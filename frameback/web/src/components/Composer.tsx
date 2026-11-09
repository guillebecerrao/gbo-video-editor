import { useEffect, useRef, useState } from "react";
import { ACTIONS, CATEGORIES, PRIORITIES, type Action, type Category, type Priority, type ReviewState, type Timeline } from "@core/schema";
import { buildAnchor, suggestCategory, type Draft } from "../lib/anchor";
import { CATEGORY_ICON, PRIORITY_LABEL } from "../lib/comments";
import { formatSpan, frameIndex } from "../lib/time";
import { LockIcon, SendIcon } from "./icons";

export interface ComposerPayload {
  category: Category;
  action: Action | null;
  priority: Priority;
  body: string;
}

interface ComposerProps {
  draft: Draft;
  fps: number;
  timeline: Timeline | null;
  onChange: (d: Draft) => void;
  onSend: (payload: ComposerPayload) => Promise<void>;
  onCancel: () => void;
  /** current text, so the host can protect an unsent draft from Esc */
  onBody?: (text: string) => void;
}

export function Composer({ draft, fps, timeline, onChange, onSend, onCancel, onBody }: ComposerProps) {
  const [category, setCategory] = useState<Category>(() => suggestCategory(draft));
  const [touched, setTouched] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [priority, setPriority] = useState<Priority>("should");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { area.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { onBody?.(body); }, [body, onBody]);
  useEffect(() => {
    if (!touched) setCategory(suggestCategory(draft));
  }, [draft, touched]);

  const anchor = buildAnchor(draft, fps, timeline);
  const isRange = anchor.time.end != null;
  const canSend = body.trim().length > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend({ category, action, priority, body: body.trim() });
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(); }} aria-label="New comment">
      <div className="anchor-chips">
        <Chip label={isRange ? "Range" : "Time"} onClear={isRange ? () => onChange({ ...draft, end: null }) : undefined}>
          <span className="mono">{formatSpan(draft.start, anchor.time.end, fps)}</span>
          <span className="muted"> · f{frameIndex(draft.start, fps)}</span>
        </Chip>
        {draft.region && (
          <Chip label="Region" onClear={() => onChange({ ...draft, region: null })}>
            {draft.region.shape === "rect"
              ? `${Math.round(draft.region.w * 100)}% × ${Math.round(draft.region.h * 100)}%`
              : `point ${Math.round(draft.region.x * 100)}, ${Math.round(draft.region.y * 100)}`}
          </Chip>
        )}
        {draft.entity && (
          <Chip label={entityLabel(draft.entity.track, draft.entity.type)} onClear={() => onChange({ ...draft, entity: null })}>
            {draft.entity.label ?? draft.entity.id}
          </Chip>
        )}
        {anchor.source && <Chip label="Source"><span className="mono">{anchor.source.name} @ {anchor.source.time.toFixed(2)}s</span></Chip>}
      </div>
      {anchor.transcript && <blockquote className="transcript">“{anchor.transcript}”</blockquote>}

      <div className="chip-row compact">
        <label className="field">
          <span className="row-label">Category</span>
          <select value={category} onChange={(e) => { setCategory(e.target.value as Category); setTouched(true); }} aria-label="Category">
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_ICON[c]} {c}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="row-label">Action</span>
          <select value={action ?? ""} onChange={(e) => setAction((e.target.value || null) as Action | null)} aria-label="Action">
            <option value="">any</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <div className="seg" role="group" aria-label="Priority">
          {PRIORITIES.map((pr) => (
            <button type="button" key={pr} className={`${priority === pr ? "on" : ""} pr-${pr}`} aria-pressed={priority === pr} onClick={() => setPriority(pr)}>
              {PRIORITY_LABEL[pr]}
            </button>
          ))}
        </div>
      </div>

      <textarea
        ref={area}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
        }}
        placeholder="What should change? Be specific — the agent reads the frame and this text."
        rows={3}
        aria-label="Comment text"
      />
      <div className="composer-actions">
        <span className="hint"><kbd>⌘↵</kbd> send · <kbd>Esc</kbd> cancel</span>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary" disabled={!canSend}><SendIcon />{sending ? "Sending…" : "Send"}</button>
      </div>
    </form>
  );
}

/** Chip label for a picked timeline entity, named after what it is rather than its raw type. */
function entityLabel(track: string, type: string): string {
  if (track === "cuts") return "Cut";
  if (track === "transitions") return "Transition";
  if (track === "words") return "Word";
  if (track === "captions") return "Caption";
  return type === "range" ? "Item" : type;
}

function Chip({ label, children, onClear }: { label: string; children: React.ReactNode; onClear?: () => void }) {
  return (
    <span className="anchor-chip">
      <span className="anchor-chip-label">{label}</span>
      <span>{children}</span>
      {onClear && <button type="button" className="chip-x" onClick={onClear} aria-label={`Clear ${label}`}>×</button>}
    </span>
  );
}

export function LockedComposer({ state, canReopen, onReopen }: { state: ReviewState; canReopen: boolean; onReopen: () => void }) {
  const text: Record<string, string> = {
    submitted: "This review was sent to the agent. New comments are locked until you add more feedback.",
    processing: "The agent is processing this review. New comments are locked until you add more feedback.",
    delivered: canReopen
      ? "This review was marked delivered, but there is no newer version yet. Reopen it to keep commenting here."
      : "A new version was delivered. Open it to keep reviewing; this version's comments are read-only.",
    closed: canReopen ? "This review is closed. Reopen it to keep commenting on this version." : "This review is closed.",
  };
  return (
    <div className="locked">
      <LockIcon />
      <p>{text[state] ?? "Comments are locked."}</p>
      {canReopen && <button className="btn" onClick={onReopen}>{state === "submitted" || state === "processing" ? "Add more feedback" : "Reopen review"}</button>}
    </div>
  );
}
