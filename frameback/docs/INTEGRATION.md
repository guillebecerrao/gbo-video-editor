# Integrating with Frameback

For people building editing tools or agents. Frameback never edits video: it shows a video and a list of comments.
You provide (optionally) the structure of the edit, and you consume the comments.

## 1. Show your edit's structure: the timeline sidecar

Write `<video stem>.timeline.json` next to the rendered video (for `final_v2.mp4`: `final_v2.timeline.json`).
Frameback picks it up when the review is opened and freezes a copy into the review folder.

```jsonc
{
  "schemaVersion": 1,
  "video": "final_v2.mp4",
  "duration": 62.4,                 // seconds, of the rendered video
  "tracks": [
    { "id": "cuts", "label": "Cuts", "kind": "segments",
      "items": [{ "id": "range:0", "type": "range", "start": 0, "end": 6.4,
                  "label": "HOOK · cam_a 12.10–18.50",
                  "source": { "name": "cam_a", "start": 12.1, "end": 18.5 },
                  "meta": { "beat": "HOOK" } }] },
    { "id": "transitions", "label": "Transitions", "kind": "markers",
      "items": [{ "id": "cut:1", "type": "transition", "start": 6.4, "label": "cut range:0 → range:1",
                  "meta": { "speakerChange": true } }] }
  ]
}
```

Rules:

- **All times are seconds in the rendered video** (output time), never source time. Put source times in `source`.
- `kind: "segments"` items have `start` and `end`; `kind: "markers"` items have only `start`.
- Item `id`s are yours; keep them stable within one render. Comments copy the item's times, so they remain meaningful
  if ids change in the next version.
- Common track ids the UI knows how to present well: `cuts`, `transitions`, `motion`, `broll`, `captions`,
  `speakers`, `words`. Any other id is shown as a generic lane. `words` may hold tens of thousands of items.
- `meta` is free-form. `transitions` with `meta.speakerChange: true` are highlighted.
- Validation is `Timeline` in `src/core/schema.ts`. An invalid sidecar is reported as a warning and ignored.

If no sidecar exists, Frameback looks for an `edl.json` next to the video (shape: `sources`, `ranges[{source, start,
end, beat?, punch?}]`, `broll[{source, src_start, duration, start_in_output}]`, transcripts in
`transcripts/<source>.json`) and derives an *approximate* timeline from it. Emitting the sidecar is more accurate.

### Minimal converter: JavaScript

```js
// edl.json -> <stem>.timeline.json  (ranges only)
import { readFileSync, writeFileSync } from "node:fs";

const edl = JSON.parse(readFileSync("edl.json", "utf8"));
let t = 0;
const cuts = edl.ranges.map((r, i) => {
  const item = {
    id: `range:${i}`, type: "range", start: t, end: t + (r.end - r.start),
    label: `${r.beat ?? "CUT"} · ${r.source} ${r.start.toFixed(2)}–${r.end.toFixed(2)}`,
    source: { name: r.source, start: r.start, end: r.end },
  };
  t = item.end;
  return item;
});
const timeline = {
  schemaVersion: 1, video: "final_v2.mp4", duration: t,
  tracks: [{ id: "cuts", label: "Cuts", kind: "segments", items: cuts }],
};
writeFileSync("final_v2.timeline.json", JSON.stringify(timeline, null, 2));
```

### Minimal converter: Python

```python
import json

edl = json.load(open("edl.json"))
t, cuts = 0.0, []
for i, r in enumerate(edl["ranges"]):
    end = t + (r["end"] - r["start"])
    cuts.append({
        "id": f"range:{i}", "type": "range", "start": t, "end": end,
        "label": f'{r.get("beat", "CUT")} · {r["source"]} {r["start"]:.2f}–{r["end"]:.2f}',
        "source": {"name": r["source"], "start": r["start"], "end": r["end"]},
    })
    t = end

timeline = {
    "schemaVersion": 1, "video": "final_v2.mp4", "duration": t,
    "tracks": [{"id": "cuts", "label": "Cuts", "kind": "segments", "items": cuts}],
}
json.dump(timeline, open("final_v2.timeline.json", "w"), indent=2)
```

## 2. Consume the comments

Everything is plain files under `<video dir>/review/<video stem>/`; the normative description is
[`PROTOCOL.md`](PROTOCOL.md). Three equivalent ways in, pick what your agent runtime supports:

| Route | Use it when | Entry points |
|-------|-------------|--------------|
| **Plain files** | Any agent that can read a directory | `comments/*.json`, `snapshots/*.jpg`, tail `events.ndjson` (one JSON event per line, `seq` increasing) |
| **CLI** | Agents with a shell. Best for Claude Code (Monitor / background tasks) | `frameback watch … --json`, `list`, `show`, `update`, `reply`, `review`, `export` |
| **MCP** | MCP clients without a long-running shell | `frameback mcp`; tools `frameback_list_reviews`, `frameback_get_review`, `frameback_get_comment` (returns the snapshot as an image), `frameback_update_comment`, `frameback_reply`, `frameback_set_review_state`, `frameback_wait_for_events`, `frameback_export` |

Write through the CLI or MCP (or `src/core/store.ts` if you are in TypeScript), never by editing JSON files by hand:
the store provides locking, atomic writes and the event log that keeps the UI live.

Resumable consumption: `frameback list <video> --json` returns `{ lastSeq, review, comments }`; continue with
`frameback watch <video> --since <lastSeq>`.

### Agent etiquette

1. Act only on comments whose `human.status` is `open` or `reopened`.
2. Acknowledge quickly (`acknowledged`), then `in_progress`, then `prepared` with a short `plan`. The reviewer sees
   these live.
3. Look at the snapshot before deciding what a comment means.
4. If it is ambiguous, set `needs_info` and ask one question in the thread. Do not guess.
5. Work on a staging copy of your edit description while the review is open. Never modify the delivered file.
6. `comment.updated` with `revision > agent.seenRevision` means the comment is stale: re-plan. `comment.deleted`:
   undo.
7. Render once per submitted review. Then `applied` + `appliedIn`, `review --state delivered --next-video`, and open
   the next version so comments carry over for verification.
8. Never write human fields; only `agent.*` and thread messages.

A ready-made Claude Code skill implementing this loop lives in `skills/frameback-review/`
(`frameback skill install`). `examples/fake-agent.mjs` is a minimal scripted agent you can read as a reference.

## 3. Make the integration optional

Your tool should work without Frameback. Detect it, and degrade to your normal feedback flow:

```sh
if command -v frameback >/dev/null 2>&1; then FB=frameback
elif npx --no-install frameback --version >/dev/null 2>&1; then FB='npx --no-install frameback'
fi
if [ -n "$FB" ]; then
  $FB open "$VIDEO" --no-open   # prints the URL to hand to the user
else
  echo "Frameback not installed; continuing without a review UI"
fi
```

Until the package is on npm, install from a clone with `npm install && npm run build && npm link`.

Guidelines: never install it silently; never block delivery on it; keep emitting your usual outputs. The sidecar is
inert if Frameback is absent.
