import { describe, expect, it } from "vitest";
import type { TimelineTrack } from "@core/schema";
import { indexTrack, packRows, tickStep, visibleItems, visibleWindow } from "./virtual";

const track = (items: [string, number, number | null][]): TimelineTrack => ({
  id: "t", label: "T", kind: "segments",
  items: items.map(([id, start, end]) => ({ id, type: "x", start, end })),
});

describe("visibleItems", () => {
  const idx = indexTrack(track([["c", 5, 6], ["a", 0, 1], ["long", 0.5, 9], ["m", 7, null], ["z", 20, 21]]));
  it("returns items intersecting the window, including long items that start earlier", () => {
    expect(visibleItems(idx, 4, 6.5).map((i) => i.id)).toEqual(["long", "c"]);
  });
  it("treats markers as points", () => {
    expect(visibleItems(idx, 7, 7).map((i) => i.id)).toEqual(["long", "m"]);
    expect(visibleItems(idx, 9.01, 10)).toEqual([]);
  });
  it("returns nothing outside the content", () => {
    expect(visibleItems(idx, 30, 40)).toEqual([]);
  });
  it("matches a brute-force scan on a large track", () => {
    const items: [string, number, number | null][] = Array.from({ length: 50000 }, (_, i) => [`w${i}`, i * 0.3, i * 0.3 + (i % 7 === 0 ? 4 : 0.25)]);
    const big = indexTrack(track(items));
    const brute = (t0: number, t1: number) => big.items.filter((it) => it.start <= t1 && (it.end ?? it.start) >= t0).map((i) => i.id);
    for (const [a, b] of [[0, 10], [1234.5, 1240], [14999, 15010], [20000, 21000]]) {
      expect(visibleItems(big, a, b).map((i) => i.id)).toEqual(brute(a, b));
    }
    expect(visibleItems(big, 1000, 1010).length).toBeLessThan(60);
  });
});

describe("window and ticks", () => {
  it("accounts for the label gutter and margin", () => {
    const w = visibleWindow(1000, 800, 100, 120, 100);
    expect(w.t0).toBeCloseTo(7.8);
    expect(w.t1).toBeCloseTo(17.8);
    expect(visibleWindow(0, 800, 100, 120, 200).t0).toBe(0);
  });
  it("picks wider ticks when zoomed out", () => {
    expect(tickStep(200)).toBe(0.5);
    expect(tickStep(10)).toBe(10);
    expect(tickStep(0.01)).toBe(3600);
  });
});

describe("packRows", () => {
  it("stacks overlapping spans and reuses rows", () => {
    const { rows, count } = packRows([{ start: 0, end: 5 }, { start: 1, end: 3 }, { start: 4, end: 6 }, { start: 5, end: 7 }]);
    expect(rows).toEqual([0, 1, 1, 0]);
    expect(count).toBe(2);
  });
});
