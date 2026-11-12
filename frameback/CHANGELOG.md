# Changelog

All notable changes are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/),
versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.2] - YYYY-MM-DD

### Added
- `frameback open <video> --share [tailscale]`: review from another computer over Tailscale or a private wifi/LAN. Whoever has the printed link can **review** (watch, comment, edit/delete comments and threads, submit, reopen) and nothing else.
  - The link carries a random per-process key; the first visit stores it in an HttpOnly, SameSite=Strict cookie (`Max-Age` = remaining TTL) and redirects to the URL without it. It expires after 12 h (`--share-ttl <hours>`, max 24): then other computers get 401 and a notice is printed on stderr, while localhost keeps working.
  - Other computers may only call an explicit allowlist of review routes; everything else (registering a video or any path, `video-info`, `/api/share`, `/api/health`…) is 403. They never see absolute paths (`reviewDir` is left out, error messages are redacted), and their responses are `Cache-Control: no-store`.
  - Only a direct localhost client (loopback socket, loopback `Host`, no `X-Forwarded-For`/`Forwarded`) skips the key, so a local reverse proxy such as `tailscale serve` cannot bypass it.
  - Listens on 127.0.0.1 plus this machine's private addresses (RFC 1918 and 100.64.0.0/10), never `0.0.0.0`; requests arriving on any other local address are refused. An address that disappears later does not stop the server.
  - `--share` prints the Tailscale links first (marked encrypted), then the local network ones (marked "trusted networks only"); `--share tailscale` shares only over Tailscale and fails clearly when Tailscale is not running.
  - 20 failed key attempts per minute from one address answer 429.
  - Without `--share` nothing changes. If a server is already running without `--share` (or with another network mode, or an expired link), `open --share` asks you to restart it; otherwise it prints that server's links.
- Video fingerprint (size, mtime, edge hash) saved when a review is opened. If the file is overwritten under the same name, the UI shows a persistent warning, `/api/reviews/:rid/video-status` reports it, and `frameback open` refuses with a `_v(N+1)` suggestion unless `--force` (recorded as `review.video_adopted`). Optional `video.fingerprint` in `review.json`; reviews without it adopt the current file silently.
- `frameback watch` resumes where it left off: it saves a per-review cursor (`.cursors/<name>.json`, written atomically) and replays only the events after it on restart; `--cursor <name>` keeps independent cursors.

### Changed
- Links point to the renamed gbo-video-method repository.
- Validation error texts (API 400 `error`, CLI and MCP messages) use zod 4 wording, e.g. `body: Invalid input: expected string, received undefined` instead of `body: Required`. The `path: message` format and what is accepted or rejected are unchanged.

### Security
- Upgrade zod to v4 (4.6.7) to fix GHSA-mrhx-c7xc-m3w5. The remaining advisories (vitest/vite/esbuild) are development-only and do not ship in the package.

## [0.1.1] - 2026-11-09

### Changed

- Docs: install from npm (`npm install -g frameback` / `npx frameback`), badges, and links to
  [gbo-video](https://github.com/guillebecerrao/gbo-video-method), the Claude Code editing skill that integrates Frameback.
- Discarding a typed comment with Esc no longer opens a native browser dialog: press Esc twice.
- The comment filters stay on one row (they scroll sideways on narrow panels).
- The top bar shows "Round N" only after a review was reopened, so a fresh version no longer reads "Round 1".

## [0.1.0] - 2026-11-09

First release.

### Added

- Local review UI: frame-accurate player, comments anchored to a point, a range, a region of the frame or a timeline
  entity (cut, transition, B-roll, caption, word), with a frame snapshot saved per comment.
- Timeline tracks from a `<video>.timeline.json` sidecar or from an `edl.json` plus word-level transcripts.
- File-based review protocol (`review/<stem>/`, schema version 1): one file per comment, append-only event log,
  human and agent fields, threads, soft delete, stale detection.
- Live two-way status: `acknowledged`, `in_progress`, `prepared`, `applied`, `needs_info`, `declined`.
- **Process review** flow and versioned deliverables: comments carry over to the next version for verification,
  remapped to the new cut through source time (exact, clamped or "this moment was cut").
- Resolved comments collapse into a group and are muted on the timeline.
- The reviewer can reopen the latest version if an agent closed or delivered it by mistake.
- CLI: `open`, `watch`, `list`, `show`, `update`, `reply`, `review`, `carry`, `export`, `timeline`, `mcp`,
  `skill install`.
- MCP stdio server with a long-poll `frameback_wait_for_events` tool.
- Claude Code skill `frameback-review`, integration guide, scripted example agent and an end-to-end smoke test.
