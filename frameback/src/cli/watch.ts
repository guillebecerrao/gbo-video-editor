/** `frameback watch` — tail a review's event log (PROTOCOL §7). */
import { promises as fs } from "node:fs";
import {
  ACTORS,
  EVENT_TYPES,
  lastSeq,
  p,
  readEvents,
  readReview,
  resolveReviewDir,
  reviewExists,
  type Actor,
  type Event,
  type EventType,
} from "../core/index.js";
import { formatEventText } from "./format.js";

const POLL_MS = 250;

export interface WatchOptions {
  target: string;
  /** replay events with seq > since (default: replay everything) */
  since?: number;
  /** start at the current end of the log instead of replaying */
  tail?: boolean;
  format: "json" | "text";
  /**
   * Stop right after printing the first NEW event of this type. Replayed history does not count (after a reopen an
   * old review.submitted must not end the next round's wait), except the review.submitted that is still current,
   * i.e. the review is waiting in `submitted`.
   */
  exitOn?: EventType;
  /** only print events written by these actors (e.g. human,system to skip the agent's own echoes) */
  actors?: Actor[];
  signal?: AbortSignal;
  /** line sink; must resolve once the line has been flushed */
  write: (line: string) => Promise<void>;
  /** diagnostics sink (stderr) */
  log: (message: string) => void;
}

export function parseEventType(value: string): EventType {
  if (!(EVENT_TYPES as readonly string[]).includes(value)) {
    throw new Error(`unknown event type '${value}' (expected one of: ${EVENT_TYPES.join(", ")})`);
  }
  return value as EventType;
}

export function parseActors(value: string): Actor[] {
  const list = value.split(",").map((a) => a.trim()).filter(Boolean);
  for (const a of list) {
    if (!(ACTORS as readonly string[]).includes(a)) throw new Error(`unknown actor '${a}' (expected: ${ACTORS.join(", ")})`);
  }
  return list as Actor[];
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

/** Resolves with the event that satisfied `exitOn`, or null when aborted. */
export async function watchReview(opts: WatchOptions): Promise<Event | null> {
  const { signal } = opts;
  const dir = await resolveReviewDir(opts.target);

  let announced = false;
  let existedAtStart = true;
  while (!(await reviewExists(dir))) {
    existedAtStart = false;
    if (signal?.aborted) return null;
    if (!announced) opts.log(`waiting for review at ${dir}`);
    announced = true;
    await sleep(POLL_MS, signal);
  }

  // --tail on a review that did not exist yet: every event is new, so start at the beginning
  const endAtStart = await lastSeq(dir);
  let cursor = opts.tail && existedAtStart ? endAtStart : opts.since ?? 0;
  opts.log(`watching ${dir} (events after #${cursor})`);

  const actors = opts.actors?.length ? new Set<Actor>(opts.actors) : null;
  const exitAfter = opts.since !== undefined ? opts.since : existedAtStart ? endAtStart : 0;
  let currentSubmitted = -1; // seq of the replayed review.submitted that is still current (the review is `submitted`)
  if (opts.exitOn === "review.submitted" && (await readReview(dir)).state === "submitted") {
    const submitted = (await readEvents(dir, 0)).filter((e) => e.type === "review.submitted");
    if (submitted.length) currentSubmitted = submitted[submitted.length - 1].seq;
  }

  let signature = "";
  let lastSize = 0;
  let lastIno: number | null = null;
  while (!signal?.aborted) {
    const st = await fs.stat(p.events(dir)).catch(() => null);
    if (st && ((lastSize > 0 && st.size < lastSize) || (lastIno !== null && st.ino !== lastIno))) {
      opts.log("event log restarted (review recreated); following it from the beginning");
      cursor = 0;
      signature = "";
    }
    if (st) {
      lastSize = st.size;
      lastIno = st.ino;
    }
    const next = st ? `${st.size}:${st.mtimeMs}` : "";
    if (next !== signature) {
      signature = next;
      for (const ev of await readEvents(dir, cursor)) {
        cursor = ev.seq;
        if (actors && !actors.has(ev.actor)) continue;
        // `reviewDir` is not stored in the log; it lets an agent resolve relative paths such as `snapshot`
        const line = opts.format === "json" ? JSON.stringify({ ...ev, reviewDir: dir }) : formatEventText(ev, dir);
        await opts.write(line);
        if (ev.type === opts.exitOn && (ev.seq > exitAfter || ev.seq === currentSubmitted)) return ev;
      }
    }
    await sleep(POLL_MS, signal);
  }
  return null;
}
