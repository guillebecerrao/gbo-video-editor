# Changelog

All notable changes are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/),
versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Changed

- Docs: install from npm (`npm install -g frameback` / `npx frameback`), badges.

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
