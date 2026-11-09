import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Timeline } from "./schema.js";
import { edlToTimeline, resolveTimeline } from "./timeline.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fb-tl-"));
});
afterEach(() => fs.rm(tmp, { recursive: true, force: true }));

/** Copy the EDL fixture next to a (fake) video and return the video path. */
async function project(name = "clip.mp4"): Promise<string> {
  await fs.cp(path.join(fixtures, "edl"), tmp, { recursive: true });
  const video = path.join(tmp, name);
  await fs.writeFile(video, "x");
  // the video is rendered after the EDL
  const later = new Date(Date.now() + 5_000);
  await fs.utimes(video, later, later);
  return video;
}

const track = (t: Timeline, id: string) => t.tracks.find((x) => x.id === id)!;

describe("edlToTimeline", () => {
  it("maps ranges to output time", async () => {
    const { timeline, warnings } = await edlToTimeline(path.join(fixtures, "edl", "edl.json"));
    expect(warnings).toEqual([]);
    expect(Timeline.parse(timeline)).toBeTruthy();
    expect(timeline.duration).toBe(7);
    const cuts = track(timeline, "cuts").items;
    expect(cuts.map((c) => [c.id, c.start, c.end])).toEqual([
      ["range:0", 0, 3],
      ["range:1", 3, 5],
      ["range:2", 5, 7],
    ]);
    expect(cuts[0]).toMatchObject({ type: "range", label: "HOOK · a 1.00–4.00", source: { name: "a", start: 1, end: 4 }, meta: { beat: "HOOK" } });
    expect(cuts[2].label).toBe("a 10.00–12.00");
  });

  it("flags speaker changes and silence around each cut", async () => {
    const { timeline } = await edlToTimeline(path.join(fixtures, "edl", "edl.json"));
    const t = track(timeline, "transitions");
    expect(t.kind).toBe("markers");
    expect(t.items.map((i) => [i.id, i.start, i.label])).toEqual([
      ["cut:1", 3, "cut range:0 → range:1 · speaker change"],
      ["cut:2", 5, "cut range:1 → range:2 · speaker change"],
    ]);
    expect(t.items[0].meta).toEqual({ speakerChange: true, gapBefore: 0.6, gapAfter: 0.3 });
    expect(t.items[1].meta).toEqual({ speakerChange: true, gapBefore: 0.9, gapAfter: 0.5 });
  });

  it("maps punch-ins, b-roll, words, captions and speakers", async () => {
    const { timeline } = await edlToTimeline(path.join(fixtures, "edl", "edl.json"));
    expect(track(timeline, "motion").items).toEqual([
      expect.objectContaining({ type: "punch", start: 0.5, end: 1.5 }),
    ]);
    expect(track(timeline, "broll").items[0]).toMatchObject({ type: "broll", start: 3, end: 4.5, label: "c 2s" });

    const words = track(timeline, "words").items;
    expect(words.map((w) => w.label)).toEqual(["Hello", "world.", "again", "now", "Yes", "indeed.", "later"]);
    expect(words[0]).toMatchObject({ start: 0.2, end: 0.5, meta: { speaker: "speaker_0" } });
    expect(words[4]).toMatchObject({ start: 3.3, end: 3.6 });

    expect(track(timeline, "captions").items.map((c) => [c.label, c.start, c.end])).toEqual([
      ["Hello world.", 0.2, 1],
      ["again now", 1.2, 2.4],
      ["Yes indeed.", 3.3, 4.1],
      ["later", 5.5, 5.9],
    ]);
    expect(track(timeline, "speakers").items.map((s) => [s.label, s.start, s.end])).toEqual([
      ["speaker_0", 0.2, 2.4],
      ["speaker_1", 3.3, 4.1],
      ["speaker_0", 5.5, 5.9],
    ]);
  });

  it("warns about missing transcripts and omits word tracks", async () => {
    await fs.cp(path.join(fixtures, "edl"), tmp, { recursive: true });
    await fs.rm(path.join(tmp, "transcripts", "b.json"));
    await fs.rm(path.join(tmp, "transcripts", "a.json"));
    const { timeline, warnings } = await edlToTimeline(path.join(tmp, "edl.json"));
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/missing transcript for source "a"/);
    expect(timeline.tracks.map((t) => t.id)).toEqual(["cuts", "transitions", "motion", "broll"]);
  });

  it("splits long phrases after four words", async () => {
    await fs.cp(path.join(fixtures, "edl"), tmp, { recursive: true });
    const words = Array.from({ length: 9 }, (_, i) => ({ text: `w${i}`, start: 1 + i * 0.3, end: 1.2 + i * 0.3, type: "word", speaker_id: "s" }));
    await fs.writeFile(path.join(tmp, "transcripts", "a.json"), JSON.stringify({ words }));
    const { timeline } = await edlToTimeline(path.join(tmp, "edl.json"));
    expect(track(timeline, "captions").items.map((c) => c.label)).toEqual(["w0 w1 w2 w3", "w4 w5 w6 w7", "w8", "Yes indeed."]);
  });

  it("rejects a malformed EDL with a readable error", async () => {
    await fs.writeFile(path.join(tmp, "edl.json"), JSON.stringify({ ranges: [{ source: "a" }] }));
    await expect(edlToTimeline(path.join(tmp, "edl.json"))).rejects.toThrow(/edl\.json: ranges\.0\.start/);
  });
});

