/** Time and frame helpers. All times are seconds in the reviewed video. */

export const FALLBACK_FPS = 24;
/** Guards against float noise such as 12.4999999 * 24 = 299.99999. */
const EPS = 1e-4;

export function frameIndex(t: number, fps: number): number {
  return Math.max(0, Math.floor(t * fps + EPS));
}

/** Center of frame `n`: seeking here lands unambiguously on that frame. */
export function frameCenter(n: number, fps: number): number {
  return (n + 0.5) / fps;
}

/** Time of the frame `delta` frames away from the one containing `t`, clamped to the video. */
export function stepFrames(t: number, delta: number, fps: number, duration: number): number {
  const lastFrame = Math.max(0, Math.ceil(duration * fps - EPS) - 1);
  const n = Math.min(lastFrame, Math.max(0, frameIndex(t, fps) + delta));
  return frameCenter(n, fps);
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** `mm:ss+ff` (`h:mm:ss+ff` from one hour on). `ff` is a frame count, so it is set apart with `+` to avoid reading it as decimal seconds. */
export function formatTimecode(t: number, fps: number = FALLBACK_FPS): string {
  const n = frameIndex(t, fps);
  const whole = Math.floor(n / fps);
  const ff = n - whole * fps;
  const ffText = pad(Math.floor(ff), String(Math.ceil(fps) - 1).length);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}+${ffText}` : `${pad(m)}:${pad(s)}+${ffText}`;
}

/** Compact clock for ruler labels: `m:ss` or `h:mm:ss`, with decimals when `decimals` > 0. */
export function formatClock(t: number, decimals = 0): string {
  const scale = 10 ** decimals;
  const total = Math.round(Math.max(0, t) * scale) / scale;
  const whole = Math.floor(total);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const frac = decimals > 0 ? "." + String(Math.round((total - whole) * scale)).padStart(decimals, "0") : "";
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}${frac}` : `${m}:${pad(s)}${frac}`;
}

export function formatSpan(start: number, end: number | null | undefined, fps: number): string {
  return end != null && end > start ? `${formatTimecode(start, fps)}–${formatTimecode(end, fps)}` : formatTimecode(start, fps);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
