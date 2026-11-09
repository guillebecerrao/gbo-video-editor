/** Region geometry. Regions are normalized (0–1) to the *encoded frame*, never to the letterboxed element. */
import type { Region } from "@core/schema";
import { clamp } from "./time";

export interface Box { x: number; y: number; w: number; h: number }
export type RectRegion = Extract<Region, { shape: "rect" }>;

/** Where the encoded frame is drawn inside a container using `object-fit: contain`. */
export function containedRect(containerW: number, containerH: number, videoW: number, videoH: number): Box {
  if (containerW <= 0 || containerH <= 0 || videoW <= 0 || videoH <= 0) return { x: 0, y: 0, w: containerW, h: containerH };
  const scale = Math.min(containerW / videoW, containerH / videoH);
  const w = videoW * scale;
  const h = videoH * scale;
  return { x: (containerW - w) / 2, y: (containerH - h) / 2, w, h };
}

/** Pixel position inside the container -> normalized frame coordinates (clamped: pointer may leave the frame). */
export function toNormalized(px: number, py: number, frame: Box): { x: number; y: number } {
  return { x: clamp((px - frame.x) / frame.w, 0, 1), y: clamp((py - frame.y) / frame.h, 0, 1) };
}

export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): RectRegion {
  return { shape: "rect", x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** True when a drag is too small to be a rectangle (a click => point region). */
export function isClick(a: { x: number; y: number }, b: { x: number; y: number }, frame: Box, thresholdPx = 5): boolean {
  return Math.hypot((a.x - b.x) * frame.w, (a.y - b.y) * frame.h) < thresholdPx;
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "move";
export const MIN_SIZE = 0.01;

/** Move or resize a rect by a normalized delta, keeping it inside the frame and at least MIN_SIZE wide/high. */
export function dragRect(r: RectRegion, handle: Handle, dx: number, dy: number): RectRegion {
  if (handle === "move") {
    return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) };
  }
  let left = r.x, top = r.y, right = r.x + r.w, bottom = r.y + r.h;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - MIN_SIZE);
  if (handle.includes("e")) right = clamp(right + dx, left + MIN_SIZE, 1);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - MIN_SIZE);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + MIN_SIZE, 1);
  return { shape: "rect", x: left, y: top, w: right - left, h: bottom - top };
}

/** CSS percentages of a region relative to the frame overlay. */
export function regionStyle(r: RectRegion): { left: string; top: string; width: string; height: string } {
  return { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` };
}
