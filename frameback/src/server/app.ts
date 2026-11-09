/** Express app implementing the HTTP contract in src/core/api.ts. */
import { promises as fs } from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { ZodError, z } from "zod";
import {
  HumanStatus,
  NewComment,
  CommentPatch,
  StoreError,
  VERSION,
  VideoInfo,
  addThreadMessage,
  computeWaveform,
  countComments,
  createComment,
  exists,
  fromReview,
  lastSeq,
  listComments,
  p,
  readComment,
  readReview,
  readTimeline,
  reopenReview,
  setHumanStatus,
  setSnapshot,
  submitReview,
  updateCommentHuman,
  updateVideoInfo,
  type CreateCommentRequest,
  type Health,
  type ReviewBundle,
  type ReviewSummary,
  type Waveform,
} from "../core/index.js";
import { InvalidVideoError, VIDEO_EXTENSIONS, splitVersion } from "./prepare.js";
import type { Registry, RegistryEntry } from "./registry.js";
import { streamEvents } from "./sse.js";

export interface AppOptions {
  registry: Registry;
  /** directory with the built web UI (index.html + assets); undefined => a "build the UI" notice page */
  webDir?: string;
  /** dev mode: the Vite dev server proxies to us, so accept its localhost origin */
  dev?: boolean;
}

const COMMENT_ID = /^c-\d{4,}$/;
const DATA_URL = /^data:image\/jpe?g;base64,/i;
const JSON_LIMIT = "15mb";
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const LOCAL_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const RegisterBody = z.object({
  video: z.string().min(1),
  edl: z.string().optional(),
  timeline: z.string().optional(),
  carry: z.boolean().optional(),
});
const StatusBody = z.object({ status: HumanStatus });
const ThreadBody = z.object({ text: z.string().min(1) });
const VideoInfoBody = VideoInfo.omit({ file: true }).partial();

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
const route = (fn: Handler): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res)).catch(next);
};

