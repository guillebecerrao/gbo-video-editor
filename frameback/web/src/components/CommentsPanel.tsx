import { useEffect, useRef, useState, type ReactNode } from "react";
import { CATEGORIES, PRIORITIES, type Category, type Comment, type CommentPatch, type HumanStatus, type Priority, type ReviewState } from "@core/schema";
import { snapshotUrl } from "../api/client";
import {
  AGENT_LABEL, CATEGORY_ICON, FILTERS, PRIORITY_LABEL, canEdit, filterCounts, hasUnansweredQuestion, isAnsweredWaiting, isCarriedOpen, isStale, matchesFilter,
  needsVerification, sortByTime, type FilterId,
} from "../lib/comments";
import { formatSpan, formatTimecode } from "../lib/time";
import { CheckIcon, EditIcon, RegionIcon, TrashIcon } from "./icons";
import { Modal } from "./Modal";

interface PanelProps {
  rid: string;
  comments: Comment[];
  fps: number;
  state: ReviewState;
  focusId: string | null;
  composer: ReactNode;
  /** id of the draft being composed, or null */
  draftId: number | null;
  onFocus: (c: Comment) => void;
  onPatch: (id: string, patch: CommentPatch) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onStatus: (id: string, status: HumanStatus) => Promise<void>;
  onReply: (id: string, text: string) => Promise<void>;
}

