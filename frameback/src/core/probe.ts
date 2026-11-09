/** Optional ffprobe/ffmpeg helpers. Everything degrades gracefully (returns null) when ffmpeg is not installed. */
import { execFile, spawn } from "node:child_process";
import { promises as fs, constants as fsc } from "node:fs";
import path from "node:path";
import type { VideoInfo } from "./schema.js";
import type { Waveform } from "./api.js";

const FALLBACK_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", "/opt/homebrew/opt/ffmpeg-full/bin"];
const WAVEFORM_RATE = 8000;
/** Samples per fine-grained peak window (10 ms); peaks are max-pooled into the requested buckets afterwards. */
const WINDOW_SAMPLES = WAVEFORM_RATE / 100;

const located = new Map<string, Promise<string | null>>();

/** Locate `ffprobe` / `ffmpeg`: env var (FFPROBE / FFMPEG), then PATH, then common install dirs. */
export function findBinary(name: "ffprobe" | "ffmpeg"): Promise<string | null> {
  let hit = located.get(name);
  if (!hit) {
    hit = locate(name);
    located.set(name, hit);
  }
  return hit;
}

async function locate(name: string): Promise<string | null> {
  const fromEnv = process.env[name.toUpperCase()];
  if (fromEnv && (await isExecutable(fromEnv))) return fromEnv;
  const dirs = [...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean), ...FALLBACK_DIRS];
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (await isExecutable(candidate)) return candidate;
  }
  return null;
}

async function isExecutable(file: string): Promise<boolean> {
  try {
    await fs.access(file, fsc.X_OK);
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}

function parseRate(rate: unknown): number | null {
  if (typeof rate !== "string") return null;
  const [num, den = "1"] = rate.split("/");
  const value = Number(num) / Number(den);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) / 1000 : null;
}

export async function probeVideo(videoPath: string): Promise<Partial<Omit<VideoInfo, "file">> | null> {
  const ffprobe = await findBinary("ffprobe");
  if (!ffprobe) return null;
  const args = [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,avg_frame_rate,r_frame_rate:format=duration",
    "-of", "json", videoPath,
  ];
  const stdout = await new Promise<string | null>((resolve) => {
    execFile(ffprobe, args, { timeout: 15_000, maxBuffer: 1 << 20 }, (err, out) => resolve(err ? null : out));
  });
  if (!stdout) return null;
  try {
    const parsed = JSON.parse(stdout) as {
      streams?: { width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string }[];
      format?: { duration?: string };
    };
    const stream = parsed.streams?.[0];
    const duration = Number(parsed.format?.duration);
    const info: Partial<Omit<VideoInfo, "file">> = {
      duration: Number.isFinite(duration) && duration >= 0 ? duration : null,
      fps: parseRate(stream?.avg_frame_rate) ?? parseRate(stream?.r_frame_rate),
      width: stream?.width ?? null,
      height: stream?.height ?? null,
    };
    return stream || info.duration != null ? info : null;
  } catch {
    return null;
  }
}

/** Decode the audio track to 8 kHz mono and reduce it to `buckets` normalized peaks (0..1). Null without ffmpeg/audio. */
export async function computeWaveform(videoPath: string, buckets: number): Promise<Waveform | null> {
  const ffmpeg = await findBinary("ffmpeg");
  if (!ffmpeg || !Number.isInteger(buckets) || buckets < 1) return null;
  const fine = await decodePeaks(ffmpeg, videoPath);
  if (!fine || fine.length === 0) return null;

  const peaks = new Array<number>(buckets).fill(0);
  for (let i = 0; i < fine.length; i++) {
    const b = Math.min(buckets - 1, Math.floor((i * buckets) / fine.length));
    if (fine[i] > peaks[b]) peaks[b] = fine[i];
  }
  const max = Math.max(...peaks);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    buckets,
    duration: round((fine.length * WINDOW_SAMPLES) / WAVEFORM_RATE),
    peaks: peaks.map((p) => (max > 0 ? round(p / max) : 0)),
  };
}

/** Streams ffmpeg's PCM output and keeps only the absolute peak of each 10 ms window. */
function decodePeaks(ffmpeg: string, videoPath: string): Promise<number[] | null> {
  return new Promise((resolve) => {
    const child = spawn(
      ffmpeg,
      ["-v", "error", "-i", videoPath, "-vn", "-ac", "1", "-ar", String(WAVEFORM_RATE), "-f", "s16le", "-"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    const windows: number[] = [];
    let inWindow = 0;
    let peak = 0;
    let carry: Buffer | null = null;

    child.stdout.on("data", (chunk: Buffer) => {
      const buf = carry ? Buffer.concat([carry, chunk]) : chunk;
      const usable = buf.length - (buf.length % 2);
      for (let o = 0; o < usable; o += 2) {
        const v = Math.abs(buf.readInt16LE(o));
        if (v > peak) peak = v;
        if (++inWindow === WINDOW_SAMPLES) {
          windows.push(peak);
          inWindow = 0;
          peak = 0;
        }
      }
      carry = usable < buf.length ? buf.subarray(usable) : null;
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (inWindow > 0) windows.push(peak);
      resolve(code === 0 ? windows : null);
    });
  });
}
