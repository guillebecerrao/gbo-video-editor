/**
 * HTTP contract between the Frameback server (src/server) and the web UI (web/).
 * Normative: both sides import these types. All JSON. Errors: { error: string, code?: string } with 4xx/5xx.
 *
 * The server hosts several reviews at once (one per opened video). `rid` = review id (the video stem);
 * if two videos share a stem, the server suffixes `-2`, `-3`… in its registry (the review dir is unaffected).
 *
 *  GET    /api/health                              -> Health
 *  GET    /api/reviews                             -> ReviewSummary[]            (registered reviews)
 *  POST   /api/reviews        RegisterReviewRequest -> RegisterReviewResponse            (register another video; used by a 2nd `frameback open`)
 *  GET    /api/reviews/:rid                        -> ReviewBundle
 *  GET    /api/reviews/:rid/video-status           -> VideoStatus                (has the file changed since it was opened?)
 *  GET    /api/reviews/:rid/timeline               -> Timeline | null
 *  GET    /api/reviews/:rid/comments               -> Comment[]                  (non-deleted)
 *  GET    /api/reviews/:rid/comments/:id           -> Comment
 *  POST   /api/reviews/:rid/comments   CreateCommentRequest (JSON, limit 15 MB) -> Comment
 *  PATCH  /api/reviews/:rid/comments/:id   CommentPatch            -> Comment     (human fields only)
 *  PUT    /api/reviews/:rid/comments/:id/snapshot  (image/jpeg body) -> Comment
 *  POST   /api/reviews/:rid/comments/:id/status  {status: HumanStatus} -> Comment (verified|reopened|resolved_by_human|open)
 *  DELETE /api/reviews/:rid/comments/:id                           -> Comment     (soft delete)
 *  POST   /api/reviews/:rid/comments/:id/thread  {text}            -> Comment     (author = human)
 *  POST   /api/reviews/:rid/submit                                 -> Review      ("Process review")
 *  POST   /api/reviews/:rid/reopen                                 -> Review
 *  POST   /api/reviews/:rid/video-info  Partial<VideoInfo>         -> Review      (UI reports duration/size if ffprobe missing)
 *  GET    /api/reviews/:rid/events?since=<seq>     -> text/event-stream; each SSE message `data:` is one Event JSON,
 *                                                     SSE `id:` = seq. Replays events with seq > since, then live.
 *                                                     Server detects writes by other processes (CLI/MCP) by polling
 *                                                     events.ndjson (stat ~250 ms); heartbeat comment every 15 s.
 *  GET    /api/reviews/:rid/waveform?buckets=N     -> Waveform | 404 (needs ffmpeg; optional)
 *  GET    /media/:rid/video                         -> the video bytes, with HTTP Range support
 *  GET    /media/:rid/snapshots/:id.jpg             -> snapshot image
 *  GET    /media/:rid/next                           -> 302 to the UI for review.nextVideo once delivered (registers it)
 *  GET    /*                                        -> web UI (dist/web); UI route: /?r=<rid>
 *
 *  GET    /api/share?rid=                          -> { links, urls, mode, expiresAt } (share mode, trusted local clients only)
 *
 * Security: bind 127.0.0.1 only; never serve paths that were not registered; ids validated by regex.
 * Share mode (`open --share`): also listens on private addresses. Peers that are not a trusted local client (loopback
 * socket + loopback Host + no proxy headers) need the key and may only call the review routes (allowlist in
 * src/server/share.ts: read the review, comment, submit, reopen); anything else is 403. For them `reviewDir` is left
 * out of ReviewSummary and absolute paths are removed from error messages.
 */
import type { Comment, Review, Timeline, VideoInfo, VideoFingerprint, HumanStatus, CommentPatch, NewComment, Event } from "./schema.js";

export type { Comment, Review, Timeline, VideoInfo, HumanStatus, CommentPatch, NewComment, Event };

export interface VideoStatus {
  /** the file under the review's video path no longer matches what was opened */
  changed: boolean;
  stored: VideoFingerprint | null;
  current: VideoFingerprint | null;
}

export interface Health {
  app: "frameback";
  version: string;
  pid: number;
  /** present (true) when the server runs with `--share` */
  share?: boolean;
}

export interface ReviewSummary {
  rid: string;
  reviewDir: string; // absolute (omitted for share-mode remote peers)
  videoName: string; // basename
  state: Review["state"];
  counts: { total: number; pending: number; prepared: number; applied: number; needs_info: number; reopened?: number };
}

/** Response of POST /api/reviews: the summary plus what `frameback open` should tell the user. */
export interface RegisterReviewResponse extends ReviewSummary {
  /** comments carried over from the previous version (0 when the review already existed) */
  carried?: number;
  /** timeline warnings and other notices */
  warnings?: string[];
}

export interface ReviewBundle {
  rid: string;
  review: Review;
  videoUrl: string; // "/media/<rid>/video"
  videoName: string;
  timeline: Timeline | null;
  comments: Comment[];
  lastSeq: number;
  /** sibling versions found next to the video (same stem without _vN suffix), oldest first */
  versions: { name: string; rid: string | null; isCurrent: boolean }[];
  /** set when review.nextVideo exists */
  next: { name: string; url: string } | null;
  /** has the video file changed since the review was opened? `changed: true` => comment times may not match */
  videoStatus: VideoStatus;
}

export interface Waveform {
  buckets: number;
  duration: number;
  /** peaks 0..1, length = buckets */
  peaks: number[];
}

export interface RegisterReviewRequest {
  /** absolute path of the video to review */
  video: string;
  /** explicit EDL / timeline sidecar (same as `frameback open --edl/--timeline`) */
  edl?: string;
  timeline?: string;
  /** false disables carrying comments over from the previous `_vN` version (default true) */
  carry?: boolean;
  /** accept a video that changed since it was opened (`frameback open --force`) */
  force?: boolean;
}

export interface CreateCommentRequest {
  comment: NewComment;
  /** optional "data:image/jpeg;base64,…" frame snapshot with the region already drawn */
  snapshotDataUrl?: string | null;
}

export const DEFAULT_PORT = 4747;
