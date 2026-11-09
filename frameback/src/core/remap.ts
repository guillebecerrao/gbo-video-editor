/**
 * Remap comment anchors from one version's timeline to the next, through SOURCE time.
 *
 * A re-cut keeps pieces of the same source media but moves them in output time. Output time t in the old version
 * is resolved to (source name, source time) via the old primary cut item containing t, then located in the new
 * timeline's cut items that reference the same source range. Pure functions, no I/O.
 *
 * Primary track: the track with id `cuts` if it has `range` items carrying `source`; otherwise the first track
 * that has such items. Both the EDL adapter and the gbo-style sidecar name it `cuts`.
 */
import type { Anchor, Timeline, TimelineItem, TimeSpan } from "./schema.js";

export type RemapMethod = "source" | "identity";
export type RemapStatus = "exact" | "clamped" | "lost";
export interface RemapInfo {
  method: RemapMethod;
  status: RemapStatus;
}
export interface MappedTime extends RemapInfo {
  time: number;
}
export interface MappedSpan extends RemapInfo {
  time: TimeSpan;
}
export interface SourceHint {
  name: string;
  time: number;
}

const EPS = 1e-3;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

interface Cut {
  index: number;
  item: TimelineItem;
  name: string;
  srcStart: number;
  srcEnd: number;
  start: number;
  end: number;
}

/** The primary cuts of a timeline in output order, or null when it has no source info. */
export function primaryCuts(tl: Timeline | null | undefined): Cut[] | null {
  if (!tl) return null;
  const usable = (items: TimelineItem[]) => items.filter((i) => i.type === "range" && i.source && i.end != null && i.end > i.start);
  const track = tl.tracks.find((t) => t.id === "cuts" && usable(t.items).length > 0) ?? tl.tracks.find((t) => usable(t.items).length > 0);
  if (!track) return null;
  return usable(track.items)
    .sort((a, b) => a.start - b.start)
    .map((item, index) => {
      const dur = item.end! - item.start;
      return {
        index,
        item,
        name: item.source!.name,
        srcStart: item.source!.start,
        srcEnd: item.source!.end ?? item.source!.start + dur,
        start: item.start,
        end: item.end!,
      };
    });
}

const toOut = (cut: Cut, srcT: number) => cut.start + (srcT - cut.srcStart);
const containsSrc = (cut: Cut, srcT: number) => srcT >= cut.srcStart - EPS && srcT <= cut.srcEnd + EPS;

function locate(cuts: Cut[], t: number): Cut | null {
  for (const c of cuts) if (t >= c.start - EPS && t < c.end - EPS) return c;
  // a point exactly on the last end still belongs to the last cut
  const last = cuts[cuts.length - 1];
  return last && Math.abs(t - last.end) <= EPS ? last : null;
}

/** Candidates are ordered by closeness to the original position (cut index, then output time). */
function nearestBy<T extends { c: Cut }>(list: T[], from: Cut | null, fromT: number): T | null {
  if (list.length === 0) return null;
  const rank = (x: T) => [from ? Math.abs(x.c.index - from.index) : 0, Math.abs(x.c.start - (from?.start ?? fromT))];
  return [...list].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1];
  })[0];
}

interface Piece {
  /** new-timeline output interval */
  from: number;
  to: number;
  /** length of source covered */
  len: number;
}

/** Where the source range [a, b] of `name` lives in the new cuts (best candidate near the original position). */
function findPiece(newCuts: Cut[], name: string, a: number, b: number, near: Cut | null, nearT: number): Piece | null {
  const cands = newCuts
    .filter((c) => c.name === name)
    .map((c) => ({ c, lo: Math.max(a, c.srcStart), hi: Math.min(b, c.srcEnd) }))
    .filter((x) => x.hi - x.lo > EPS);
  const best = nearestBy(cands, near, nearT);
  if (!best) return null;
  return { from: toOut(best.c, best.lo), to: toOut(best.c, best.hi), len: best.hi - best.lo };
}

/** Time in the new timeline closest to a lost moment: the end of the nearest surviving earlier content, else the start of later content. */
function neighbour(oldCuts: Cut[], newCuts: Cut[], lost: Cut | null, t: number): number {
  const others = oldCuts.filter((c) => c !== lost);
  const before = others.filter((c) => c.end <= t + EPS).sort((a, b) => b.end - a.end);
  const after = others.filter((c) => c.start >= t - EPS).sort((a, b) => a.start - b.start);
  for (const c of before) {
    const p = findPiece(newCuts, c.name, c.srcStart, c.srcEnd, c, c.start);
    if (p) return r3(p.to);
  }
  for (const c of after) {
    const p = findPiece(newCuts, c.name, c.srcStart, c.srcEnd, c, c.start);
    if (p) return r3(p.from);
  }
  return 0;
}

const identity = (t: number): MappedTime => ({ time: t, method: "identity", status: "exact" });

