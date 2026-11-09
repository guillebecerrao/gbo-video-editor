# EP-001 · Frameback v0.1 — lane specs (acceptance criteria)

Product root: `frameback/` inside the repo. Read first: `frameback/docs/ARCHITECTURE.md`, `frameback/docs/PROTOCOL.md`,
`frameback/src/core/schema.ts`, `frameback/src/core/store.ts`, `frameback/src/core/api.ts`.

## Rules for every lane

- **Code and docs in English** (public open-source repo). No personal data, no absolute paths of this machine, no names
  of real people/clients/brands except the author byline "Guillermo Becerra (GBO)" in README/LICENSE (L4 only).
- **Never write review files directly**: always use `src/core/store.ts`. Don't change `schema.ts`/`store.ts`/`api.ts`
  semantics. If you need a *small additive* change there (a new helper, an optional field), make it, keep tests green,
  and list it in your report under "CONTRACT CHANGES".
- **Do not edit `package.json`/`package-lock.json`** unless strictly necessary; if you must add a dependency, report it
  under "DEPENDENCIES ADDED". All planned deps are installed (express, commander, zod, open, @modelcontextprotocol/sdk,
  react, vite, vitest, tsx, tsup).
- Stay inside your owned paths. Setup in your worktree: `cd frameback && npm install && node examples/make-demo.mjs`
  (ffmpeg is at `/opt/homebrew/opt/ffmpeg-full/bin`, prepend it to PATH).
