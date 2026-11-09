import { describe, it, expect } from "vitest";
import { mapTime, mapSpan, remapAnchor } from "./remap.js";
import type { Timeline } from "./schema.js";
import { tl } from "./remap.fixture.js";

// v1: cam 0-10 | 20-30 | 40-50  (output 0-10, 10-20, 20-30)
const v1 = tl([["cam", 0, 10], ["cam", 20, 30], ["cam", 40, 50]]);
const dropMiddle = tl([["cam", 0, 10], ["cam", 40, 50]]);

describe("mapTime", () => {
  it("shifts earlier when a segment before it was removed", () => {
    expect(mapTime(v1, dropMiddle, 25)).toEqual({ time: 15, method: "source", status: "exact" });
  });
  it("is lost when the containing segment was removed, with a neighbour fallback", () => {
    const m = mapTime(v1, dropMiddle, 15);
    expect(m.status).toBe("lost");
    expect(m.time).toBe(10);
  });
  it("follows reordered segments", () => {
    const v2 = tl([["cam", 40, 50], ["cam", 0, 10], ["cam", 20, 30]]);
    expect(mapTime(v1, v2, 5).time).toBe(10 + 5);
    expect(mapTime(v1, v2, 25).time).toBe(5);
  });
  it("handles a trimmed segment (point inside the cut part is lost, inside the kept part moves)", () => {
    const v2 = tl([["cam", 0, 10], ["cam", 24, 30], ["cam", 40, 50]]);
    expect(mapTime(v1, v2, 11).status).toBe("lost"); // src 21 trimmed away
    expect(mapTime(v1, v2, 18)).toEqual({ time: 14, method: "source", status: "exact" }); // src 28
  });
  it("uses anchor.source as key", () => {
    const v2 = tl([["cam", 40, 50]]);
    expect(mapTime(null, v2, 99, { name: "cam", time: 45 })).toEqual({ time: 5, method: "source", status: "exact" });
  });
  it("falls back to identity without source info", () => {
    const plain: Timeline = { schemaVersion: 1, tracks: [] };
    expect(mapTime(plain, v1, 7)).toEqual({ time: 7, method: "identity", status: "exact" });
    expect(mapTime(v1, plain, 7).method).toBe("identity");
    expect(mapTime(null, null, 7).method).toBe("identity");
  });
  it("prefers the occurrence near the original order when a source range repeats", () => {
    const v2 = tl([["cam", 0, 10], ["cam", 0, 10]]);
    expect(mapTime(tl([["cam", 0, 10]]), v2, 2).time).toBe(2);
    expect(mapTime(tl([["x", 0, 1], ["cam", 0, 10]]), v2, 3).time).toBe(12);
  });
});

describe("mapSpan", () => {
  it("clamps a span partly cut", () => {
    const v2 = tl([["cam", 0, 10], ["cam", 24, 30], ["cam", 40, 50]]);
    const m = mapSpan(v1, v2, { start: 12, end: 18 }); // src 22-28 survives as 24-28
    expect(m.status).toBe("clamped");
    expect(m.time).toEqual({ start: 10, end: 14 });
  });
  it("is exact for a surviving span and lost when fully cut", () => {
    expect(mapSpan(v1, dropMiddle, { start: 21, end: 24 })).toEqual({ time: { start: 11, end: 14 }, method: "source", status: "exact" });
    expect(mapSpan(v1, dropMiddle, { start: 12, end: 18 }).status).toBe("lost");
  });
  it("is identity without source info", () => {
    expect(mapSpan(null, null, { start: 1, end: 2 })).toEqual({ time: { start: 1, end: 2 }, method: "identity", status: "exact" });
  });
});

describe("remapAnchor", () => {
  it("updates frame and entity, keeps region", () => {
    const r = remapAnchor(v1, dropMiddle, {
      time: { start: 25 }, frame: 600, region: { shape: "point", x: 0.5, y: 0.5 },
      entity: { track: "cuts", id: "range:2", type: "range", label: "old" },
    }, 24);
    expect(r.anchor.time.start).toBe(15);
    expect(r.anchor.frame).toBe(360);
    expect(r.anchor.entity?.id).toBe("range:1");
    expect(r.anchor.region).toEqual({ shape: "point", x: 0.5, y: 0.5 });
  });
  it("drops the entity (and frame without fps) when lost", () => {
    const r = remapAnchor(v1, dropMiddle, { time: { start: 15 }, frame: 360, entity: { track: "cuts", id: "range:1", type: "range" } }, null);
    expect(r.remap.status).toBe("lost");
    expect(r.anchor.entity).toBeUndefined();
    expect(r.anchor.frame).toBeUndefined();
    expect(r.from).toEqual({ start: 15 });
  });
});
