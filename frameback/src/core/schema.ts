/**
 * Frameback review protocol — normative schema (schemaVersion 1).
 * Must stay in sync with docs/PROTOCOL.md. Shared by server, CLI, MCP and (types only) the web UI.
 */
import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------- enums ----

export const CATEGORIES = [
  "cut", "transition", "framing", "color", "motion", "audio",
  "caption", "broll", "element", "pacing", "other",
] as const;
export const ACTIONS = ["remove", "change", "add", "move", "keep", "question"] as const;
export const PRIORITIES = ["must", "should", "nit"] as const;
export const HUMAN_STATUSES = ["open", "resolved_by_human", "deleted", "verified", "reopened"] as const;
export const AGENT_STATUSES = [
  "pending", "acknowledged", "in_progress", "prepared", "applied", "needs_info", "declined",
] as const;
export const REVIEW_STATES = ["reviewing", "submitted", "processing", "delivered", "closed"] as const;
export const ACTORS = ["human", "agent", "system"] as const;
export const EVENT_TYPES = [
  "review.opened",
  "comment.created",
  "comment.carried",
  "comment.updated",
  "comment.deleted",
  "comment.human_status",
  "comment.agent_status",
  "thread.message",
  "review.submitted",
  "review.state",
] as const;

export const Category = z.enum(CATEGORIES);
export const Action = z.enum(ACTIONS);
export const Priority = z.enum(PRIORITIES);
export const HumanStatus = z.enum(HUMAN_STATUSES);
export const AgentStatus = z.enum(AGENT_STATUSES);
export const ReviewState = z.enum(REVIEW_STATES);
export const Actor = z.enum(ACTORS);
export const EventType = z.enum(EVENT_TYPES);

const Iso = z.string(); // ISO-8601 timestamp
const Seconds = z.number().finite().nonnegative();
const Unit = z.number().min(0).max(1);

// --------------------------------------------------------------- anchor ----

export const TimeSpan = z.object({
  start: Seconds,
  /** omitted or null => a single point in time */
  end: Seconds.nullable().optional(),
});

export const Region = z.discriminatedUnion("shape", [
  z.object({ shape: z.literal("rect"), x: Unit, y: Unit, w: Unit, h: Unit }),
  z.object({ shape: z.literal("point"), x: Unit, y: Unit }),
]);

export const EntityRef = z.object({
  track: z.string(),
  id: z.string(),
  type: z.string(),
  label: z.string().optional(),
});

export const Anchor = z.object({
  time: TimeSpan,
  frame: z.number().int().nonnegative().optional(),
  region: Region.optional(),
  entity: EntityRef.optional(),
  source: z.object({ name: z.string(), time: Seconds }).optional(),
  transcript: z.string().optional(),
});

// -------------------------------------------------------------- comment ----

export const ThreadMessage = z.object({
  author: z.enum(["human", "agent"]),
  at: Iso,
  text: z.string().min(1),
});

export const AgentFields = z.object({
  status: AgentStatus,
  plan: z.string().nullable().optional(),
  reply: z.string().nullable().optional(),
  appliedIn: z.string().nullable().optional(),
  /** human.revision the agent last acted on; mismatch => the human edited after the agent's work (stale) */
  seenRevision: z.number().int().nonnegative().nullable().optional(),
  updatedAt: Iso.nullable().optional(),
});

/** Where a carried comment came from; `time`/`remap` record how its anchor was moved to this version's timeline. */
export const CarriedFrom = z.object({
  review: z.string(),
  id: z.string(),
  /** the anchor time in the previous version (before remapping) */
  time: TimeSpan.optional(),
  remap: z
    .object({
      method: z.enum(["source", "identity"]),
      status: z.enum(["exact", "clamped", "lost"]),
    })
    .optional(),
});

export const Comment = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().regex(/^c-\d{4,}$/),
  createdAt: Iso,
  updatedAt: Iso,
  anchor: Anchor,
  category: Category,
  action: Action.nullable().optional(),
  priority: Priority,
  body: z.string(),
  snapshot: z.string().nullable().optional(),
  human: z.object({
    status: HumanStatus,
    /** increments on every human edit of body/anchor/category/action/priority (starts at 1) */
    revision: z.number().int().positive(),
  }),
  agent: AgentFields,
  thread: z.array(ThreadMessage),
  carriedFrom: CarriedFrom.nullable().optional(),
});

