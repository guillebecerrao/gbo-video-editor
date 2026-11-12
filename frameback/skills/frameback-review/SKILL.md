---
name: frameback-review
description: Run a live, frame-accurate review of a delivered video with Frameback and process the reviewer's comments incrementally. Use when delivering a video for review, when the user says "review with Frameback", "I left feedback on the video", "process my comments", or when a `review/` folder with `events.ndjson` exists next to a video.
---

# Frameback review loop

Frameback is a local review UI. The human clicks on frames, regions, ranges and timeline items and leaves comments;
each comment lands on disk immediately (`<video dir>/review/<video stem>/`). You prepare changes **while they keep
reviewing**, then render **once** when they press **Process review**.

Full command and event reference: `reference.md` (same folder). The essentials of the protocol are in `reference.md`; the full spec is `docs/PROTOCOL.md` in the Frameback repo (https://github.com/guillebecerrao/frameback/blob/main/docs/PROTOCOL.md).

## If Frameback is not installed

This skill is optional. Resolve the command once per session:

```sh
if command -v frameback >/dev/null 2>&1; then FB=frameback
elif npx --no-install frameback --version >/dev/null 2>&1; then FB='npx --no-install frameback'
fi
```

Use `$FB` wherever this skill says `frameback`. If neither works, do not install anything silently: tell the user
Frameback is available and why it is off (not on PATH; install with `npm install -g frameback`),
and continue the normal editing workflow with its usual checkpoints (ask for feedback in chat, deliver the next
version the usual way).

## 1. Deliver and open the review

After you deliver a video (preview or final):

1. Start the UI in the background (do not block on it): `frameback open <video> --no-open` if the user is not at the
   screen, otherwise `frameback open <video>`. Use `$FB` (see above) when `frameback` is not on PATH.
2. Announce the printed URL to the user in one line, plus what to do: comment as you watch, press **Process review**
   when done.
3. Start listening, before anything else is on disk to miss:
   - **Preferred**: the Monitor tool running `frameback watch <video> --json --actor human,system`. Every stdout line is one event, so
     every comment becomes one notification.
   - Fallback A: a background Bash task `frameback watch <video> --json --exit-on review.submitted` (one
     notification when the review is submitted; read comments with `frameback list`).
   - Fallback B (MCP configured): loop on `frameback_wait_for_events` with the last `lastSeq`.
   Start the watch on the video the reviewer is currently looking at, and only one watch per video.
   `watch` remembers the last event it delivered (`<reviewDir>/.cursors/watch.json`), so if you restart it (e.g. to change
   `--actor`) it continues without losing or repeating events; `--since <n>` / `--tail` override that, `--since 0`
   starts over, and `--cursor <name>` keeps a separate position per consumer. If you resume a session, run
   `frameback list <video> --json` first to catch up.

## 2. Triage loop (one pass per event)

For `comment.created`:

1. Read it: `frameback show <video> <id> --json`. **Look at the snapshot image** (`snapshot` path, a JPEG with the
   region drawn on it). A still removes most ambiguity.
2. Classify:
   - **Preparable now**: you can change the staging edit description right away (cut point, caption text, B-roll
     choice, crop, punch-in, audio level). Do it.
   - **Needs the final render**: only visible after rendering (color, motion feel, final mix). Note it in the plan.
   - **Ambiguous**: do not guess. `frameback update <video> <id> --status needs_info` and
     `frameback reply <video> <id> "<one short question>"`.
3. Update statuses as you go: `acknowledged` right away, `in_progress` when you start, then `prepared` with a short
   `--plan` ("what I changed / will change") and optional `--reply` ("Done in staging, lands in the next version").
   `declined` (with a `--reply` reason) only for requests you cannot or should not do.
4. Record the work in the **staging plan**: `<review dir>/agent-plan.md`, one line per comment id with the decision
   and the exact edit. Apply edits to a **staging copy** of the edit description (e.g. `edl.next.json`). Never touch
   the delivered file or the description the delivered file was rendered from.

Other events:

| Event | Action |
|-------|--------|
| `comment.updated` | If `data.revision` > the comment's `agent.seenRevision` it is **stale**: re-read, re-plan, redo the staging edit, then set a status again (`in_progress`/`prepared`): that marks the new revision as seen. A plan-only `update` does not clear STALE; only a status change (or `--seen-revision <n>`) does. |
| `comment.deleted` | Undo the staged edit for that id and remove it from `agent-plan.md`, then `frameback update <video> <id> --status declined --reply "undone"`. |
| `thread.message` (author `human`) | The reviewer answered or added context. Re-read the comment; if it was `needs_info`, resume triage. |
| `comment.human_status` | `reopened` means the earlier fix was not accepted: treat like a new comment. `verified`/`resolved_by_human`: nothing to do. |
| `review.state` with `reopened: true` | The reviewer added more feedback after submitting: go back to triage, render later. |

## 3. When the review is submitted (`review.submitted`)

1. `frameback review <video> --state processing`.
2. `frameback export <video>` (or `list --json`) to get the final set. Finish everything still `pending`,
   `acknowledged`, `in_progress` or `needs_info` without an answer (state the assumption in the `--reply`).
3. Render **once**, from the staging description, to the next versioned file (`..._v2.mp4`). Never overwrite a file that is
   under review, not even a preview: the reviewer's comments are anchored to that exact cut. Frameback warns the reviewer
   and `frameback open` refuses (without `--force`) when the file changed; a new cut is always a new `_v(N+1)` file.
   Prefer cheap previews to check risky edits before the full render.
4. Mark each handled comment: `frameback update <video> <id> --status applied --applied-in <next stem>`.
5. `frameback review <video> --state delivered --next-video <next video path>`.
6. `frameback open <next video>`: previous comments are carried over automatically as "verify" items. Announce the
   new URL and a two-line summary of what changed. Carried comments do not trigger new work.
   Carried comments are remapped to the new cut through source time (`carriedFrom.time` is the old time,
   `carriedFrom.remap.status` is `exact`, `clamped` or `lost`). `lost` means that moment was removed from the new
   version: the position is only the nearest surviving neighbour, so treat it as probably intentional and let the
   reviewer verify or reopen.
7. **Switch the watch to the new version**: stop the previous watch (it is tied to the old video's `events.ndjson`
   and never ends on its own) and start `frameback watch <next video> --json --actor human,system` (Monitor). Without this, the
   reviewer's `reopened` and new comments on the next version reach nobody.

## Rules

- Never edit human fields (anchor, body, category, priority, human status). Agents only write `agent.*` and thread
  messages, always through the CLI/MCP.
- Act only on comments whose human status is `open` or `reopened`.
- Batch renders: one render per submitted review, not one per comment.
- Keep replies to one or two short sentences; the reviewer is mid-review.
- Times are seconds in the **reviewed video** (output time). Map back to sources through the timeline/EDL
  (`frameback timeline <video> --json`) or the comment's `anchor.source` / `anchor.entity`.
- `--state closed` only when the user says the review is finished.
- `delivered` and `closed` go on the review of the version you **replaced**, never on the one you just opened: the new
  version's review must stay `reviewing`, or the reviewer cannot comment on it (the UI locks it). Never use `--force`
  on review states unless the user asks. If you locked the latest version by mistake, tell the reviewer to press
  **Reopen review** in the comments panel.
