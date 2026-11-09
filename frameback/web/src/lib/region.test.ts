import { describe, expect, it } from "vitest";
import { containedRect, dragRect, isClick, rectFromPoints, toNormalized } from "./region";

describe("containedRect", () => {
  it("letterboxes a wide video in a tall container", () => {
    const r = containedRect(1000, 1000, 1920, 1080);
    expect(r.w).toBeCloseTo(1000);
    expect(r.h).toBeCloseTo(562.5);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(218.75);
  });
  it("pillarboxes a vertical video in a wide container", () => {
    const r = containedRect(1600, 900, 1080, 1920);
    expect(r.h).toBeCloseTo(900);
    expect(r.w).toBeCloseTo(506.25);
    expect(r.x).toBeCloseTo(546.875);
    expect(r.y).toBeCloseTo(0);
  });
  it("falls back to the full box while the video size is unknown", () => {
    expect(containedRect(300, 200, 0, 0)).toEqual({ x: 0, y: 0, w: 300, h: 200 });
  });
});

describe("normalization", () => {
  const frame = containedRect(1000, 1000, 1920, 1080);
  it("maps the frame corners to 0 and 1, ignoring the bars", () => {
    const tl = toNormalized(0, 218.75, frame);
    expect(tl.x).toBeCloseTo(0);
    expect(tl.y).toBeCloseTo(0);
    const br = toNormalized(1000, 781.25, frame);
    expect(br.x).toBeCloseTo(1);
    expect(br.y).toBeCloseTo(1);
  });
  it("clamps pointers that are inside the bars", () => {
    expect(toNormalized(500, 0, frame)).toEqual({ x: 0.5, y: 0 });
    expect(toNormalized(2000, 5000, frame)).toEqual({ x: 1, y: 1 });
  });
  it("builds rects from any drag direction", () => {
    const r = rectFromPoints({ x: 0.6, y: 0.7 }, { x: 0.2, y: 0.1 });
    expect(r).toMatchObject({ shape: "rect", x: 0.2, y: 0.1 });
    expect(r.w).toBeCloseTo(0.4);
    expect(r.h).toBeCloseTo(0.6);
  });
  it("tells clicks from drags in pixels", () => {
    expect(isClick({ x: 0.5, y: 0.5 }, { x: 0.501, y: 0.5 }, frame)).toBe(true);
    expect(isClick({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, frame)).toBe(false);
  });
});

describe("dragRect", () => {
  const r = { shape: "rect" as const, x: 0.2, y: 0.2, w: 0.3, h: 0.3 };
  it("moves within the frame", () => {
    expect(dragRect(r, "move", 0.9, -0.5)).toMatchObject({ x: 0.7, y: 0 });
  });
  it("resizes from the south-east corner", () => {
    const out = dragRect(r, "se", 0.1, 0.1);
    expect(out.w).toBeCloseTo(0.4);
    expect(out.h).toBeCloseTo(0.4);
  });
  it("cannot invert through the opposite edge", () => {
    const out = dragRect(r, "w", 5, 0);
    expect(out.w).toBeCloseTo(0.01);
    expect(out.x + out.w).toBeCloseTo(0.5);
  });
});
