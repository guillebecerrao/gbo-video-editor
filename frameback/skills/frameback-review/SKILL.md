---
name: frameback-review
description: Run a live, frame-accurate review of a delivered video with Frameback and process the reviewer's comments incrementally. Use when delivering a video for review, when the user says "review with Frameback", "I left feedback on the video", "process my comments", or when a `review/` folder with `events.ndjson` exists next to a video.
---

# Frameback review loop

Frameback is a local review UI. The human clicks on frames, regions, ranges and timeline items and leaves comments;
each comment lands on disk immediately (`<video dir>/review/<video stem>/`). You prepare changes **while they keep
reviewing**, then render **once** when they press **Process review**.

Full command and event reference: `reference.md` (same folder). Protocol: `docs/PROTOCOL.md` in the Frameback repo.

## If Frameback is not installed

This skill is optional. Check with `command -v frameback || npx --no-install frameback --version`. If it fails, do
not install anything silently: mention that Frameback is available, and continue the normal editing workflow with
its usual checkpoints (ask for feedback in chat, deliver the next version the usual way).

## 1. Deliver and open the review

After you deliver a video (preview or final):

1. Start the UI in the background (do not block on it): `frameback open <video> --no-open` if the user is not at the
   screen, otherwise `frameback open <video>`. Use `npx frameback open …` when it is not installed globally.
2. Announce the printed URL to the user in one line, plus what to do: comment as you watch, press **Process review**
   when done.
3. Start listening, before anything else is on disk to miss:
   - **Preferred**: the Monitor tool running `frameback watch <video> --json`. Every stdout line is one event, so
     every comment becomes one notification.
   - Fallback A: a background Bash task `frameback watch <video> --json --exit-on review.submitted` (one
     notification when the review is submitted; read comments with `frameback list`).
   - Fallback B (MCP configured): loop on `frameback_wait_for_events` with the last `lastSeq`.
   If you resume a session, run `frameback list <video> --json` first and watch with `--since <lastSeq>`.

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
| `comment.updated` | If `data.revision` > the comment's `agent.seenRevision` it is **stale**: re-read, re-plan, redo the staging edit, then set a status again (`in_progress`/`prepared`): that marks the new revision as seen. |
| `comment.deleted` | Undo the staged edit for that id and remove it from `agent-plan.md`. |
| `thread.message` (author `human`) | The reviewer answered or added context. Re-read the comment; if it was `needs_info`, resume triage. |
| `comment.human_status` | `reopened` means the earlier fix was not accepted: treat like a new comment. `verified`/`resolved_by_human`: nothing to do. |
| `review.state` with `reopened: true` | The reviewer added more feedback after submitting: go back to triage, render later. |

## 3. When the review is submitted (`review.submitted`)

1. `frameback review <video> --state processing`.
2. `frameback export <video>` (or `list --json`) to get the final set. Finish everything still `pending`,
   `acknowledged`, `in_progress` or `needs_info` without an answer (state the assumption in the `--reply`).
3. Render **once**, from the staging description, to the next versioned file (`..._v2.mp4`, never overwrite).
   Prefer cheap previews to check risky edits before the full render.
4. Mark each handled comment: `frameback update <video> <id> --status applied --applied-in <next stem>`.
5. `frameback review <video> --state delivered --next-video <next video path>`.
6. `frameback open <next video>`: previous comments are carried over automatically as "verify" items. Announce the
   new URL and a two-line summary of what changed. Carried comments do not trigger new work: wait for `reopened`.

## Rules

- Never edit human fields (anchor, body, category, priority, human status). Agents only write `agent.*` and thread
  messages, always through the CLI/MCP.
- Act only on comments whose human status is `open` or `reopened`.
- Batch renders: one render per submitted review, not one per comment.
- Keep replies to one or two short sentences; the reviewer is mid-review.
- Times are seconds in the **reviewed video** (output time). Map back to sources through the timeline/EDL
  (`frameback timeline <video> --json`) or the comment's `anchor.source` / `anchor.entity`.
- `--state closed` only when the user says the review is finished.
