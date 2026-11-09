#!/usr/bin/env node
/**
 * Generates a synthetic demo project (no real footage) in the same shape an agentic editing pipeline
 * (video-use style) produces:
 *
 *   examples/demo/
 *     raw/cam_a.mp4, raw/cam_b.mp4, raw/broll_city.mp4   synthetic sources (test patterns + tones)
 *     edit/edl.json                                       ranges + broll (output-time placement)
 *     edit/transcripts/cam_a.json, cam_b.json             word-level transcripts with speaker ids
 *     edit/final_demo_v1.mp4                              the "delivered" cut (concat of ranges + broll overlay)
 *
 * Usage: node examples/make-demo.mjs [--out examples/demo] [--force]
 * Requires ffmpeg + ffprobe on PATH (or FFMPEG / FFPROBE env vars).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outArg = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(here, "demo");
const OUT = path.resolve(outArg);
const FORCE = args.includes("--force");
const FFMPEG = process.env.FFMPEG || "ffmpeg";

const final = path.join(OUT, "edit", "final_demo_v1.mp4");
if (existsSync(final) && !FORCE) {
  console.log(`demo already exists: ${final} (use --force to regenerate)`);
  process.exit(0);
}
if (FORCE) rmSync(OUT, { recursive: true, force: true });
for (const d of ["raw", "edit/transcripts", "edit/.work"]) mkdirSync(path.join(OUT, d), { recursive: true });

for (const bin of [FFMPEG, process.env.FFPROBE || "ffprobe"]) {
  if (spawnSync(bin, ["-version"], { stdio: "ignore" }).error) {
    console.error(`ffmpeg and ffprobe are required for the demo (not found: ${bin}).\nInstall: brew install ffmpeg  |  apt install ffmpeg`);
    process.exit(1);
  }
}

const ff = (...a) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...a], { stdio: "inherit" });
const W = 1280, H = 720, FPS = 24;

// ------------------------------------------------------------ sources ----
// cam_a: testsrc2 pattern + 440 Hz; cam_b: smptehd bars + 330 Hz; broll: mandelbrot, silent.
const SRC = {
  cam_a: `testsrc2=size=${W}x${H}:rate=${FPS}`,
  cam_b: `smptehdbars=size=${W}x${H}:rate=${FPS}`,
};
const TONE = { cam_a: 440, cam_b: 330 };
for (const [name, vsrc] of Object.entries(SRC)) {
  ff("-f", "lavfi", "-i", `${vsrc}:duration=40`,
     "-f", "lavfi", "-i", `sine=frequency=${TONE[name]}:sample_rate=48000:duration=40`,
     "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
     path.join(OUT, "raw", `${name}.mp4`));
}
ff("-f", "lavfi", "-i", `mandelbrot=size=${W}x${H}:rate=${FPS}`, "-t", "20",
   "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", path.join(OUT, "raw", "broll_city.mp4"));

// -------------------------------------------------------- transcripts ----
const LINES = {
  cam_a: [
    "Today I want to show you how to review an edit made by an agent",
    "The problem is that the agent cannot see what you see",
    "So every piece of feedback becomes a long paragraph with timestamps",
    "And while you review the agent just waits doing nothing",
    "Let me show you a better way to work together",
  ],
  cam_b: [
    "That sounds useful but how does the agent know what I mean",
    "You click on the frame and draw a box around the problem",
    "The comment is saved with a snapshot and the exact time",
    "The agent starts preparing the fix while you keep watching",
  ],
};
const speaker = { cam_a: "speaker_0", cam_b: "speaker_1" };
const sentenceSpans = {}; // name -> [{start,end}]
for (const [name, lines] of Object.entries(LINES)) {
  const words = [];
  const spans = [];
  let t = 0.6;
  for (const line of lines) {
    const s0 = t;
    const toks = line.split(" ");
    toks.forEach((tok, i) => {
      const d = 0.18 + 0.03 * tok.length;
      const text = i === toks.length - 1 ? `${tok}.` : tok;
      words.push({ text, start: +t.toFixed(3), end: +(t + d).toFixed(3), type: "word", speaker_id: speaker[name] });
      words.push({ text: " ", start: +(t + d).toFixed(3), end: +(t + d + 0.08).toFixed(3), type: "spacing", speaker_id: speaker[name] });
      t += d + 0.08;
    });
    spans.push({ start: +s0.toFixed(3), end: +t.toFixed(3) });
    t += 1.2; // pause between sentences
  }
  sentenceSpans[name] = spans;
  writeFileSync(path.join(OUT, "edit", "transcripts", `${name}.json`),
    JSON.stringify({ language_code: "en", text: lines.join(". ") + ".", words }, null, 1));
}

// ---------------------------------------------------------------- edl ----
const pick = (name, i, beat) => {
  const s = sentenceSpans[name][i];
  return { source: name, start: +(s.start - 0.15).toFixed(3), end: +(s.end + 0.1).toFixed(3), beat,
           caption_words: [s.start, s.end], punch: [] };
};
const ranges = [
  pick("cam_a", 0, "HOOK"),
  pick("cam_a", 1, "PROBLEM"),
  pick("cam_b", 0, "QUESTION"),
  pick("cam_a", 2, "PROBLEM"),
  pick("cam_b", 1, "SOLUTION"),
  pick("cam_b", 2, "SOLUTION"),
  pick("cam_a", 4, "CTA"),
];
ranges[1].punch = [[ranges[1].start + 0.5, ranges[1].start + 2.0]];
let acc = 0;
const outStarts = ranges.map((r) => { const s = acc; acc += r.end - r.start; return s; });
const broll = [{ source: "broll_city", src_start: 2.0, duration: 2.5, start_in_output: +(outStarts[3] + 0.4).toFixed(3) }];
const edl = {
  version: 1,
  sources: { cam_a: "../raw/cam_a.mp4", cam_b: "../raw/cam_b.mp4", broll_city: "../raw/broll_city.mp4" },
  ranges,
  broll,
  emphasis: ["agent", "snapshot"],
  punch_scale: 1.08,
};
writeFileSync(path.join(OUT, "edit", "edl.json"), JSON.stringify(edl, null, 2));

// -------------------------------------------------------------- render ----
const work = path.join(OUT, "edit", ".work");
const segs = ranges.map((r, i) => {
  const seg = path.join(work, `seg_${i}.mp4`);
  ff("-ss", String(r.start), "-i", path.join(OUT, "raw", `${r.source}.mp4`), "-t", String(r.end - r.start),
     "-vf", `scale=${W}:${H},setsar=1`, "-af", "afade=t=in:d=0.03",
     "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(FPS),
     "-c:a", "aac", "-ar", "48000", seg);
  return seg;
});
const list = path.join(work, "list.txt");
writeFileSync(list, segs.map((s) => `file '${s}'`).join("\n"));
const concat = path.join(work, "concat.mp4");
ff("-f", "concat", "-safe", "0", "-i", list, "-c", "copy", concat);
const b = broll[0];
ff("-i", concat, "-ss", String(b.src_start), "-t", String(b.duration), "-i", path.join(OUT, "raw", "broll_city.mp4"),
   "-filter_complex",
   `[1:v]setpts=PTS-STARTPTS+${b.start_in_output}/TB,scale=${W}:${H}[b];[0:v][b]overlay=enable='between(t,${b.start_in_output},${b.start_in_output + b.duration})':eof_action=pass[v]`,
   "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
   "-c:a", "copy", "-movflags", "+faststart", final);
rmSync(work, { recursive: true, force: true });
console.log(`demo ready: ${final}  (${acc.toFixed(2)} s, ${ranges.length} ranges, ${broll.length} b-roll)`);
