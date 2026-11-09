import { describe, expect, it } from "vitest";
import { formatClock, formatSpan, formatTimecode, frameCenter, frameIndex, stepFrames } from "./time";

describe("frames", () => {
  it("absorbs float noise when indexing", () => {
    expect(frameIndex(12.4999999, 24)).toBe(300);
    expect(frameIndex(12.5, 24)).toBe(300);
    expect(frameIndex(-1, 24)).toBe(0);
  });
  it("seeks to the frame center", () => {
    expect(frameCenter(300, 24)).toBeCloseTo(12.5208333, 6);
    expect(frameIndex(frameCenter(300, 24), 24)).toBe(300);
  });
  it("steps by whole frames and clamps to the video", () => {
    expect(frameIndex(stepFrames(1, 1, 24, 10), 24)).toBe(25);
    expect(stepFrames(0, -1, 24, 10)).toBeCloseTo(0.5 / 24, 9);
    expect(frameIndex(stepFrames(9.99, 5, 24, 10), 24)).toBe(239);
  });
});

describe("formatting", () => {
  it("formats mm:ss.ff", () => {
    expect(formatTimecode(0, 24)).toBe("00:00.00");
    expect(formatTimecode(12.5, 24)).toBe("00:12.12");
    expect(formatTimecode(75.0, 30)).toBe("01:15.00");
  });
  it("adds hours when needed", () => {
    expect(formatTimecode(3725, 24)).toBe("1:02:05.00");
  });
  it("formats ruler clocks", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(1.25, 2)).toBe("0:01.25");
  });
  it("formats spans", () => {
    expect(formatSpan(1, null, 24)).toBe("00:01.00");
    expect(formatSpan(1, 2, 24)).toBe("00:01.00–00:02.00");
  });
});
