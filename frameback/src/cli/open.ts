/** `frameback open` — start the review server for a video, or attach to one that is already running. */
import path from "node:path";
import open from "open";
import type { Health, RegisterReviewRequest, RegisterReviewResponse } from "../core/index.js";
import { DEV_UI_PORT } from "../server/app.js";
import { assertVideoFile, startServer } from "../server/index.js";

export interface OpenCommandOptions {
  port: number;
  open: boolean;
  edl?: string;
  timeline?: string;
  carry: boolean;
  force?: boolean;
  dev?: boolean;
}

/** How many consecutive ports to try after the requested one. */
const PORT_SPAN = 10;
/** Retries on one port when another `frameback open` wins the race for it. */
const BIND_RETRIES = 4;
const HOST = "127.0.0.1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Probe = "frameback" | "other" | "none";

async function probePort(port: number): Promise<Probe> {
  try {
    const res = await fetch(`http://${HOST}:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    const health = (await res.json().catch(() => null)) as Partial<Health> | null;
    return health?.app === "frameback" ? "frameback" : "other";
  } catch {
    return "none";
  }
}

async function registerRemote(port: number, req: RegisterReviewRequest): Promise<RegisterReviewResponse> {
  const res = await fetch(`http://${HOST}:${port}/api/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const body = (await res.json().catch(() => null)) as (RegisterReviewResponse & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `server on port ${port} answered ${res.status}`);
  return body;
}

function announce(port: number, rid: string, reviewDir: string): void {
  console.log(`Frameback: http://${HOST}:${port}/?r=${encodeURIComponent(rid)}`);
  console.log(`Review dir: ${reviewDir}`);
}

function report(carried: number | undefined, warnings: string[] | undefined): void {
  if (carried) console.error(`frameback: carried ${carried} comment(s) from the previous version for verification`);
  for (const warning of warnings ?? []) console.error(`frameback: warning: ${warning}`);
}

async function openBrowser(url: string): Promise<void> {
  try {
    await open(url);
  } catch (e) {
    console.error(`frameback: could not open a browser (${(e as Error).message}); open the URL above manually`);
  }
}

export async function openCommand(videoArg: string, opts: OpenCommandOptions): Promise<void> {
  const video = await assertVideoFile(videoArg);
  const request: RegisterReviewRequest = {
    video,
    edl: opts.edl ? path.resolve(opts.edl) : undefined,
    timeline: opts.timeline ? path.resolve(opts.timeline) : undefined,
    carry: opts.carry,
    force: opts.force,
  };

  for (let port = opts.port; port <= opts.port + PORT_SPAN; port++) {
    for (let attempt = 0; attempt < BIND_RETRIES; attempt++) {
      const found = await probePort(port);
      if (found === "other") break; // not ours: next port
      if (found === "frameback") {
        const summary = await registerRemote(port, request);
        announce(port, summary.rid, summary.reviewDir);
        report(summary.carried, summary.warnings);
        if (opts.open) await openBrowser(`http://${HOST}:${port}/?r=${encodeURIComponent(summary.rid)}`);
        return;
      }

      let server;
      try {
        server = await startServer({ port, serveWeb: !opts.dev, dev: opts.dev });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") {
          // another `frameback open` may have just claimed this port: look at it again before moving on
          await sleep(150 + Math.random() * 150);
          continue;
        }
        throw e;
      }
      let result;
      try {
        result = await server.registry.register(video, { edlPath: request.edl, timelinePath: request.timeline, carry: opts.carry, force: opts.force });
      } catch (e) {
        await server.close(); // never leave an empty server (and a taken port) behind
        throw e;
      }
      const { entry, prepared } = result;
      announce(server.port, entry.rid, entry.reviewDir);
      report(prepared.carried, prepared.warnings);
      if (opts.dev) {
        console.error("frameback: dev mode — the API is served here, the UI comes from the Vite dev server");
        console.error(`frameback: dev mode accepts cross-origin requests from the Vite dev server (port ${DEV_UI_PORT}) only`);
      }
      if (opts.open) await openBrowser(`${server.url}/?r=${encodeURIComponent(entry.rid)}`);

      const shutdown = () => void server.close().then(() => process.exit(0));
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      return; // the listening server keeps the process alive
    }
  }
  throw new Error(`no free port in ${opts.port}–${opts.port + PORT_SPAN} (use --port)`);
}
