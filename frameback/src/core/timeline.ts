/**
 * Timeline resolution and the `edl.json` adapter.
 *
 * Resolution order for a video: explicit path(s) -> `<dir>/<stem>.timeline.json` sidecar -> `<dir>/edl.json`
 * (video-use / gbo-style shape, see docs/PROTOCOL.md §6) -> null. EDL-derived timelines are `approximate: true`:
 * the EDL describes the intended cut, not the rendered file.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { SCHEMA_VERSION, Timeline, type TimelineItem, type TimelineTrack } from "./schema.js";
import { StoreError, exists, type FrozenTimeline } from "./store.js";

export interface ResolveTimelineOptions {
  /** explicit Frameback timeline sidecar (CLI --timeline) */
  timelinePath?: string;
  /** explicit EDL (CLI --edl); wins over an auto-detected sidecar */
  edlPath?: string;
  /** known video duration in seconds, for drift warnings */
  videoDuration?: number | null;
}

/** Output durations differing from the video by more than this (seconds) produce a warning. */
const DURATION_DRIFT_S = 0.5;
/** Caption phrases are cut after this many words (or at sentence punctuation). */
const CAPTION_MAX_WORDS = 4;
/** Same-speaker runs separated by less than this (seconds) are one speaker span. */
const SPEAKER_MERGE_GAP_S = 1;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fix2 = (n: number) => n.toFixed(2);

// ------------------------------------------------------------ resolution ----

/** Explicit --edl / --timeline paths must exist and parse; failures carry a clear message (the caller reports them). */
async function explicit<T>(kind: string, file: string, run: (f: string) => Promise<T>): Promise<T> {
  if (!(await exists(file))) throw new StoreError("invalid", `${kind} file not found: ${file}`);
  try {
    return await run(file);
  } catch (e) {
    throw new StoreError("invalid", `invalid ${kind} file ${path.basename(file)}: ${e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message}`);
  }
}

export async function resolveTimeline(videoPath: string, opts: ResolveTimelineOptions = {}): Promise<FrozenTimeline | null> {
  const video = path.resolve(videoPath);
  const stem = path.basename(video, path.extname(video));
  const dir = path.dirname(video);
  const warnings: string[] = [];

  if (opts.timelinePath) return explicit("timeline", path.resolve(opts.timelinePath), (f) => fromSidecar(f, opts, warnings));
  if (opts.edlPath) return explicit("edl", path.resolve(opts.edlPath), (f) => fromEdl(f, video, opts, warnings));

  const sidecar = path.join(dir, `${stem}.timeline.json`);
  if (await exists(sidecar)) {
    try {
      return await fromSidecar(sidecar, opts, warnings);
    } catch (e) {
      warnings.push(`ignored invalid sidecar ${path.basename(sidecar)}: ${(e as Error).message}`);
    }
  }
  const edl = path.join(dir, "edl.json");
  if (await exists(edl)) {
    try {
      return await fromEdl(edl, video, opts, warnings);
    } catch (e) {
      warnings.push(`ignored invalid edl.json: ${(e as Error).message}`);
    }
  }
  return null;
}

async function fromSidecar(file: string, opts: ResolveTimelineOptions, warnings: string[]): Promise<FrozenTimeline> {
  const timeline = parseJson(Timeline, await fs.readFile(file, "utf8"), file);
  warnDurationDrift(timeline.duration, opts.videoDuration, warnings);
  return {
    timeline: { ...timeline, origin: "sidecar" },
    origin: "sidecar",
    sourceFile: file,
    sourceMtime: (await fs.stat(file)).mtime.toISOString(),
    approximate: false,
    warnings,
  };
}

async function fromEdl(file: string, video: string, opts: ResolveTimelineOptions, warnings: string[]): Promise<FrozenTimeline> {
  const { timeline, warnings: edlWarnings } = await edlToTimeline(file);
  warnings.push(...edlWarnings);
  const [edlStat, videoStat] = await Promise.all([fs.stat(file), fs.stat(video).catch(() => null)]);
  if (videoStat && edlStat.mtimeMs > videoStat.mtimeMs) {
    warnings.push(`${path.basename(file)} is newer than the video: the timeline may not match the rendered file`);
  }
  warnDurationDrift(timeline.duration, opts.videoDuration, warnings);
  return {
    timeline,
    origin: "edl",
    sourceFile: file,
    sourceMtime: edlStat.mtime.toISOString(),
    approximate: true,
    warnings,
  };
}

function warnDurationDrift(timelineDuration: number | null | undefined, videoDuration: number | null | undefined, warnings: string[]) {
  if (timelineDuration == null || videoDuration == null) return;
  if (Math.abs(timelineDuration - videoDuration) > DURATION_DRIFT_S) {
    warnings.push(`timeline duration ${fix2(timelineDuration)}s differs from video duration ${fix2(videoDuration)}s`);
  }
}

// ------------------------------------------------------------ EDL adapter ----

