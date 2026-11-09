/** Optional ffprobe/ffmpeg helpers (owned by lane L1). Must degrade gracefully when ffmpeg is not installed. */
import type { VideoInfo } from "./schema.js";
import type { Waveform } from "./api.js";

export async function probeVideo(_videoPath: string): Promise<Partial<Omit<VideoInfo, "file">> | null> {
  throw new Error("not implemented (L1)");
}

export async function computeWaveform(_videoPath: string, _buckets: number): Promise<Waveform | null> {
  throw new Error("not implemented (L1)");
}
