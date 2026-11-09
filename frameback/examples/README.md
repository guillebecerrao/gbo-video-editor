# Examples

## Demo project (`make-demo.mjs`)

Generates synthetic footage (no real people or brands) with ffmpeg: three sources, an `edl.json`, word-level
transcripts and a rendered `final_demo_v1.mp4` (about 33 s).

```sh
node examples/make-demo.mjs        # needs ffmpeg and ffprobe on PATH
node dist/cli/index.js open examples/demo/edit/final_demo_v1.mp4
```

The generated files live in `examples/demo/` and are git-ignored.

## Scripted agent (`fake-agent.mjs`)

A stand-in for an editing agent. It uses the same CLI a real agent would, so it is a compact reference for the
protocol and a handy way to see the UI react live.

```sh
npm run build
node dist/cli/index.js open examples/demo/edit/final_demo_v1.mp4        # terminal 1
node examples/fake-agent.mjs examples/demo/edit/final_demo_v1.mp4       # terminal 2
```

What it does:

| Event | Reaction |
|-------|----------|
| `comment.created` | after 1 s `acknowledged`, 2 s later `in_progress`, 2 s later `prepared` with a canned plan |
| `comment.created` with `?` in the body | `acknowledged`, a thread question, then `needs_info` |
| `review.submitted` | `processing`, `prepared` comments become `applied`, the video is copied to `…_v2.mp4`, state `delivered` with `--next-video` |

Options: `--delay <ms>` scales the step timing (default 1000), `--cli <path>` or `FRAMEBACK_CLI` points at another CLI
entry. Progress is logged to stderr.

After delivery, open `final_demo_v2.mp4` in the UI (or via the "new version ready" banner): the first round's comments
appear as "verify" items.

## Smoke test

`npm run smoke` runs the whole loop without a browser (see `scripts/smoke.mjs`).
