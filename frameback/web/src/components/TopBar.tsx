import { useEffect, useRef, useState } from "react";
import type { ReviewBundle } from "@core/api";
import type { Comment, Review } from "@core/schema";
import { filterCounts } from "../lib/comments";
import { ChevronIcon, HelpIcon, SendIcon } from "./icons";

interface TopBarProps {
  bundle: ReviewBundle;
  review: Review;
  comments: Comment[];
  live: boolean;
  onProcess: () => void;
  onHelp: () => void;
}

const STATE_LABEL: Record<Review["state"], string> = {
  reviewing: "Reviewing",
  submitted: "Sent to agent",
  processing: "Processing",
  delivered: "Delivered",
  closed: "Closed",
};

export function TopBar({ bundle, review, comments, live, onProcess, onHelp }: TopBarProps) {
  const counts = filterCounts(comments);
  const canProcess = review.state === "reviewing";
  return (
    <header className="topbar">
      <div className="brand" aria-label="Frameback">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">Frameback</span>
      </div>
      <VersionSwitcher bundle={bundle} />
      <span className={`state state-${review.state}`}>{STATE_LABEL[review.state]}</span>
      <span className="round" title="Review round">Round {review.round}</span>
      <div className="counts" aria-label="Comment counts">
        <span title="All comments"><b>{counts.all}</b> {counts.all === 1 ? "comment" : "comments"}</span>
        <span title="Waiting on the agent" className={counts.needs_action ? "c-action" : ""}><b>{counts.needs_action}</b> open</span>
        <span title="Prepared by the agent" className={counts.prepared ? "c-prepared" : ""}><b>{counts.prepared}</b> prepared</span>
        <span title="Applied in a render" className={counts.applied ? "c-applied" : ""}><b>{counts.applied}</b> applied</span>
        {counts.needs_info > 0 && <span title="The agent asked a question" className="c-info"><b>{counts.needs_info}</b> need info</span>}
      </div>
      <span className="spacer" />
      <span className={`live${live ? " on" : ""}`} title={live ? "Live: updates from the agent arrive instantly" : "Reconnecting to the server…"}>
        <i /> {live ? "Live" : "Offline"}
      </span>
      <button className="icon-btn" onClick={onHelp} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"><HelpIcon /></button>
      <button className="btn primary big" onClick={onProcess} disabled={!canProcess} title={canProcess ? "Send everything to the agent" : "This review was already sent"}>
        <SendIcon /> Process review
      </button>
    </header>
  );
}

function VersionSwitcher({ bundle }: { bundle: ReviewBundle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const many = bundle.versions.length > 1;
  return (
    <div className="versions" ref={ref}>
      <button className="video-name" onClick={() => many && setOpen((o) => !o)} aria-haspopup={many ? "listbox" : undefined} aria-expanded={many ? open : undefined} disabled={!many} title={bundle.videoName}>
        <span className="name">{bundle.videoName}</span>
        {many && <ChevronIcon />}
      </button>
      {open && (
        <ul className="menu" role="listbox" aria-label="Versions">
          {bundle.versions.map((v) => (
            <li key={v.name} role="option" aria-selected={v.isCurrent}>
              {v.isCurrent || !v.rid ? (
                <span className={`menu-item${v.isCurrent ? " current" : " disabled"}`} title={v.rid ? undefined : "Not opened in Frameback yet. Run `frameback open` on it."}>
                  {v.name}{v.isCurrent ? " · current" : " · not opened"}
                </span>
              ) : (
                <a className="menu-item" href={`/?r=${encodeURIComponent(v.rid)}`}>{v.name}</a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
