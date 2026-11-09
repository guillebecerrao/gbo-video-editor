/** Human-readable one-line renderings used by `watch --text` and `list`. */
import { formatSpan, fromReview, isStale, type Comment, type Event } from "../core/index.js";

export function truncate(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

const quote = (text: string) => `"${truncate(text)}"`;

type Data = Record<string, any>;

function commentSummary(d: Data, reviewDir: string): string {
  const parts: string[] = [];
  if (d.priority || d.category) parts.push(`[${[d.priority, d.category].filter(Boolean).join("/")}]`);
  if (d.time) parts.push(formatSpan(d.time));
  if (d.region) parts.push(`region(${d.region.shape})`);
  if (d.entity) parts.push(`entity(${d.entity.track}/${d.entity.id})`);
  if (d.body) parts.push(quote(d.body));
  if (d.snapshot) parts.push(`snapshot=${fromReview(reviewDir, d.snapshot)}`);
  return parts.join(" ");
}

/** e.g. `#12 comment.created c-0007 [must/framing] 00:12.48–00:15.20 region(rect) "Center the speaker…" snapshot=/…/c-0007.jpg` */
export function formatEventText(ev: Event, reviewDir: string): string {
  const d: Data = ev.data ?? {};
  const head = [`#${ev.seq}`, ev.type];
  if (ev.commentId) head.push(ev.commentId);
  let detail = "";
  switch (ev.type) {
    case "comment.created":
      detail = commentSummary(d, reviewDir);
      break;
    case "comment.updated":
      detail = `${commentSummary(d, reviewDir)} changed=${(d.fields ?? []).join(",")} rev=${d.revision}`;
      break;
    case "comment.carried":
      detail = `${commentSummary(d, reviewDir)} carried-from=${d.from?.review}/${d.from?.id} agent=${d.agentStatus} (verify)`;
      break;
    case "comment.deleted":
      detail = d.body ? `${quote(d.body)}` : "";
      break;
    case "comment.human_status":
      detail = `human=${d.status}`;
      break;
    case "comment.agent_status":
      detail = [`agent=${d.status}`, d.plan ? `plan=${quote(d.plan)}` : "", d.reply ? `reply=${quote(d.reply)}` : "", d.appliedIn ? `applied-in=${d.appliedIn}` : ""]
        .filter(Boolean)
        .join(" ");
      break;
    case "thread.message":
      detail = `${d.author}: ${quote(String(d.text ?? ""))}`;
      break;
    case "review.opened":
      detail = `video=${d.video}`;
      break;
    case "review.submitted":
      detail = `counts=${JSON.stringify(d.counts ?? {})} round=${d.round ?? 1}`;
      break;
    case "review.state":
      detail = [`state=${d.state}`, d.nextVideo ? `next=${d.nextVideo}` : "", d.reopened ? `reopened round=${d.round}` : ""].filter(Boolean).join(" ");
      break;
  }
  return [...head, detail].filter(Boolean).join(" ");
}

/** One row of `frameback list`. */
export function formatCommentRow(c: Comment, reviewDir: string): string {
  const flags = [isStale(c) ? "STALE" : "", c.carriedFrom ? "carried" : "", c.human.status !== "open" ? `human=${c.human.status}` : ""].filter(Boolean);
  const snapshot = c.snapshot ? ` snapshot=${fromReview(reviewDir, c.snapshot)}` : "";
  return [
    c.id,
    formatSpan(c.anchor.time),
    c.priority,
    c.action ? `${c.category}/${c.action}` : c.category,
    `agent=${c.agent.status}`,
    ...flags,
    quote(c.body),
  ].join("  ") + snapshot;
}
