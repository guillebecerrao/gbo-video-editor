/** Thin typed wrapper over the HTTP contract in src/core/api.ts. */
import type {
  Comment, CommentPatch, CreateCommentRequest, HumanStatus, Review, ReviewBundle, ReviewSummary, VideoInfo, VideoStatus, Waveform,
} from "@core/api";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Cannot reach the Frameback server. Is it still running?", 0, "network");
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    let code: string | undefined;
    try {
      const data = (await res.json()) as { error?: string; code?: string };
      if (data.error) message = data.error;
      code = data.code;
    } catch { /* non-JSON error body */ }
    throw new ApiError(message, res.status, code);
  }
  return (await res.json()) as T;
}

const r = (rid: string) => `/api/reviews/${encodeURIComponent(rid)}`;
const c = (rid: string, id: string) => `${r(rid)}/comments/${id}`;

export const api = {
  listReviews: () => request<ReviewSummary[]>("GET", "/api/reviews"),
  bundle: (rid: string) => request<ReviewBundle>("GET", r(rid)),
  videoStatus: (rid: string) => request<VideoStatus>("GET", `${r(rid)}/video-status`),
  comments: (rid: string) => request<Comment[]>("GET", `${r(rid)}/comments`),
  createComment: (rid: string, body: CreateCommentRequest) => request<Comment>("POST", `${r(rid)}/comments`, body),
  patchComment: (rid: string, id: string, patch: CommentPatch) => request<Comment>("PATCH", c(rid, id), patch),
  setStatus: (rid: string, id: string, status: HumanStatus) => request<Comment>("POST", `${c(rid, id)}/status`, { status }),
  deleteComment: (rid: string, id: string) => request<Comment>("DELETE", c(rid, id)),
  reply: (rid: string, id: string, text: string) => request<Comment>("POST", `${c(rid, id)}/thread`, { text }),
  submit: (rid: string) => request<Review>("POST", `${r(rid)}/submit`),
  reopen: (rid: string) => request<Review>("POST", `${r(rid)}/reopen`),
  videoInfo: (rid: string, info: Partial<Omit<VideoInfo, "file">>) => request<Review>("POST", `${r(rid)}/video-info`, info),
  /** The waveform is optional (needs ffmpeg on the server): any failure means "no waveform". */
  async waveform(rid: string, buckets: number): Promise<Waveform | null> {
    try {
      return await request<Waveform>("GET", `${r(rid)}/waveform?buckets=${buckets}`);
    } catch {
      return null;
    }
  },
};

export const snapshotUrl = (rid: string, commentId: string, cacheBust?: string | null) =>
  `/media/${encodeURIComponent(rid)}/snapshots/${commentId}.jpg${cacheBust ? `?v=${encodeURIComponent(cacheBust)}` : ""}`;
