# Contributing

Thanks for helping. Frameback is a small TypeScript project; the contract between its parts is written down, so most
changes are easy to place.

## Setup

```sh
npm install
npm run build
npm run demo:make        # needs ffmpeg; generates synthetic footage in examples/demo/
```

Node 20 or newer. ffmpeg is only required for the demo, the waveform and the smoke test.

## Layout

| Path | What |
|------|------|
| `src/core/` | schema (zod), file store, timeline adapters, export. **The contract.** |
| `src/server/` | HTTP API, SSE, video streaming |
| `src/cli/` | the `frameback` command |
| `src/mcp/` | MCP stdio server |
| `web/` | React + Vite UI |
| `skills/` | Claude Code skill for the agent loop |
| `docs/` | `ARCHITECTURE.md`, `PROTOCOL.md`, `INTEGRATION.md` |
| `examples/`, `scripts/` | demo generator, scripted agent, smoke test |

## Ground rules

- **Plain files are the protocol.** Write review data only through `src/core/store.ts` (locking, atomic writes, event
  log). Never hand-edit files in `review/`.
- **Contract changes** (`schema.ts`, `store.ts`, `api.ts`, `docs/PROTOCOL.md`) need to be additive and documented in
  the protocol doc. Keep `schema.ts` and `PROTOCOL.md` in sync.
- Times are seconds in the reviewed video. Regions are normalized to the encoded frame.
- Local only: bind `127.0.0.1`, no telemetry, no network calls, no serving unregistered paths.
- Code, comments and docs in English. No personal data, real footage or real client names in fixtures.

## Before you open a pull request

```sh
npm run typecheck
npm test
npm run build
npm run smoke            # end-to-end, no browser
```

Add tests for behavior changes (vitest, next to the code as `*.test.ts`). Keep commits focused, with messages in the
imperative ("Add range export"). If you change the protocol or the CLI, update `docs/` and `CHANGELOG.md`.

## Reporting bugs

Include the Frameback version, Node version, the video codec, and, if relevant, the contents of
`review/<stem>/events.ndjson` (remove anything private first).
