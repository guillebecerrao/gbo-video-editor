import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer, type RunningServer } from "./index.js";

let tmp: string;
let server: RunningServer;
let video: string;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const dataUrl = `data:image/jpeg;base64,${JPEG.toString("base64")}`;

const api = (p: string, init: RequestInit & { json?: unknown } = {}) =>
  fetch(`${server.url}${p}`, {
    ...init,
    headers: { ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}), ...init.headers },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
const getJson = async <T>(p: string): Promise<T> => (await api(p)).json() as Promise<T>;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fb-hard-"));
  video = path.join(tmp, "clip.mp4");
  await fs.writeFile(video, Buffer.alloc(5000, 3));
  server = await startServer({ port: 0, serveWeb: false });
  await api("/api/reviews", { method: "POST", json: { video } });
});
afterAll(async () => {
  await server.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("hardening", () => {
  it("sends anti-framing headers", async () => {
    const res = await api("/api/health");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("answers an unsatisfiable Range with 416, not 500", async () => {
    const res = await api("/media/clip/video", { headers: { Range: "bytes=999999-" } });
    expect(res.status).toBe(416);
    expect((await api("/media/clip/video", { headers: { Range: "bytes=0-9" } })).status).toBe(206);
  });

  it("validates snapshots, regions, times and blank bodies", async () => {
    const post = (comment: unknown, snapshotDataUrl?: string) =>
      api("/api/reviews/clip/comments", { method: "POST", json: { comment, snapshotDataUrl } });
    const ok = { anchor: { time: { start: 1 } }, category: "cut", body: "ok" };
    expect((await post(ok, "data:image/jpeg;base64,aGVsbG8gd29ybGQ=")).status).toBe(400); // not a JPEG
    expect((await post(ok, "data:image/jpeg;base64,@@@")).status).toBe(400); // not base64
    expect((await post({ ...ok, body: "   " })).status).toBe(400);
    expect((await post({ ...ok, anchor: { region: { shape: "rect", x: 0.9, y: 0, w: 0.9, h: 0.1 }, time: { start: 1 } } })).status).toBe(400);
    expect((await post(ok, dataUrl)).status).toBe(200);
    await api("/api/reviews/clip/video-info", { method: "POST", json: { duration: 10 } });
    expect((await post({ ...ok, anchor: { time: { start: 99999 } } })).status).toBe(400);
  });

  it("re-freezes the timeline for an explicit --edl, and rejects a missing or broken one", async () => {
    const edl = path.join(tmp, "edl.json");
    await fs.writeFile(edl, JSON.stringify({ ranges: [{ source: "a", start: 0, end: 5 }] }));
    const reg = (body: object) => api("/api/reviews", { method: "POST", json: { video, ...body } });
    expect(await getJson("/api/reviews/clip/timeline")).toBeNull();
    expect((await reg({ edl })).status).toBe(200);
    expect(await getJson("/api/reviews/clip/timeline")).toMatchObject({ origin: "edl" });
    const missing = await reg({ edl: path.join(tmp, "nope.json") });
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { error: string }).error).toMatch(/not found/);
    await fs.writeFile(path.join(tmp, "bad.json"), JSON.stringify({ ranges: [{ source: "a", start: "x", end: 1 }] }));
    expect((await reg({ edl: path.join(tmp, "bad.json") })).status).toBe(400);
  });

  it("reports carried comments and warnings when registering", async () => {
    const second = path.join(tmp, "clip_v2.mp4");
    await fs.writeFile(second, "x");
    const body = (await (await api("/api/reviews", { method: "POST", json: { video: second } })).json()) as { carried: number; warnings: string[] };
    expect(body.carried).toBeGreaterThan(0);
    expect(Array.isArray(body.warnings)).toBe(true);
  });
});
