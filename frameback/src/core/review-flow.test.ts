/** Cross-version review flow: carry / reopen / verify, the state machine and the lock. */
import { beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as S from "./store.js";
import { exportReview } from "./export.js";
import { prepareReview } from "../server/prepare.js";
import { watchReview } from "../cli/watch.js";

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fb-flow-"));
});
const mk = async (name: string) => {
  const f = path.join(tmp, name);
  await fs.writeFile(f, "x");
  return f;
};
const nc = (body: string, start = 1) => ({ anchor: { time: { start } }, category: "cut" as const, body });

describe("carry, reopen and verify", () => {
  it("a comment the reviewer reopens on v2 is needs-action again (export, counts, agent status)", async () => {
    const v1 = await mk("r_v1.mp4");
    const { dir: d1 } = await S.openReview(v1);
    await S.createComment(d1, nc("fix"));
    await S.submitReview(d1);
    await S.updateCommentAgent(d1, "c-0001", { status: "applied", appliedIn: "r_v2" });
    const v2 = await mk("r_v2.mp4");
    await S.setReviewState(d1, "delivered", { nextVideo: v2 });

    const p2 = await prepareReview(v2);
    expect(p2.carried).toBe(1);
    await S.setHumanStatus(p2.dir, "c-0001", "reopened");
    await S.submitReview(p2.dir);

    expect((await S.readComment(p2.dir, "c-0001")).agent.status).toBe("pending");
    const counts = await S.countComments(p2.dir);
    expect(counts).toMatchObject({ pending: 1, applied: 0, reopened: 1 });
    const md = await exportReview(p2.dir);
    expect(md).toContain("## Needs action (1)");
    expect(md).not.toContain("## Applied");
  });

  it("verified and resolved comments are not carried again; the rest are", async () => {
    const v1 = await mk("a_v1.mp4");
    const { dir: d1 } = await S.openReview(v1);
    for (const b of ["one", "two", "three"]) await S.createComment(d1, nc(b));
    await S.setHumanStatus(d1, "c-0001", "verified");
    await S.setHumanStatus(d1, "c-0002", "resolved_by_human");
    const p2 = await prepareReview(await mk("a_v2.mp4"));
    expect(p2.carried).toBe(1);
    expect((await S.listComments(p2.dir))[0].body).toBe("three");
  });

  it("carries by nextVideo link, from an unversioned base, and across skipped numbers", async () => {
    const promo = await mk("promo.mp4");
    const { dir } = await S.openReview(promo);
    await S.createComment(dir, nc("x"));
    await S.submitReview(dir);
    const fin = await mk("promo-final.mp4");
    await S.setReviewState(dir, "delivered", { nextVideo: fin });
    expect((await prepareReview(fin)).carried).toBe(1); // explicit link
    expect((await prepareReview(await mk("promo_v2.mp4"))).carried).toBe(1); // base -> _v2

    const s1 = await mk("skip_v1.mp4");
    const { dir: ds } = await S.openReview(s1);
    await S.createComment(ds, nc("y"));
    expect((await prepareReview(await mk("skip_v3.mp4"))).carried).toBe(1); // v1 -> v3
  });

  it("refuses to carry a review into itself", async () => {
    const { dir } = await S.openReview(await mk("self_v1.mp4"));
    await expect(S.carryComments(dir, dir)).rejects.toThrow(/itself/);
  });
});

describe("review state machine", () => {
  it("enforces PROTOCOL §7 unless forced", async () => {
    const v1 = await mk("s_v1.mp4");
    const { dir } = await S.openReview(v1);
    await expect(S.setReviewState(dir, "processing")).rejects.toThrow(/cannot set 'processing'/);
    await expect(S.setReviewState(dir, "delivered")).rejects.toThrow(/cannot set 'delivered'/);
    await S.submitReview(dir);
    await S.setReviewState(dir, "processing");
    await expect(S.setReviewState(dir, "delivered")).rejects.toThrow(/next version/);
    await expect(S.setReviewState(dir, "delivered", { nextVideo: path.join(tmp, "nope.mp4") })).rejects.toThrow(/not found/);
    await S.setReviewState(dir, "delivered", { nextVideo: await mk("s_v2.mp4") });
    await expect(S.reopenReview(dir)).rejects.toThrow(/only a submitted or processing/);
    await S.setReviewState(dir, "closed");
    await expect(S.setReviewState(dir, "processing")).rejects.toThrow(/cannot set/);
    await S.setReviewState(dir, "processing", { force: true });
  });
});

describe("lock", () => {
  it("steals an owner-less lock after a short while instead of timing out", async () => {
    const { dir } = await S.openReview(await mk("l_v1.mp4"));
    await fs.mkdir(path.join(dir, ".lock"));
    const t0 = Date.now();
    await S.createComment(dir, nc("after crash"));
    expect(Date.now() - t0).toBeLessThan(6000);
  });
});

describe("watch --exit-on", () => {
  it("ignores a replayed review.submitted from an earlier round", async () => {
    const { dir } = await S.openReview(await mk("w_v1.mp4"));
    await S.submitReview(dir);
    await S.reopenReview(dir);
    const lines: string[] = [];
    const controller = new AbortController();
    const watching = watchReview({
      target: dir, format: "json", exitOn: "review.submitted", signal: controller.signal,
      write: async (l) => void lines.push(l), log: () => {},
    });
    await new Promise((r) => setTimeout(r, 700));
    expect(lines.length).toBeGreaterThan(0); // history is still printed
    let done = false;
    void watching.then(() => (done = true));
    expect(done).toBe(false);
    await S.submitReview(dir);
    const ev = await watching;
    expect(ev?.type).toBe("review.submitted");
    expect(ev!.seq).toBeGreaterThan(3);
  });

  it("exits at once when the review is waiting in 'submitted', and --actor filters echoes", async () => {
    const { dir } = await S.openReview(await mk("x_v1.mp4"));
    await S.createComment(dir, nc("c"));
    await S.updateCommentAgent(dir, "c-0001", { status: "acknowledged" });
    await S.submitReview(dir);
    const lines: string[] = [];
    const ev = await watchReview({
      target: dir, format: "json", exitOn: "review.submitted", actors: ["human", "system"],
      write: async (l) => void lines.push(l), log: () => {},
    });
    expect(ev?.type).toBe("review.submitted");
    expect(lines.map((l) => JSON.parse(l).actor)).not.toContain("agent");
  });
});
