import { describe, expect, it } from "vitest";
import type { Event } from "../core/schema.js";
import { formatEventText, truncate } from "./format.js";

const ev = (type: Event["type"], data: Record<string, unknown>, commentId?: string, seq = 7): Event => ({
  seq, at: "2026-01-01T00:00:00.000Z", type, review: "r", actor: "agent", commentId, data,
});

describe("formatEventText", () => {
  it("renders agent status, thread and state events", () => {
    expect(formatEventText(ev("comment.agent_status", { status: "prepared", plan: "shift crop", reply: null, appliedIn: "r_v2" }, "c-0001"), "/x"))
      .toBe('#7 comment.agent_status c-0001 agent=prepared plan="shift crop" applied-in=r_v2');
    expect(formatEventText(ev("thread.message", { author: "human", text: "a cut" }, "c-0002"), "/x")).toBe('#7 thread.message c-0002 human: "a cut"');
    expect(formatEventText(ev("review.state", { state: "delivered", nextVideo: "../../r_v2.mp4" }), "/x")).toBe("#7 review.state state=delivered next=../../r_v2.mp4");
    expect(formatEventText(ev("review.state", { state: "reviewing", reopened: true, round: 2 }), "/x")).toBe("#7 review.state state=reviewing reopened round=2");
  });

  it("renders carried and updated comments", () => {
    const data = { time: { start: 1 }, category: "cut", priority: "nit", body: "b", snapshot: null };
    expect(formatEventText(ev("comment.carried", { ...data, from: { review: "r_v1", id: "c-0003" }, agentStatus: "applied" }, "c-0001"), "/x"))
      .toBe('#7 comment.carried c-0001 [nit/cut] 00:01.00 "b" carried-from=r_v1/c-0003 agent=applied (verify)');
    expect(formatEventText(ev("comment.updated", { ...data, fields: ["body"], revision: 2 }, "c-0001"), "/x"))
      .toBe('#7 comment.updated c-0001 [nit/cut] 00:01.00 "b" changed=body rev=2');
  });

  it("flattens and truncates long bodies", () => {
    expect(truncate("a\n  b", 10)).toBe("a b");
    expect(truncate("x".repeat(100), 10)).toBe("xxxxxxxxx…");
  });
});