/** What a human sends to create a comment (server fills ids/timestamps/statuses). */
export const NewComment = z.object({
  anchor: Anchor,
  category: Category,
  action: Action.nullable().optional(),
  priority: Priority.default("should"),
  body: z.string().trim().min(1),
});

/** Human-editable fields. */
export const CommentPatch = z.object({
  anchor: Anchor.optional(),
  category: Category.optional(),
  action: Action.nullable().optional(),
  priority: Priority.optional(),
  body: z.string().trim().min(1).optional(),
});

/** Agent-editable fields. */
export const AgentPatch = z.object({
  status: AgentStatus.optional(),
  seenRevision: z.number().int().nonnegative().nullable().optional(),
  plan: z.string().nullable().optional(),
  reply: z.string().nullable().optional(),
  appliedIn: z.string().nullable().optional(),
});

// --------------------------------------------------------------- review ----

export const VideoInfo = z.object({
  file: z.string(), // relative to the review dir
  duration: Seconds.nullable().optional(),
  fps: z.number().positive().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
});

export const Review = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  video: VideoInfo,
  /** frozen resolved timeline inside the review dir (usually "timeline.json"), plus where it came from */
  timeline: z.object({
    file: z.string(),
    origin: z.string(),            // "sidecar" | "edl" | adapter name
    sourceFile: z.string().nullable().optional(), // relative to review dir
    sourceMtime: Iso.nullable().optional(),
    approximate: z.boolean().optional(),          // true when derived from EDL durations
    warnings: z.array(z.string()).optional(),
  }).nullable().optional(),
  state: ReviewState,
  round: z.number().int().positive(),
  previous: z.string().nullable().optional(),
  nextVideo: z.string().nullable().optional(),
  createdAt: Iso,
  submittedAt: Iso.nullable().optional(),
  updatedAt: Iso,
});

// ---------------------------------------------------------------- event ----

export const Event = z.object({
  seq: z.number().int().positive(),
  at: Iso,
  type: EventType,
  review: z.string(),
  commentId: z.string().optional(),
  actor: Actor,
  data: z.record(z.unknown()).optional(),
});

// ------------------------------------------------------------- timeline ----

export const TimelineItem = z.object({
  id: z.string(),
  type: z.string(), // range | transition | broll | caption | word | overlay | speaker | …
  start: Seconds,
  end: Seconds.nullable().optional(),
  label: z.string().optional(),
  source: z.object({ name: z.string(), start: Seconds, end: Seconds.optional() }).optional(),
  meta: z.record(z.unknown()).optional(),
});

export const TimelineTrack = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["segments", "markers"]),
  items: z.array(TimelineItem),
});

export const Timeline = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  video: z.string().optional(),
  duration: Seconds.nullable().optional(),
  /** where this timeline came from: "sidecar" | "edl" | other adapter name */
  origin: z.string().optional(),
  tracks: z.array(TimelineTrack),
});

// ---------------------------------------------------------------- types ----

export type Category = z.infer<typeof Category>;
export type Action = z.infer<typeof Action>;
export type Priority = z.infer<typeof Priority>;
export type HumanStatus = z.infer<typeof HumanStatus>;
export type AgentStatus = z.infer<typeof AgentStatus>;
export type ReviewState = z.infer<typeof ReviewState>;
export type Actor = z.infer<typeof Actor>;
export type EventType = z.infer<typeof EventType>;
export type TimeSpan = z.infer<typeof TimeSpan>;
export type Region = z.infer<typeof Region>;
export type EntityRef = z.infer<typeof EntityRef>;
export type Anchor = z.infer<typeof Anchor>;
export type ThreadMessage = z.infer<typeof ThreadMessage>;
export type AgentFields = z.infer<typeof AgentFields>;
export type Comment = z.infer<typeof Comment>;
export type NewComment = z.input<typeof NewComment>;
export type CommentPatch = z.infer<typeof CommentPatch>;
export type AgentPatch = z.infer<typeof AgentPatch>;
export type VideoInfo = z.infer<typeof VideoInfo>;
export type Review = z.infer<typeof Review>;
export type Event = z.infer<typeof Event>;
export type TimelineItem = z.infer<typeof TimelineItem>;
export type TimelineTrack = z.infer<typeof TimelineTrack>;
export type Timeline = z.infer<typeof Timeline>;
