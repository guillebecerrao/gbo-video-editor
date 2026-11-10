# Frameback

[![npm](https://img.shields.io/npm/v/frameback)](https://www.npmjs.com/package/frameback) [![CI](https://github.com/guillebecerrao/frameback/actions/workflows/ci.yml/badge.svg)](https://github.com/guillebecerrao/frameback/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Frame-accurate feedback for AI video editing.**

Open the video your AI agent delivered, click on the exact frame, drag a region, select a range or a timeline item,
and write what you want changed. Your agent sees it the moment you send it, prepares the changes while you keep
reviewing, and renders the next version once. 100% local, open source, no accounts.

Created by **Guillermo Becerra (GBO)** · [@guillebecerrao](https://github.com/guillebecerrao) · as the review companion of
[gbo-video](https://github.com/guillebecerrao/gbo-video), his open-source agentic video editing skill.
[Source](https://github.com/guillebecerrao/frameback) · [Issues](https://github.com/guillebecerrao/frameback/issues) · [Security](SECURITY.md)

## The problem

When an LLM edits video (ffmpeg, Remotion, an EDL), the editing UI disappears, and with it the shared visual context.
Feedback turns into "around 12 seconds, the image on the left looks off", which is slow and ambiguous. It is also
serial: the agent sits idle until you finish watching the whole thing.

Frameback restores the context and removes the wait:

- every comment is anchored to a frame, a region, a time range, or a cut / transition / B-roll / caption / word;
- every comment carries a **snapshot** of the frame with your region drawn on it, so the agent can *see* what you meant;
- every comment is written to disk immediately and streamed to the agent, which works **during** your review;
- the agent replies, asks questions, and reports status (`acknowledged → in progress → prepared → applied`) live.

## How it works

```
 ┌──────────── browser ───────────────────┐        ┌──────── your agent session ─────────┐
 │ player · region tool · timeline tracks │        │ editing skill                       │
 │ comment composer · status · threads    │        │  ├─ watches `frameback watch --json`│
 └──────┬─────────────────────▲───────────┘        │  ├─ or MCP: wait_for_events         │
   REST │                 SSE │                    │  └─ `frameback update <id> …`       │
 ┌──────▼─────────────────────┴───────────┐        └───────▲───────────────┬─────────────┘
 │ frameback server (127.0.0.1)           │◄───────────────┘               │ CLI / MCP
 └──────┬─────────────────────────────────┘  filesystem events (NDJSON)    │
 ┌──────▼──────────────────────────────────────────────────┐◄──────────────┘
 │ <video dir>/review/<stem>/  review.json · comments/*.json│
 │                              events.ndjson · snapshots/  │
 └──────────────────────────────────────────────────────────┘
```

The filesystem is the bus. Any agent that can read a folder can take part; the CLI and the MCP server are
conveniences over the same files. See [`docs/PROTOCOL.md`](docs/PROTOCOL.md).

## Quickstart (60 seconds)

Requires Node 20+. ffmpeg is optional (waveform and video probing); the demo generator needs it.

Install the `frameback` command globally (it is what the agent skill calls from inside your video project):

```sh
npm install -g frameback      # `frameback --version` should now work anywhere
```

Then, from your video's folder:

```sh
frameback open video.mp4      # or, without installing: npx frameback open video.mp4
```

The UI opens in your browser. Press `C` to comment at the playhead. Nothing else to configure.

To hack on Frameback itself, install from a clone instead:

```sh
git clone https://github.com/guillebecerrao/frameback.git
cd frameback
npm install && npm link
```

Try it with synthetic demo footage, from a clone (needs ffmpeg and ffprobe):

```sh
npm run demo        # builds if needed, generates the demo once, opens the review UI on port 4747
node examples/fake-agent.mjs examples/demo/edit/final_demo_v1.mp4   # in another terminal: a scripted agent
```

The URL is printed on start. To use another port: `node dist/cli/index.js open examples/demo/edit/final_demo_v1.mp4 --port 4880`.
<!-- Screenshot / GIF of the review UI: add docs/media/frameback.gif and embed it here before announcing. -->

## Ways to anchor a comment

| Anchor | How |
|--------|-----|
| **Point in time** | `C`, or the Comment button, at the playhead |
| **Time range** | `I` / `O` to mark in and out, or drag on the timeline ruler |
| **Region** | `R`, then drag a rectangle on the video (or click for a point). Normalized to the encoded frame, letterbox excluded |
| **Timeline entity** | Click a cut, transition, B-roll, caption or word on the timeline; combine it with a region |

Each comment also has a category (cut, transition, framing, color, motion, audio, caption, b-roll, element, pacing,
other), an optional action (remove, change, add, move, keep, question) and a priority (must, should, nit).

## Use with Claude Code

1. Install the skill (and optionally the MCP server), see below.
2. Ask your agent: *"deliver the video and open it in Frameback"* or *"review this with Frameback"*.
3. Comment in the browser while you watch. The skill starts the Monitor tool itself, so you do not set anything
   up; press **Process review** when you are done and the agent renders the next version.

## The agent loop

1. The agent delivers a video and runs `frameback open <video>`.
2. It listens: **Claude Code** runs `frameback watch <video> --json --actor human,system` with the Monitor tool (one notification per
   comment), or a background task with `--exit-on review.submitted`.
3. For each comment it looks at the snapshot, then acknowledges, prepares a change against a *staging* edit, or asks a
   question in the thread. You see statuses and replies update live.
4. You press **Process review**. The agent finishes what is left, renders **once** to `…_v2.mp4`, marks comments
   `applied`, and opens the new version. Your previous comments come along as "verify" items. The agent then stops
   its old watch and starts a new `frameback watch <next video> --json`, so your `reopened` comments reach it.

Install the ready-made Claude Code skill and, if you prefer tools over a shell, the MCP server:

```sh
frameback skill install                          # copies skills/frameback-review to ~/.claude/skills
claude mcp add frameback -- frameback mcp
# not on PATH? use the clone directly:
claude mcp add frameback -- node /absolute/path/to/frameback/dist/cli/index.js mcp
```

Editing with [gbo-video](https://github.com/guillebecerrao/gbo-video)? It already includes this loop; you only need
the `frameback` command on your PATH.

Not using Claude Code? Point any agent at [`docs/INTEGRATION.md`](docs/INTEGRATION.md) (plain files, CLI, or MCP).
[`examples/fake-agent.mjs`](examples/fake-agent.mjs) is a small scripted agent that shows the whole loop.

## Integrations

- **Any EDL-based pipeline.** If an `edl.json` sits next to the video (`sources`, `ranges`, `broll`, word-level
  transcripts), Frameback derives cuts, transitions, B-roll, captions and words tracks from it. The shape is the
  `video-use` `edl.json` shape, described in [`docs/PROTOCOL.md`](docs/PROTOCOL.md) §6.
- **[gbo-video](https://github.com/guillebecerrao/gbo-video).** The Claude Code video editing skill writes the
  timeline sidecar on every render and runs the Frameback review loop out of the box (optional: it works without it).
- **Timeline sidecar.** Emit `<video stem>.timeline.json` for an exact timeline. Spec and converters in
  [`docs/INTEGRATION.md`](docs/INTEGRATION.md).
- **Versioned deliverables.** `final_v1.mp4` → `final_v2.mp4`: comments are carried to the new version for verification.

## Keyboard shortcuts

| Key | Action | Key | Action |
|-----|--------|-----|--------|
| `Space` | Play / pause | `C` | Comment at playhead |
| `←` / `→` | Previous / next frame | `I` / `O` | Set in / out |
| `Shift` + `←` / `→` | Back / forward 1 s | `R` | Region tool |
| `J` / `K` / `L` | Shuttle back / pause / forward | `Ctrl/Cmd` + `Enter` | Send comment |
| `?` | Shortcut help | `Esc` | Cancel |

## Privacy

Everything runs on your machine. The server binds to `127.0.0.1`, serves only the videos you opened, and the review
data lives in a `review/` folder next to each video. There is no telemetry, no account, and no network access.

## Roadmap

- Remapping of non-cut anchors (B-roll, captions) beyond the primary cuts track, and a manual `--map` override for `carry`
- Side-by-side comparison of two versions
- Audio-only and multi-track review
- Importers for more NLE formats (FCPXML, OTIO)

## Author

Frameback is built by **Guillermo Becerra (GBO)**, **@guillebecerrao** everywhere:
[GitHub](https://github.com/guillebecerrao) ·
[YouTube](https://www.youtube.com/@guillebecerrao) ·
[X](https://x.com/guillebecerrao) ·
[Instagram](https://www.instagram.com/guillebecerrao) ·
[Facebook](https://www.facebook.com/guillebecerrao) ·
[Builderia](https://builderia.lat)

Contact: [hello@guillebecerrao.cl](mailto:hello@guillebecerrao.cl)

Frameback was built overnight by a team of AI agents with the P60 product framework. The whole build log (backlog,
decisions, reviews, lessons learned) is public: [guillebecerrao/gbo-video-editor](https://github.com/guillebecerrao/gbo-video-editor).

## License

[MIT](LICENSE). Contributions welcome: see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## CLI reference

Run `frameback <command> --help` for every option. Targets (`<target>`) are a video path, a review folder or a
`review.json`.

| Command | Purpose |
|---------|---------|
| `open <video> [--port] [--no-open] [--edl] [--timeline] [--no-carry]` | Start the UI (or register the video on a running instance) |
| `watch <target> [--since n] [--tail] [--json\|--text] [--exit-on type]` | Stream review events, one per line |
| `list <target> [--agent-status …] [--json]` | List comments; `--json` returns `{lastSeq, review, comments}` |
| `show <target> <id> [--json]` | Show one comment |
| `update <target> <id> --status s [--plan] [--reply] [--applied-in] [--seen-revision n] [--json]` | Set agent status, plan and reply |
| `reply <target> <id> "<message>"` | Add an agent message to a comment thread |
| `review <target> --state processing\|delivered\|closed [--next-video p]` | Move the review state |
| `carry <fromVideo> <toVideo>` | Copy comments to the next version for verification; times are remapped through source time using both versions' cuts (`carriedFrom.remap`: `exact`, `clamped` or `lost`) |
| `export <target> [--format md\|json]` | Feedback summary for the agent |
| `timeline <video\|edl> [--json]` | Print the resolved timeline |
| `mcp [--root dir]` | Run the MCP server on stdio |
| `skill install [--dest dir]` | Install the Claude Code skill |
