/** Pure helpers over comments: filtering, labels, counts. */
import type { AgentStatus, Category, Comment, Priority, ReviewState } from "@core/schema";

export const AGENT_LABEL: Record<AgentStatus, string> = {
  pending: "Pending",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  prepared: "Prepared",
  applied: "Applied",
  needs_info: "Needs info",
  declined: "Declined",
};

export const CATEGORY_ICON: Record<Category, string> = {
  cut: "✂", transition: "⇄", framing: "▢", color: "◐", motion: "↯", audio: "♪",
  caption: "Aa", broll: "▤", element: "◇", pacing: "⏱", other: "•",
};

export const PRIORITY_LABEL: Record<Priority, string> = { must: "Must", should: "Should", nit: "Nit" };

export type FilterId = "all" | "needs_action" | "prepared" | "applied" | "needs_info" | "to_verify";

export const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs_action", label: "Needs action" },
  { id: "prepared", label: "Prepared" },
  { id: "applied", label: "Applied" },
  { id: "needs_info", label: "Needs info" },
  { id: "to_verify", label: "To verify" },
];

/** Human edited after the agent acted on an earlier revision. */
export function isStale(c: Comment): boolean {
  return c.agent.seenRevision != null && c.agent.seenRevision < c.human.revision;
}

/** Carried over from a previous version and still waiting for the human to verify or reopen it. */
export function needsVerification(c: Comment): boolean {
  return c.carriedFrom != null && c.human.status === "open" && (c.agent.status === "applied" || c.agent.appliedIn != null);
}

/** Carried over from a previous version but the agent never applied it, so there is nothing to verify yet. */
export function isCarriedOpen(c: Comment): boolean {
  return c.carriedFrom != null && c.human.status === "open" && !needsVerification(c);
}

export function isAlive(c: Comment): boolean {
  return c.human.status !== "deleted";
}

/** The agent asked something the human has not answered yet. */
export function hasUnansweredQuestion(c: Comment): boolean {
  const last = c.thread[c.thread.length - 1];
  if (last?.author === "human") return false;
  if (c.agent.status === "needs_info") return true;
  return last?.author === "agent" && c.agent.status !== "applied" && c.agent.status !== "declined";
}

/** The agent asked, the human answered, and the agent has not picked it up yet. */
export function isAnsweredWaiting(c: Comment): boolean {
  return c.agent.status === "needs_info" && c.thread[c.thread.length - 1]?.author === "human";
}

const ACTION_STATUSES: AgentStatus[] = ["pending", "acknowledged", "in_progress", "needs_info"];

export function matchesFilter(c: Comment, f: FilterId): boolean {
  switch (f) {
    case "all": return true;
    case "needs_action": return ACTION_STATUSES.includes(c.agent.status) || isStale(c);
    case "prepared": return c.agent.status === "prepared";
    case "applied": return c.agent.status === "applied";
    case "needs_info": return hasUnansweredQuestion(c) && c.agent.status === "needs_info";
    case "to_verify": return needsVerification(c);
  }
}

export function filterCounts(comments: Comment[]): Record<FilterId, number> {
  const out = {} as Record<FilterId, number>;
  for (const { id } of FILTERS) out[id] = comments.filter((c) => matchesFilter(c, id)).length;
  return out;
}

export function sortByTime(comments: Comment[]): Comment[] {
  return [...comments].sort((a, b) => a.anchor.time.start - b.anchor.time.start || a.id.localeCompare(b.id));
}

export function spanOf(c: Comment): { start: number; end: number } {
  const { start, end } = c.anchor.time;
  return { start, end: end != null && end > start ? end : start };
}

/** Whether the comment's anchor is "active" at time t (points get a small tolerance). */
export function coversTime(c: Comment, t: number, pointTolerance = 0.5): boolean {
  const { start, end } = spanOf(c);
  return end > start ? t >= start - 1e-3 && t <= end + 1e-3 : Math.abs(t - start) <= pointTolerance;
}

export function upsertComment(list: Comment[], c: Comment): Comment[] {
  if (!isAlive(c)) return list.filter((x) => x.id !== c.id);
  const i = list.findIndex((x) => x.id === c.id);
  if (i === -1) return [...list, c];
  const next = list.slice();
  next[i] = c;
  return next;
}

export const canEdit = (state: ReviewState): boolean => state === "reviewing";
