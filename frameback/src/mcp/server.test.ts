import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server.js";
import * as S from "../core/store.js";

let tmp: string;
let video: string;
let dir: string;
let client: Client;

/** A valid 1x1 JPEG header-ish payload is enough: the server only base64-encodes the bytes. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

const nc = (body: string, start = 1) => ({ anchor: { time: { start } }, category: "framing" as const, body });

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  return { res, content, json: () => JSON.parse(content[0].text as string) };
}

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fb-mcp-"));
  video = path.join(tmp, "final_v1.mp4");
  await fs.writeFile(video, "x");
  ({ dir } = await S.openReview(video));
  const server = createMcpServer({ root: tmp });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("frameback MCP server", () => {
  it("advertises instructions and every tool", async () => {
    expect(client.getInstructions()).toContain("frameback_wait_for_events");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "frameback_export", "frameback_get_comment", "frameback_get_review", "frameback_list_reviews",
      "frameback_reply", "frameback_set_review_state", "frameback_update_comment", "frameback_wait_for_events",
    ]);
  });

  it("lists reviews under the root and skips node_modules", async () => {
    await S.createComment(dir, nc("a"));
    const hidden = path.join(tmp, "node_modules", "pkg", "x_v1.mp4");
    await fs.mkdir(path.dirname(hidden), { recursive: true });
    await fs.writeFile(hidden, "x");
    await S.openReview(hidden);

    const out = (await call("frameback_list_reviews")).json();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "final_v1", dir, state: "reviewing", round: 1, lastSeq: 2 });
    expect(out[0].counts.total).toBe(1);

    expect((await call("frameback_list_reviews", { maxDepth: 0 })).json()).toEqual([]);
  });

  it("gets a review with compact comments and accepts a video path", async () => {
    await S.createComment(dir, nc("later", 5));
    await S.createComment(dir, { ...nc("earlier", 2), anchor: { time: { start: 2 }, region: { shape: "point", x: 0.5, y: 0.5 } } });
    const out = (await call("frameback_get_review", { review: "final_v1.mp4" })).json();
    expect(out.review.state).toBe("reviewing");
    expect(out.comments.map((c: { body: string }) => c.body)).toEqual(["earlier", "later"]);
    expect(out.comments[0]).toMatchObject({ agentStatus: "pending", stale: false, hasSnapshot: false });
    expect(out.timeline).toBeNull();
    expect(out.lastSeq).toBe(3);
  });

  it("returns the snapshot as image content", async () => {
    const c = await S.createComment(dir, nc("see frame"), { snapshot: JPEG });
    const { content } = await call("frameback_get_comment", { review: dir, id: c.id });
    expect(content[0].type).toBe("text");
    expect(JSON.parse(content[0].text!).body).toBe("see frame");
    expect(content[1]).toMatchObject({ type: "image", mimeType: "image/jpeg" });
    expect(Buffer.from(content[1].data!, "base64").equals(JPEG)).toBe(true);
  });

  it("returns only text when the comment has no snapshot", async () => {
    const c = await S.createComment(dir, nc("no frame"));
    const { content } = await call("frameback_get_comment", { review: dir, id: c.id });
    expect(content).toHaveLength(1);
  });

  it("updates agent fields, replies, and persists through the store", async () => {
    const c = await S.createComment(dir, nc("fix it"));
    const upd = (await call("frameback_update_comment", { review: dir, id: c.id, status: "prepared", plan: "crop 5%" })).json();
    expect(upd).toMatchObject({ agentStatus: "prepared", stale: false });
    await call("frameback_reply", { review: dir, id: c.id, text: "Which side?" });
    const stored = await S.readComment(dir, c.id);
    expect(stored.agent).toMatchObject({ status: "prepared", plan: "crop 5%" });
    expect(stored.thread).toMatchObject([{ author: "agent", text: "Which side?" }]);
  });

  it("never reads a snapshot outside the review folder, and clamps a foreign sinceSeq", async () => {
    const c = await S.createComment(dir, nc("a"));
    const secret = path.join(tmp, "secret.txt");
    await fs.writeFile(secret, "SECRETDATA");
    const file = S.p.comment(dir, c.id);
    await fs.writeFile(file, JSON.stringify({ ...c, snapshot: secret }));
    const got = (await call("frameback_get_comment", { review: dir, id: c.id })).content;
    expect(got.some((x) => x.type === "image")).toBe(false);
    expect(JSON.stringify(got)).not.toContain(Buffer.from("SECRETDATA").toString("base64"));

    const waited = (await call("frameback_wait_for_events", { review: dir, sinceSeq: 9999, timeoutSec: 1 })).json();
    expect(waited).toMatchObject({ timedOut: true, reset: true, lastSeq: await S.lastSeq(dir) });
    const typo = (await call("frameback_wait_for_events", { review: path.join(tmp, "typo.mp4"), timeoutSec: 1 })).json();
    expect(typo).toMatchObject({ reviewExists: false });
  });

  it("sets the review state and the next video", async () => {
    await S.submitReview(dir);
    await fs.writeFile(path.join(path.dirname(video), "final_v2.mp4"), "x");
    const out = (await call("frameback_set_review_state", { review: dir, state: "delivered", nextVideo: "final_v2.mp4" })).json();
    expect(out).toMatchObject({ state: "delivered", nextVideo: "../../final_v2.mp4" });
  });

  it("wait_for_events returns an event written concurrently", async () => {
    const start = await S.lastSeq(dir);
    const waiting = call("frameback_wait_for_events", { review: video, sinceSeq: start, timeoutSec: 10 });
    setTimeout(() => void S.createComment(dir, nc("live")), 300);
    const out = (await waiting).json();
    expect(out.timedOut).toBe(false);
    expect(out.events.map((e: { type: string }) => e.type)).toEqual(["comment.created"]);
    expect(out.lastSeq).toBe(start + 1);
  });

  it("wait_for_events filters by type but still advances lastSeq, and times out cleanly", async () => {
    await S.createComment(dir, nc("x"));
    const waiting = call("frameback_wait_for_events", { review: dir, sinceSeq: 0, timeoutSec: 10, types: ["review.submitted"] });
    setTimeout(() => void S.submitReview(dir), 300);
    const out = (await waiting).json();
    expect(out.events.map((e: { type: string }) => e.type)).toEqual(["review.submitted"]);
    expect(out.lastSeq).toBeGreaterThan(2);

    const idle = (await call("frameback_wait_for_events", { review: dir, sinceSeq: out.lastSeq, timeoutSec: 1 })).json();
    expect(idle).toMatchObject({ events: [], lastSeq: out.lastSeq, timedOut: true, reviewExists: true });
  });

  it("wait_for_events waits for a review that does not exist yet", async () => {
    const later = path.join(tmp, "later_v1.mp4");
    await fs.writeFile(later, "x");
    const waiting = call("frameback_wait_for_events", { review: later, timeoutSec: 10 });
    setTimeout(() => void S.openReview(later), 300);
    const out = (await waiting).json();
    expect(out.events.map((e: { type: string }) => e.type)).toEqual(["review.opened"]);
  });

  it("reports errors as tool errors, not protocol failures", async () => {
    const missing = await call("frameback_get_review", { review: path.join(tmp, "nope_v1.mp4") });
    expect(missing.res.isError).toBe(true);
    expect(missing.content[0].text).toContain("no review found");

    const noComment = await call("frameback_get_comment", { review: dir, id: "c-0099" });
    expect(noComment.res.isError).toBe(true);

    const exported = await call("frameback_export", { review: dir });
    expect(typeof exported.content[0].text).toBe("string");
  });
});
