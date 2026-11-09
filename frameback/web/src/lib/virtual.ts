/** Windowing for timeline lanes: a words track can hold tens of thousands of items, only the visible ones render. */
import type { TimelineItem, TimelineTrack } from "@core/schema";

export interface IndexedTrack {
  track: TimelineTrack;
  /** items sorted by start */
  items: TimelineItem[];
  /** effective end of each item (markers and point items end where they start) */
  ends: number[];
  /** running maximum of `ends`: monotonic, so the first visible item is found by binary search */
  maxEnd: number[];
}

export const itemEnd = (it: TimelineItem): number => (it.end != null && it.end > it.start ? it.end : it.start);

export function indexTrack(track: TimelineTrack): IndexedTrack {
  const items = [...track.items].sort((a, b) => a.start - b.start);
  const ends = items.map(itemEnd);
  const maxEnd: number[] = [];
  let m = -Infinity;
  for (const e of ends) maxEnd.push((m = Math.max(m, e)));
  return { track, items, ends, maxEnd };
}

/** First index in [0, n) where pred(i) is true, assuming pred is monotonic (false… then true…). */
function firstWhere(n: number, pred: (i: number) => boolean): number {
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pred(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Items intersecting the closed window [t0, t1]. */
export function visibleItems(idx: IndexedTrack, t0: number, t1: number): TimelineItem[] {
  const first = firstWhere(idx.items.length, (i) => idx.maxEnd[i] >= t0);
  const last = firstWhere(idx.items.length, (i) => idx.items[i].start > t1); // exclusive
  const out: TimelineItem[] = [];
  for (let i = first; i < last; i++) if (idx.ends[i] >= t0) out.push(idx.items[i]);
  return out;
}

/** Visible time window for a scroll position, with a margin so blocks do not pop in at the edges. */
export function visibleWindow(scrollLeft: number, viewWidth: number, pxPerSec: number, gutter: number, marginPx = 200) {
  const t0 = Math.max(0, (scrollLeft - gutter - marginPx) / pxPerSec);
  const t1 = (scrollLeft + viewWidth - gutter + marginPx) / pxPerSec;
  return { t0, t1 };
}

/** Smallest "nice" tick step (seconds) giving at least `minPx` between labelled ticks. */
export function tickStep(pxPerSec: number, minPx = 90): number {
  const steps = [0.04, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  return steps.find((s) => s * pxPerSec >= minPx) ?? 3600;
}

/** Greedy lane packing for overlapping spans; returns the row of each span (input order) and the row count. */
export function packRows(spans: { start: number; end: number }[], gap = 0): { rows: number[]; count: number } {
  const order = spans.map((_, i) => i).sort((a, b) => spans[a].start - spans[b].start);
  const rowEnds: number[] = [];
  const rows = new Array<number>(spans.length).fill(0);
  for (const i of order) {
    let r = rowEnds.findIndex((e) => e + gap <= spans[i].start);
    if (r === -1) {
      r = rowEnds.length;
      rowEnds.push(0);
    }
    rowEnds[r] = spans[i].end;
    rows[i] = r;
  }
  return { rows, count: Math.max(1, rowEnds.length) };
}
