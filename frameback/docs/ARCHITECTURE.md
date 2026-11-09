# Frameback — Architecture & v0.1 plan

> **Frameback** (*frame* + *feedback*) is a local, open-source review tool for
> **agentic video editing**. You open the video an AI agent delivered, click on frames, drag regions, select
> time ranges or pick timeline entities (cuts, transitions, B-roll, captions, words), and leave anchored
> comments. Each comment is written to disk the moment you send it, so the agent working in your Claude Code
> session can start preparing changes **while you keep reviewing**. When you press **Process review**, the
> agent consolidates everything it prepared and renders the next version once.

## 1. Problem

Agentic video editing (an LLM driving ffmpeg / Remotion / an EDL) removes the editing UI, and with it the shared
visual context between the human and the editor. Feedback becomes "at around 12 s, the image on the left…".
That is slow, ambiguous, and serial: the agent waits idle until the whole review is over.

## 2. Goals (v0.1)

1. Open any local video in a browser UI with frame-accurate playback.
2. Anchor comments to: a **point in time**, a **time range**, a **region of the frame** (rectangle/point) at a
   time or over a range, or a **timeline entity** (cut segment, transition, B-roll insert, caption, word).
3. Show the edit's structure as timeline tracks when an edit description is available (Frameback timeline sidecar,
   or a `video-use`/`gbo-style` style `edl.json` + word-level transcripts).
4. Persist every comment immediately as plain files (`<video dir>/review/<video stem>/`), with a frame
   snapshot so the agent can **see** what you meant.
5. Notify the agent session incrementally (`frameback watch`, NDJSON on stdout — designed for Claude Code's
   Monitor / background tasks) **and** through an optional MCP server (`frameback mcp`).
6. Two-way status: the agent marks each comment `acknowledged → in_progress → prepared → applied`
   (or `needs_info` / `declined`) and replies; the UI updates live.
7. **Process review** button → `review.submitted` event → agent renders next version → the next version opens
   with previous comments carried over for verification.

## 3. Non-goals (v0.1)

- Not a video editor: no trimming, no rendering, no effects in the UI. The agent edits; Frameback is the review surface.
- No multi-user / cloud sync / auth. Local, single reviewer, bound to `127.0.0.1`.
- No dependency from the editing skill on Frameback: skills must keep working without it (Frameback is opt-in).

## 4. Shape

Single npm package `frameback` (TypeScript, Node ≥ 20), built into `dist/`:

```
frameback/
  src/core/      schema (zod), file store, event log, locking, timeline adapters, carry-over, markdown export
  src/server/    HTTP server: REST API, SSE, video streaming (Range), static web UI, frame snapshots
  src/cli/       `frameback` CLI (commander): open, watch, list, show, update, review, carry, export, timeline, mcp, skill
  src/mcp/       MCP stdio server over the same core store
  web/           React + Vite UI (built into dist/web, served by the server)
  skills/        `frameback-review` Claude Code skill (generic agent protocol)
  examples/      synthetic demo project generator (ffmpeg) — no real footage
  docs/          ARCHITECTURE.md, PROTOCOL.md, INTEGRATION.md
```

```
 ┌──────────── browser (web/) ────────────┐        ┌──────── Claude Code session ────────┐
 │ player · region tool · timeline tracks │        │ editing skill (e.g. gbo-style)      │
 │ comment composer · status · threads    │        │  ├─ Monitor: `frameback watch --json`   │
 └──────┬─────────────────────▲───────────┘        │  ├─ or MCP: frameback_wait_for_events   │
   REST │                 SSE │                    │  └─ `frameback update <id> --status …`  │
 ┌──────▼─────────────────────┴───────────┐        └───────▲───────────────┬─────────────┘
 │ frameback server (src/server)              │  fs watch     │ NDJSON         │ CLI / MCP
 └──────┬─────────────────────────────────┘◄──────────────┼────────────────┘
        │ core store (atomic writes + lock + append-only events.ndjson)
 ┌──────▼──────────────────────────────────────────────────┐
 │ <video dir>/review/<stem>/ review.json · comments/*.json │
 │                           events.ndjson · snapshots/*.jpg│
 └──────────────────────────────────────────────────────────┘
```

