import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewBundle, ReviewSummary, Waveform } from "@core/api";
import type { Comment, CommentPatch, HumanStatus, Review, TimelineItem } from "@core/schema";
import { api } from "./api/client";
import { Composer, LockedComposer, type ComposerPayload } from "./components/Composer";
import { CommentsPanel } from "./components/CommentsPanel";
import { HelpOverlay, ProcessDialog } from "./components/Dialogs";
import { Player } from "./components/Player";
import { Timeline } from "./components/Timeline";
import { TopBar } from "./components/TopBar";
import { useReview, type ReviewApi } from "./hooks/useReview";
import { useToasts } from "./hooks/useToasts";
import { useVideo } from "./hooks/useVideo";
import { buildAnchor, entityRef, type Draft, type Marks } from "./lib/anchor";
import { canEdit } from "./lib/comments";
import { captureSnapshot } from "./lib/snapshot";
import { FALLBACK_FPS, frameCenter, frameIndex } from "./lib/time";

const NO_MARKS: Marks = { in: null, out: null };
const TL_HEIGHT_KEY = "frameback.timelineHeight";

/** Height a timeline needs to show every lane, capped to a share of the window. */
function autoHeight(laneCount: number, hasWave: boolean): number {
  const need = 40 + 26 + 30 + (hasWave ? 40 : 0) + laneCount * 28 + 12;
  return Math.max(200, Math.min(need, Math.round(window.innerHeight * 0.45)));
}

/** The height the viewer chose, or null to size from the lanes. */
function readStoredHeight(): number | null {
  try {
    const raw = localStorage.getItem(TL_HEIGHT_KEY);
    const v = Number(raw);
    return raw != null && Number.isFinite(v) && v >= 120 ? v : null;
  } catch {
    return null;
  }
}

export function App() {
  const rid = new URLSearchParams(location.search).get("r");
  return rid ? <ReviewLoader rid={rid} /> : <ReviewChooser />;
}

// ------------------------------------------------------------------ entry states ----

function ReviewChooser() {
  const [list, setList] = useState<ReviewSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listReviews().then((reviews) => {
      if (reviews.length === 1) location.replace(`/?r=${encodeURIComponent(reviews[0].rid)}`);
      else setList(reviews);
    }, (e: Error) => setError(e.message));
  }, []);

  if (error) return <Splash title="Cannot reach Frameback" text={error} />;
  if (!list) return <Splash title="Loading…" />;
  if (list.length === 0) {
    return <Splash title="No review open" text="Run `frameback open <video>` to start reviewing a video." />;
  }
  return (
    <Splash title="Choose a review">
      <ul className="chooser">
        {list.map((r) => (
          <li key={r.rid}>
            <a href={`/?r=${encodeURIComponent(r.rid)}`}>
              <strong>{r.videoName}</strong>
              <span className="muted">{r.state} · {r.counts.total} comments</span>
            </a>
          </li>
        ))}
      </ul>
    </Splash>
  );
}

