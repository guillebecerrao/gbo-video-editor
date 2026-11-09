/** Create (or reopen) the review for a video: probe, resolve + freeze the timeline, auto-carry comments. */
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  carryComments,
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
  /** carry comments over from the previous `_v<N-1>` version when this review is new (default true) */
  carry?: boolean;
}

export interface PreparedReview {
  dir: string;
  review: Review;
  created: boolean;
  /** number of comments carried over from the previous version */
  carried: number;
}

export class InvalidVideoError extends Error {}

/** `final_v3` -> { base: "final", n: 3 } */
export function splitVersion(stem: string): { base: string; n: number } | null {
  const m = /^(.+)_v(\d+)$/.exec(stem);
  return m ? { base: m[1], n: parseInt(m[2], 10) } : null;
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

export async function prepareReview(videoPath: string, opts: PrepareOptions = {}): Promise<PreparedReview> {
  const video = await assertVideoFile(videoPath);
  const videoInfo = (await probeVideo(video)) ?? undefined;
  const existing = await reviewExists(reviewDirForVideo(video));
  const timeline = existing
    ? null
    : await resolveTimeline(video, { timelinePath: opts.timelinePath, edlPath: opts.edlPath, videoDuration: videoInfo?.duration });

  const { dir, review, created } = await openReview(video, { videoInfo, timeline });
  let carried = 0;
  let current = review;
  if (created && opts.carry !== false) {
    const version = splitVersion(review.id);
    if (version && version.n > 1) {
      const previousDir = path.join(path.dirname(dir), `${version.base}_v${version.n - 1}`);
      if (await reviewExists(previousDir)) {
        carried = (await carryComments(previousDir, dir)).length;
        current = await readReview(dir); // carryComments records `previous`
      }
    }
  }
  return { dir, review: current, created, carried };
}