describe("resolveTimeline", () => {
  it("returns null when nothing is next to the video", async () => {
    const video = path.join(tmp, "clip.mp4");
    await fs.writeFile(video, "x");
    expect(await resolveTimeline(video)).toBeNull();
  });

  it("falls back to edl.json (approximate)", async () => {
    const video = await project();
    const r = (await resolveTimeline(video, { videoDuration: 7.1 }))!;
    expect(r).toMatchObject({ origin: "edl", approximate: true, sourceFile: path.join(tmp, "edl.json"), warnings: [] });
    expect(r.sourceMtime).toMatch(/^\d{4}-/);
    expect(track(r.timeline, "cuts").items).toHaveLength(3);
  });

  it("prefers the sidecar over edl.json", async () => {
    const video = await project();
    await fs.copyFile(path.join(fixtures, "sidecar.timeline.json"), path.join(tmp, "clip.timeline.json"));
    const r = (await resolveTimeline(video, { videoDuration: 10 }))!;
    expect(r).toMatchObject({ origin: "sidecar", approximate: false, sourceFile: path.join(tmp, "clip.timeline.json") });
    expect(r.timeline.origin).toBe("sidecar");
    expect(r.warnings).toEqual([]);
  });

  it("honours explicit paths", async () => {
    const video = await project();
    const sidecar = path.join(fixtures, "sidecar.timeline.json");
    expect((await resolveTimeline(video, { timelinePath: sidecar }))!.origin).toBe("sidecar");
    await fs.copyFile(sidecar, path.join(tmp, "clip.timeline.json"));
    expect((await resolveTimeline(video, { edlPath: path.join(tmp, "edl.json") }))!.origin).toBe("edl");
  });

  it("warns when the EDL is newer than the video or durations drift", async () => {
    const video = await project();
    const earlier = new Date(Date.now() - 60_000);
    await fs.utimes(video, earlier, earlier);
    const r = (await resolveTimeline(video, { videoDuration: 9 }))!;
    expect(r.warnings.some((w) => /newer than the video/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /7\.00s differs from video duration 9\.00s/.test(w))).toBe(true);
  });

  it("skips an invalid sidecar with a warning and uses the EDL", async () => {
    const video = await project();
    await fs.writeFile(path.join(tmp, "clip.timeline.json"), "{nope");
    const r = (await resolveTimeline(video))!;
    expect(r.origin).toBe("edl");
    expect(r.warnings[0]).toMatch(/ignored invalid sidecar clip\.timeline\.json/);
  });

  it("throws for an invalid explicit sidecar", async () => {
    const video = await project();
    await fs.writeFile(path.join(tmp, "bad.json"), JSON.stringify({ schemaVersion: 1 }));
    await expect(resolveTimeline(video, { timelinePath: path.join(tmp, "bad.json") })).rejects.toThrow(/bad\.json/);
  });
});