function Splash({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="splash">
      <div className="brand"><span className="brand-mark" aria-hidden /><span className="brand-name">Frameback</span></div>
      <h1>{title}</h1>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

function ReviewLoader({ rid }: { rid: string }) {
  const review = useReview(rid);
  const { data } = review;
  if (data.status === "loading") return <Splash title="Loading review…" />;
  if (data.status === "error") return <Splash title="Cannot open this review" text={data.message} />;
  return <ReviewView rid={rid} bundle={data.bundle} review={data.review} comments={data.comments} live={data.live} api={review} />;
}

// ------------------------------------------------------------------- review view ----

interface ViewProps {
  rid: string;
  bundle: ReviewBundle;
  review: Review;
  comments: Comment[];
  live: boolean;
  api: ReviewApi;
}

function ReviewView({ rid, bundle, review, comments, live, api: store }: ViewProps) {
  const toasts = useToasts();
  const fps = review.video.fps ?? FALLBACK_FPS;
  const video = useVideo(fps, review.video.duration ?? bundle.timeline?.duration ?? null);
  const duration = video.duration || review.video.duration || bundle.timeline?.duration || 0;
  const editable = canEdit(review.state);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [marks, setMarks] = useState<Marks>(NO_MARKS);
  const [regionTool, setRegionTool] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [waveform, setWaveform] = useState<Waveform | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showProcess, setShowProcess] = useState(false);
  const [tlHeight, setTlHeight] = useState(() => readStoredHeight() ?? autoHeight(bundle.timeline?.tracks.length ?? 0, true));
  const draftCounter = useRef(0);
  const draftBody = useRef("");

  useEffect(() => { document.title = `${bundle.videoName} · Frameback`; }, [bundle.videoName]);

  // Persist the timeline height as a per-viewer convenience, only once the viewer resized it.
  const resizeTimeline = useCallback((h: number) => {
    setTlHeight(h);
    try { localStorage.setItem(TL_HEIGHT_KEY, String(Math.round(h))); } catch { /* storage unavailable */ }
  }, []);

  // Waveform is optional: no ffmpeg on the server means no lane.
  useEffect(() => {
    if (!duration) return;
    let cancelled = false;
    void api.waveform(rid, Math.min(20000, Math.ceil(duration * 50))).then((w) => { if (!cancelled) setWaveform(w); });
    return () => { cancelled = true; };
  }, [rid, Math.round(duration)]);

  // Report what the browser learned about the video when the server could not probe it.
  const reported = useRef(false);
  useEffect(() => {
    const v = review.video;
    if (reported.current || !video.duration || !video.size.w || (v.duration && v.width && v.height)) return;
    reported.current = true;
    api.videoInfo(rid, { duration: video.duration, width: video.size.w, height: video.size.h })
      .then(store.applyReview, () => { /* best effort */ });
  }, [rid, review.video, video.duration, video.size.w, video.size.h, store.applyReview]);

  useEffect(() => { if (video.playing) setFocusId(null); }, [video.playing]);

  // ---- navigation
  const seek = useCallback((t: number) => video.seek(frameCenter(frameIndex(t, fps), fps)), [video, fps]);

  // ---- anchoring
  const startComposing = (patch: Partial<Draft> = {}) => {
    if (!editable) return;
    video.pause();
    setDraft((d) => {
      if (d) return { ...d, ...patch };
      const now = video.time.get();
      // In and Out: that range. Only In set and the playhead is past it: In to the playhead.
      const range = marks.in != null && marks.out != null && marks.out > marks.in;
      const inToHead = !range && marks.in != null && marks.out == null && now > marks.in;
      return {
        id: ++draftCounter.current,
        start: range || inToHead ? marks.in! : now,
        end: range ? marks.out : inToHead ? now : null,
        region: null,
        entity: null,
        ...patch,
      };
    });
    setMarks(NO_MARKS);
  };

  const cancelComposing = () => {
    draftBody.current = "";
    setDraft(null);
    setMarks(NO_MARKS);
    setRegionTool(false);
  };

  const setMark = (which: "in" | "out") => {
    if (!editable) return;
    const t = video.time.get();
    if (draft) {
      setDraft(which === "in"
        ? { ...draft, start: t, end: draft.end != null && draft.end > t ? draft.end : null }
        : { ...draft, end: t > draft.start ? t : null });
      return;
    }
    setMarks((m) => {
      const next = { ...m, [which]: t };
      return next.in != null && next.out != null && next.out <= next.in ? (which === "in" ? { in: t, out: null } : { in: null, out: t }) : next;
    });
  };

  const onRange = (start: number, end: number) => {
    if (!editable) return;
    if (draft) setDraft({ ...draft, start, end });
    else setMarks({ in: start, out: end });
    seek(start);
  };

  const onPickEntity = (trackId: string, item: TimelineItem) => {
    const track = bundle.timeline?.tracks.find((t) => t.id === trackId);
    seek(item.start);
    if (!track || !editable) return;
    startComposing({ start: item.start, end: item.end != null && item.end > item.start ? item.end : null, entity: entityRef(track, item) });
  };

  const onRegion = (region: Draft["region"]) => {
    if (!editable) return;
    if (region) {
      startComposing({ region });
      setRegionTool(false);
    } else if (draft) {
      setDraft({ ...draft, region: null });
    }
  };

  const focusComment = (c: Comment) => {
    setFocusId(c.id);
    video.pause();
    seek(c.anchor.time.start);
  };

  // ---- mutations
  const guard = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (err) {
      toasts.error(err);
      return undefined;
    }
  };

  const sendComment = async (payload: ComposerPayload) => {
    if (!draft) return;
    const current = draft;
    video.pause();
    await video.seekAndWait(current.start);
    const snapshot = video.element ? captureSnapshot(video.element, current.region) : null;
    const created = await guard(() => api.createComment(rid, {
      comment: { anchor: buildAnchor(current, fps, bundle.timeline), ...payload },
      snapshotDataUrl: snapshot,
    }));
    if (created) {
      store.applyComment(created);
      cancelComposing();
      setFocusId(created.id);
      toasts.info(`Comment ${created.id} sent. The agent can see it now.`);
    }
  };

  const patchComment = async (id: string, patch: CommentPatch) => {
    const c = await guard(() => api.patchComment(rid, id, patch));
    if (c) store.applyComment(c);
  };
  const deleteComment = async (id: string) => {
    const c = await guard(() => api.deleteComment(rid, id));
    if (c) store.applyComment(c);
  };
  const setStatus = async (id: string, status: HumanStatus) => {
    const c = await guard(() => api.setStatus(rid, id, status));
    if (c) store.applyComment(c);
  };
  const reply = async (id: string, text: string) => {
    const c = await guard(() => api.reply(rid, id, text));
    if (c) store.applyComment(c);
  };

  const submit = async () => {
    const r = await guard(() => api.submit(rid));
    if (r) {
      store.applyReview(r);
      cancelComposing();
      setShowProcess(false);
    }
  };
  const reopen = async () => {
    const r = await guard(() => api.reopen(rid));
    if (r) store.applyReview(r);
  };

  // ---- keyboard (always reads the latest handlers through a ref)
  const setBody = useCallback((t: string) => { draftBody.current = t; }, []);
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (document.querySelector('[aria-modal="true"]')) return;
    const target = e.target as HTMLElement;
    const typing = target.matches("input, textarea, select, [contenteditable='true']");
    if (e.key === "Escape") {
      // Never throw away typed text with a reflex Esc: the first one only leaves the field, the next one asks.
      if (draft && draftBody.current.trim()) {
        e.preventDefault();
        if (typing) target.blur();
        else if (window.confirm("Discard this comment?")) cancelComposing();
        return;
      }
      if (draft || regionTool || marks.in != null || marks.out != null) {
        cancelComposing();
        e.preventDefault();
      }
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const handled = (fn: () => void) => { e.preventDefault(); fn(); };
    if (key === " " && target.matches("button, a")) target.blur();
    switch (key) {
      case " ": case "k": return handled(video.toggle);
      case "ArrowLeft": return handled(() => (e.shiftKey ? video.nudge(-1) : video.step(-1)));
      case "ArrowRight": return handled(() => (e.shiftKey ? video.nudge(1) : video.step(1)));
      case "j": return handled(() => video.nudge(-2));
      case "l": return handled(video.forward);
      case "m": return handled(video.toggleMute);
      case "Home": return handled(() => seek(0));
      case "End": return handled(() => seek(duration));
      case "c": return handled(() => (editable ? startComposing() : toasts.info("Comments are locked for this review.")));
      case "i": return handled(() => setMark("in"));
      case "o": return handled(() => setMark("out"));
      case "x": return handled(() => setMarks(NO_MARKS));
      case "r": return handled(() => editable && setRegionTool((on) => !on));
      case "?": return handled(() => setShowHelp(true));
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selection = draft
    ? { start: draft.start, end: draft.end }
    : marks.in != null ? { start: marks.in, end: marks.out }
    : marks.out != null ? { start: marks.out, end: null } : null;

  const composer = !editable
    ? <LockedComposer state={review.state} onReopen={reopen} />
    : draft && (
      <Composer
        key={draft.id}
        draft={draft}
        fps={fps}
        timeline={bundle.timeline}
        onChange={setDraft}
        onSend={sendComment}
        onCancel={cancelComposing}
        onBody={setBody}
      />
    );

  return (
    <div className="app">
      <TopBar bundle={bundle} review={review} comments={comments} live={live} onProcess={() => setShowProcess(true)} onHelp={() => setShowHelp(true)} />
      <Banner rid={rid} review={review} bundle={bundle} onReopen={reopen} />
      <main className="main">
        <Player
          video={video}
          videoUrl={bundle.videoUrl}
          fps={fps}
          comments={comments}
          focusId={focusId}
          region={draft?.region ?? null}
          regionTool={regionTool && editable}
          canAnnotate={editable}
          marks={marks}
          onRegion={onRegion}
          onToggleRegionTool={() => setRegionTool((on) => !on)}
          onComment={() => startComposing()}
        />
        <CommentsPanel
          rid={rid}
          comments={comments}
          fps={fps}
          state={review.state}
          focusId={focusId}
          composer={composer}
          draftId={editable && draft ? draft.id : null}
          onFocus={focusComment}
          onPatch={patchComment}
          onDelete={deleteComment}
          onStatus={setStatus}
          onReply={reply}
        />
      </main>
      <Timeline
        timeline={bundle.timeline}
        timelineInfo={review.timeline}
        duration={duration}
        comments={comments}
        time={video.time}
        selection={selection}
        entity={draft?.entity ?? null}
        focusId={focusId}
        waveform={waveform}
        height={tlHeight}
        onHeight={resizeTimeline}
        onSeek={seek}
        onPickEntity={onPickEntity}
        onRange={onRange}
        onFocusComment={(id) => { const c = comments.find((x) => x.id === id); if (c) focusComment(c); }}
      />
      {showProcess && <ProcessDialog comments={comments} fps={fps} onConfirm={submit} onClose={() => setShowProcess(false)} onSeek={seek} />}
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function Banner({ rid, review, bundle, onReopen }: { rid: string; review: Review; bundle: ReviewBundle; onReopen: () => void }) {
  if (review.state === "submitted" || review.state === "processing") {
    return (
      <div className="banner info" role="status">
        <span className="spinner" aria-hidden />
        <span><strong>Sent to agent. It is processing.</strong> You can keep watching and answering questions; comments are locked.</span>
        <button className="btn small" onClick={onReopen}>Add more feedback</button>
      </div>
    );
  }
  if (review.state === "delivered" && bundle.next) {
    return (
      <div className="banner success" role="status">
        <span><strong>New version ready:</strong> {bundle.next.name}</span>
        <a className="btn small primary" href={`/media/${encodeURIComponent(rid)}/next`}>Open it →</a>
      </div>
    );
  }
  if (review.state === "delivered") {
    return <div className="banner success" role="status"><span><strong>The agent delivered a new version.</strong></span></div>;
  }
  return null;
}
