import { useState } from "react";
import type { Comment } from "@core/schema";
import { filterCounts, hasUnansweredQuestion, isAnsweredWaiting } from "../lib/comments";
import { formatTimecode } from "../lib/time";
import { Modal } from "./Modal";
import { SendIcon } from "./icons";

export function ProcessDialog({ comments, fps, onConfirm, onClose, onSeek }: {
  comments: Comment[];
  fps: number;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  onSeek: (t: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const counts = filterCounts(comments);
  const open = comments.filter((c) => c.human.status === "open" || c.human.status === "reopened");
  const questions = comments.filter(hasUnansweredQuestion);
  const answered = comments.filter(isAnsweredWaiting);
  const rows: [string, number][] = [
    ["Comments", comments.length],
    ["Must-fix", comments.filter((c) => c.priority === "must").length],
    ["Already prepared by the agent", counts.prepared],
    ["Waiting on the agent", counts.needs_action],
  ];

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Process review" onClose={onClose}>
      <div className="modal-body">
        <p>The agent will finish whatever is still pending and render the next version once. You can add more feedback afterwards.</p>
        <dl className="summary">
          {rows.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
        </dl>
        {comments.length === 0 && <p className="warn-box">There are no comments. The agent will have nothing to change.</p>}
        {questions.length > 0 && (
          <div className="warn-box">
            <strong>{questions.length} unanswered agent question{questions.length > 1 ? "s" : ""}.</strong> The agent may have to guess or skip them:
            <ul>
              {questions.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <button className="link mono" onClick={() => { onSeek(c.anchor.time.start); onClose(); }}>{formatTimecode(c.anchor.time.start, fps)}</button>{" "}
                  {c.body.length > 70 ? `${c.body.slice(0, 70)}…` : c.body}
                </li>
              ))}
              {questions.length > 5 && <li className="muted">and {questions.length - 5} more</li>}
            </ul>
          </div>
        )}
        {answered.length > 0 && (
          <p className="muted small">{answered.length} answered question{answered.length > 1 ? "s" : ""} the agent has not picked up yet. They will be used when it processes the review.</p>
        )}
        {open.length === 0 && comments.length > 0 && <p className="muted small">All comments are resolved or verified.</p>}
      </div>
      <footer className="modal-foot">
        <button className="btn" onClick={onClose}>{questions.length > 0 ? "Go back and answer" : "Cancel"}</button>
        <button className="btn primary" onClick={() => void confirm()} disabled={busy} autoFocus>
          <SendIcon /> {busy ? "Sending…" : questions.length > 0 ? "Send anyway" : "Send to agent"}
        </button>
      </footer>
    </Modal>
  );
}

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: "Playback",
    items: [
      ["Space / K", "Play / pause"],
      ["← / →", "Previous / next frame"],
      ["Shift + ←/→", "Back / forward 1 s"],
      ["J", "Back 2 s"],
      ["L", "Play; press again to speed up"],
      ["M", "Mute"],
      ["Home / End", "Start / end of the video"],
    ],
  },
  {
    group: "Anchoring",
    items: [
      ["C", "Comment at the playhead (or on the I–O range)"],
      ["I / O", "Set range in / out"],
      ["X", "Clear in / out"],
      ["R", "Region tool: drag a rectangle, or click for a point"],
      ["Esc", "Cancel the current comment or tool"],
    ],
  },
  {
    group: "Timeline",
    items: [
      ["Click ruler", "Seek"],
      ["Drag ruler", "Select a range"],
      ["Click an item", "Comment on that cut, caption or word"],
      ["Ctrl/⌘ + wheel", "Zoom"],
      ["Shift + wheel", "Scroll sideways"],
    ],
  },
  { group: "Composer", items: [["⌘/Ctrl + Enter", "Send the comment"], ["?", "This help"]] },
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} wide>
      <div className="modal-body help-grid">
        {SHORTCUTS.map((g) => (
          <section key={g.group}>
            <h3>{g.group}</h3>
            <dl>
              {g.items.map(([k, v]) => (<div key={k}><dt>{k.split(" / ").map((part, i) => (<span key={part}>{i > 0 && " / "}<kbd>{part}</kbd></span>))}</dt><dd>{v}</dd></div>))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
