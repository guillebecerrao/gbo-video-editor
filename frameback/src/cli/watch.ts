/** `frameback watch` — tail a review's event log (PROTOCOL §7). */
import { promises as fs } from "node:fs";
import {
  EVENT_TYPES,
  lastSeq,
  p,
  readEvents,
  resolveReviewDir,
  reviewExists,
  type Event,
  type EventType,
} from "../core/index.js";
import { formatEventText } from "./format.js";

const POLL_MS = 250;

export interface WatchOptions {
  target: string;
  /** replay events with seq > since (default 0) */
  since?: number;
  /** start at the current end of the log instead of replaying */
  tail?: boolean;
  format: "json" | "text";
  /** stop right after printing the first event of this type */
  exitOn?: EventType;
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
  while (!(await reviewExists(dir))) {
    if (signal?.aborted) return null;
    if (!announced) opts.log(`waiting for review at ${dir}`);
    announced = true;
    await sleep(POLL_MS, signal);
  }

  let cursor = opts.tail ? await lastSeq(dir) : opts.since ?? 0;
  opts.log(`watching ${dir} (events after #${cursor})`);

  let signature = "";
  while (!signal?.aborted) {
    const st = await fs.stat(p.events(dir)).catch(() => null);
    const next = st ? `${st.size}:${st.mtimeMs}` : "";
    if (next !== signature) {
      signature = next;
      for (const ev of await readEvents(dir, cursor)) {
        cursor = ev.seq;
        await opts.write(opts.format === "json" ? JSON.stringify(ev) : formatEventText(ev, dir));
        if (ev.type === opts.exitOn) return ev;
      }
    }
    await sleep(POLL_MS, signal);
  }
  return null;
}