const EdlRange = z.object({
  source: z.string(),
  start: z.number(),
  end: z.number(),
  beat: z.string().optional(),
  punch: z.array(z.tuple([z.number(), z.number()])).optional(),
});
const EdlBroll = z.object({
  source: z.string(),
  src_start: z.number().default(0),
  duration: z.number().positive(),
  start_in_output: z.number().nonnegative(),
});
const Edl = z.object({
  ranges: z.array(EdlRange),
  broll: z.array(EdlBroll).optional(),
});
const TranscriptWord = z.object({
  type: z.string().optional(),
  text: z.string(),
  start: z.number().optional(),
  end: z.number().optional(),
  speaker_id: z.string().nullish(),
});
const Transcript = z.object({ words: z.array(TranscriptWord) });

type EdlRange = z.infer<typeof EdlRange>;

interface Word {
  text: string;
  /** source time */
  start: number;
  end: number;
  speaker: string | null;
}

interface Placed {
  range: EdlRange;
  index: number;
  outStart: number;
  outEnd: number;
  /** words overlapping the range (source time) */
  words: Word[];
}

type OutTime = (p: Placed, sourceTime: number) => number;

/** Convert a video-use / gbo-style edl.json (+ `transcripts/<source>.json` next to it) into a Timeline. */
export async function edlToTimeline(edlPath: string): Promise<{ timeline: Timeline; warnings: string[] }> {
  const file = path.resolve(edlPath);
  const edl = parseJson(Edl, await fs.readFile(file, "utf8"), file);
  const warnings: string[] = [];
  const transcripts = await loadTranscripts(path.dirname(file), [...new Set(edl.ranges.map((r) => r.source))], warnings);

  edl.ranges.forEach((r, i) => {
    if (r.end <= r.start) warnings.push(`range ${i} (${r.source}) has end <= start (${r.start}–${r.end}); it becomes a zero-length cut`);
    if (r.start < 0) warnings.push(`range ${i} (${r.source}) starts at a negative source time (${r.start})`);
  });

  let cursor = 0;
  const placed: Placed[] = edl.ranges.map((range, index) => {
    const outStart = cursor;
    cursor += Math.max(0, range.end - range.start);
    const words = (transcripts.get(range.source) ?? []).filter((w) => w.end > range.start && w.start < range.end);
    return { range, index, outStart, outEnd: cursor, words };
  });

  /** source time -> output time, clipped to the range */
  const outTime: OutTime = (p, t) => r3(p.outStart + Math.min(Math.max(t, p.range.start), p.range.end) - p.range.start);
  const tracks = [
    cutsTrack(placed),
    transitionsTrack(placed),
    motionTrack(placed, outTime),
    brollTrack(edl.broll ?? []),
    captionsTrack(placed, outTime),
    speakersTrack(placed, outTime),
    wordsTrack(placed, outTime),
  ];

  (edl.broll ?? []).forEach((b, i) => {
    if (b.start_in_output + b.duration > cursor + 0.05) {
      warnings.push(`broll ${i} (${b.source}) ends at ${fix2(b.start_in_output + b.duration)}s, past the ${fix2(cursor)}s timeline`);
    }
  });

  const timeline: Timeline = {
    schemaVersion: SCHEMA_VERSION,
    duration: r3(cursor),
    origin: "edl",
    tracks: tracks.filter((t) => t.items.length > 0),
  };
  return { timeline, warnings };
}

async function loadTranscripts(edlDir: string, sources: string[], warnings: string[]): Promise<Map<string, Word[]>> {
  const out = new Map<string, Word[]>();
  for (const name of sources) {
    const file = path.join(edlDir, "transcripts", `${name}.json`);
    try {
      const t = parseJson(Transcript, await fs.readFile(file, "utf8"), file);
      const words = t.words.flatMap((w) =>
          (w.type === undefined || w.type === "word") && w.start != null && w.end != null
            ? [{ text: w.text, start: w.start, end: w.end, speaker: w.speaker_id ?? null }]
            : [],
      );
      out.set(name, words);
      if (!words.length) warnings.push(`transcript for "${name}" has no usable words (need text/start/end per word)`);
    } catch (e) {
      const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
      warnings.push(
        missing ? `missing transcript for source "${name}" (transcripts/${name}.json)` : `unreadable transcript for "${name}": ${(e as Error).message}`,
      );
    }
  }
  return out;
}

function cutsTrack(placed: Placed[]): TimelineTrack {
  return {
    id: "cuts",
    label: "Cuts",
    kind: "segments",
    items: placed.map(({ range, index, outStart, outEnd }) => ({
      id: `range:${index}`,
      type: "range",
      start: r3(outStart),
      end: r3(outEnd),
      label: `${range.beat ? `${range.beat} · ` : ""}${range.source} ${fix2(range.start)}–${fix2(range.end)}`,
      source: { name: range.source, start: range.start, end: range.end },
      meta: { beat: range.beat ?? null, punch: range.punch ?? [] },
    })),
  };
}

function dominantSpeaker(p: Placed): string | null {
  const total = new Map<string, number>();
  for (const w of p.words) if (w.speaker) total.set(w.speaker, (total.get(w.speaker) ?? 0) + (w.end - w.start));
  let best: string | null = null;
  let bestDur = -1;
  for (const [speaker, dur] of total) {
    if (dur > bestDur) {
      best = speaker;
      bestDur = dur;
    }
  }
  return best;
}

