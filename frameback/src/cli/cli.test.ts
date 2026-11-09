import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../core/store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const entry = path.join(root, "src", "cli", "index.ts");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let tmp: string;
let video: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fb-cli-"));
  video = path.join(tmp, "cut_v1.mp4");
  await fs.writeFile(video, "x");
});
afterEach(() => fs.rm(tmp, { recursive: true, force: true }));

const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", entry, ...args], { cwd: root, encoding: "utf8", timeout: 30_000 });

/** Start a long-running CLI process and collect its output. */
function start(...args: string[]) {
  const child = spawn(process.execPath, ["--import", "tsx", entry, ...args], { cwd: root });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
  return {
    child,
    exited,
    out: () => stdout,
    err: () => stderr,
    lines: () => stdout.split("\n").filter(Boolean),
    async waitFor(predicate: () => boolean, ms = 15_000) {
      const deadline = Date.now() + ms;
      while (!predicate() && Date.now() < deadline) await sleep(50);
      if (!predicate()) throw new Error(`timed out; stdout=${stdout} stderr=${stderr}`);
    },
  };
}

const nc = (body: string, start = 1) => ({ anchor: { time: { start } }, category: "cut" as const, body });

describe("frameback --version / errors", () => {
  it("prints the version", () => {
    const r = run("--version");
    expect(r.stdout.trim()).toBe("0.1.0");
  });

  it("reports a missing review without a stack trace", () => {
    const r = run("list", video);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^frameback: no review found at .*cut_v1/);
    expect(r.stderr).not.toMatch(/\n\s+at /);
  });

  it("rejects an unknown event type", () => {
    const r = run("watch", video, "--exit-on", "nope");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unknown event type 'nope'/);
  });
});

describe("frameback watch", () => {
  it("replays, tails and exits on review.submitted (--json, one event per line)", async () => {
    const { dir } = await S.openReview(video);
    await S.createComment(dir, nc("first"));
    const w = start("watch", video, "--json", "--exit-on", "review.submitted");
    await w.waitFor(() => w.lines().length >= 2);
    expect(w.lines().map((l) => JSON.parse(l).type)).toEqual(["review.opened", "comment.created"]);

    await S.createComment(dir, nc("second", 2));
    await S.submitReview(dir);
    expect(await w.exited).toBe(0);
    const events = w.lines().map((l) => JSON.parse(l));
    expect(events.map((e) => e.type)).toEqual(["review.opened", "comment.created", "comment.created", "review.submitted"]);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(w.err()).toMatch(/watching .*cut_v1/);
  });

  it("waits for a review that does not exist yet", async () => {
    const w = start("watch", video, "--json", "--exit-on", "comment.created");
    await w.waitFor(() => /waiting for review/.test(w.err()));
    const { dir } = await S.openReview(video);
    await S.createComment(dir, nc("hello"));
    expect(await w.exited).toBe(0);
    expect(w.lines().map((l) => JSON.parse(l).type)).toEqual(["review.opened", "comment.created"]);
  });

  it("honours --since and --tail", async () => {
    const { dir } = await S.openReview(video);
    await S.createComment(dir, nc("a"));
    await S.createComment(dir, nc("b", 2));

    const since = start("watch", video, "--json", "--since", "2", "--exit-on", "comment.created");
    expect(await since.exited).toBe(0);
    expect(since.lines().map((l) => JSON.parse(l).seq)).toEqual([3]);

    const tail = start("watch", video, "--json", "--tail", "--exit-on", "thread.message");
    await tail.waitFor(() => /watching/.test(tail.err()));
    await S.addThreadMessage(dir, "c-0001", "agent", "hi");
    expect(await tail.exited).toBe(0);
    expect(tail.lines().map((l) => JSON.parse(l).type)).toEqual(["thread.message"]);
  });

  it("prints readable lines with --text and stops cleanly on SIGINT", async () => {
    const { dir } = await S.openReview(video);
    await S.createComment(
      dir,
      { anchor: { time: { start: 12.48, end: 15.2 }, region: { shape: "rect", x: 0.5, y: 0.1, w: 0.3, h: 0.25 } }, category: "framing", priority: "must", body: "Center the speaker" },
      { snapshot: Buffer.from([0xff, 0xd8]) },
    );
    const w = start("watch", video, "--text");
    await w.waitFor(() => w.lines().length >= 2);
    expect(w.lines()[1]).toBe(
      `#2 comment.created c-0001 [must/framing] 00:12.48–00:15.20 region(rect) "Center the speaker" snapshot=${path.join(dir, "snapshots", "c-0001.jpg")}`,
    );
    w.child.kill("SIGINT");
    expect(await w.exited).toBe(0);
  });
});

describe("agent commands", () => {
  it("update, reply, review, list --json, show and export work end to end", async () => {
    const { dir } = await S.openReview(video);
    await S.createComment(dir, nc("fix it"));

    expect(run("update", video, "c-0001", "--status", "in_progress", "--plan", "p").stdout).toContain("agent=in_progress");
    expect(run("update", video, "c-0001", "--status", "bogus").status).toBe(1);
    expect(run("update", video, "c-0001").stderr).toMatch(/nothing to update/);
    expect(run("reply", video, "c-0001", "which", "one?").status).toBe(0);
    expect(run("review", video, "--state", "processing").status).toBe(1); // not submitted yet
    await S.submitReview(dir);
    expect(run("review", video, "--state", "processing").stdout).toContain("state=processing");
    expect(run("review", video, "--state", "reviewing").status).toBe(1);

    const list = JSON.parse(run("list", dir, "--json").stdout);
    expect(list.lastSeq).toBe(6);
    expect(list.comments[0]).toMatchObject({ agent: { status: "in_progress", plan: "p" }, thread: [{ author: "agent", text: "which one?" }] });
    expect(run("list", video, "--agent-status", "prepared").stdout).not.toContain("c-0001");
    expect(JSON.parse(run("show", video, "c-0001", "--json").stdout).id).toBe("c-0001");
    expect(run("export", video).stdout).toContain("## Needs action (1)");
    expect(JSON.parse(run("export", video, "--format", "json").stdout).comments).toHaveLength(1);
  });

  it("carry copies comments into the next version", async () => {
    const { dir } = await S.openReview(video);
    await S.createComment(dir, nc("carry me"));
    const v2 = path.join(tmp, "cut_v2.mp4");
    await fs.writeFile(v2, "y");
    const r = run("carry", video, v2);
    expect(r.stdout).toContain("carried 1 comment(s)");
    const carried = await S.listComments(S.reviewDirForVideo(v2));
    expect(carried[0].carriedFrom).toEqual({ review: "cut_v1", id: "c-0001" });
  });

  it("timeline prints the resolved tracks", async () => {
    const edl = path.join(root, "src", "core", "__fixtures__", "edl", "edl.json");
    const r = run("timeline", edl);
    expect(r.stdout).toMatch(/timeline from edl \(approximate\) · 7\.00s/);
    expect(r.stdout).toMatch(/cuts\s+3 segments/);
    expect(JSON.parse(run("timeline", edl, "--json").stdout).timeline.tracks.length).toBeGreaterThan(3);
    expect(run("timeline", video).status).toBe(1);
  });

  it("skill install reports a missing skill folder clearly or copies it", async () => {
    const r = run("skill", "install", "--dest", path.join(tmp, "skills"));
    const hasSkill = await fs.stat(path.join(root, "skills", "frameback-review")).then(() => true, () => false);
    if (hasSkill) expect(r.stdout).toContain(path.join(tmp, "skills", "frameback-review"));
    else expect(r.stderr).toMatch(/skill files not found/);
  });
});
