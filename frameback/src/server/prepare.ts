/** Create (or reopen) the review for a video: probe, resolve + freeze the timeline, auto-carry comments. */
import { promises as fs, realpathSync } from "node:fs";
import path from "node:path";
import {
  carryComments,
  findBinary,
  adoptVideo,
  checkVideo,
  openReview,
  probeVideo,
  resolveTimeline,
  reviewDirForVideo,
  readReview,
  reviewExists,
  type Review,
} from "../core/index.js";

export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm", ".mkv"] as const;

export interface PrepareOptions {
  timelinePath?: string;
  edlPath?: string;
  /** carry comments over from the previous version when this review is new (default true) */
  carry?: boolean;
  /** accept a video that changed since it was opened for review (`frameback open --force`) */
  force?: boolean;
  /** review dir to carry from (e.g. the review whose `nextVideo` is this video); default: auto-detected */
  carryFrom?: string;
}

export interface PreparedReview {
  dir: string;
  review: Review;
  created: boolean;
  /** number of comments carried over from the previous version */
  carried: number;
  /** timeline warnings plus anything else worth telling the user */
  warnings: string[];
}

export class InvalidVideoError extends Error {}

/** The file under an open review was replaced: its comments point at a cut that no longer exists. */
export class VideoChangedError extends Error {}

/** `final` -> `final_v2`, `final_v3` -> `final_v4` */
export function nextVersionName(file: string): string {
  const ext = path.extname(file);
  const stem = path.basename(file, ext);
  const v = splitVersion(stem);
  return v ? `${v.base}_v${v.n + 1}${ext}` : `${stem}_v2${ext}`;
}

/** `final_v3` -> { base: "final", n: 3 } */
export function splitVersion(stem: string): { base: string; n: number } | null {
  const m = /^(.+)_v(\d+)$/.exec(stem);
  return m ? { base: m[1], n: parseInt(m[2], 10) } : null;
}

/** Absolute, symlink-resolved path (falls back to the plain absolute path when it cannot be resolved). */
export function realPathSync(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    return path.resolve(file);
  }
}

export async function assertVideoFile(videoPath: string): Promise<string> {
  const abs = path.resolve(videoPath);
  const st = await fs.stat(abs).catch(() => null);
  if (!st?.isFile()) throw new InvalidVideoError(`video not found: ${abs}`);
  if (!VIDEO_EXTENSIONS.includes(path.extname(abs).toLowerCase() as (typeof VIDEO_EXTENSIONS)[number])) {
    throw new InvalidVideoError(`unsupported video type '${path.extname(abs)}' (expected ${VIDEO_EXTENSIONS.join(", ")})`);
  }
  return abs;
}

/**
 * Where do this video's comments come from? 1) a sibling review whose `nextVideo` points at this video
 * (the explicit link the agent wrote on delivery), 2) the highest lower version of the same base
 * (`promo_v2` <- `promo_v1` <- `promo`).
 */
async function findPreviousReviewDir(dir: string, video: string): Promise<string | null> {
  const reviewsRoot = path.dirname(dir);
  const names = await fs.readdir(reviewsRoot).catch(() => [] as string[]);
  const me = path.basename(dir);
  const target = realPathSync(video);
  for (const name of names.sort()) {
    const other = path.join(reviewsRoot, name);
    if (name === me || !(await reviewExists(other))) continue;
    try {
      const r = await readReview(other);
      if (r.nextVideo && realPathSync(path.resolve(other, r.nextVideo)) === target) return other;
    } catch {
      /* unreadable review: ignore */
    }
  }
  const version = splitVersion(me);
  if (!version) return null;
  for (let n = version.n - 1; n >= 0; n--) {
    const candidate = path.join(reviewsRoot, n === 0 ? version.base : `${version.base}_v${n}`);
    if (await reviewExists(candidate)) return candidate;
  }
  return null;
}

export async function prepareReview(videoPath: string, opts: PrepareOptions = {}): Promise<PreparedReview> {
  const video = await assertVideoFile(videoPath);
  const probed = await probeVideo(video);
  const videoInfo = probed ?? undefined;
  const extra: string[] = [];
  if (!probed && (await findBinary("ffprobe"))) {
    extra.push(`ffprobe found no video stream in ${path.basename(video)}; is it really a video?`);
  }
  const existing = await reviewExists(reviewDirForVideo(video));
  const explicitTimeline = Boolean(opts.timelinePath || opts.edlPath);
  // an explicit --edl/--timeline always wins (and re-freezes the timeline of an existing review);
  // otherwise the timeline is auto-detected when the review is created only
  const timeline =
    existing && !explicitTimeline
      ? null
      : await resolveTimeline(video, { timelinePath: opts.timelinePath, edlPath: opts.edlPath, videoDuration: videoInfo?.duration });

  const { dir, review, created } = await openReview(video, { videoInfo, timeline, refreshTimeline: explicitTimeline });
  let current = review;
  const warnings: string[] = [];
  if (!created) {
    const status = await checkVideo(dir);
    if (status.changed) {
      if (!opts.force) {
        throw new VideoChangedError(
          `${path.basename(video)} changed after it was opened for review, so its comments may no longer match the video. ` +
            `Render the new cut as ${nextVersionName(video)} and open that instead, or re-run with --force to keep reviewing this file as it is now.`,
        );
      }
      current = await adoptVideo(dir);
      warnings.push(`${path.basename(video)} changed since it was opened; re-adopted the current file (--force). Existing comments may not match the new cut.`);
    }
  }
  let carried = 0;
  if (created && opts.carry !== false) {
    const previousDir =
      opts.carryFrom && path.resolve(opts.carryFrom) !== dir ? opts.carryFrom : await findPreviousReviewDir(dir, video);
    if (previousDir && (await reviewExists(previousDir))) {
      carried = (await carryComments(previousDir, dir)).length;
      current = await readReview(dir); // carryComments records `previous`
    }
  }
  return { dir, review: current, created, carried, warnings: [...(current.timeline?.warnings ?? []), ...extra, ...warnings] };
}
