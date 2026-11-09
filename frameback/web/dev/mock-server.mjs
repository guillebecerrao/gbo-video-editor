/**
 * Development mock of the Frameback HTTP API (src/core/api.ts) for working on the web UI without the real server.
 * Backed by the real store, so what the UI writes is what agents read.
 *
 *   npx tsx web/dev/mock-server.mjs [video] [--port 4820]
 *   npx vite --config web/vite.config.ts --port 5180      (proxy target: FRAMEBACK_API, default http://127.0.0.1:4747)
 *
 * It resolves the timeline with a small built-in EDL converter and probes with ffprobe when available.
 * Not part of the shipped package.
 */
import express from "express";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  StoreError, addThreadMessage, carryComments, countComments, createComment, listComments, openReview, readEvents,
  readReview, readTimeline, reopenReview, reviewDirForVideo, setHumanStatus, setSnapshot, submitReview, updateCommentHuman,
  updateVideoInfo, videoPathOf, lastSeq,
} from "../../src/core/store.ts";

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const PORT = Number(flag("--port", 4820));
if (PORT === 4747) throw new Error("port 4747 is reserved for the real server");
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--port");
const defaultVideo = path.resolve(here, "../../examples/demo/edit/final_demo_v1.mp4");
const FFMPEG_DIRS = ["/opt/homebrew/opt/ffmpeg-full/bin", "/opt/homebrew/bin", "/usr/local/bin"];

const tool = async (name) => {
  for (const dir of ["", ...FFMPEG_DIRS]) {
    const bin = dir ? path.join(dir, name) : name;
    try {
      await run(bin, ["-version"]);
      return bin;
    } catch { /* try next */ }
  }
  return null;
};

async function probe(video) {
  const ffprobe = await tool("ffprobe");
  if (!ffprobe) return null;
  const { stdout } = await run(ffprobe, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", video]);
  const info = JSON.parse(stdout);
  const v = info.streams.find((s) => s.codec_type === "video");
  if (!v) return null;
  const [n, d] = String(v.r_frame_rate).split("/").map(Number);
  return { duration: Number(info.format.duration), fps: d ? n / d : null, width: v.width, height: v.height };
}

async function waveform(video, buckets) {
  const ffmpeg = await tool("ffmpeg");
  if (!ffmpeg) return null;
  const { stdout } = await run(ffmpeg, ["-v", "error", "-i", video, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], { encoding: "buffer", maxBuffer: 1 << 29 });
  const samples = new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 2));
  if (samples.length === 0) return null;
  const per = Math.max(1, Math.floor(samples.length / buckets));
  const peaks = [];
  for (let b = 0; b < buckets; b++) {
    let max = 0;
    for (let i = b * per; i < Math.min(samples.length, (b + 1) * per); i++) max = Math.max(max, Math.abs(samples[i]));
    peaks.push(Math.min(1, max / 32768));
  }
  return { buckets, duration: samples.length / 8000, peaks };
}

