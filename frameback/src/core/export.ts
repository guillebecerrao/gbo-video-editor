/** Markdown / JSON export of a review for agents. */
import {
  countComments,
  exists,
  fromReview,
  isStale,
  lastSeq,
  listComments,
  readReview,
  videoPathOf,
} from "./store.js";
import type { Comment } from "./schema.js";

/** `mm:ss.cc` (minutes keep growing past 59). */
export function formatTimecode(seconds: number): string {
  const total = Math.round(Math.max(0, seconds) * 100);
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

export function formatSpan(time: Comment["anchor"]["time"]): string {
  return time.end != null ? `${formatTimecode(time.start)}–${formatTimecode(time.end)}` : formatTimecode(time.start);
}

type Group = "needs_action" | "prepared" | "applied" | "declined";

const GROUPS: { id: Group; title: string }[] = [
  { id: "needs_action", title: "Needs action" },
  { id: "prepared", title: "Prepared" },
  { id: "applied", title: "Applied" },
  { id: "declined", title: "Declined / deleted" },
];

function groupOf(c: Comment): Group {
  if (c.human.status === "deleted" || c.agent.status === "declined") return "declined";
  if (isStale(c) || c.human.status === "reopened") return "needs_action";
  switch (c.agent.status) {
    case "prepared":
      return "prepared";
    case "applied":
      return "applied";
    default:
      return "needs_action"; // pending | acknowledged | in_progress | needs_info
  }
}

export async function exportReview(reviewDir: string, format: "md" | "json" = "md"): Promise<string> {
  const review = await readReview(reviewDir);
  const comments = await listComments(reviewDir, { includeDeleted: true });
  const counts = await countComments(reviewDir);
  const video = await videoPathOf(reviewDir);

  if (format === "json") {
    const items = comments.map((c) => ({
      ...c,
      group: groupOf(c),
      stale: isStale(c),
      snapshotPath: c.snapshot ? fromReview(reviewDir, c.snapshot) : null,
    }));
    return JSON.stringify({ review, videoPath: video, lastSeq: await lastSeq(reviewDir), counts, comments: items }, null, 2) + "\n";
  }

  const lines: string[] = [
    `# Review: ${review.id}`,
    "",
    `- Video: ${video}`,
    `- State: ${review.state} (round ${review.round})`,
    `- Comments: ${counts.total} total · ${counts.pending} pending · ${counts.prepared} prepared · ${counts.applied} applied · ${counts.reopened} reopened · ${counts.needs_info} needs info · ${counts.must} must`,
  ];
  if (review.previous) lines.push(`- Previous version: ${review.previous}`);
  if (review.nextVideo) lines.push(`- Next version: ${fromReview(reviewDir, review.nextVideo)}`);

  for (const group of GROUPS) {
    const inGroup = comments.filter((c) => groupOf(c) === group.id);
    if (!inGroup.length) continue;
    lines.push("", `## ${group.title} (${inGroup.length})`);
    for (const c of inGroup) lines.push("", ...(await renderComment(reviewDir, c)));
  }
  if (!comments.length) lines.push("", "_No comments yet._");
  return lines.join("\n") + "\n";
}

/** Markdown block for one comment (used by the export and by `frameback show`). */
export async function renderComment(reviewDir: string, c: Comment): Promise<string[]> {
  const a = c.anchor;
  const head = [c.id, formatSpan(a.time), c.priority, c.action ? `${c.category}/${c.action}` : c.category];
  const out = [`### ${head.join(" · ")}`, ""];
  const flags = [isStale(c) ? "STALE (the reviewer edited this after the agent acted)" : null, c.carriedFrom ? `carried from ${c.carriedFrom.review}/${c.carriedFrom.id} — verify` : null, c.human.status !== "open" ? `human: ${c.human.status}` : null]
    .filter(Boolean);
  if (flags.length) out.push(`**${flags.join(" · ")}**`, "");
  out.push(c.body.trim());
  const meta: string[] = [];
  if (a.region) {
    meta.push(
      a.region.shape === "rect"
        ? `- Region: rect x=${a.region.x} y=${a.region.y} w=${a.region.w} h=${a.region.h} (normalized, top-left origin)`
        : `- Region: point x=${a.region.x} y=${a.region.y} (normalized, top-left origin)`,
    );
  }
  if (a.entity) meta.push(`- Entity: ${a.entity.label ?? a.entity.id} (${a.entity.track}/${a.entity.id}, ${a.entity.type})`);
  if (a.source) meta.push(`- Source: ${a.source.name} @ ${a.source.time}s`);
  if (a.transcript) meta.push(`- Transcript: "${a.transcript}"`);
  if (c.snapshot) meta.push(`- Snapshot: ${await snapshotPath(reviewDir, c.snapshot)}`);
  meta.push(`- Agent: ${c.agent.status}${c.agent.appliedIn ? ` (applied in ${c.agent.appliedIn})` : ""}`);
  if (c.agent.plan) meta.push(`- Plan: ${c.agent.plan}`);
  if (c.agent.reply) meta.push(`- Reply: ${c.agent.reply}`);
  out.push("", ...meta);
  if (c.thread.length) {
    out.push("", "Thread:");
    for (const m of c.thread) out.push(`- **${m.author}**: ${m.text.trim().replace(/\n/g, " ")}`);
  }
  return out;
}

async function snapshotPath(reviewDir: string, rel: string): Promise<string> {
  const abs = fromReview(reviewDir, rel);
  return (await exists(abs)) ? abs : `${abs} (missing)`;
}