- Done = `npm run typecheck` and `npm test` green + your lane's acceptance criteria verified by actually running it.
  Commit on your branch with clear messages (end each commit message with
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`). Do not merge into main.

---

## L1 · Server + CLI + timeline adapters, probe, export (BL-002)

Owns: `src/server/**`, `src/cli/**`, `src/core/timeline.ts`, `src/core/probe.ts`, `src/core/export.ts`, their tests.

1. `timeline.ts`
   - `resolveTimeline(video, {timelinePath, edlPath, videoDuration})`: explicit path → `<dir>/<stem>.timeline.json`
     sidecar (validate with `Timeline` schema, origin `sidecar`) → `<dir>/edl.json` (origin `edl`, `approximate: true`)
     → null. Return `FrozenTimeline` with `sourceFile`, `sourceMtime`, warnings: EDL mtime newer than video; derived
     duration differs from `videoDuration` by > 0.5 s; missing transcripts.
   - `edlToTimeline(edlPath)`: EDL shape documented in PROTOCOL §6 (also real example: `examples/demo/edit/edl.json`
     after running the demo generator). Output tracks (skip empty ones):
     - `cuts` (segments): one per range, id `range:<i>`, type `range`, label `"<BEAT> · <source> <start>–<end>"`,
       `source: {name,start,end}`, meta `{beat, punch}`. Output start = cumulative sum of `(end-start)`.
     - `transitions` (markers): one per boundary between consecutive ranges, id `cut:<i>` (i = index of the incoming
       range), type `transition`, label `"cut range:<i-1> → range:<i>"`; `meta.speakerChange: true` + label suffix
       `" · speaker change"` when the dominant `speaker_id` differs; `meta.gapBefore`/`gapAfter` = seconds of
       silence (from word timings) on each side inside the ranges — lets the reviewer spot "tight" speaker handoffs.
     - `motion` (segments): punch-ins mapped to output time (type `punch`).
     - `broll` (segments): from `broll[]` using `start_in_output`/`duration` (type `broll`, label `"<source> <src_start>s"`).
     - `captions` (segments): phrases built from transcript words inside each range (break on sentence punctuation or
       > 4 words), mapped to output time, type `caption`, label = text.
     - `speakers` (segments): contiguous output spans per `speaker_id` (type `speaker`).
     - `words` (segments): every `type:"word"` word inside the ranges, output time, type `word`, label = text,
       meta `{speaker}`. Word mapping: `out = rangeOutStart + (w.start - range.start)`, clipped to the range.
     Transcripts at `<edl dir>/transcripts/<source>.json`; missing → warning, tracks without words.
   - Tests with fixtures (create small JSON fixtures in `src/core/__fixtures__/`).
2. `probe.ts`: find ffprobe/ffmpeg via env `FFPROBE`/`FFMPEG`, PATH, then `/opt/homebrew/bin`, `/usr/local/bin`,
   `/opt/homebrew/opt/ffmpeg-full/bin`. `probeVideo` → `{duration,fps,width,height}` or null (never throws if missing).
   `computeWaveform(video, buckets)` via `ffmpeg -ac 1 -ar 8000 -f s16le -` → normalized peaks; null if no ffmpeg.
3. `export.ts`: `exportReview(dir, "md"|"json")`. Markdown: header (video, state, round, counts), then comments sorted by
   time, grouped "Needs action" (agent pending/acknowledged/in_progress/needs_info or stale) → "Prepared" → "Applied" →
   "Declined/Deleted". Each: `### c-0007 · 00:12.48–00:15.20 · must · framing/change`, body, region, entity label,
   transcript, absolute snapshot path, agent plan/reply, thread, `STALE` flag (use `isStale`).
4. Server (`src/server/`): express app per `src/core/api.ts` exactly. Registry `rid → {videoPath, reviewDir}`; on
   register: `probeVideo` → `resolveTimeline` → `openReview` (freeze timeline) → **auto-carry**: if the video stem ends
   in `_v<N>` and `<stem _v<N-1>>` has a review in the same `review/` dir and this review was just created, call
   `carryComments`. SSE per api.ts (poll events file ~250 ms, `since`, heartbeat). Range video streaming (`res.sendFile`
   is fine). JSON body limit 15 MB; decode `snapshotDataUrl`. Map `StoreError` codes → 404/409/400. Serve `dist/web`
   static + SPA fallback; if `dist/web` is missing, serve a small HTML page saying "run npm run build:web".
   Bind `127.0.0.1`. Validate ids (`/^c-\d{4,}$/`, rid in registry). Never serve unregistered paths.
   `GET /media/:rid/next`: registers `review.nextVideo` and redirects to `/?r=<newRid>`.
5. CLI (`src/cli/index.ts`, commander, `frameback --version`): commands per PROTOCOL §5 + §7:
   - `open <video> [--port 4747] [--no-open] [--edl p] [--timeline p] [--no-carry] [--dev]`: if the port answers
     `/api/health` with `app:"frameback"`, POST `/api/reviews` to register and open the browser at `/?r=<rid>`, then
     exit 0; if the port is taken by something else, try the next 10 ports. Prints `Frameback: http://127.0.0.1:<port>/?r=<rid>`
     and `Review dir: <abs>`. `--dev` = don't serve static (vite dev proxies to it).
   - `watch`, `list`, `show`, `update`, `reply`, `review` (state), `carry <fromVideo> <toVideo>`, `export`,
     `timeline <video|edl> [--json]` (prints resolved timeline), `mcp [--root dir]` (calls `startMcpServer` from
     `src/mcp/server.ts`, owned by L3 — do not edit that file), `skill install [--dest ~/.claude/skills]` (copies the
     package's `skills/frameback-review/` folder; L4 writes its content).
   - `watch` per PROTOCOL §7 exactly (wait for dir, replay since, `--tail`, `--json`/`--text`, `--exit-on`), flush per
     line, diagnostics on stderr, handles SIGINT.
   - Human-friendly errors (no stack traces) and `--json` on read commands.
6. Tests: timeline adapter, export, server API (start on an ephemeral port, create/patch/delete/thread/submit/reopen,
   SSE receives an event written by a separate `store` call), CLI `watch --exit-on` (spawn via tsx).
7. Verify manually: `npm run build && node dist/cli/index.js open examples/demo/edit/final_demo_v1.mp4 --no-open`, curl
   the API, `frameback watch … --text` shows a comment you POST.

## L2 · Web UI (BL-003)

Owns: `web/**` (React 18 + Vite + TypeScript; plain CSS, no UI framework; import types from `@core/api` and
`@core/schema`). Until L1 lands you may write a dev mock server in `web/dev/mock-server.mjs` that implements the needed
endpoints of `api.ts` with `src/core/store.ts` (run with tsx) and serves the demo video — keep it in the repo as a dev tool.

Design: dark, calm, editor-like, dense but legible; accessible contrast; keyboard-first. Layout: top bar (video name,
review state badge, round, counts, **Process review** button) · center player · right comments panel · bottom timeline.

1. **Player**: `<video>` from `bundle.videoUrl`; play/pause, ±1 frame (←/→, uses `review.video.fps` or 24 fallback;
   seek to frame center `(n+0.5)/fps`), ±1 s (Shift+←/→), J/K/L, speed 0.5/1/1.5/2, timecode `mm:ss.ff` + frame,
   mute. Use `requestVideoFrameCallback` `mediaTime` when available for the displayed/anchored time.
2. **Anchoring**:
   - Point in time: `C` or "Comment" button at the playhead.
   - Range: `I` / `O` set in/out (shown on the timeline), or drag on the timeline ruler.
   - Region: `R` toggles region tool; drag a rectangle on the video (normalized to the *encoded frame*, accounting for
     letterboxing/object-fit); a click without drag = point. Visible, adjustable overlay until submitted.
   - Entity: click a timeline item → selects it as anchor (entity + its time span); combinable with a region.
   - The composer shows a summary chip of the anchor (time/range, region, entity label, transcript excerpt of words in
     the span from the `words` track, if present).
3. **Composer**: category chips (all `CATEGORIES`, icons optional), action chips (optional), priority (must/should/nit,
   default should), textarea (Cmd/Ctrl+Enter sends, Esc cancels). On send: capture snapshot with canvas
   (`drawImage(video)` at native resolution, scaled to max 1280 px wide, draw the region rect/point in a high-contrast
   color, JPEG 0.85) and POST `CreateCommentRequest`. Pause video while composing. Composer locked (with explanation)
   when review state ≠ reviewing.
4. **Comments panel**: list sorted by time, filters (all / needs action / prepared / applied / needs info / mine to
   verify), each card: timecode (click = seek + show region overlay), category/priority, body, snapshot thumb, agent
   status badge (pending, acknowledged, in progress, prepared, applied, needs info, declined) + agent plan/reply,
   STALE badge when `seenRevision < revision`, "carried — verify" with Verified / Reopen buttons, thread with reply
   box (needs_info cards highlighted), edit (inline) and delete. Live updates through SSE
   (`/api/reviews/:rid/events?since=lastSeq`, refetch the comment on comment events; reconnect with backoff).
5. **Timeline** (bottom, resizable height): ruler with zoom (Ctrl/Cmd+wheel or slider) and horizontal scroll; playhead;
   in/out selection; comment markers (points + range bars colored by agent status); waveform lane if
   `/api/reviews/:rid/waveform` returns data; one lane per timeline track (`segments` as blocks with labels, `markers`
   as ticks; `transitions` with `meta.speakerChange` visually distinct). **Virtualize**: only render items intersecting
   the visible window (the `words` track can have tens of thousands of items); hide the words lane label text below a
   zoom threshold. If `review.timeline.approximate`, show a small "approximate (from EDL)" note and any warnings.
   If there is no timeline, show ruler + comments + waveform only.
6. **Process review**: confirmation dialog (in-app, not `window.confirm`) with counts and a warning if any comment is
   `needs_info` or has unanswered agent questions → POST submit. After submit: banner "Sent to agent — it is
   processing"; "Add more feedback" → reopen. When `review.state === "delivered"` and `bundle.next` exists, banner
   "New version ready → open" (link to `/media/:rid/next`).
7. **Version switcher**: dropdown of `bundle.versions` (link to open other registered rids if available).
8. Keyboard shortcut help overlay (`?`). Empty state explaining how to comment. Toasts for errors.
9. Typecheck clean (`tsc -p web/tsconfig.json`), `npm run build:web` OK; small unit tests for pure helpers
   (time formatting, region normalization with letterboxing, timeline virtualization window) under `web/src/**/*.test.ts`.
10. Verify by running against the mock (or L1 server if present) with the demo video, in a real browser if possible.

## L3 · MCP server (BL-004)

Owns: `src/mcp/**` (+ tests). Use `@modelcontextprotocol/sdk` (McpServer + StdioServerTransport, zod input schemas).

- `startMcpServer({root})` (keep the exported signature).
- Tools (all paths absolute or relative to `root`/cwd; `review` arg accepts a video path or review dir → `resolveReviewDir`):
  - `frameback_list_reviews {root?, maxDepth=4}` → finds `**/review/*/review.json` (skip node_modules/.git), returns id,
    dir, state, round, counts, lastSeq.
  - `frameback_get_review {review}` → review + counts + comments (compact) + lastSeq + timeline summary (track ids/counts).
  - `frameback_get_comment {review, id}` → full comment JSON as text **plus the snapshot as image content** (base64 jpeg).
  - `frameback_update_comment {review, id, status?, plan?, reply?, appliedIn?}` → updateCommentAgent.
  - `frameback_reply {review, id, text}` → addThreadMessage(author agent).
  - `frameback_set_review_state {review, state: processing|delivered|closed, nextVideo?}`.
  - `frameback_wait_for_events {review, sinceSeq=0, timeoutSec=60 (max 300), types?}` → polls `readEvents` every 250 ms;
    returns `{events, lastSeq, timedOut}`; waits for the review to exist.
  - `frameback_export {review, format=md}` → `exportReview` (implemented by L1; in your branch it may still throw —
    catch and return an error message).
- Server instructions string explaining the incremental workflow in 5 lines.
- Tests using the SDK's in-memory transport / Client: list, get, update, reply, wait (event written concurrently),
  get_comment returns image content.
- Never write to stdout except MCP protocol (log to stderr).

## L4 · Agent kit, docs, smoke test (BL-005)

Owns: `skills/**`, `README.md`, `docs/INTEGRATION.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `examples/README.md`,
`examples/fake-agent.mjs`, `scripts/smoke.mjs`, `.github/workflows/ci.yml`. (Do not edit `examples/make-demo.mjs`.)

1. `skills/frameback-review/SKILL.md` — a generic Claude Code skill (frontmatter `name`, `description` that triggers
   on "review with Frameback / feedback on the video / process my comments"). Content: when the agent delivers a
   video, start `npx frameback open <video>` (background) and announce the URL; start `frameback watch <video> --json`
   with the **Monitor** tool (one notification per event; fallback: background Bash with `--exit-on review.submitted`,
   or MCP `frameback_wait_for_events`). Triage loop per event (read snapshot image!, classify *preparable now* vs
   *needs final render* vs *ambiguous → needs_info + thread question*), update statuses with `frameback update`,
   keep a **staging plan** file (`<review dir>/agent-plan.md`) and a staging copy of the edit description (never
   touch the delivered file), handle `comment.updated` (stale → re-plan), `comment.deleted` (undo), `thread.message`.
   On `review.submitted`: `frameback review --state processing`, finish remaining, render ONCE to the next versioned
   file, mark `applied --applied-in <stem>`, `frameback review --state delivered --next-video <path>`, then
   `frameback open <next>` (comments carry over automatically for verification). Rules: never edit human fields;
   batch renders; prefer cheap previews; keep replies short. Include an "If Frameback is not installed" note: the
   skill is optional; the editing workflow must continue with its normal checkpoints.
   Also `skills/frameback-review/reference.md` with the CLI cheat sheet and event → action table.
2. `README.md` (brandable, concise, great first impression): name + tagline ("Frame-accurate feedback for AI video
   editing"), the problem (agentic editing lost the shared visual context; serial feedback), how it works (diagram
   from ARCHITECTURE), 60-second quickstart (`npx frameback open video.mp4`, demo: `npm run demo`), anchoring types,
   the agent loop (Claude Code Monitor + skill; MCP config: `claude mcp add frameback -- npx -y frameback mcp`),
   protocol pointer, integrations (any EDL-based pipeline; timeline sidecar; video-use / gbo-style style `edl.json`),
   keyboard shortcuts, privacy (100% local, binds 127.0.0.1, no telemetry), roadmap, license. Byline:
   "Created by **Guillermo Becerra (GBO)** as a companion to his agentic editing workflow." (no links/handles —
   leave a `<!-- TODO: add links -->`). Generate the CLI reference table at the end from the docs (L1 implements it).
3. `docs/INTEGRATION.md`: for tool builders — emitting the timeline sidecar (spec + minimal Python and JS snippets
   that convert an EDL), consuming the protocol from any agent (plain files, CLI, MCP), recommended agent etiquette,
   making the integration optional (detect `command -v frameback || npx --no-install frameback --version`).
4. `examples/fake-agent.mjs`: a scripted stand-in agent for demos and tests — uses the CLI (`node dist/cli/index.js`)
   to `watch --json`; on `comment.created` waits 1 s → `acknowledged`, 2 s → `in_progress`, 2 s → `prepared` with a
   canned plan; if the body contains "?" → `needs_info` + a thread question; on `review.submitted` → processing, marks
   prepared ones `applied` (appliedIn = next stem), copies the video to `<stem with _v(N+1)>.mp4`, sets `delivered`
   with `--next-video`. Document in `examples/README.md`.
5. `scripts/smoke.mjs` (`npm run smoke` — report the script line to add under DEPENDENCIES/CONTRACT notes, don't edit
   package.json): end-to-end without a browser — make demo (if missing), start `dist/cli/index.js open … --no-open
   --port <free>`, POST a comment with a tiny data-URL snapshot, assert `watch --json --exit-on review.submitted`
   receives `comment.created` then `review.submitted`, `update` agent status via CLI and see it via the API, carry to a
   copied `_v2` file by opening it, assert the carried comment, print PASS/FAIL. Must exit non-zero on failure.
6. `.github/workflows/ci.yml`: node 20/22, install, typecheck, test, build (ffmpeg via apt for smoke).
7. `CONTRIBUTING.md`, `CHANGELOG.md` (0.1.0).

## L5 · gbo-style optional integration (BL-006) — done by the orchestrator (touches the owner's private skill)

- New section in gbo-style SKILL.md: "Revisión con Frameback (opcional)" — detection, launch after each delivered
  preview/final, watch via Monitor, triage per comment against the staging `edl.next.json`, render once on submit,
  versioning rules unchanged. Explicit: if Frameback is not available, the standard checkpoints apply unchanged.
- `gbo_render.py`: emit `<output stem>.timeline.json` sidecar (output-time tracks: cuts, transitions with speaker
  change, broll, punch, captions from the chunks it already builds) — additive, no behavior change.
