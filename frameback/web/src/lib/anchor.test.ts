import { describe, expect, it } from "vitest";
import type { Comment, Timeline } from "@core/schema";
import { buildAnchor, sourceAt, suggestCategory, transcriptFor } from "./anchor";
import { FILTERS, filterCounts, hasUnansweredQuestion, isStale, matchesFilter, needsVerification, upsertComment } from "./comments";

const timeline: Timeline = {
  schemaVersion: 1,
  tracks: [
    {
      id: "cuts", label: "Cuts", kind: "segments",
      items: [
        { id: "range:0", type: "range", start: 0, end: 5, source: { name: "cam_a", start: 10, end: 15 } },
        { id: "range:1", type: "range", start: 5, end: 9, source: { name: "cam_b", start: 2, end: 6 } },
      ],
    },
    {
      id: "words", label: "Words", kind: "segments",
      items: [
        { id: "w0", type: "word", start: 0.1, end: 0.4, label: "Hello" },
        { id: "w1", type: "word", start: 0.5, end: 0.9, label: "there" },
        { id: "w2", type: "word", start: 6, end: 6.4, label: "later" },
      ],
    },
  ],
};

describe("anchors", () => {
  it("collects words inside a range", () => {
    expect(transcriptFor(timeline, 0, 1)).toBe("Hello there");
    expect(transcriptFor(timeline, 5.5, 7)).toBe("later");
  });
  it("uses a small context window for points and nothing without a words track", () => {
    expect(transcriptFor(timeline, 0.5, null)).toBe("Hello there");
    expect(transcriptFor({ ...timeline, tracks: [] }, 0, 1)).toBeUndefined();
    expect(transcriptFor(null, 0, 1)).toBeUndefined();
  });
  it("maps output time to source time", () => {
    expect(sourceAt(timeline, 6)).toEqual({ name: "cam_b", time: 3 });
    expect(sourceAt(timeline, 50)).toBeUndefined();
  });
  it("builds a point anchor with frame, source and transcript", () => {
    const a = buildAnchor({ start: 0.5, end: null, region: { shape: "point", x: 0.5, y: 0.5 }, entity: null }, 24, timeline);
    expect(a).toMatchObject({ time: { start: 0.5, end: null }, frame: 12, source: { name: "cam_a", time: 10.5 }, transcript: "Hello there" });
    expect(a.region).toEqual({ shape: "point", x: 0.5, y: 0.5 });
  });
  it("treats an empty or inverted end as a point", () => {
    expect(buildAnchor({ start: 2, end: 2, region: null, entity: null }, 24, null).time.end).toBeNull();
  });
  it("suggests categories from the entity", () => {
    const base = { start: 0, end: null, region: null };
    expect(suggestCategory({ ...base, entity: { track: "cuts", id: "r", type: "range" } })).toBe("cut");
    expect(suggestCategory({ ...base, entity: null })).toBe("other");
    expect(suggestCategory({ ...base, entity: null, region: { shape: "point", x: 0, y: 0 } })).toBe("framing");
  });
});

const comment = (over: Partial<Comment> & { agent?: Partial<Comment["agent"]> }): Comment => ({
  schemaVersion: 1, id: "c-0001", createdAt: "", updatedAt: "",
  anchor: { time: { start: 1 } }, category: "other", priority: "should", body: "x",
  human: { status: "open", revision: 1 }, thread: [], carriedFrom: null,
  ...over,
  agent: { status: "pending", seenRevision: 1, ...over.agent },
});

describe("comment helpers", () => {
  it("detects stale comments", () => {
    expect(isStale(comment({ human: { status: "open", revision: 2 } }))).toBe(true);
    expect(isStale(comment({}))).toBe(false);
  });
  it("filters", () => {
    const list = [
      comment({ id: "c-0001" }),
      comment({ id: "c-0002", agent: { status: "prepared" } }),
      comment({ id: "c-0003", agent: { status: "applied" }, carriedFrom: { review: "v1", id: "c-0001" } }),
      comment({ id: "c-0004", agent: { status: "needs_info" } }),
      comment({ id: "c-0005", agent: { status: "prepared" }, human: { status: "open", revision: 3 } }),
    ];
    const counts = filterCounts(list);
    expect(counts).toMatchObject({ all: 5, needs_action: 3, prepared: 2, applied: 1, needs_info: 1, to_verify: 1 });
    expect(FILTERS.map((f) => f.id)).toContain("to_verify");
    expect(matchesFilter(list[2], "to_verify")).toBe(true);
    expect(needsVerification(comment({ carriedFrom: { review: "v1", id: "c-0001" }, human: { status: "verified", revision: 1 } }))).toBe(false);
  });
  it("detects unanswered agent questions", () => {
    expect(hasUnansweredQuestion(comment({ agent: { status: "needs_info" } }))).toBe(true);
    expect(hasUnansweredQuestion(comment({ thread: [{ author: "agent", at: "", text: "Cut or zoom?" }], agent: { status: "in_progress" } }))).toBe(true);
    expect(hasUnansweredQuestion(comment({ thread: [{ author: "agent", at: "", text: "q" }, { author: "human", at: "", text: "a" }] }))).toBe(false);
  });
  it("upserts and drops deleted comments", () => {
    const a = comment({ id: "c-0001" });
    const list = upsertComment([], a);
    expect(upsertComment(list, { ...a, body: "y" })[0].body).toBe("y");
    expect(upsertComment(list, { ...a, human: { status: "deleted", revision: 1 } })).toEqual([]);
  });
});
