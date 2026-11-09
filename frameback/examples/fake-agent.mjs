#!/usr/bin/env node
/**
 * Scripted stand-in for an editing agent. Drives the Frameback CLI exactly like a real agent would,
 * which makes it useful for demos, UI development and end-to-end tests.
 *
 *   node examples/fake-agent.mjs <video> [--cli <path to cli entry>] [--delay <ms per step, default 1000>]
 *
 * Behaviour (see docs/PROTOCOL.md section 5):
 *   comment.created   -> acknowledged (1 s) -> in_progress (+2 s) -> prepared (+2 s, canned plan)
 *                        a body containing "?" -> needs_info + a thread question instead
 *   review.submitted  -> processing, mark prepared comments applied, copy the video to the next
 *                        versioned file, then delivered with --next-video
 */
import { spawn, execFile } from "node:child_process";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { video: null, cli: process.env.FRAMEBACK_CLI ?? path.resolve(here, "../dist/cli/index.js"), unit: 1000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--cli") args.cli = path.resolve(argv[++i]);
    else if (argv[i] === "--delay") args.unit = Number(argv[++i]);
    else if (!args.video) args.video = path.resolve(argv[i]);
  }
  if (!args.video || !Number.isFinite(args.unit)) {
    console.error("usage: fake-agent.mjs <video> [--cli <entry>] [--delay <ms>]");
    process.exit(2);
  }
  return args;
}

const { video, cli, unit } = parseArgs(process.argv.slice(2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.error(`[fake-agent] ${msg}`);
const fb = (...args) => run(process.execPath, [cli, ...args], { maxBuffer: 16 * 1024 * 1024 });
const update = (id, status, extra = []) => fb("update", video, id, "--status", status, ...extra);

/** `final_x_v3.mp4` -> `final_x_v4.mp4`; an unversioned stem becomes `_v2`. */
function nextVideoPath(file) {
  const ext = path.extname(file);
  const stem = path.basename(file, ext);
  const m = /^(.*)_v(\d+)$/.exec(stem);
  const next = m ? `${m[1]}_v${Number(m[2]) + 1}` : `${stem}_v2`;
  return path.join(path.dirname(file), next + ext);
}

async function handleComment(event) {
  const id = event.commentId;
  const body = String(event.data?.body ?? "");
  try {
    await sleep(unit);
    await update(id, "acknowledged");
    if (body.includes("?")) {
      await fb("reply", video, id, "Quick question before I touch this: do you want a hard cut or a soft transition here?");
      await update(id, "needs_info", ["--reply", "Waiting for your answer in the thread."]);
      log(`${id}: needs_info`);
      return;
    }
    await sleep(2 * unit);
    await update(id, "in_progress");
    await sleep(2 * unit);
    await update(id, "prepared", [
      "--plan",
      `Staging EDL adjusted for "${body.slice(0, 60)}". Will be rendered in the next version.`,
      "--reply",
      "Prepared in staging.",
    ]);
    log(`${id}: prepared`);
  } catch (err) {
    log(`${id}: failed (${err.message})`);
  }
}

async function deliver() {
  await fb("review", video, "--state", "processing");
  const next = nextVideoPath(video);
  const { stdout } = await fb("list", video, "--json");
  const { comments } = JSON.parse(stdout);
  const nextStem = path.basename(next, path.extname(next));
  for (const c of comments) {
    if (c.agent.status === "prepared") await update(c.id, "applied", ["--applied-in", nextStem]);
  }
  await copyFile(video, next);
  await fb("review", video, "--state", "delivered", "--next-video", next);
  log(`delivered ${path.basename(next)}`);
}

const pending = new Set();
const watcher = spawn(process.execPath, [cli, "watch", video, "--json", "--exit-on", "review.submitted"], {
  stdio: ["ignore", "pipe", "inherit"],
});
const lines = createInterface({ input: watcher.stdout });
log(`watching ${path.basename(video)}`);

for await (const line of lines) {
  if (!line.trim()) continue;
  const event = JSON.parse(line);
  if (event.type === "comment.created") {
    const work = handleComment(event);
    pending.add(work);
    work.finally(() => pending.delete(work));
  } else if (event.type === "review.submitted") {
    await Promise.all(pending);
    await deliver();
  }
}
