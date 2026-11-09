/** Server-sent events for a review: replay events after `since`, then follow events.ndjson (any writer). */
import { promises as fs } from "node:fs";
import type { Request, Response } from "express";
import { p, readEvents } from "../core/index.js";

const POLL_MS = 250;
const HEARTBEAT_MS = 15_000;

export function streamEvents(req: Request, res: Response, reviewDir: string, since: number): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 2000\n\n");

  let cursor = since;
  let signature = "";
  let lastSize = 0;
  let lastIno: number | null = null;
  let closed = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async () => {
    try {
      const st = await fs.stat(p.events(reviewDir)).catch(() => null);
      const next = st ? `${st.size}:${st.mtimeMs}` : "";
      if (st && ((lastSize > 0 && st.size < lastSize) || (lastIno !== null && st.ino !== lastIno))) {
        // the log started over (review dir deleted and recreated): follow the new log from its beginning
        cursor = 0;
        res.write(": log restarted\n\n");
      }
      if (st) {
        lastSize = st.size;
        lastIno = st.ino;
      }
      if (next !== signature) {
        signature = next;
        for (const ev of await readEvents(reviewDir, cursor)) {
          if (closed) return;
          res.write(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`);
          cursor = ev.seq;
        }
      }
    } catch (e) {
      process.stderr.write(`frameback: event stream error: ${(e as Error).message}\n`);
    }
    if (!closed) timer = setTimeout(tick, POLL_MS);
  };

  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  req.on("close", () => {
    closed = true;
    clearTimeout(timer);
    clearInterval(heartbeat);
  });
  void tick();
}