/** Map one output time of the old timeline to the new timeline. `hint` is the comment's stored `anchor.source`. */
export function mapTime(oldTl: Timeline | null | undefined, newTl: Timeline | null | undefined, t: number, hint?: SourceHint | null): MappedTime {
  const oldCuts = primaryCuts(oldTl);
  const newCuts = primaryCuts(newTl);
  if (!newCuts || (!oldCuts && !hint)) return identity(t);
  const from = oldCuts ? locate(oldCuts, t) : null;
  const key = hint ?? (from ? { name: from.name, time: from.srcStart + (t - from.start) } : null);
  const lost = (): MappedTime => ({ time: oldCuts ? neighbour(oldCuts, newCuts, from, t) : t, method: "source", status: "lost" });
  if (!key) return lost();
  const best = nearestBy(newCuts.filter((c) => c.name === key.name && containsSrc(c, key.time)).map((c) => ({ c })), from, t);
  if (!best) return lost();
  return { time: r3(Math.max(best.c.start, toOut(best.c, key.time))), method: "source", status: "exact" };
}

/** Map a time span. Parts of the span that were cut are dropped (`clamped`); if nothing survives the result is `lost`. */
export function mapSpan(oldTl: Timeline | null | undefined, newTl: Timeline | null | undefined, span: TimeSpan, hint?: SourceHint | null): MappedSpan {
  const s = span.start;
  const e = span.end;
  if (e == null || e <= s + EPS) {
    const m = mapTime(oldTl, newTl, s, hint);
    return { time: { start: m.time }, method: m.method, status: m.status };
  }
  const oldCuts = primaryCuts(oldTl);
  const newCuts = primaryCuts(newTl);
  if (!newCuts || (!oldCuts && !hint)) return { time: { start: s, end: e }, method: "identity", status: "exact" };

  // pieces of source covered by the span, in old output order
  const src: { name: string; a: number; b: number; cut: Cut | null }[] = [];
  if (oldCuts) {
    for (const c of oldCuts) {
      const lo = Math.max(s, c.start), hi = Math.min(e, c.end);
      if (hi - lo > EPS) src.push({ name: c.name, a: c.srcStart + (lo - c.start), b: c.srcStart + (hi - c.start), cut: c });
    }
  } else if (hint) {
    src.push({ name: hint.name, a: hint.time, b: hint.time + (e - s), cut: null });
  }

  const pieces: Piece[] = [];
  let covered = 0;
  for (const x of src) {
    const p = findPiece(newCuts, x.name, x.a, x.b, x.cut, s);
    if (p) {
      pieces.push(p);
      covered += p.len;
    }
  }
  if (pieces.length === 0) {
    const lostCut = oldCuts ? locate(oldCuts, s) : null;
    return { time: { start: oldCuts ? neighbour(oldCuts, newCuts, lostCut, s) : s }, method: "source", status: "lost" };
  }
  const start = pieces[0].from;
  let end = pieces[pieces.length - 1].to;
  if (end <= start + EPS) end = pieces[0].to; // reordered: keep the first surviving piece
  const exact = Math.abs(covered - (e - s)) < 0.05 && Math.abs(end - start - (e - s)) < 0.05;
  return { time: { start: r3(start), end: r3(end) }, method: "source", status: exact ? "exact" : "clamped" };
}

export interface RemappedAnchor {
  anchor: Anchor;
  /** the span in the old version */
  from: TimeSpan;
  remap: RemapInfo;
}

/** Remap a whole anchor: time, frame (when `fps` is known) and entity. The region is left untouched. */
export function remapAnchor(oldTl: Timeline | null | undefined, newTl: Timeline | null | undefined, anchor: Anchor, fps?: number | null): RemappedAnchor {
  const from = anchor.time;
  const res = mapSpan(oldTl, newTl, from, anchor.source ?? null);
  const next: Anchor = { ...anchor, time: res.time.end != null ? { start: res.time.start, end: res.time.end } : { start: res.time.start } };
  const moved = Math.abs(res.time.start - from.start) > EPS;

  if (anchor.frame !== undefined && moved) {
    if (fps && fps > 0) next.frame = Math.max(0, Math.floor(res.time.start * fps + 1e-4));
    else delete next.frame;
  }

  if (anchor.entity && res.method === "source") {
    const ent = res.status === "lost" ? undefined : remapEntity(oldTl, newTl, anchor.entity, res.time.start);
    if (ent) next.entity = ent;
    else delete next.entity;
  }
  return { anchor: next, from, remap: { method: res.method, status: res.status } };
}

function remapEntity(oldTl: Timeline | null | undefined, newTl: Timeline | null | undefined, ref: NonNullable<Anchor["entity"]>, newT: number) {
  const track = newTl?.tracks.find((t) => t.id === ref.track);
  if (!track) return undefined;
  const oldItem = oldTl?.tracks.find((t) => t.id === ref.track)?.items.find((i) => i.id === ref.id);
  const hits = track.items.filter((i) => i.type === ref.type && newT >= i.start - EPS && newT < (i.end ?? i.start) + EPS);
  const pick = hits.find((i) => oldItem?.source && i.source?.name === oldItem.source.name) ?? hits[0];
  if (!pick) return undefined;
  return { track: ref.track, id: pick.id, type: pick.type, ...(pick.label ? { label: pick.label } : {}) };
}