/** Minimal EDL (video-use style) to timeline conversion, enough to exercise every lane. */
function edlTimeline(video) {
  const edlPath = path.join(path.dirname(video), "edl.json");
  if (!fs.existsSync(edlPath)) return null;
  const edl = JSON.parse(fs.readFileSync(edlPath, "utf8"));
  const transcripts = {};
  for (const name of Object.keys(edl.sources ?? {})) {
    const f = path.join(path.dirname(edlPath), "transcripts", `${name}.json`);
    if (fs.existsSync(f)) transcripts[name] = JSON.parse(fs.readFileSync(f, "utf8")).words ?? [];
  }
  const cuts = [], transitions = [], motion = [], captions = [], words = [], speakers = [];
  let cursor = 0, prevSpeaker = null;
  edl.ranges.forEach((r, i) => {
    const dur = r.end - r.start;
    const inRange = (transcripts[r.source] ?? []).filter((w) => w.type === "word" && w.start >= r.start && w.end <= r.end);
    const speaker = inRange[0]?.speaker_id ?? null;
    cuts.push({ id: `range:${i}`, type: "range", start: cursor, end: cursor + dur, label: `${r.beat ?? "CUT"} · ${r.source} ${r.start}–${r.end}`, source: { name: r.source, start: r.start, end: r.end }, meta: { beat: r.beat, punch: r.punch } });
    if (i > 0) {
      const change = speaker && prevSpeaker && speaker !== prevSpeaker;
      transitions.push({ id: `cut:${i}`, type: "transition", start: cursor, label: `cut range:${i - 1} → range:${i}${change ? " · speaker change" : ""}`, meta: { speakerChange: Boolean(change) } });
    }
    for (const [a, b] of r.punch ?? []) motion.push({ id: `punch:${i}:${a}`, type: "punch", start: cursor + (a - r.start), end: cursor + (b - r.start), label: "punch-in" });
    let phrase = [];
    const flush = () => {
      if (!phrase.length) return;
      captions.push({ id: `cap:${captions.length}`, type: "caption", start: phrase[0].out, end: phrase.at(-1).outEnd, label: phrase.map((w) => w.text).join(" ") });
      phrase = [];
    };
    for (const w of inRange) {
      const out = cursor + (w.start - r.start), outEnd = cursor + (w.end - r.start);
      words.push({ id: `w:${words.length}`, type: "word", start: out, end: outEnd, label: w.text, meta: { speaker: w.speaker_id } });
      phrase.push({ text: w.text, out, outEnd });
      if (/[.!?]$/.test(w.text) || phrase.length >= 4) flush();
    }
    flush();
    if (speaker) {
      const last = speakers.at(-1);
      if (last && last.label === speaker) last.end = cursor + dur;
      else speakers.push({ id: `spk:${speakers.length}`, type: "speaker", start: cursor, end: cursor + dur, label: speaker, meta: { speaker } });
    }
    prevSpeaker = speaker ?? prevSpeaker;
    cursor += dur;
  });
  const broll = (edl.broll ?? []).map((b, i) => ({ id: `broll:${i}`, type: "broll", start: b.start_in_output, end: b.start_in_output + b.duration, label: `${b.source} ${b.src_start}s` }));
  const tracks = [
    ["cuts", "Cuts", "segments", cuts], ["transitions", "Transitions", "markers", transitions], ["motion", "Motion", "segments", motion],
    ["broll", "B-roll", "segments", broll], ["captions", "Captions", "segments", captions], ["speakers", "Speakers", "segments", speakers],
    ["words", "Words", "segments", words],
  ].filter(([, , , items]) => items.length).map(([id, label, kind, items]) => ({ id, label, kind, items }));
  return {
    timeline: { schemaVersion: 1, duration: cursor, origin: "edl", tracks },
    origin: "edl", sourceFile: edlPath, sourceMtime: fs.statSync(edlPath).mtime.toISOString(), approximate: true,
    warnings: [],
  };
}

// ------------------------------------------------------------------ registry ----

const registry = new Map(); // rid -> { video, dir }

async function register(video) {
  const abs = path.resolve(video);
  for (const [rid, e] of registry) if (e.video === abs) return rid;
  const stem = path.basename(abs, path.extname(abs));
  let rid = stem;
  for (let n = 2; registry.has(rid); n++) rid = `${stem}-${n}`;
  const info = await probe(abs).catch(() => null);
  const timeline = edlTimeline(abs);
  const { dir, created } = await openReview(abs, { videoInfo: info ?? {}, timeline });
  const m = stem.match(/^(.*)_v(\d+)$/);
  if (created && m && Number(m[2]) > 1) {
    const prev = path.join(path.dirname(abs), `${m[1]}_v${Number(m[2]) - 1}${path.extname(abs)}`);
    const prevDir = reviewDirForVideo(prev);
    if (fs.existsSync(path.join(prevDir, "review.json"))) await carryComments(prevDir, dir);
  }
  registry.set(rid, { video: abs, dir });
  return rid;
}

const entry = (req) => {
  const e = registry.get(req.params.rid);
  if (!e) throw new StoreError("not_found", `unknown review '${req.params.rid}'`);
  return e;
};

async function summary(rid) {
  const { video, dir } = registry.get(rid);
  const review = await readReview(dir);
  const c = await countComments(dir);
  return { rid, reviewDir: dir, videoName: path.basename(video), state: review.state, counts: { total: c.total, pending: c.pending, prepared: c.prepared, applied: c.applied, needs_info: c.needs_info } };
}

async function bundle(rid) {
  const { video, dir } = registry.get(rid);
  const review = await readReview(dir);
  const ext = path.extname(video);
  const base = path.basename(video, ext).replace(/_v\d+$/, "");
  const siblings = fs.readdirSync(path.dirname(video))
    .filter((f) => f.endsWith(ext) && f.replace(ext, "").replace(/_v\d+$/, "") === base)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const versions = siblings.map((name) => {
    const abs = path.join(path.dirname(video), name);
    const found = [...registry].find(([, e]) => e.video === abs);
    return { name, rid: found ? found[0] : null, isCurrent: abs === video };
  });
  const nextAbs = review.nextVideo ? path.resolve(dir, review.nextVideo) : null;
  return {
    rid, review, videoUrl: `/media/${rid}/video`, videoName: path.basename(video),
    timeline: await readTimeline(dir), comments: await listComments(dir), lastSeq: await lastSeq(dir), versions,
    next: nextAbs && fs.existsSync(nextAbs) ? { name: path.basename(nextAbs), url: `/media/${rid}/next` } : null,
  };
}

// ----------------------------------------------------------------------- app ----

