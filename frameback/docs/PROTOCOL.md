# Frameback review protocol (schemaVersion 1)

This is the contract between the Frameback UI and any agent. Everything is plain files; `src/core/schema.ts` is the
normative zod definition and must match this document.

## 1. Location

For a reviewed video `<dir>/<stem>.<ext>` the review lives in:

```
<dir>/review/<stem>/
  review.json          # Review manifest
  comments/<id>.json   # one Comment per file
  snapshots/<id>.jpg   # optional frame snapshot per comment (region drawn on it)
  events.ndjson        # append-only event log, one JSON Event per line
  .lock/               # transient lock directory (mkdir-based); ignore
```

Example: `edit/final_v2.mp4` → `edit/review/final_v2/`.

All writes go through the core store: atomic write (tmp file + rename) under the lock; events appended under the
lock with `seq = last seq + 1` (starting at 1).

## 2. Review manifest — `review.json`

```jsonc
{
  "schemaVersion": 1,
  "id": "final_v2",              // = stem
  "video": { "file": "../../final_v2.mp4",  // relative to the review dir
             "duration": 2412.48, "fps": 24, "width": 1920, "height": 1080,   // filled when known
             "fingerprint": { "size": 81920000, "mtimeMs": 1794200000000, "hash": "<sha1 of first+last 64 KB>" } },  // optional; set on open
  "timeline": { "file": "../../final_v2.timeline.json" } ,              // optional; or null
  "state": "reviewing",                   // reviewing | submitted | processing | delivered | closed
  "round": 1,                             // incremented when a submitted review is reopened
  "previous": "final_v1",         // stem of the version this one was carried from, or null
  "nextVideo": null,                      // relative path of the next version once delivered
  "createdAt": "2026-11-09T03:00:00.000Z",
  "submittedAt": null,
  "updatedAt": "2026-11-09T03:00:00.000Z"
}
```

## 3. Comment — `comments/<id>.json`

`id` format: `c-0001`, `c-0002`… (allocated under lock; zero-padded to 4, grows if needed).

```jsonc
{
  "schemaVersion": 1,
  "id": "c-0007",
  "createdAt": "…", "updatedAt": "…",

  // ---- human fields (written by the UI / reviewer) ----
  "anchor": {
    "time": { "start": 12.48, "end": 15.2 },    // seconds in THIS video. end omitted/null => a point in time
    "frame": 299,                                // optional frame index of start (if fps known)
    "region": { "shape": "rect", "x": 0.52, "y": 0.10, "w": 0.30, "h": 0.25 },  // optional; normalized 0–1
                                                 // or { "shape": "point", "x": 0.5, "y": 0.4 }
    "entity": {                                  // optional; a timeline item the comment targets
      "track": "cuts", "id": "range:3", "type": "range", "label": "HOOK · cam_a 83.20–90.10"
    },
    "source": { "name": "cam_a", "time": 83.2 }, // optional; resolved from the timeline when available
    "transcript": "what is said in that span"  // optional; words spoken in the anchored span
  },
  "category": "framing",   // cut | transition | framing | color | motion | audio | caption | broll | element | pacing | other
  "action": "change",      // remove | change | add | move | keep | question   (optional)
  "priority": "should",    // must | should | nit
  "body": "Center the speaker, the face is cut on the right.",
  "snapshot": "snapshots/c-0007.jpg",          // optional, relative to review dir
  "human": { "status": "open", "revision": 1 }, // status: open | resolved_by_human | deleted | verified | reopened
                                               // revision: +1 on every human content edit

  // ---- agent fields (written by the agent via CLI / MCP) ----
  "agent": {
    "status": "prepared",  // pending | acknowledged | in_progress | prepared | applied | needs_info | declined
    "plan": "Shift crop x by +8% on range:3 in staging EDL",
    "reply": "Done in staging; will be in v3.",
    "appliedIn": null,     // stem of the version where it was applied, e.g. "final_v3"
    "seenRevision": 1,     // human.revision the agent acted on; < human.revision => STALE (human edited after)
    "updatedAt": "…"
  },

  // ---- shared ----
  "thread": [ { "author": "agent", "at": "…", "text": "Do you prefer a cut or a zoom?" },
              { "author": "human", "at": "…", "text": "A cut." } ],
  "carriedFrom": null       // when carried over: { "review": "final_v1", "id": "c-0003",
                            //   "time": { "start": 25, "end": null },   // anchor time in the previous version (optional)
                            //   "remap": { "method": "source", "status": "exact" } }  // optional, see §7
}
```

