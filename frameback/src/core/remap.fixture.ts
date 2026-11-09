import type { Timeline } from "./schema.js";

/** Test helper: a timeline with one `cuts` track built from [source, srcStart, srcEnd] triples, laid out back to back. */
export const tl = (cuts: [string, number, number][]): Timeline => {
  let t = 0;
  return {
    schemaVersion: 1,
    tracks: [
      {
        id: "cuts", label: "Cuts", kind: "segments",
        items: cuts.map(([name, a, b], i) => {
          const it = { id: `range:${i}`, type: "range", start: t, end: t + (b - a), label: `${name} ${a}-${b}`, source: { name, start: a, end: b } };
          t += b - a;
          return it;
        }),
      },
    ],
  };
};
