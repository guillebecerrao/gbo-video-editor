#!/usr/bin/env node
/**
 * End-to-end smoke test, no browser needed. Requires a built CLI (`npm run build`) and ffmpeg for the demo.
 *
 *   1. start `frameback open` on a throwaway copy of the demo video
 *   2. POST a comment (with a tiny snapshot) through the HTTP API
 *   3. `frameback watch --json --exit-on review.submitted` must see comment.created then review.submitted
 *   4. `frameback update` an agent status and read it back through the API
 *   5. open a copied `_v2` file: the comment must be carried over for verification
 *
 * Exits 0 on PASS, 1 on FAIL.
 */
import { spawn, execFile } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist/cli/index.js");
const demoVideo = path.join(root, "examples/demo/edit/final_demo_v1.mp4");
const ONE_PIXEL_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

const children = [];
let tmp = null;
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${!ok && detail ? ` -- ${detail}` : ""}`);
  if (!ok) throw new Error(`assertion failed: ${name}`);
}

const exists = (f) => access(f).then(() => true, () => false);

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const fb = (...args) => run(process.execPath, [cli, ...args], { maxBuffer: 16 * 1024 * 1024 });

async function waitFor(fn, what, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (err) {
      last = err;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`timed out waiting for ${what}${last ? ` (${last.message})` : ""}`);
}

async function api(base, method, route, body) {
  const res = await fetch(base + route, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!(await exists(cli))) throw new Error("dist/cli/index.js not found: run `npm run build` first");
  if (!(await exists(demoVideo))) {
    console.log("generating demo media...");
    await run(process.execPath, [path.join(root, "examples/make-demo.mjs")]);
  }

  tmp = await mkdtemp(path.join(os.tmpdir(), "frameback-smoke-"));
  const editDir = path.join(tmp, "edit");
  await mkdir(editDir);
  const v1 = path.join(editDir, "final_smoke_v1.mp4");
  const v2 = path.join(editDir, "final_smoke_v2.mp4");
  await copyFile(demoVideo, v1);
  await copyFile(demoVideo, v2);

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [cli, "open", v1, "--no-open", "--port", String(port)], { stdio: ["ignore", "ignore", "inherit"] });
  children.push(server);

  const health = await waitFor(() => fetch(`${base}/api/health`).then((r) => r.json()), "server health");
  check("server answers /api/health", health.app === "frameback");
  const rid = "final_smoke_v1";
  // the server listens before it finishes registering the video (probe + timeline), so wait for the review
  await waitFor(() => fetch(`${base}/api/reviews`).then((r) => r.json()).then((list) => JSON.stringify(list).includes(`"${rid}"`)), "review registered");

  const events = [];
  const watcher = spawn(process.execPath, [cli, "watch", v1, "--json", "--exit-on", "review.submitted"], { stdio: ["ignore", "pipe", "inherit"] });
  children.push(watcher);
  let buffer = "";
  watcher.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const l of lines) if (l.trim()) events.push(JSON.parse(l));
  });
  const watcherDone = new Promise((resolve) => watcher.on("exit", resolve));

  const comment = await api(base, "POST", `/api/reviews/${rid}/comments`, {
    comment: {
      anchor: { time: { start: 2.5, end: 4 }, region: { shape: "rect", x: 0.2, y: 0.2, w: 0.4, h: 0.3 } },
      category: "framing",
      action: "change",
      priority: "must",
      body: "Smoke test: center the speaker.",
    },
    snapshotDataUrl: ONE_PIXEL_JPEG,
  });
  check("comment created with a snapshot", comment.id === "c-0001" && Boolean(comment.snapshot));

  await waitFor(() => events.some((e) => e.type === "comment.created"), "comment.created on watch");
  check("watch --json received comment.created", events.find((e) => e.type === "comment.created").commentId === comment.id);

  await fb("update", v1, comment.id, "--status", "prepared", "--plan", "smoke plan", "--reply", "smoke reply");
  const afterUpdate = await api(base, "GET", `/api/reviews/${rid}/comments`);
  check("agent update is visible through the API", afterUpdate[0].agent.status === "prepared" && afterUpdate[0].agent.plan === "smoke plan");

  await api(base, "POST", `/api/reviews/${rid}/submit`);
  const exitCode = await Promise.race([watcherDone, new Promise((r) => setTimeout(() => r("timeout"), 10_000))]);
  check("watch exits 0 after review.submitted", exitCode === 0, `exit=${exitCode}`);
  const types = events.map((e) => e.type);
  check("events arrive in order (created before submitted)", types.indexOf("comment.created") !== -1 && types.indexOf("comment.created") < types.indexOf("review.submitted"), types.join(","));

  await fb("review", v1, "--state", "processing");
  await fb("review", v1, "--state", "delivered", "--next-video", v2);
  await fb("open", v2, "--no-open", "--port", String(port));
  const carried = await waitFor(async () => {
    const list = await api(base, "GET", "/api/reviews/final_smoke_v2/comments");
    return list.length ? list : null;
  }, "carried comments on v2");
  check("v2 carries the comment for verification", carried[0].carriedFrom?.id === comment.id && carried[0].human.status === "open");
}

function cleanup() {
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
}

let failed = false;
try {
  await main();
} catch (err) {
  failed = true;
  console.error(`\n${err.message}`);
} finally {
  cleanup();
  if (tmp) await rm(tmp, { recursive: true, force: true });
}
console.log(failed ? "\nSMOKE: FAIL" : `\nSMOKE: PASS (${results.length} checks)`);
process.exit(failed ? 1 : 0);