Rules:
- The UI never writes `agent.*`; agents never write human fields except appending to `thread`.
- New comments start with `human.status = "open"` and `agent.status = "pending"`.
- `deleted` comments stay on disk (soft delete) so agents can undo prepared work.

## 4. Events — `events.ndjson`

Every line: `{ "seq": 12, "at": "ISO", "type": "<type>", "review": "<stem>", "commentId"?: "c-0007", "actor": "human"|"agent"|"system", "data"?: {...} }`

| type | actor | when | data |
|------|-------|------|------|
| `review.opened` | system | review dir created / UI opened | `{ video }` |
| `comment.created` | human | comment sent | summary: `{ time, region, entity, category, action, priority, body, snapshot, revision }` |
| `comment.carried` | system | copied from previous version for verification (no rework!) | `{ from: {review, id, time}, agentStatus, remap: {method, status}, …summary }` |
| `comment.updated` | human | body/anchor/category/priority edited | `{ fields: [...], …summary }` |
| `comment.deleted` | human | soft delete | — |
| `comment.human_status` | human | verified / reopened / resolved_by_human | `{ status }` |
| `comment.agent_status` | agent | status / plan / reply change | `{ status }` |
| `thread.message` | human\|agent | message appended | `{ author }` |
| `review.submitted` | human | **Process review** pressed | `{ counts: { total, open, … } }` |
| `review.video_adopted` | human | `frameback open --force` accepted a video that changed after it was opened | `{ previous, current }` (fingerprints) |
| `review.state` | agent\|human | processing / delivered / closed (agent); reviewing after reopen (human, `reopened: true`, `round`) | `{ state, nextVideo?, reopened?, round? }` |

## 5. Agent interface

### CLI (works everywhere)

```
frameback watch <video|reviewDir> [--since <seq>] [--tail] [--exit-on review.submitted] [--actor human,agent,system] [--json|--text]
frameback list  <video|reviewDir> [--agent-status pending,needs_info] [--json]
frameback show  <reviewDir> <commentId> [--json]
frameback update <reviewDir> <commentId> --status <agentStatus> [--plan …] [--reply …] [--applied-in <stem>] [--seen-revision <n>] [--json]
frameback reply <reviewDir> <commentId> "<message>"
frameback review <reviewDir> --state <processing|delivered|closed> [--next-video <path>]
frameback carry <fromVideo> <toVideo>
frameback export <reviewDir> [--format md|json]       # FEEDBACK.md-style summary for the agent
```

`watch --json` prints exactly one Event JSON per line on stdout and flushes; diagnostics go to stderr.
Agents should pass `--actor human,system` so they are not notified of their own writes.
Designed for Claude Code: run it with the Monitor tool (one notification per comment) or as a background task with
`--exit-on review.submitted` (one notification when the review is done).

### MCP (`frameback mcp`, stdio)

Tools: `frameback_list_reviews`, `frameback_get_review`, `frameback_get_comment` (includes the snapshot image),
`frameback_update_comment`, `frameback_reply`, `frameback_set_review_state`, `frameback_wait_for_events` (long-poll: blocks up to
`timeoutSec` until events after `sinceSeq` exist), `frameback_export`.

## 6. Timeline sidecar — `<video stem>.timeline.json` (optional)

Lets any editing tool show its structure in Frameback. Times are output-time seconds.

```jsonc
{
  "schemaVersion": 1,
  "video": "final_v2.mp4",
  "duration": 2412.48,
  "tracks": [
    { "id": "cuts",    "label": "Cuts",    "kind": "segments",
      "items": [ { "id": "range:0", "type": "range", "start": 0, "end": 6.4, "label": "HOOK · cam_a 12.10–18.50",
                   "source": { "name": "cam_a", "start": 12.1, "end": 18.5 }, "meta": { "beat": "HOOK" } } ] },
    { "id": "transitions", "label": "Transitions", "kind": "markers",
      "items": [ { "id": "cut:1", "type": "transition", "start": 6.4, "label": "hard cut range:0 → range:1" } ] },
    { "id": "broll",   "label": "B-roll",  "kind": "segments", "items": [ … "type": "broll" … ] },
    { "id": "captions","label": "Captions","kind": "segments", "items": [ … "type": "caption", "label": "texto" … ] },
    { "id": "words",   "label": "Words",   "kind": "segments", "items": [ … "type": "word" … ] }
  ]
}
```

If no sidecar exists, Frameback looks for `edl.json` next to the video and converts it (the `video-use` `edl.json` shape:
`sources`, `ranges[{source,start,end,beat?,punch?}]`, `broll[{source,src_start,duration,start_in_output}]`, word
transcripts in `transcripts/<source>.json` with `words[{type:"word",text,start,end}]`). Range output times are the
cumulative sum of range durations in order.

