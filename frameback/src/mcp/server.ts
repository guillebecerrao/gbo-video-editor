/**
 * Frameback MCP stdio server. `frameback mcp` calls startMcpServer().
 *
 * It exposes the review protocol (docs/PROTOCOL.md) as MCP tools. Every write goes through `src/core/store.ts`,
 * so the CLI, the web UI and this server stay consistent. stdout is reserved for the MCP protocol: never log there.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { Actor, AgentStatus, EventType, type Comment, type Event } from "../core/schema.js";
import {
  addThreadMessage,
  countComments,
  fromReview,
  insideReview,
  isStale,
  lastSeq,
  listComments,
  readComment,
  readEvents,
  readReview,
  readTimeline,
  resolveReviewDir,
  reviewExists,
  setReviewState,
  updateCommentAgent,
  REVIEW_DIR_NAME,
  REVIEW_FILE,
} from "../core/store.js";
import { exportReview } from "../core/export.js";
import { VERSION } from "../core/index.js";

export interface McpServerOptions {
  /** default root directory to search for reviews, and base for relative `review` arguments (default: cwd) */
  root?: string;
}

const INSTRUCTIONS = [
  "Frameback lets a human leave frame-accurate review comments on a video while you edit.",
  "1. Call frameback_list_reviews (or use the review the user names), then frameback_get_review for the overview.",
  "2. Call frameback_wait_for_events with the returned lastSeq; each comment.created / comment.updated event carries the comment summary.",
  "3. Call frameback_get_comment to see the snapshot image, then mark it acknowledged / in_progress / prepared / needs_info via frameback_update_comment (ask questions with frameback_reply).",
  "4. When review.submitted arrives, set the state to processing, finish the remaining comments, render once, mark them applied.",
  "5. Finish with frameback_set_review_state delivered (nextVideo = the new, existing file). Never edit human fields; keep replies short.",
  "Pass actors:[\"human\",\"system\"] to frameback_wait_for_events to skip the echoes of your own updates.",
  "Starting a review (`frameback open <video>`) and carrying comments to a new version need the CLI; MCP only works on existing reviews.",
].join("\n");

const MAX_WAIT_SEC = 300;
const POLL_MS = 250;
const SKIPPED_DIRS = new Set(["node_modules", ".git"]);

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

const text = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

const failure = (e: unknown): CallToolResult => ({
  isError: true,
  content: [{ type: "text", text: `frameback: ${e instanceof Error ? e.message : String(e)}` }],
});

/** Compact view of a comment: enough to triage without reading the full JSON. */
function compactComment(c: Comment) {
  return {
    id: c.id,
    time: c.anchor.time,
    category: c.category,
    action: c.action ?? null,
    priority: c.priority,
    body: c.body,
    region: c.anchor.region ?? null,
    entity: c.anchor.entity ? { track: c.anchor.entity.track, id: c.anchor.entity.id, label: c.anchor.entity.label ?? null } : null,
    transcript: c.anchor.transcript ?? null,
    humanStatus: c.human.status,
    revision: c.human.revision,
    agentStatus: c.agent.status,
    stale: isStale(c),
    carried: c.carriedFrom != null,
    hasSnapshot: c.snapshot != null,
    threadMessages: c.thread.length,
  };
}

/** Find `**\/review/<id>/review.json` below `dir`. */
async function findReviewDirs(dir: string, depth: number, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  if (path.basename(dir) === REVIEW_DIR_NAME) {
    for (const e of entries) {
      if (e.isDirectory() && (await reviewExists(path.join(dir, e.name)))) out.push(path.join(dir, e.name));
    }
  }
  if (depth <= 0) return out;
  for (const e of entries) {
    if (e.isDirectory() && !SKIPPED_DIRS.has(e.name)) await findReviewDirs(path.join(dir, e.name), depth - 1, out);
  }
  return out;
}

