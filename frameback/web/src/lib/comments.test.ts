import { describe, expect, it } from "vitest";
import type { Comment } from "@core/schema";
import { firstLine, hasUnansweredQuestion, isResolved, partitionResolved, isAnsweredWaiting, isCarriedOpen, needsVerification } from "./comments";

const base = (over: Record<string, unknown>) => ({
  id: "c-0001",
  human: { status: "open", revision: 1 },
  agent: { status: "needs_info" },
  thread: [],
  ...over,
}) as unknown as Comment;

const msg = (author: "human" | "agent") => ({ author, at: "2026-01-01T00:00:00Z", text: "x" });

describe("questions", () => {
  it("is unanswered until the human replies last", () => {
    expect(hasUnansweredQuestion(base({ thread: [msg("agent")] }))).toBe(true);
    const answered = base({ thread: [msg("agent"), msg("human")] });
    expect(hasUnansweredQuestion(answered)).toBe(false);
    expect(isAnsweredWaiting(answered)).toBe(true);
  });
});

describe("carried comments", () => {
  const carried = { review: "r1", id: "c-0005" };
  it("only asks to verify what the agent applied", () => {
    expect(needsVerification(base({ carriedFrom: carried, agent: { status: "applied" } }))).toBe(true);
    const pending = base({ carriedFrom: carried });
    expect(needsVerification(pending)).toBe(false);
    expect(isCarriedOpen(pending)).toBe(true);
  });
});

describe("resolved grouping", () => {
  const st = (id: string, status: string) => base({ id, human: { status, revision: 1 } });
  it("treats verified and resolved_by_human as resolved", () => {
    expect(isResolved(st("a", "verified"))).toBe(true);
    expect(isResolved(st("a", "resolved_by_human"))).toBe(true);
    expect(isResolved(st("a", "open"))).toBe(false);
    expect(isResolved(st("a", "reopened"))).toBe(false);
  });
  it("partitions preserving order", () => {
    const { active, resolved } = partitionResolved([st("a", "open"), st("b", "verified"), st("c", "reopened"), st("d", "resolved_by_human")]);
    expect(active.map((c) => c.id)).toEqual(["a", "c"]);
    expect(resolved.map((c) => c.id)).toEqual(["b", "d"]);
  });
  it("takes the first non-empty line", () => {
    expect(firstLine("\n  hello\nworld")).toBe("hello");
    expect(firstLine("")).toBe("");
  });
});
