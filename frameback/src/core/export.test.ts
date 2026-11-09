import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportReview, formatSpan, formatTimecode } from "./export.js";
import * as S from "./store.js";

let tmp: string;
let dir: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fb-exp-"));
  const video = path.join(tmp, "final_v1.mp4");
  await fs.writeFile(video, "x");
  dir = (await S.openReview(video)).dir;
});
afterEach(() => fs.rm(tmp, { recursive: true, force: true }));

const add = (body: string, start: number, extra: object = {}) =>
  S.createComment(dir, { anchor: { time: { start } }, category: "cut", body, ...extra });

describe("formatTimecode", () => {
  it("formats mm:ss.cc", () => {
    expect(formatTimecode(12.48)).toBe("00:12.48");
    expect(formatTimecode(75.5)).toBe("01:15.50");
    expect(formatTimecode(0)).toBe("00:00.00");
    expect(formatTimecode(3725.999)).toBe("62:06.00");
    expect(formatSpan({ start: 1, end: 2.5 })).toBe("00:01.00–00:02.50");
    expect(formatSpan({ start: 1, end: null })).toBe("00:01.00");
  });
});

describe("exportReview", () => {
  it("renders an empty review", async () => {
    const md = await exportReview(dir);
    expect(md).toContain("# Review: final_v1");
    expect(md).toContain("State: reviewing (round 1)");
    expect(md).toContain("_No comments yet._");
  });

  it("groups comments by what the agent has to do, sorted by time", async () => {
    const late = await add("late pending", 30);
    const early = await add("early pending", 2);
    const prepared = await add("prepared one", 10, { category: "framing", action: "change", priority: "must" });
    const applied = await add("applied one", 5);
    const declined = await add("declined one", 6);
    const deleted = await add("deleted one", 7);
    await S.updateCommentAgent(dir, prepared.id, { status: "prepared", plan: "Shift crop", reply: "In staging" });
    await S.updateCommentAgent(dir, applied.id, { status: "applied", appliedIn: "final_v2" });
    await S.updateCommentAgent(dir, declined.id, { status: "declined" });
    await S.setHumanStatus(dir, deleted.id, "deleted");
    await S.updateCommentAgent(dir, early.id, { status: "needs_info" });
    await S.addThreadMessage(dir, early.id, "agent", "Which one?");

    const md = await exportReview(dir);
    const order = ["## Needs action (2)", "## Prepared (1)", "## Applied (1)", "## Declined / deleted (2)"].map((h) => md.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // needs action: time order
    expect(md.indexOf(`### ${early.id}`)).toBeLessThan(md.indexOf(`### ${late.id}`));
    expect(md).toContain(`### ${prepared.id} · 00:10.00 · must · framing/change`);
    expect(md).toContain("- Plan: Shift crop");
    expect(md).toContain("- Reply: In staging");
    expect(md).toContain("- Agent: applied (applied in final_v2)");
    expect(md).toContain("- **agent**: Which one?");
    expect(md).toContain("Comments: 5 total"); // deleted ones are not counted
  });

  it("flags stale comments and moves them back to needs action", async () => {
    const c = await add("first", 1);
    await S.updateCommentAgent(dir, c.id, { status: "prepared" });
    await S.updateCommentHuman(dir, c.id, { body: "second" });
    const md = await exportReview(dir);
    expect(md).toContain("## Needs action (1)");
    expect(md).not.toContain("## Prepared");
    expect(md).toContain("STALE");
  });

  it("includes region, entity, transcript and the absolute snapshot path", async () => {
    const c = await S.createComment(
      dir,
      {
        anchor: {
          time: { start: 12.48, end: 15.2 },
          region: { shape: "rect", x: 0.5, y: 0.1, w: 0.3, h: 0.25 },
          entity: { track: "cuts", id: "range:3", type: "range", label: "HOOK · cam_a 83.20–90.10" },
          transcript: "the words said here",
        },
        category: "framing",
        priority: "must",
        body: "Center the speaker",
      },
      { snapshot: Buffer.from([0xff, 0xd8]) },
    );
    const md = await exportReview(dir);
    expect(md).toContain(`### ${c.id} · 00:12.48–00:15.20 · must · framing`);
    expect(md).toContain("Region: rect x=0.5 y=0.1 w=0.3 h=0.25");
    expect(md).toContain("Entity: HOOK · cam_a 83.20–90.10 (cuts/range:3, range)");
    expect(md).toContain('Transcript: "the words said here"');
    expect(md).toContain(`Snapshot: ${path.join(dir, "snapshots", `${c.id}.jpg`)}`);
  });

  it("exports JSON with group, stale flag and snapshot path", async () => {
    const c = await add("x", 1);
    const parsed = JSON.parse(await exportReview(dir, "json"));
    expect(parsed.review.id).toBe("final_v1");
    expect(parsed.lastSeq).toBe(2);
    expect(parsed.comments[0]).toMatchObject({ id: c.id, group: "needs_action", stale: false, snapshotPath: null });
  });
});