**The filesystem is the bus.** Every writer (server, CLI, MCP) goes through `src/core/store.ts`. Readers that need
liveness tail `events.ndjson`. This keeps the protocol inspectable, diff-able, offline, and usable by any agent
(not only Claude Code) — see `PROTOCOL.md`.

## 5. Key design decisions

| # | Decision | Why |
|---|----------|-----|
| D1 | Files as the integration bus; MCP as a thin optional layer over the same store | Works with zero config; any agent can `cat` it; MCP can't push, files + `watch` can |
| D2 | One file per comment + append-only event log with monotonically increasing `seq` | Conflict-free concurrent writers (UI vs agent), resumable `watch --since` |
| D3 | Human fields vs agent fields split inside the comment | Each side only writes its own fields; no lost updates in practice; lock covers the rest |
| D4 | Times are always **seconds in the reviewed video** (output time). Source mapping is optional metadata | The reviewer only sees the output; the agent maps back via the timeline/EDL |
| D5 | Generic **timeline sidecar** (`<video>.timeline.json`) + built-in adapter for `edl.json` (video-use / gbo-style shape) | Frameback stays tool-agnostic; editing tools can emit the sidecar; existing EDLs work today |
| D6 | Frame snapshot (JPEG, region drawn) saved per comment, captured client-side via canvas | Agents can't watch video; a still with the region marked removes ambiguity cheaply |
| D7 | Review is per delivered file (`final_x_v1.mp4` → `review/final_x_v1/`); `carry` copies comments to the next version | Matches versioned deliverables; verification of fixes happens on the new version |
| D8 | Single package, `npx frameback open <video>` | Easiest to adopt and publish |
| D9 | Bind to 127.0.0.1, random-free fixed default port 4747 (`--port`), path traversal guarded | Local tool, safe defaults |

## 6. The incremental ("queue") workflow

Comment lifecycle (agent side) lets the agent work **during** the review:

1. Reviewer sends comment → `comment.created` event (+ snapshot).
2. Agent (watching) triages: is it **preparable now**? (find a replacement B-roll, recompute a cut point, rewrite a
   caption, re-transcribe a word, adjust the staging EDL) → `in_progress` → does the work against a **staging** edit
   description (never the delivered file) → `prepared` with a short `plan`/`reply`.
   Ambiguous? → `needs_info` with a question; the reviewer answers in the thread.
3. Reviewer presses **Process review** → `review.submitted`.
4. Agent finishes remaining items, renders **once** → new versioned file → marks comments `applied` (with
   `appliedIn`), sets review state `delivered` with `nextVideo`.
5. Reviewer opens the next version (UI offers it); carried comments show as "verify" → `verified` / `reopened`.

## 7. Work breakdown (lanes, built in parallel)

| Lane | Owns | Delivers |
|------|------|----------|
| L0 foundation (orchestrator) | `package.json`, tsconfig, `src/core/schema.ts`, `src/core/store.ts`, `docs/PROTOCOL.md` | The contract every lane codes against |
| L1 server + CLI | `src/server/**`, `src/cli/**`, `src/core/{timeline,edl,carry,export}*.ts` | `frameback open/watch/list/show/update/review/carry/export/timeline` |
| L2 web UI | `web/**` | Player, region tool, timeline tracks, composer, comments panel, live status, process button, version switch |
| L3 MCP | `src/mcp/**` | MCP stdio server with tools incl. long-poll `frameback_wait_for_events` |
| L4 agent kit + docs | `skills/**`, `examples/**`, `README.md`, `docs/INTEGRATION.md`, `e2e/**` | Generic skill, demo generator, README, Playwright e2e |

Then: integrate → reviewer agents (UX, correctness, protocol/agent-ergonomics, security & privacy, docs) → fix round.

## 8. Risks

- **Comment drift across versions** (times shift after re-cut) → v0.1 carries comments at the same time and flags
  them "verify"; agent may pass a time remap when carrying (`frameback carry --map`).
- **Codec support in the browser** (ProRes/HEVC) → document; H.264 MP4 deliverables are the norm.
- **EDL ↔ delivered file mismatch** → timeline is shown with the source file name and mtime; sidecar preferred.