## 7. Normative rules (v0.1)

**Review state machine**

```
reviewing --(human: Process review)--> submitted --(agent)--> processing --(agent)--> delivered --(agent/human)--> closed
    ^                                      |                       |
    +------(human: reopen, round++)--------+-----------------------+
```
- While not `reviewing`, the UI locks the composer and human edits (store rejects them); threads and human
  verification statuses stay open; agents may write in any state.
- The human can also reopen a `delivered` or `closed` review while no newer version exists (no `nextVideo`, or its
  file is missing): it is still the latest cut. Once the next version exists, feedback belongs there.
- Agents set `delivered` / `closed` only on the review of the version they **replaced**; the review of the version
  just opened stays `reviewing`.

**Write order and locking**
- All writers use `src/core/store.ts`. Lock = `mkdir .lock` with an `owner` file `{pid, at}`; a lock older than 10 s
  or whose pid is dead is stolen; retries with backoff up to 8 s.
- Create: snapshot → comment → event. Every event is appended under the lock; `.seq` caches the last seq.
- Writers emit `null` (never omission) for absent optional values; readers accept both.

**Timeline**
- Resolved once when the review is created and **frozen** to `review/<stem>/timeline.json`; `review.timeline`
  records `origin`, `sourceFile`, `sourceMtime`, `approximate` and `warnings` (e.g. EDL newer than the video, or
  EDL-derived duration differs from the video by > 0.5 s). Staging edits to the EDL never move the timeline under
  a review. Entity anchors copy the item's times, so they stay meaningful even if ids change later.

**Never overwrite a video that is under review.** The review is anchored to the exact cut that was opened. When the
file under `video.file` no longer matches `video.fingerprint` (size or edge hash; a bare mtime change is ignored), the UI
shows a persistent warning, `GET /api/reviews/:rid/video-status` and the bundle's `videoStatus` report `changed: true`,
and `frameback open` refuses (HTTP 409, `code: "video_changed"`) unless `--force` is given. Deliver a new cut as the next
version (`_v(N+1)`) instead. A review without a fingerprint adopts the current file silently.

**Regions** are normalized to the encoded video frame (letterbox excluded), origin top-left.

**watch semantics**
- `frameback watch <target>` waits for the review dir to exist, then **replays** all events with seq > `--since`
  (default 0) and keeps tailing (polling ~250 ms; only complete lines). `--tail` starts at the current end instead.
- `--json`: one Event per line. `--text`: one human-readable line per event, e.g.
  `#12 comment.created c-0007 [must/framing] 00:12.48–00:15.20 region(rect) "Center the speaker…" snapshot=…/c-0007.jpg`.
- `--exit-on <type>` exits 0 right after printing the first event of that type (e.g. `review.submitted`).
- `list --json` returns `{ lastSeq, review, comments }` so an agent can resume with `watch --since lastSeq`.

**Carry-over** never re-triggers work: carried comments keep their agent fields and emit `comment.carried`.
The UI shows them as "verify" (`carriedFrom != null`, human.status `open`) until the human marks `verified` or `reopened`.

**Agent etiquette**
- Act only on comments with `human.status` in {open, reopened}; on `comment.deleted` undo prepared staging work.
- On `comment.updated` with `revision > agent.seenRevision`, re-plan.
- Use `needs_info` + a thread question instead of guessing.

**Carry-over remap** (`src/core/remap.ts`): a re-cut moves content in output time, so carried anchors are remapped through
source time using the two frozen timelines. The primary track is the `cuts` track (else the first track with `range`
items that carry `source`). Output time `t` → the old cut containing `t` → `(source, srcT)` (or `anchor.source` when
stored) → the new cut with the same source name whose source range contains `srcT` (nearest in cut order if several)
→ new output time. Spans map both ends; a partly surviving span is clamped to the surviving part.
`carriedFrom.remap.method` is `source`, or `identity` (times kept as-is) when either timeline has no cuts with source info.
`status` is `exact`; `clamped` (part of the span was cut or reordered); or `lost` (the content was removed: `anchor.time`
then holds the nearest surviving neighbour position and `anchor.entity` is dropped). `carriedFrom.time` keeps the original
anchor time. `anchor.frame` is recomputed from the review's fps when known, else dropped; `region` is untouched; `entity` is
re-pointed to the new item at the mapped time (same track and type), or dropped. Remap never changes agent fields.