const app = express();
app.use(express.json({ limit: "15mb" }));
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
  if (err instanceof StoreError) {
    const status = err.code === "not_found" ? 404 : err.code === "conflict" ? 409 : 400;
    return res.status(status).json({ error: err.message, code: err.code });
  }
  console.error(err);
  res.status(500).json({ error: String(err.message ?? err) });
});
const cid = (req) => {
  if (!/^c-\d{4,}$/.test(req.params.id)) throw new StoreError("invalid", "bad comment id");
  return req.params.id;
};

app.get("/api/health", (_req, res) => res.json({ app: "frameback", version: "0.1.0-mock", pid: process.pid }));
app.get("/api/reviews", wrap(async (_q, res) => res.json(await Promise.all([...registry.keys()].map(summary)))));
app.post("/api/reviews", wrap(async (req, res) => res.json(await summary(await register(req.body.video)))));
app.get("/api/reviews/:rid", wrap(async (req, res) => { entry(req); res.json(await bundle(req.params.rid)); }));
app.get("/api/reviews/:rid/timeline", wrap(async (req, res) => res.json(await readTimeline(entry(req).dir))));
app.get("/api/reviews/:rid/comments", wrap(async (req, res) => res.json(await listComments(entry(req).dir))));
app.post("/api/reviews/:rid/comments", wrap(async (req, res) => {
  const { dir } = entry(req);
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(req.body.snapshotDataUrl ?? "");
  res.json(await createComment(dir, req.body.comment, { snapshot: m ? Buffer.from(m[1], "base64") : null }));
}));
app.patch("/api/reviews/:rid/comments/:id", wrap(async (req, res) => res.json(await updateCommentHuman(entry(req).dir, cid(req), req.body))));
app.put("/api/reviews/:rid/comments/:id/snapshot", express.raw({ type: "image/jpeg", limit: "15mb" }), wrap(async (req, res) => res.json(await setSnapshot(entry(req).dir, cid(req), req.body))));
app.post("/api/reviews/:rid/comments/:id/status", wrap(async (req, res) => res.json(await setHumanStatus(entry(req).dir, cid(req), req.body.status))));
app.delete("/api/reviews/:rid/comments/:id", wrap(async (req, res) => res.json(await setHumanStatus(entry(req).dir, cid(req), "deleted"))));
app.post("/api/reviews/:rid/comments/:id/thread", wrap(async (req, res) => res.json(await addThreadMessage(entry(req).dir, cid(req), "human", req.body.text))));
app.post("/api/reviews/:rid/submit", wrap(async (req, res) => res.json(await submitReview(entry(req).dir))));
app.post("/api/reviews/:rid/reopen", wrap(async (req, res) => res.json(await reopenReview(entry(req).dir))));
app.post("/api/reviews/:rid/video-info", wrap(async (req, res) => res.json(await updateVideoInfo(entry(req).dir, req.body))));
app.get("/api/reviews/:rid/waveform", wrap(async (req, res) => {
  const w = await waveform(entry(req).video, Math.min(20000, Number(req.query.buckets) || 2000));
  if (!w) return res.status(404).json({ error: "no waveform" });
  res.json(w);
}));
app.get("/api/reviews/:rid/events", (req, res) => {
  const e = registry.get(req.params.rid);
  if (!e) return res.status(404).json({ error: "unknown review" });
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  let since = Number(req.query.since ?? req.get("Last-Event-ID") ?? 0) || 0;
  let busy = false;
  const poll = async () => {
    if (busy) return;
    busy = true;
    try {
      for (const ev of await readEvents(e.dir, since)) {
        res.write(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`);
        since = ev.seq;
      }
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(poll, 250);
  const beat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
  void poll();
  req.on("close", () => { clearInterval(timer); clearInterval(beat); });
});

app.get("/media/:rid/video", wrap(async (req, res) => res.sendFile(await videoPathOf(entry(req).dir))));
app.get("/media/:rid/snapshots/:id.jpg", wrap(async (req, res) => {
  const { dir } = entry(req);
  if (!/^c-\d{4,}$/.test(req.params.id)) throw new StoreError("invalid", "bad comment id");
  res.sendFile(path.join(dir, "snapshots", `${req.params.id}.jpg`));
}));
app.get("/media/:rid/next", wrap(async (req, res) => {
  const { dir } = entry(req);
  const review = await readReview(dir);
  if (!review.nextVideo) throw new StoreError("not_found", "no next version yet");
  const rid = await register(path.resolve(dir, review.nextVideo));
  res.redirect(`/?r=${encodeURIComponent(rid)}`);
}));

const server = app.listen(PORT, "127.0.0.1", async () => {
  const rid = await register(positional[0] ?? defaultVideo);
  console.log(`mock server: http://127.0.0.1:${PORT}/?r=${rid}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
