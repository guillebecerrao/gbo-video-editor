/** Frame snapshot for a comment: the current video frame at native resolution (max 1280 px wide) with the region drawn on it. */
import type { Region } from "@core/schema";

const MAX_WIDTH = 1280;
const MARK_COLOR = "#ff3b6b";

export function snapshotSize(videoW: number, videoH: number): { w: number; h: number } {
  const scale = Math.min(1, MAX_WIDTH / videoW);
  return { w: Math.round(videoW * scale), h: Math.round(videoH * scale) };
}

export function captureSnapshot(video: HTMLVideoElement, region: Region | null): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const { w, h } = snapshotSize(video.videoWidth, video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  if (region) drawRegion(ctx, region, w, h);
  try {
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null; // tainted canvas: the comment is still sent, just without an image
  }
}

function drawRegion(ctx: CanvasRenderingContext2D, region: Region, w: number, h: number) {
  const line = Math.max(3, Math.round(w / 320));
  ctx.lineWidth = line;
  ctx.strokeStyle = MARK_COLOR;
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = line * 2;
  if (region.shape === "rect") {
    const x = region.x * w, y = region.y * h, rw = region.w * w, rh = region.h * h;
    ctx.fillStyle = "rgba(255,59,107,0.14)";
    ctx.fillRect(x, y, rw, rh);
    ctx.strokeRect(x, y, rw, rh);
    return;
  }
  const cx = region.x * w, cy = region.y * h, r = line * 5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.moveTo(cx - r * 1.8, cy);
  ctx.lineTo(cx - r * 0.6, cy);
  ctx.moveTo(cx + r * 0.6, cy);
  ctx.lineTo(cx + r * 1.8, cy);
  ctx.moveTo(cx, cy - r * 1.8);
  ctx.lineTo(cx, cy - r * 0.6);
  ctx.moveTo(cx, cy + r * 0.6);
  ctx.lineTo(cx, cy + r * 1.8);
  ctx.stroke();
}
