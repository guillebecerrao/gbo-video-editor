/** Building comment anchors from what the reviewer selected, enriched from the timeline. */
import type { Anchor, Category, EntityRef, Region, Timeline, TimelineItem, TimelineTrack } from "@core/schema";
import { frameIndex } from "./time";

/** What the reviewer has selected so far and is about to comment on. */
export interface Draft {
  /** distinguishes one composing session from the next (resets the composer form) */
  id: number;
  start: number;
  end: number | null;
  region: Region | null;
  entity: EntityRef | null;
}

/** In/out marks set with I / O or by dragging the ruler; they become the comment's range. */
export interface Marks { in: number | null; out: number | null }

const WORDS_TRACK_TYPE = "word";

function wordsTrack(timeline: Timeline | null): TimelineTrack | undefined {
  return timeline?.tracks.find((t) => t.id === "words") ?? timeline?.tracks.find((t) => t.items.some((i) => i.type === WORDS_TRACK_TYPE));
}

/**
 * Words spoken in [start, end] (words whose center falls inside). A point anchor takes ±`pointContext` seconds so the
 * excerpt still gives the agent something to read.
 */
export function transcriptFor(timeline: Timeline | null, start: number, end: number | null, pointContext = 1.5): string | undefined {
  const track = wordsTrack(timeline);
  if (!track) return undefined;
  const isRange = end != null && end > start;
  const lo = isRange ? start : start - pointContext;
  const hi = isRange ? end : start + pointContext;
  const words = track.items
    .filter((w) => {
      const center = (w.start + (w.end ?? w.start)) / 2;
      return center >= lo && center <= hi;
    })
    .sort((a, b) => a.start - b.start)
    .map((w) => (w.label ?? "").trim())
    .filter(Boolean);
  return words.length ? words.join(" ") : undefined;
}

/** The source clip (and the time inside it) playing at output time `t`, from any track item carrying `source`. */
export function sourceAt(timeline: Timeline | null, t: number): { name: string; time: number } | undefined {
  if (!timeline) return undefined;
  for (const track of timeline.tracks) {
    for (const it of track.items) {
      if (it.type !== "range" || !it.source || it.end == null) continue;
      if (t >= it.start && t < it.end) return { name: it.source.name, time: Math.round((it.source.start + (t - it.start)) * 1000) / 1000 };
    }
  }
  return undefined;
}

export function entityRef(track: TimelineTrack, item: TimelineItem): EntityRef {
  return { track: track.id, id: item.id, type: item.type, ...(item.label ? { label: item.label } : {}) };
}

/** A category that matches the selected entity, so the composer starts with a sensible default. */
export function suggestCategory(draft: Omit<Draft, "id">): Category {
  switch (draft.entity?.type) {
    case "range": return "cut";
    case "transition": return "transition";
    case "broll": return "broll";
    case "caption":
    case "word": return "caption";
    case "punch": return "motion";
    case "speaker": return "audio";
  }
  if (draft.entity) return "element";
  return draft.region ? "framing" : "other";
}

export function buildAnchor(draft: Omit<Draft, "id">, fps: number, timeline: Timeline | null): Anchor {
  const isRange = draft.end != null && draft.end > draft.start;
  const transcript = transcriptFor(timeline, draft.start, draft.end);
  const source = sourceAt(timeline, draft.start);
  return {
    time: { start: draft.start, end: isRange ? draft.end : null },
    frame: frameIndex(draft.start, fps),
    ...(draft.region ? { region: draft.region } : {}),
    ...(draft.entity ? { entity: draft.entity } : {}),
    ...(source ? { source } : {}),
    ...(transcript ? { transcript } : {}),
  };
}
