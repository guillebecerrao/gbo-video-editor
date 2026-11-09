/** The set of reviews a running server is willing to serve. Nothing outside it is ever readable over HTTP. */
import path from "node:path";
import { reviewDirForVideo } from "../core/index.js";
import { assertVideoFile, prepareReview, type PrepareOptions, type PreparedReview } from "./prepare.js";

export interface RegistryEntry {
  rid: string;
  videoPath: string;
  reviewDir: string;
}

export class Registry {
  private readonly entries = new Map<string, RegistryEntry>();
  /** registrations run one at a time so rid allocation and review creation never interleave */
  private queue: Promise<unknown> = Promise.resolve();

  get(rid: string): RegistryEntry | undefined {
    return this.entries.get(rid);
  }

  byVideo(videoPath: string): RegistryEntry | undefined {
    const abs = path.resolve(videoPath);
    return [...this.entries.values()].find((e) => e.videoPath === abs);
  }

  list(): RegistryEntry[] {
    return [...this.entries.values()];
  }

  /** Register (and open/create the review of) a video. Idempotent per video path. */
  register(videoPath: string, opts: PrepareOptions = {}): Promise<{ entry: RegistryEntry; prepared: PreparedReview }> {
    const run = this.queue.then(() => this.registerNow(videoPath, opts));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async registerNow(videoPath: string, opts: PrepareOptions) {
    const video = await assertVideoFile(videoPath);
    const prepared = await prepareReview(video, opts);
    const known = this.byVideo(video);
    if (known) return { entry: known, prepared };
    const stem = path.basename(video, path.extname(video));
    let rid = stem;
    for (let n = 2; this.entries.has(rid); n++) rid = `${stem}-${n}`;
    const entry: RegistryEntry = { rid, videoPath: video, reviewDir: reviewDirForVideo(video) };
    this.entries.set(rid, entry);
    return { entry, prepared };
  }
}