export function createApp(opts: AppOptions): express.Express {
  const { registry } = opts;
  const app = express();
  app.disable("x-powered-by");
  const waveforms = new Map<string, Promise<Waveform | null>>();

  // Local-only guard: DNS rebinding (foreign Host) and cross-site requests (foreign Origin) never reach a route.
  app.use((req, _res, next) => {
    const host = req.headers.host ?? "";
    if (!LOCAL_HOST.test(host)) return next(new HttpError(403, "forbidden host"));
    const origin = req.headers.origin;
    if (origin && origin !== `http://${host}` && !(opts.dev && LOCAL_ORIGIN.test(origin))) {
      return next(new HttpError(403, "forbidden origin"));
    }
    next();
  });
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });

  const entryOf = (req: Request): RegistryEntry => {
    const entry = registry.get(String(req.params.rid));
    if (!entry) throw new HttpError(404, `unknown review '${req.params.rid}'`);
    return entry;
  };
  const commentId = (req: Request): string => {
    const id = String(req.params.id);
    if (!COMMENT_ID.test(id)) throw new HttpError(400, `invalid comment id '${id}'`);
    return id;
  };

  const summary = async (e: RegistryEntry): Promise<ReviewSummary> => {
    const [review, counts] = await Promise.all([readReview(e.reviewDir), countComments(e.reviewDir)]);
    return {
      rid: e.rid,
      reviewDir: e.reviewDir,
      videoName: path.basename(e.videoPath),
      state: review.state,
      counts: { total: counts.total, pending: counts.pending, prepared: counts.prepared, applied: counts.applied, needs_info: counts.needs_info },
    };
  };

  const json = express.json({ limit: JSON_LIMIT });

  // ----------------------------------------------------------------- reviews --

  app.get("/api/health", (_req, res) => {
    const health: Health = { app: "frameback", version: VERSION, pid: process.pid };
    res.json(health);
  });

  app.get("/api/reviews", route(async (_req, res) => {
    res.json(await Promise.all(registry.list().map(summary)));
  }));

  app.post("/api/reviews", json, route(async (req, res) => {
    const body = RegisterBody.parse(req.body);
    const { entry } = await registry.register(body.video, { edlPath: body.edl, timelinePath: body.timeline, carry: body.carry });
    res.json(await summary(entry));
  }));

  app.get("/api/reviews/:rid", route(async (req, res) => {
    const entry = entryOf(req);
    const [review, timeline, comments, seq] = await Promise.all([
      readReview(entry.reviewDir),
      readTimeline(entry.reviewDir),
      listComments(entry.reviewDir),
      lastSeq(entry.reviewDir),
    ]);
    const bundle: ReviewBundle = {
      rid: entry.rid,
      review,
      videoUrl: `/media/${entry.rid}/video`,
      videoName: path.basename(entry.videoPath),
      timeline,
      comments,
      lastSeq: seq,
      versions: await listVersions(entry, registry),
      next: await nextOf(entry, review.nextVideo),
    };
    res.json(bundle);
  }));

  app.get("/api/reviews/:rid/timeline", route(async (req, res) => {
    res.json(await readTimeline(entryOf(req).reviewDir));
  }));

  app.post("/api/reviews/:rid/submit", route(async (req, res) => {
    res.json(await submitReview(entryOf(req).reviewDir));
  }));

  app.post("/api/reviews/:rid/reopen", route(async (req, res) => {
    res.json(await reopenReview(entryOf(req).reviewDir));
  }));

  app.post("/api/reviews/:rid/video-info", json, route(async (req, res) => {
    res.json(await updateVideoInfo(entryOf(req).reviewDir, VideoInfoBody.parse(req.body)));
  }));

  app.get("/api/reviews/:rid/waveform", route(async (req, res) => {
    const entry = entryOf(req);
    const buckets = Math.min(4000, Math.max(50, parseInt(String(req.query.buckets ?? "1000"), 10) || 1000));
    const key = `${entry.rid}:${buckets}`;
    let pending = waveforms.get(key);
    if (!pending) {
      pending = computeWaveform(entry.videoPath, buckets);
      waveforms.set(key, pending);
    }
    const waveform = await pending;
    if (!waveform) {
      waveforms.delete(key);
      throw new HttpError(404, "waveform unavailable (ffmpeg missing or no audio track)");
    }
    res.json(waveform);
  }));

  app.get("/api/reviews/:rid/events", (req, res, next) => {
    try {
      const entry = entryOf(req);
      const fromHeader = parseInt(String(req.headers["last-event-id"] ?? ""), 10);
      const fromQuery = parseInt(String(req.query.since ?? ""), 10);
      const since = Math.max(0, Number.isFinite(fromQuery) ? fromQuery : 0, Number.isFinite(fromHeader) ? fromHeader : 0);
      streamEvents(req, res, entry.reviewDir, since);
    } catch (e) {
      next(e);
    }
  });

  // ---------------------------------------------------------------- comments --

  app.get("/api/reviews/:rid/comments", route(async (req, res) => {
    res.json(await listComments(entryOf(req).reviewDir));
  }));

  app.get("/api/reviews/:rid/comments/:id", route(async (req, res) => {
    res.json(await readComment(entryOf(req).reviewDir, commentId(req)));
  }));

  app.post("/api/reviews/:rid/comments", json, route(async (req, res) => {
    const entry = entryOf(req);
    const body = req.body as Partial<CreateCommentRequest>;
    const comment = NewComment.parse(body?.comment);
    const snapshot = decodeSnapshot(body?.snapshotDataUrl);
    res.json(await createComment(entry.reviewDir, comment, { snapshot }));
  }));

  app.patch("/api/reviews/:rid/comments/:id", json, route(async (req, res) => {
    res.json(await updateCommentHuman(entryOf(req).reviewDir, commentId(req), CommentPatch.parse(req.body)));
  }));

  app.put("/api/reviews/:rid/comments/:id/snapshot", express.raw({ type: "image/jpeg", limit: JSON_LIMIT }), route(async (req, res) => {
    const entry = entryOf(req);
    const id = commentId(req);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, "expected an image/jpeg body");
    res.json(await setSnapshot(entry.reviewDir, id, req.body));
  }));

  app.post("/api/reviews/:rid/comments/:id/status", json, route(async (req, res) => {
    const { status } = StatusBody.parse(req.body);
    res.json(await setHumanStatus(entryOf(req).reviewDir, commentId(req), status));
  }));

  app.delete("/api/reviews/:rid/comments/:id", route(async (req, res) => {
    res.json(await setHumanStatus(entryOf(req).reviewDir, commentId(req), "deleted"));
  }));

  app.post("/api/reviews/:rid/comments/:id/thread", json, route(async (req, res) => {
    const { text } = ThreadBody.parse(req.body);
    res.json(await addThreadMessage(entryOf(req).reviewDir, commentId(req), "human", text));
  }));

  // ------------------------------------------------------------------- media --

  app.get("/media/:rid/video", route(async (req, res) => {
    const entry = entryOf(req);
    await sendRegisteredFile(res, entry.videoPath);
  }));

  app.get("/media/:rid/snapshots/:file", route(async (req, res) => {
    const entry = entryOf(req);
    const m = /^(c-\d{4,})\.jpg$/.exec(String(req.params.file));
    if (!m) throw new HttpError(400, "invalid snapshot name");
    await sendRegisteredFile(res, p.snapshot(entry.reviewDir, m[1]));
  }));

  app.get("/media/:rid/next", route(async (req, res) => {
    const entry = entryOf(req);
    const review = await readReview(entry.reviewDir);
    if (!review.nextVideo) throw new HttpError(404, "no next version yet");
    const { entry: next } = await registry.register(fromReview(entry.reviewDir, review.nextVideo));
    res.redirect(302, `/?r=${encodeURIComponent(next.rid)}`);
  }));

  // --------------------------------------------------------------- static UI --

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "not found")));
  app.use("/media", (_req, _res, next) => next(new HttpError(404, "not found")));
  if (opts.webDir) {
    const webDir = opts.webDir;
    app.use(express.static(webDir, { index: false }));
    app.get("*", (_req, res) => res.sendFile(path.join(webDir, "index.html")));
  } else {
    app.get("*", (_req, res) => {
      res
        .status(200)
        .type("html")
        .send(
          "<!doctype html><meta charset=utf-8><title>Frameback</title>" +
            "<body style=\"font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem\">" +
            "<h1>Frameback</h1><p>The web UI is not built. Run <code>npm run build:web</code> and reload.</p>",
        );
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const { status, body } = toHttpError(err);
    if (status >= 500) process.stderr.write(`frameback: ${err instanceof Error ? err.stack : String(err)}\n`);
    if (res.headersSent) return res.end();
    res.status(status).json(body);
  });

  return app;
}

