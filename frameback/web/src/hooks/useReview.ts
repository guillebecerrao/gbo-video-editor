/** Loads a review bundle and keeps comments, review state and versions live through the event stream. */
import { useCallback, useEffect, useState } from "react";
import type { ReviewBundle } from "@core/api";
import type { Comment, Review } from "@core/schema";
import { api } from "../api/client";
import { openEventStream } from "../api/events";
import { upsertComment } from "../lib/comments";

export type ReviewData =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; bundle: ReviewBundle; review: Review; comments: Comment[]; live: boolean };

export interface ReviewApi {
  data: ReviewData;
  /** Apply a comment returned by a mutation right away (the event stream confirms it later). */
  applyComment: (c: Comment) => void;
  applyReview: (r: Review) => void;
}

const REFRESH_DEBOUNCE_MS = 80;

export function useReview(rid: string): ReviewApi {
  const [data, setData] = useState<ReviewData>({ status: "loading" });

  const applyComment = useCallback((c: Comment) => {
    setData((d) => (d.status === "ready" ? { ...d, comments: upsertComment(d.comments, c) } : d));
  }, []);
  const applyReview = useCallback((review: Review) => {
    setData((d) => (d.status === "ready" ? { ...d, review } : d));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stopStream = () => {};
    let commentsTimer: ReturnType<typeof setTimeout> | undefined;
    let bundleTimer: ReturnType<typeof setTimeout> | undefined;
    setData({ status: "loading" });

    // The timeline can be large and never changes under a review: only the first load fetches it.
    const refreshComments = () => {
      clearTimeout(commentsTimer);
      commentsTimer = setTimeout(async () => {
        try {
          const comments = await api.comments(rid);
          if (!cancelled) setData((d) => (d.status === "ready" ? { ...d, comments } : d));
        } catch { /* the next event or reconnect refreshes again */ }
      }, REFRESH_DEBOUNCE_MS);
    };
    const refreshBundle = () => {
      clearTimeout(bundleTimer);
      bundleTimer = setTimeout(async () => {
        try {
          const b = await api.bundle(rid);
          if (!cancelled) {
            setData((d) => (d.status === "ready"
              ? { ...d, review: b.review, comments: b.comments, bundle: { ...d.bundle, ...b, timeline: d.bundle.timeline } }
              : d));
          }
        } catch { /* ditto */ }
      }, REFRESH_DEBOUNCE_MS);
    };

    api.bundle(rid).then(
      (bundle) => {
        if (cancelled) return;
        setData({ status: "ready", bundle, review: bundle.review, comments: bundle.comments, live: false });
        stopStream = openEventStream(rid, bundle.lastSeq, {
          onConnection: (live) => setData((d) => (d.status === "ready" ? { ...d, live } : d)),
          onEvent: (e) => {
            if (e.type.startsWith("review.")) refreshBundle();
            else refreshComments();
          },
        });
      },
      (err: Error) => {
        if (!cancelled) setData({ status: "error", message: err.message });
      },
    );

    return () => {
      cancelled = true;
      clearTimeout(commentsTimer);
      clearTimeout(bundleTimer);
      stopStream();
    };
  }, [rid]);

  return { data, applyComment, applyReview };
}
