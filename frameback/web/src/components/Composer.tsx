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
}

export function Composer({ draft, fps, timeline, onChange, onSend, onCancel }: ComposerProps) {
  const [category, setCategory] = useState<Category>(() => suggestCategory(draft));
  const [touched, setTouched] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [priority, setPriority] = useState<Priority>("should");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { area.current?.focus(); }, []);
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
          <Chip label={draft.entity.type} onClear={() => onChange({ ...draft, entity: null })}>
            {draft.entity.label ?? draft.entity.id}
          </Chip>
        )}
        {anchor.source && <Chip label="Source"><span className="mono">{anchor.source.name} @ {anchor.source.time.toFixed(2)}s</span></Chip>}
      </div>
      {anchor.transcript && <blockquote className="transcript">“{anchor.transcript}”</blockquote>}

      <div className="chip-row" role="group" aria-label="Category">
        {CATEGORIES.map((c) => (
          <button
            type="button" key={c} className={`pick${category === c ? " on" : ""}`} aria-pressed={category === c}
            onClick={() => { setCategory(c); setTouched(true); }}
          >
            <span className="pick-icon" aria-hidden>{CATEGORY_ICON[c]}</span>{c}
          </button>
        ))}
      </div>
      <div className="chip-row" role="group" aria-label="Action">
        <span className="row-label">Action</span>
        {ACTIONS.map((a) => (
          <button type="button" key={a} className={`pick small${action === a ? " on" : ""}`} aria-pressed={action === a} onClick={() => setAction(action === a ? null : a)}>
            {a}
          </button>
        ))}
      </div>
      <div className="chip-row" role="group" aria-label="Priority">
        <span className="row-label">Priority</span>
        <div className="seg">
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
        rows={4}
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

function Chip({ label, children, onClear }: { label: string; children: React.ReactNode; onClear?: () => void }) {
  return (
    <span className="anchor-chip">
      <span className="anchor-chip-label">{label}</span>
      <span>{children}</span>
      {onClear && <button type="button" className="chip-x" onClick={onClear} aria-label={`Clear ${label}`}>×</button>}
    </span>
  );
}

export function LockedComposer({ state, onReopen }: { state: ReviewState; onReopen: () => void }) {
  const text: Record<string, string> = {
    submitted: "This review was sent to the agent. New comments are locked until you add more feedback.",
    processing: "The agent is processing this review. New comments are locked until you add more feedback.",
    delivered: "A new version was delivered. Open it to keep reviewing; this version's comments are read-only.",
    closed: "This review is closed.",
  };
  return (
    <div className="locked">
      <LockIcon />
      <p>{text[state] ?? "Comments are locked."}</p>
      {(state === "submitted" || state === "processing") && <button className="btn" onClick={onReopen}>Add more feedback</button>}
    </div>
  );
}
