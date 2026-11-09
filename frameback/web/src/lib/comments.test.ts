import { describe, expect, it } from "vitest";
import type { Comment } from "@core/schema";
import { hasUnansweredQuestion, isAnsweredWaiting, isCarriedOpen, needsVerification } from "./comments";

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