export function CommentsPanel(p: PanelProps) {
  const [filter, setFilter] = useState<FilterId>("all");
  const counts = filterCounts(p.comments);
  const shown = sortByTime(p.comments.filter((c) => matchesFilter(c, filter)));
  const listRef = useRef<HTMLDivElement>(null);

  // A new draft always starts with its anchor chips in view.
  useEffect(() => {
    if (p.draftId != null) listRef.current?.scrollTo({ top: 0 });
  }, [p.draftId]);

  useEffect(() => {
    if (!p.focusId) return;
    listRef.current?.querySelector(`[data-comment="${p.focusId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [p.focusId]);

  return (
    <aside className="panel" aria-label="Comments">
      <header className="panel-head">
        <h2>{p.comments.length === 1 ? "Comment" : "Comments"} <span className="count">{p.comments.length}</span></h2>
        <div className="filters" role="tablist" aria-label="Filter comments">
          {FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0 || filter === f.id).map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>
              {f.label}<span className="count">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </header>
      <div className="panel-body" ref={listRef}>
        {p.composer}
        {p.comments.length === 0 && p.draftId == null && <EmptyState />}
        {p.comments.length > 0 && shown.length === 0 && <p className="empty-filter">Nothing matches this filter.</p>}
        {shown.map((c) => (
          <CommentCard key={c.id} comment={c} {...p} focused={c.id === p.focusId} />
        ))}
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <h3>Review the edit, frame by frame</h3>
      <ol>
        <li>Scrub or play, then press <kbd>C</kbd> to comment at the playhead.</li>
        <li>Press <kbd>I</kbd> / <kbd>O</kbd> or drag the timeline ruler to anchor a range.</li>
        <li>Press <kbd>R</kbd> and drag on the video to point at something in the frame.</li>
        <li>Click a cut, caption or word on the timeline to comment on that exact element.</li>
      </ol>
      <p>Every comment is saved the moment you send it, so your agent can start working while you keep reviewing. Press <kbd>?</kbd> for all shortcuts.</p>
    </div>
  );
}

// ------------------------------------------------------------------------- card ----

type CardProps = PanelProps & { comment: Comment; focused: boolean };

function CommentCard({ comment: c, rid, fps, state, focused, onFocus, onPatch, onDelete, onStatus, onReply }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [replying, setReplying] = useState(false);
  const [zoom, setZoom] = useState(false);
  const editable = canEdit(state);
  const stale = isStale(c);
  const verify = needsVerification(c);
  const question = hasUnansweredQuestion(c);
  const answeredWaiting = isAnsweredWaiting(c);
  const carriedOpen = isCarriedOpen(c);
  const done = c.human.status === "verified" || c.human.status === "resolved_by_human";
  const region = c.anchor.region;

  return (
    <article
      data-comment={c.id}
      className={`card st-${c.agent.status}${focused ? " focused" : ""}${question ? " ask" : ""}${done ? " done" : ""}`}
    >
      <header className="card-head">
        <button className="tc-link mono" onClick={() => onFocus(c)} title="Seek to this comment">
          {formatSpan(c.anchor.time.start, c.anchor.time.end, fps)}
        </button>
        <span className="cat" title={c.category}><span aria-hidden>{CATEGORY_ICON[c.category]}</span>{c.category}</span>
        {c.action && <span className="muted small">{c.action}</span>}
        <span className={`prio pr-${c.priority}`}>{PRIORITY_LABEL[c.priority]}</span>
        <span className="spacer" />
        {stale && <span className="badge stale" title="You edited this after the agent worked on it. The agent will re-plan.">STALE</span>}
        <span className={`badge agent st-${c.agent.status}`}>{AGENT_LABEL[c.agent.status]}</span>
      </header>

      {editing ? (
        <EditForm
          comment={c}
          onCancel={() => setEditing(false)}
          onSave={async (patch) => { await onPatch(c.id, patch); setEditing(false); }}
        />
      ) : (
        <p className="body">{c.body}</p>
      )}

      {(c.anchor.entity || region || c.anchor.source) && (
        <div className="meta">
          {c.anchor.entity && <span className="meta-item">{c.anchor.entity.label ?? c.anchor.entity.id}</span>}
          {region && <span className="meta-item"><RegionIcon /> {region.shape}</span>}
          {c.anchor.source && <span className="meta-item mono">{c.anchor.source.name} @ {c.anchor.source.time.toFixed(2)}s</span>}
        </div>
      )}
      {c.anchor.transcript && <blockquote className="transcript">“{c.anchor.transcript}”</blockquote>}

      {c.snapshot && (
        <>
          <button className="thumb" onClick={() => setZoom(true)} aria-label={`Open snapshot of ${c.id}`}>
            <img src={snapshotUrl(rid, c.id, c.updatedAt)} alt="" loading="lazy" />
            {c.carriedFrom && <span className="thumb-badge">{c.carriedFrom.review.replace(/^.*_(v\d+)$/, "$1")} frame</span>}
          </button>
          {zoom && (
            <Modal title={`Snapshot ${c.id}`} onClose={() => setZoom(false)} wide bare>
              <img className="lightbox" src={snapshotUrl(rid, c.id, c.updatedAt)} alt={`Snapshot for ${c.id}`} onClick={() => setZoom(false)} />
            </Modal>
          )}
        </>
      )}

      {(c.agent.plan || c.agent.reply) && (
        <div className="agent-note">
          {c.agent.plan && <p><strong>Plan</strong> {c.agent.plan}</p>}
          {c.agent.reply && <p><strong>Agent</strong> {c.agent.reply}</p>}
          {c.agent.appliedIn && <p className="muted small">Applied in {c.agent.appliedIn}</p>}
        </div>
      )}

      {verify && (
        <div className="verify">
          <span>Carried from the previous version. Is it fixed?</span>
          <button className="btn small ok" onClick={() => onStatus(c.id, "verified")}><CheckIcon /> Verified</button>
          <button className="btn small" onClick={() => onStatus(c.id, "reopened")}>Reopen</button>
        </div>
      )}
      {carriedOpen && (
        <p className="muted small carried-line">Still open from the previous version (was #{c.carriedFrom?.id.replace(/^c-/, "")}).</p>
      )}
      {c.carriedFrom?.remap?.status === "lost" && (
        <p className="small carried-line remap-lost">This moment was cut in this version.</p>
      )}
      {c.carriedFrom?.time && c.carriedFrom.remap?.status !== "lost" && Math.abs(c.carriedFrom.time.start - c.anchor.time.start) > 0.02 && (
        <p className="muted small carried-line">Moved from {formatTimecode(c.carriedFrom.time.start, fps)} in {c.carriedFrom.review.replace(/^.*_(v\d+)$/, "$1")}{c.carriedFrom.remap?.status === "clamped" ? " (part of it was cut)" : ""}.</p>
      )}
      {verify && c.carriedFrom && <p className="muted small carried-line">Was #{c.carriedFrom.id.replace(/^c-/, "")} in the previous version.</p>}
      {c.human.status === "verified" && <p className="muted small verified-line"><CheckIcon /> Verified</p>}
      {c.human.status === "reopened" && <p className="muted small">Reopened — the agent will look again.</p>}

      {c.thread.length > 0 && (
        <ul className="thread">
          {c.thread.map((m, i) => (
            <li key={i} className={`msg ${m.author}`}><strong>{m.author === "agent" ? "Agent" : "You"}</strong> {m.text}</li>
          ))}
        </ul>
      )}
      {answeredWaiting && !replying && !editing && <p className="muted small answered-line"><CheckIcon /> Answered, waiting for the agent.</p>}
      {(replying || question) && !editing && (
        <ReplyBox
          autoFocus={replying}
          placeholder={question ? "Answer the agent…" : "Reply…"}
          onSend={async (text) => { await onReply(c.id, text); setReplying(false); }}
        />
      )}

      {!editing && (
        <footer className="card-foot">
          {!replying && !question && <button className="link" onClick={() => setReplying(true)}>Reply</button>}
          <span className="spacer" />
          <button className="icon-btn" disabled={!editable} onClick={() => setEditing(true)} title={editable ? "Edit" : "Locked while the review is not in progress"} aria-label="Edit comment"><EditIcon /></button>
          {confirmDelete ? (
            <>
              <button className="btn small danger" onClick={() => onDelete(c.id)}>Delete</button>
              <button className="btn small" onClick={() => setConfirmDelete(false)}>Keep</button>
            </>
          ) : (
            <button className="icon-btn" disabled={!editable} onClick={() => setConfirmDelete(true)} title={editable ? "Delete" : "Locked while the review is not in progress"} aria-label="Delete comment"><TrashIcon /></button>
          )}
        </footer>
      )}
    </article>
  );
}

function ReplyBox({ onSend, placeholder, autoFocus }: { onSend: (text: string) => Promise<void>; placeholder: string; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSend(t);
      setText("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="reply">
      <textarea
        value={text} rows={2} placeholder={placeholder} autoFocus={autoFocus} aria-label="Reply"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
      />
      <button className="btn small primary" disabled={!text.trim() || busy} onClick={() => void send()}>Reply</button>
    </div>
  );
}

function EditForm({ comment: c, onSave, onCancel }: { comment: Comment; onSave: (p: CommentPatch) => Promise<void>; onCancel: () => void }) {
  const [body, setBody] = useState(c.body);
  const [category, setCategory] = useState<Category>(c.category);
  const [priority, setPriority] = useState<Priority>(c.priority);
  const [busy, setBusy] = useState(false);

  const changed = body.trim() !== c.body || category !== c.category || priority !== c.priority;
  const save = async () => {
    if (!changed || !body.trim() || busy) return;
    const patch: CommentPatch = {};
    if (body.trim() !== c.body) patch.body = body.trim();
    if (category !== c.category) patch.category = category;
    if (priority !== c.priority) patch.priority = priority;
    setBusy(true);
    try {
      await onSave(patch);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="edit">
      <textarea
        value={body} rows={3} autoFocus aria-label="Edit comment text"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
          if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
        }}
      />
      <div className="edit-row">
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)} aria-label="Category">
          {CATEGORIES.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} aria-label="Priority">
          {PRIORITIES.map((x) => <option key={x} value={x}>{PRIORITY_LABEL[x]}</option>)}
        </select>
        <span className="spacer" />
        <button className="btn small" onClick={onCancel}>Cancel</button>
        <button className="btn small primary" disabled={!changed || !body.trim() || busy} onClick={() => void save()}>Save</button>
      </div>
    </div>
  );
}