// ----------------------------------------------------------------- helpers ----

function toHttpError(err: unknown): { status: number; body: { error: string; code?: string } } {
  if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
  if (err instanceof StoreError) {
    const status = err.code === "not_found" ? 404 : err.code === "conflict" ? 409 : 400;
    return { status, body: { error: err.message, code: err.code } };
  }
  if (err instanceof InvalidVideoError) return { status: 400, body: { error: err.message, code: "invalid" } };
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return { status: 400, body: { error: `${issue.path.join(".") || "body"}: ${issue.message}`, code: "invalid" } };
  }
  const bodyParserError = err as { status?: number; type?: string; message?: string };
  if (bodyParserError?.type && bodyParserError.status && bodyParserError.status < 500) {
    return { status: bodyParserError.status, body: { error: bodyParserError.message ?? "bad request" } };
  }
  return { status: 500, body: { error: "internal error" } };
}

function decodeSnapshot(dataUrl: string | null | undefined): Buffer | null {
  if (dataUrl == null || dataUrl === "") return null;
  if (typeof dataUrl !== "string" || !DATA_URL.test(dataUrl)) {
    throw new HttpError(400, "snapshotDataUrl must be a data:image/jpeg;base64 URL");
  }
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

async function sendRegisteredFile(res: Response, file: string): Promise<void> {
  if (!(await exists(file))) throw new HttpError(404, "file not found");
  await new Promise<void>((resolve, reject) => {
    // Range requests, ETag and content types are handled by express/send; dotfiles allowed (project dirs may start with '.')
    res.sendFile(file, { dotfiles: "allow", headers: { "Cache-Control": "no-cache" } }, (err) => {
      if (err && !res.headersSent) reject(err);
      else resolve();
    });
  });
}

async function nextOf(entry: RegistryEntry, nextVideo: string | null | undefined): Promise<ReviewBundle["next"]> {
  if (!nextVideo) return null;
  const abs = fromReview(entry.reviewDir, nextVideo);
  if (!(await exists(abs))) return null;
  return { name: path.basename(abs), url: `/media/${entry.rid}/next` };
}

/** Sibling versions of the video (`<base>_v<N>.<ext>` in the same directory), oldest first. */
async function listVersions(entry: RegistryEntry, registry: Registry): Promise<ReviewBundle["versions"]> {
  const dir = path.dirname(entry.videoPath);
  const currentName = path.basename(entry.videoPath);
  const currentStem = path.basename(currentName, path.extname(currentName));
  const base = splitVersion(currentStem)?.base ?? currentStem;
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const found = names
    .map((name) => ({ name, stem: path.basename(name, path.extname(name)), ext: path.extname(name).toLowerCase() }))
    .filter((f) => (VIDEO_EXTENSIONS as readonly string[]).includes(f.ext))
    .map((f) => ({ ...f, n: f.stem === base ? 0 : splitVersion(f.stem)?.base === base ? splitVersion(f.stem)!.n : -1 }))
    .filter((f) => f.n >= 0 || f.name === currentName)
    .sort((a, b) => a.n - b.n || a.name.localeCompare(b.name));
  return found.map((f) => ({
    name: f.name,
    rid: registry.byVideo(path.join(dir, f.name))?.rid ?? null,
    isCurrent: f.name === currentName,
  }));
}
