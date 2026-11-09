import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as S from "./store.js";

let tmp: string;
let video: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fb-"));
  video = path.join(tmp, "final_demo_v1.mp4");
  await fs.writeFile(video, "x");
});

const nc = (body: string, start = 1) => ({ anchor: { time: { start } }, category: "cut" as const, body });

describe("store", () => {
  it("opens a review and emits review.opened once", async () => {
    const a = await S.openReview(video);
    const b = await S.openReview(video);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(a.dir).toBe(path.join(tmp, "review", "final_demo_v1"));
    expect(a.review.video.file).toBe("../../final_demo_v1.mp4");
    const evs = await S.readEvents(a.dir);
    expect(evs.map((e) => e.type)).toEqual(["review.opened"]);
  });

  it("creates comments with sequential ids, snapshot before event", async () => {
    const { dir } = await S.openReview(video);
    const c1 = await S.createComment(dir, nc("one"), { snapshot: Buffer.from([0xff, 0xd8]) });
    const c2 = await S.createComment(dir, nc("two", 0.5));
    expect(c1.id).toBe("c-0001");
    expect(c2.id).toBe("c-0002");
    expect(c1.snapshot).toBe("snapshots/c-0001.jpg");
    expect(await S.exists(path.join(dir, c1.snapshot!))).toBe(true);
    const list = await S.listComments(dir);
    expect(list.map((c) => c.id)).toEqual(["c-0002", "c-0001"]); // sorted by time
    const evs = await S.readEvents(dir, 1);
    expect(evs.map((e) => [e.seq, e.type])).toEqual([[2, "comment.created"], [3, "comment.created"]]);
    expect((evs[0].data as any).body).toBe("one");
  });

  it("concurrent creates never collide", async () => {
    const { dir } = await S.openReview(video);
    await Promise.all(Array.from({ length: 20 }, (_, i) => S.createComment(dir, nc(`c${i}`, i))));
    const list = await S.listComments(dir);
    expect(new Set(list.map((c) => c.id)).size).toBe(20);
    const evs = await S.readEvents(dir);
    expect(evs.map((e) => e.seq)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
  });

  it("human edit bumps revision and marks agent work stale", async () => {
    const { dir } = await S.openReview(video);
    const c = await S.createComment(dir, nc("x"));
    const a = await S.updateCommentAgent(dir, c.id, { status: "prepared", plan: "p" });
    expect(a.agent.seenRevision).toBe(1);
    const h = await S.updateCommentHuman(dir, c.id, { body: "y" });
    expect(h.human.revision).toBe(2);
    expect(S.isStale(h)).toBe(true);
    expect(h.agent.status).toBe("prepared");
  });

  it("submit locks human edits; reopen bumps round; agent can still write", async () => {
    const { dir } = await S.openReview(video);
    const c = await S.createComment(dir, nc("x"));
    await S.submitReview(dir);
    await expect(S.createComment(dir, nc("z"))).rejects.toThrow(/submitted/);
    await S.updateCommentAgent(dir, c.id, { status: "applied", appliedIn: "final_demo_v2" });
    await S.addThreadMessage(dir, c.id, "agent", "done");
    const r = await S.reopenReview(dir);
    expect(r.round).toBe(2);
    expect(r.state).toBe("reviewing");
  });

  it("carries comments without triggering rework", async () => {
    const v1 = await S.openReview(video);
    const c = await S.createComment(v1.dir, nc("fix"), { snapshot: Buffer.from([1]) });
    await S.updateCommentAgent(v1.dir, c.id, { status: "applied", appliedIn: "final_demo_v2" });
    const v2path = path.join(tmp, "final_demo_v2.mp4");
    await fs.writeFile(v2path, "x");
    const v2 = await S.openReview(v2path);
    const carried = await S.carryComments(v1.dir, v2.dir);
    expect(carried).toHaveLength(1);
    expect(carried[0].agent.status).toBe("applied");
    expect(carried[0].carriedFrom).toEqual({ review: "final_demo_v1", id: "c-0001" });
    expect(await S.carryComments(v1.dir, v2.dir)).toHaveLength(0); // idempotent
    expect((await S.readReview(v2.dir)).previous).toBe("final_demo_v1");
    const types = (await S.readEvents(v2.dir)).map((e) => e.type);
    expect(types).toEqual(["review.opened", "comment.carried"]);
  });

  it("steals a stale lock from a dead pid", async () => {
    const { dir } = await S.openReview(video);
    await fs.mkdir(path.join(dir, ".lock"));
    await fs.writeFile(path.join(dir, ".lock", "owner"), JSON.stringify({ pid: 999999 }));
    const c = await S.createComment(dir, nc("after stale"));
    expect(c.id).toBe("c-0001");
  });
});
