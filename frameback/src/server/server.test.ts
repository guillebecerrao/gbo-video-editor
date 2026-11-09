import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as S from "../core/store.js";
import type { Comment, ReviewBundle, ReviewSummary } from "../core/api.js";
import { startServer, type RunningServer } from "./index.js";

let tmp: string;
let server: RunningServer;
let v1: string;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const dataUrl = `data:image/jpeg;base64,${JPEG.toString("base64")}`;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fb-srv-"));
  v1 = path.join(tmp, "talk_v1.mp4");
  await fs.writeFile(v1, Buffer.alloc(1000, 7));
  server = await startServer({ port: 0, serveWeb: false });
});
afterAll(async () => {
  await server.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

const api = (p: string, init: RequestInit & { json?: unknown } = {}) =>
  fetch(`${server.url}${p}`, {
    ...init,
    headers: { ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}), ...init.headers },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
const getJson = async <T>(p: string): Promise<T> => (await api(p)).json() as Promise<T>;

const newComment = (body: string, start = 1) => ({ comment: { anchor: { time: { start } }, category: "cut", body }, snapshotDataUrl: dataUrl });

describe("registration", () => {
  it("answers health and rejects unknown paths", async () => {
    expect(await getJson("/api/health")).toMatchObject({ app: "frameback", version: "0.1.0" });
    expect((await api("/api/nope")).status).toBe(404);
    expect((await api("/api/reviews/ghost")).status).toBe(404);
  });

  it("registers a video once and returns the same rid", async () => {
    const res = await api("/api/reviews", { method: "POST", json: { video: v1 } });
    expect(res.status).toBe(200);
    const summary = (await res.json()) as ReviewSummary;
    expect(summary).toMatchObject({ rid: "talk_v1", videoName: "talk_v1.mp4", state: "reviewing", reviewDir: path.join(tmp, "review", "talk_v1") });
    const again = (await (await api("/api/reviews", { method: "POST", json: { video: v1 } })).json()) as ReviewSummary;
    expect(again.rid).toBe("talk_v1");
    expect(await getJson<ReviewSummary[]>("/api/reviews")).toHaveLength(1);
  });

  it("refuses missing files and non-video paths", async () => {
    expect((await api("/api/reviews", { method: "POST", json: { video: path.join(tmp, "missing.mp4") } })).status).toBe(400);
    const secret = path.join(tmp, "secret.txt");
    await fs.writeFile(secret, "top secret");
    const res = await api("/api/reviews", { method: "POST", json: { video: secret } });
    expect(res.status).toBe(400);
    expect((await api("/api/reviews", { method: "POST", json: {} })).status).toBe(400);
  });

  it("disambiguates rids when two videos share a stem", async () => {
    await fs.mkdir(path.join(tmp, "other"));
    const twin = path.join(tmp, "other", "talk_v1.mp4");
    await fs.writeFile(twin, "x");
    const summary = (await (await api("/api/reviews", { method: "POST", json: { video: twin } })).json()) as ReviewSummary;
    expect(summary.rid).toBe("talk_v1-2");
  });

  it("returns the bundle", async () => {
    const bundle = await getJson<ReviewBundle>("/api/reviews/talk_v1");
    expect(bundle).toMatchObject({ rid: "talk_v1", videoUrl: "/media/talk_v1/video", videoName: "talk_v1.mp4", timeline: null, comments: [], next: null, lastSeq: 1 });
    expect(bundle.versions).toEqual([{ name: "talk_v1.mp4", rid: "talk_v1", isCurrent: true }]);
    expect(await getJson("/api/reviews/talk_v1/timeline")).toBeNull();
  });
});

describe("comments lifecycle", () => {
  let id: string;

  it("creates a comment with a snapshot", async () => {
    const res = await api("/api/reviews/talk_v1/comments", { method: "POST", json: newComment("fix this", 3) });
    expect(res.status).toBe(200);
    const c = (await res.json()) as Comment;
    id = c.id;
    expect(c).toMatchObject({ id: "c-0001", body: "fix this", priority: "should", snapshot: "snapshots/c-0001.jpg", agent: { status: "pending" } });
    const img = await api(`/media/talk_v1/snapshots/${id}.jpg`);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await img.arrayBuffer())).toEqual(JPEG);
  });

  it("validates input", async () => {
    expect((await api("/api/reviews/talk_v1/comments", { method: "POST", json: { comment: { category: "cut", body: "x" } } })).status).toBe(400);
    expect((await api("/api/reviews/talk_v1/comments", { method: "POST", json: { ...newComment("x"), snapshotDataUrl: "data:text/html;base64,AAAA" } })).status).toBe(400);
    expect((await api("/api/reviews/talk_v1/comments/nope")).status).toBe(400);
    expect((await api("/api/reviews/talk_v1/comments/c-0099")).status).toBe(404);
    expect((await api("/media/talk_v1/snapshots/..%2Freview.json")).status).toBe(400);
  });

  it("patches, replaces the snapshot, changes status, threads and deletes", async () => {
    const patched = (await (await api(`/api/reviews/talk_v1/comments/${id}`, { method: "PATCH", json: { body: "fix that", priority: "must" } })).json()) as Comment;
    expect(patched).toMatchObject({ body: "fix that", priority: "must", human: { revision: 2 } });

    const png = await api(`/api/reviews/talk_v1/comments/${id}/snapshot`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: Buffer.from([0xff, 0xd8, 9]) });
    expect(png.status).toBe(200);
    expect(Buffer.from(await (await api(`/media/talk_v1/snapshots/${id}.jpg`)).arrayBuffer())).toEqual(Buffer.from([0xff, 0xd8, 9]));

    const threaded = (await (await api(`/api/reviews/talk_v1/comments/${id}/thread`, { method: "POST", json: { text: "a cut please" } })).json()) as Comment;
    expect(threaded.thread).toMatchObject([{ author: "human", text: "a cut please" }]);
    expect((await api(`/api/reviews/talk_v1/comments/${id}/thread`, { method: "POST", json: { text: "" } })).status).toBe(400);

    const verified = (await (await api(`/api/reviews/talk_v1/comments/${id}/status`, { method: "POST", json: { status: "verified" } })).json()) as Comment;
    expect(verified.human.status).toBe("verified");
    expect((await api(`/api/reviews/talk_v1/comments/${id}/status`, { method: "POST", json: { status: "bogus" } })).status).toBe(400);

    const second = (await (await api("/api/reviews/talk_v1/comments", { method: "POST", json: newComment("second", 5) })).json()) as Comment;
    const deleted = (await (await api(`/api/reviews/talk_v1/comments/${second.id}`, { method: "DELETE" })).json()) as Comment;
    expect(deleted.human.status).toBe("deleted");
    const live = await getJson<Comment[]>("/api/reviews/talk_v1/comments");
    expect(live.map((c) => c.id)).toEqual([id]);
  });

  it("locks the review on submit and unlocks on reopen", async () => {
    const submitted = await api("/api/reviews/talk_v1/submit", { method: "POST" });
    expect((await submitted.json()).state).toBe("submitted");
    expect((await api("/api/reviews/talk_v1/submit", { method: "POST" })).status).toBe(409);
    const locked = await api("/api/reviews/talk_v1/comments", { method: "POST", json: newComment("late") });
    expect(locked.status).toBe(409);
    expect(await locked.json()).toMatchObject({ code: "conflict" });
    const reopened = await (await api("/api/reviews/talk_v1/reopen", { method: "POST" })).json();
    expect(reopened).toMatchObject({ state: "reviewing", round: 2 });
  });

  it("accepts video info from the UI without overwriting known values", async () => {
    const review = await (await api("/api/reviews/talk_v1/video-info", { method: "POST", json: { duration: 12.5, fps: 30 } })).json();
    expect(review.video).toMatchObject({ duration: 12.5, fps: 30 });
    const again = await (await api("/api/reviews/talk_v1/video-info", { method: "POST", json: { duration: 99 } })).json();
    expect(again.video.duration).toBe(12.5);
  });
});