function transitionsTrack(placed: Placed[]): TimelineTrack {
  const items: TimelineItem[] = [];
  for (let i = 1; i < placed.length; i++) {
    const prev = placed[i - 1];
    const cur = placed[i];
    const prevSpeaker = dominantSpeaker(prev);
    const curSpeaker = dominantSpeaker(cur);
    const speakerChange = prevSpeaker !== null && curSpeaker !== null && prevSpeaker !== curSpeaker;
    const meta: Record<string, unknown> = {};
    if (speakerChange) meta.speakerChange = true;
    // silence inside each range next to the cut: end of the outgoing range, start of the incoming one
    if (prev.words.length) meta.gapBefore = r3(Math.max(0, prev.range.end - prev.words[prev.words.length - 1].end));
    if (cur.words.length) meta.gapAfter = r3(Math.max(0, cur.words[0].start - cur.range.start));
    items.push({
      id: `cut:${i}`,
      type: "transition",
      start: r3(cur.outStart),
      label: `cut range:${i - 1} → range:${i}${speakerChange ? " · speaker change" : ""}`,
      meta,
    });
  }
  return { id: "transitions", label: "Transitions", kind: "markers", items };
}

function motionTrack(placed: Placed[], outTime: OutTime): TimelineTrack {
  const items: TimelineItem[] = [];
  for (const p of placed) {
    for (const [from, to] of p.range.punch ?? []) {
      if (to <= p.range.start || from >= p.range.end) continue;
      items.push({
        id: `punch:${items.length}`,
        type: "punch",
        start: outTime(p, from),
        end: outTime(p, to),
        label: `punch-in · range:${p.index}`,
        meta: { range: p.index },
      });
    }
  }
  return { id: "motion", label: "Motion", kind: "segments", items };
}

function brollTrack(broll: z.infer<typeof EdlBroll>[]): TimelineTrack {
  return {
    id: "broll",
    label: "B-roll",
    kind: "segments",
    items: broll.map((b, i) => ({
      id: `broll:${i}`,
      type: "broll",
      start: r3(b.start_in_output),
      end: r3(b.start_in_output + b.duration),
      label: `${b.source} ${b.src_start}s`,
      source: { name: b.source, start: b.src_start, end: r3(b.src_start + b.duration) },
    })),
  };
}

function captionsTrack(placed: Placed[], outTime: OutTime): TimelineTrack {
  const items: TimelineItem[] = [];
  for (const p of placed) {
    let phrase: Word[] = [];
    const flush = () => {
      if (!phrase.length) return;
      items.push({
        id: `caption:${items.length}`,
        type: "caption",
        start: outTime(p, phrase[0].start),
        end: outTime(p, phrase[phrase.length - 1].end),
        label: phrase.map((w) => w.text).join(" "),
      });
      phrase = [];
    };
    for (const w of p.words) {
      phrase.push(w);
      if (/[.!?…;:]["')\]]*$/.test(w.text) || phrase.length >= CAPTION_MAX_WORDS) flush();
    }
    flush();
  }
  return { id: "captions", label: "Captions", kind: "segments", items };
}

function speakersTrack(placed: Placed[], outTime: OutTime): TimelineTrack {
  const items: TimelineItem[] = [];
  let current: { speaker: string; start: number; end: number } | null = null;
  const flush = () => {
    if (current) {
      items.push({
        id: `speaker:${items.length}`,
        type: "speaker",
        start: current.start,
        end: current.end,
        label: current.speaker,
        meta: { speaker: current.speaker },
      });
    }
    current = null;
  };
  for (const p of placed) {
    for (const w of p.words) {
      if (!w.speaker) continue;
      const start = outTime(p, w.start);
      const end = outTime(p, w.end);
      if (current && current.speaker === w.speaker && start - current.end <= SPEAKER_MERGE_GAP_S) {
        current.end = Math.max(current.end, end);
      } else {
        flush();
        current = { speaker: w.speaker, start, end };
      }
    }
  }
  flush();
  return { id: "speakers", label: "Speakers", kind: "segments", items };
}

function wordsTrack(placed: Placed[], outTime: OutTime): TimelineTrack {
  const items: TimelineItem[] = [];
  for (const p of placed) {
    for (const w of p.words) {
      items.push({
        id: `word:${items.length}`,
        type: "word",
        start: outTime(p, w.start),
        end: outTime(p, w.end),
        label: w.text,
        meta: { speaker: w.speaker },
      });
    }
  }
  return { id: "words", label: "Words", kind: "segments", items };
}

// --------------------------------------------------------------- helpers ----

function parseJson<S extends z.ZodTypeAny>(schema: S, text: string, file: string): z.infer<S> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`${path.basename(file)} is not valid JSON`);
  }
  const res = schema.safeParse(raw);
  if (!res.success) {
    const issue = res.error.issues[0];
    throw new Error(`${path.basename(file)}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  return res.data;
}
