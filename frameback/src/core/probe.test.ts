import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeWaveform, findBinary, probeVideo } from "./probe.js";

const ffmpeg = await findBinary("ffmpeg");
const hasFfmpeg = ffmpeg !== null && (await findBinary("ffprobe")) !== null;

let tmp: string;
let clip: string;
beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fb-probe-"));
  clip = path.join(tmp, "clip.mp4");
  if (hasFfmpeg) {
    // 2 s, 25 fps, 320x180: one second of tone then one of silence
    execFileSync(ffmpeg!, [
      "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=25:duration=2",
      "-f", "lavfi", "-i", "aevalsrc='if(lt(t,1),sin(2*PI*440*t),0)':s=48000:d=2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", clip,
    ]);
  }
});
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

describe.skipIf(!hasFfmpeg)("with ffmpeg installed", () => {
  it("probes duration, fps and size", async () => {
    const info = await probeVideo(clip);
    expect(info).toMatchObject({ fps: 25, width: 320, height: 180 });
    expect(info!.duration).toBeGreaterThan(1.9);
    expect(info!.duration).toBeLessThan(2.2);
  });

  it("returns null for a file that is not a video", async () => {
    const junk = path.join(tmp, "junk.mp4");
    await fs.writeFile(junk, "not a video");
    expect(await probeVideo(junk)).toBeNull();
    expect(await computeWaveform(junk, 10)).toBeNull();
  });

  it("computes normalized peaks", async () => {
    const wf = (await computeWaveform(clip, 8))!;
    expect(wf.buckets).toBe(8);
    expect(wf.peaks).toHaveLength(8);
    expect(wf.duration).toBeGreaterThan(1.9);
    expect(Math.max(...wf.peaks)).toBe(1);
    // loud first half, silent second half
    expect(Math.min(...wf.peaks.slice(0, 3))).toBeGreaterThan(0.5);
    expect(Math.max(...wf.peaks.slice(5))).toBeLessThan(0.2);
  });
});
