/**
 * Timeline resolution (owned by lane L1).
 * Order: `<stem>.timeline.json` sidecar next to the video -> `edl.json` next to the video (video-use/gbo-style shape)
 * -> null. EDL-derived timelines are `approximate: true` and get warnings when the EDL is newer than the video
 * or durations differ by > 0.5 s.
 */
import type { FrozenTimeline } from "./store.js";
import type { Timeline } from "./schema.js";

export interface ResolveTimelineOptions {
  /** explicit sidecar or edl path (CLI --timeline / --edl) */
  timelinePath?: string;
  edlPath?: string;
  /** known video duration in seconds, for drift warnings */
  videoDuration?: number | null;
}

export async function resolveTimeline(_videoPath: string, _opts: ResolveTimelineOptions = {}): Promise<FrozenTimeline | null> {
  throw new Error("not implemented (L1)");
}

/** Convert a video-use / gbo-style edl.json (+ transcripts dir) into a Frameback Timeline. Pure given file contents. */
export async function edlToTimeline(_edlPath: string): Promise<{ timeline: Timeline; warnings: string[] }> {
  throw new Error("not implemented (L1)");
}