describe("media", () => {
  it("streams the video with Range support", async () => {
    const full = await api("/media/talk_v1/video");
    expect(full.status).toBe(200);
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect((await full.arrayBuffer()).byteLength).toBe(1000);
    const part = await api("/media/talk_v1/video", { headers: { Range: "bytes=10-19" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 10-19/1000");
    expect((await part.arrayBuffer()).byteLength).toBe(10);
  });

  it("returns 404 for a waveform it cannot compute", async () => {
    expect((await api("/api/reviews/talk_v1/waveform?buckets=20")).status).toBe(404);
  });

  it("serves a placeholder page when the UI is not built", async () => {
    const res = await api("/?r=talk_v1");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("npm run build:web");
  });
});

describe("events (SSE)", () => {
  it("replays, then delivers events written by another writer", async () => {
    const dir = path.join(tmp, "review", "talk_v1");
    const res = await api("/api/reviews/talk_v1/events?since=0");
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const seen: { seq: number; type: string }[] = [];
    let buffer = "";
    const until = async (predicate: () => boolean) => {
      const deadline = Date.now() + 5000;
      while (!predicate() && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        for (const block of buffer.split("\n\n").slice(0, -1)) {
          const data = block.split("\n").find((l) => l.startsWith("data: "));
          if (data) seen.push(JSON.parse(data.slice(6)));
        }
        buffer = buffer.slice(buffer.lastIndexOf("\n\n") + 2);
      }
    };
    await until(() => seen.some((e) => e.type === "review.state"));
    expect(seen[0]).toMatchObject({ seq: 1, type: "review.opened" });

    // a different "process" (direct store call) writes while the stream is open
    const last = seen[seen.length - 1].seq;
    await S.updateCommentAgent(dir, "c-0001", { status: "prepared", plan: "do it" });
    await until(() => seen.some((e) => e.seq > last && e.type === "comment.agent_status"));
    expect(seen.at(-1)).toMatchObject({ type: "comment.agent_status", commentId: "c-0001", data: { status: "prepared" } });
    await reader.cancel();

    // reconnect with `since` skips what was already seen
    const again = await api(`/api/reviews/talk_v1/events?since=${seen.at(-1)!.seq}`, { headers: { Accept: "text/event-stream" } });
    const r2 = again.body!.getReader();
    const first = await Promise.race([r2.read().then((x) => decoder.decode(x.value)), new Promise<string>((r) => setTimeout(() => r("quiet"), 600))]);
    expect(first).toBe("retry: 2000\n\n");
    const second = await Promise.race([r2.read().then((x) => decoder.decode(x.value)), new Promise<string>((r) => setTimeout(() => r("quiet"), 600))]);
    expect(second).toBe("quiet");
    await r2.cancel();
  });
});

describe("versions and carry-over", () => {
  it("carries comments into _v2 on registration and lists versions", async () => {
    await S.setReviewState(path.join(tmp, "review", "talk_v1"), "delivered", { nextVideo: path.join(tmp, "talk_v2.mp4") });
    const v2 = path.join(tmp, "talk_v2.mp4");
    await fs.writeFile(v2, Buffer.alloc(10, 1));

    const before = await getJson<ReviewBundle>("/api/reviews/talk_v1");
    expect(before.next).toEqual({ name: "talk_v2.mp4", url: "/media/talk_v1/next" });

    const redirect = await api("/media/talk_v1/next", { redirect: "manual" });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/?r=talk_v2");

    const bundle = await getJson<ReviewBundle>("/api/reviews/talk_v2");
    expect(bundle.review.previous).toBe("talk_v1");
    expect(bundle.comments).toHaveLength(1);
    expect(bundle.comments[0]).toMatchObject({ carriedFrom: { review: "talk_v1", id: "c-0001" }, agent: { status: "prepared" }, human: { status: "open" } });
    expect(bundle.versions).toEqual([
      { name: "talk_v1.mp4", rid: "talk_v1", isCurrent: false },
      { name: "talk_v2.mp4", rid: "talk_v2", isCurrent: true },
    ]);
  });

  it("does not carry when asked not to", async () => {
    const v3 = path.join(tmp, "talk_v3.mp4");
    await fs.writeFile(v3, "x");
    await api("/api/reviews", { method: "POST", json: { video: v3, carry: false } });
    expect((await getJson<Comment[]>("/api/reviews/talk_v3/comments"))).toEqual([]);
  });
});

describe("local-only guard", () => {
  const raw = (headers: http.OutgoingHttpHeaders, method = "GET", p = "/api/reviews") =>
    new Promise<number>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: server.port, path: p, method, headers }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });

  it("rejects foreign Host headers (DNS rebinding)", async () => {
    expect(await raw({ Host: "evil.example" })).toBe(403);
    expect(await raw({ Host: `localhost:${server.port}` })).toBe(200);
  });

  it("rejects cross-site Origins, even for state-changing requests", async () => {
    expect(await raw({ Origin: "http://evil.example" }, "POST", "/api/reviews/talk_v1/submit")).toBe(403);
    expect(await raw({ Origin: `http://127.0.0.1:${server.port}` })).toBe(200);
    expect((await getJson<Comment[]>("/api/reviews/talk_v1/comments")).length).toBe(1);
  });
});