/** Build the (not yet connected) MCP server. Exported so tests can attach an in-memory transport. */
export function createMcpServer(opts: McpServerOptions = {}): McpServer {
  const root = path.resolve(opts.root ?? process.cwd());
  const server = new McpServer({ name: "frameback", version: VERSION }, { instructions: INSTRUCTIONS });

  /** Resolve a `review` argument (video path, review dir or review.json) relative to the root; it must exist. */
  async function reviewDirOf(arg: string): Promise<string> {
    const dir = await resolveReviewDir(path.resolve(root, arg));
    if (!(await reviewExists(dir))) throw new Error(`no review found for '${arg}' (looked for ${path.join(dir, REVIEW_FILE)})`);
    return dir;
  }

  /** Register a tool whose errors are returned as MCP tool errors instead of protocol failures. */
  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    handler: (args: z.infer<z.ZodObject<S>>, signal: AbortSignal) => Promise<CallToolResult>,
  ) {
    server.registerTool(name, { description, inputSchema: shape }, (async (args: z.infer<z.ZodObject<S>>, extra: { signal: AbortSignal }) => {
      try {
        return await handler(args, extra.signal);
      } catch (e) {
        return failure(e);
      }
    }) as never);
  }

  const reviewArg = z.string().describe("Video path, review directory or review.json (absolute, or relative to the server root)");

  tool(
    "frameback_list_reviews",
    "Find Frameback reviews (`**/review/*/review.json`) under a directory. Returns id, dir, state, round, counts and lastSeq.",
    {
      root: z.string().optional().describe("Directory to search (default: the server root)"),
      maxDepth: z.number().int().min(0).max(12).default(4).describe("How many directory levels to descend"),
    },
    async ({ root: searchRoot, maxDepth }) => {
      const dirs = await findReviewDirs(path.resolve(root, searchRoot ?? "."), maxDepth);
      const reviews = await Promise.all(
        dirs.sort().map(async (dir) => {
          const review = await readReview(dir);
          return { id: review.id, dir, state: review.state, round: review.round, counts: await countComments(dir), lastSeq: await lastSeq(dir) };
        }),
      );
      return text(reviews);
    },
  );

  tool(
    "frameback_get_review",
    "Review overview: state, round, comment counts, compact comments (sorted by time), lastSeq and a timeline summary.",
    { review: reviewArg },
    async ({ review }) => {
      const dir = await reviewDirOf(review);
      const [r, counts, comments, seq, timeline] = await Promise.all([
        readReview(dir), countComments(dir), listComments(dir), lastSeq(dir), readTimeline(dir),
      ]);
      return text({
        review: r,
        dir,
        video: fromReview(dir, r.video.file),
        counts,
        lastSeq: seq,
        comments: comments.map(compactComment),
        timeline: timeline && {
          origin: r.timeline?.origin ?? timeline.origin ?? null,
          approximate: r.timeline?.approximate ?? false,
          duration: timeline.duration ?? null,
          warnings: r.timeline?.warnings ?? [],
          tracks: timeline.tracks.map((t) => ({ id: t.id, label: t.label, kind: t.kind, items: t.items.length })),
        },
      });
    },
  );

  tool(
    "frameback_get_comment",
    "Full comment JSON plus the snapshot frame (with the region drawn on it) as an image.",
    { review: reviewArg, id: z.string().regex(/^c-\d{4,}$/).describe("Comment id, e.g. c-0007") },
    async ({ review, id }) => {
      const dir = await reviewDirOf(review);
      const comment = await readComment(dir, id);
      const content: CallToolResult["content"] = [{ type: "text", text: JSON.stringify({ ...comment, stale: isStale(comment) }, null, 2) }];
      if (comment.snapshot) {
        try {
          // review folders can come from elsewhere: never read outside <review>/snapshots, and only hand over real JPEGs
          const file = insideReview(dir, comment.snapshot, "snapshots");
          if (!file) throw new Error("snapshot path escapes the review folder");
          const jpeg = await fs.readFile(file);
          if (jpeg.length < 3 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff) throw new Error("not a JPEG");
          content.push({ type: "image", data: jpeg.toString("base64"), mimeType: "image/jpeg" });
        } catch {
          content.push({ type: "text", text: `(snapshot ${comment.snapshot} is missing on disk)` });
        }
      }
      return { content };
    },
  );

  tool(
    "frameback_update_comment",
    "Update the agent-owned fields of a comment (status, plan, reply, appliedIn). Never changes human fields.",
    {
      review: reviewArg,
      id: z.string().regex(/^c-\d{4,}$/),
      status: AgentStatus.optional(),
      plan: z.string().nullable().optional().describe("What you intend to do / did, one or two sentences"),
      reply: z.string().nullable().optional().describe("Short note shown to the human on the card"),
      appliedIn: z.string().nullable().optional().describe("Stem of the video version where the change landed"),
      seenRevision: z.number().int().min(0).nullable().optional().describe("Human revision you acted on (defaults to the current one)"),
    },
    async ({ review, id, ...patch }) => {
      const dir = await reviewDirOf(review);
      return text(compactComment(await updateCommentAgent(dir, id, patch)));
    },
  );

  tool(
    "frameback_reply",
    "Append an agent message to a comment's thread (use it for clarifying questions together with status needs_info).",
    { review: reviewArg, id: z.string().regex(/^c-\d{4,}$/), text: z.string().min(1) },
    async ({ review, id, text: message }) => {
      const dir = await reviewDirOf(review);
      const c = await addThreadMessage(dir, id, "agent", message);
      return text({ id: c.id, thread: c.thread });
    },
  );

  tool(
    "frameback_set_review_state",
    "Move the review to processing (you started working), delivered (a new version is ready) or closed.",
    {
      review: reviewArg,
      state: z.enum(["processing", "delivered", "closed"]),
      nextVideo: z.string().optional().describe("Path of the new video version; required with delivered and it must exist"),
      force: z.boolean().optional().describe("Skip the state-machine checks (processing only after submit, delivered only after processing, closed is final)"),
    },
    async ({ review, state, nextVideo, force }) => {
      const dir = await reviewDirOf(review);
      const r = await setReviewState(dir, state, { nextVideo: nextVideo ? path.resolve(root, nextVideo) : undefined, force });
      return text({ id: r.id, state: r.state, round: r.round, nextVideo: r.nextVideo ?? null });
    },
  );

  tool(
    "frameback_wait_for_events",
    `Long-poll for new review events (seq > sinceSeq). Waits for the review to exist. Returns { events, lastSeq, timedOut, reviewExists, reviewDir }; pass lastSeq back as sinceSeq. A sinceSeq beyond the log end is clamped to the real lastSeq (reset: true).`,
    {
      review: reviewArg,
      sinceSeq: z.number().int().min(0).default(0),
      timeoutSec: z.number().min(1).max(MAX_WAIT_SEC).default(60),
      types: z.array(EventType).optional().describe("Only return these event types"),
      actors: z.array(Actor).optional().describe("Only return events written by these actors, e.g. [\"human\",\"system\"] to skip your own echoes"),
    },
    async ({ review, sinceSeq, timeoutSec, types, actors }, signal) => {
      const dir = await resolveReviewDir(path.resolve(root, review));
      const deadline = Date.now() + timeoutSec * 1000;
      let cursor = sinceSeq;
      let reset = false;
      const end = await lastSeq(dir);
      if (cursor > end) {
        // a stale or foreign cursor would silently skip every event up to it
        cursor = end;
        reset = true;
      }
      for (;;) {
        const fresh: Event[] = await readEvents(dir, cursor);
        if (fresh.length) {
          cursor = fresh[fresh.length - 1].seq;
          const events = fresh.filter((e) => (!types || types.includes(e.type)) && (!actors || actors.includes(e.actor)));
          if (events.length) return text({ events, lastSeq: cursor, timedOut: false, reviewExists: true, reviewDir: dir, ...(reset ? { reset } : {}) });
        }
        if (Date.now() >= deadline || signal.aborted) {
          const exists = await reviewExists(dir);
          return text({
            events: [], lastSeq: cursor, timedOut: true, reviewExists: exists, reviewDir: dir, ...(reset ? { reset } : {}),
            ...(exists ? {} : { warning: `no review found at ${dir}; check the path (it may not exist yet)` }),
          });
        }
        await sleep(POLL_MS, signal);
      }
    },
  );

  tool(
    "frameback_export",
    "Export the whole review as Markdown (default) or JSON, ready to read in one go.",
    { review: reviewArg, format: z.enum(["md", "json"]).default("md") },
    async ({ review, format }) => text(await exportReview(await reviewDirOf(review), format)),
  );

  return server;
}

/** Start the MCP server on stdio and resolve once connected. */
export async function startMcpServer(opts: McpServerOptions = {}): Promise<void> {
  await createMcpServer(opts).connect(new StdioServerTransport());
}
