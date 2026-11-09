# Frameback quick reference

`<target>` is a video path, a review dir (`<video dir>/review/<stem>`) or a `review.json` path.
If `frameback` is not on PATH, use the clone: `npm install && npm run build && npm link` in the Frameback repo, or
`node /abs/path/frameback/dist/cli/index.js …`. Read commands accept `--json`.

## CLI cheat sheet

| Goal | Command |
|------|---------|
| Open the UI for a video (registers on an already running instance) | `frameback open <video> [--port 4747] [--no-open] [--edl p] [--timeline p] [--no-carry]` |
| Stream events (one per line) | `frameback watch <target> --json [--since <seq>] [--tail] [--exit-on review.submitted]` |
| Same, human readable | `frameback watch <target> --text` |
| List comments and resume point | `frameback list <target> --json [--agent-status pending,needs_info]` (returns `{lastSeq, review, comments}`) |
| One comment (with snapshot path) | `frameback show <target> <id> --json` |
| Change agent status / plan / reply | `frameback update <target> <id> --status <s> [--plan "…"] [--reply "…"] [--applied-in <stem>] [--seen-revision <n>] [--json]` |
| Ask or answer in the thread | `frameback reply <target> <id> "<message>"` |
| Review state | `frameback review <target> --state processing\|delivered\|closed [--next-video <path>]` |
| Carry comments to a new version | `frameback carry <fromVideo> <toVideo>` (done automatically by `open` for `_vN` files) |
| Summary for the agent | `frameback export <target> --format md\|json` |
| Timeline the UI shows | `frameback timeline <video\|edl> --json` |
| MCP server | `frameback mcp [--root dir]` |
| Install this skill | `frameback skill install [--dest ~/.claude/skills]` |

Agent statuses: `pending`, `acknowledged`, `in_progress`, `prepared`, `applied`, `needs_info`, `declined`.
Human statuses: `open`, `reopened`, `verified`, `resolved_by_human`, `deleted`.
Review states: `reviewing` -> `submitted` -> `processing` -> `delivered` -> `closed` (reopen returns to `reviewing`, round + 1).
Categories: cut, transition, framing, color, motion, audio, caption, broll, element, pacing, other.
Priorities: must, should, nit.

A plan-only `update` does not clear STALE: only a status change or `--seen-revision <n>` marks the new revision as seen.

## Event -> action

| Event (`type`) | Actor | What you do |
|----------------|-------|-------------|
| `review.opened` | system | Nothing. |
| `comment.created` | human | Read + view snapshot, classify, `acknowledged`, work, `prepared` (or `needs_info` + question). |
| `comment.carried` | system | Nothing. It is a "verify" item; never redo the work. |
| `comment.updated` | human | Stale if `revision` > `agent.seenRevision`: re-plan, redo staging edit. |
| `comment.deleted` | human | Undo staged edit, drop from `agent-plan.md`, then `update --status declined --reply "undone"`. |
| `comment.human_status` | human | `reopened`: treat as new. Others: nothing. |
| `thread.message` | human / agent | Human message: re-read comment, resume if `needs_info`. Your own: ignore. |
| `comment.agent_status` | agent | Echo of your own update. Ignore. |
| `review.submitted` | human | `--state processing`, finish, render once, `applied`, `--state delivered --next-video`, open next, then stop the old watch and watch the next video. |
| `review.state` (`reopened: true`) | human | More feedback incoming: back to triage. |

Event envelope: `{"seq":12,"at":"…","type":"comment.created","review":"<stem>","commentId":"c-0007","actor":"human","data":{…}}`.
`data` of comment events carries `time`, `region`, `entity`, `category`, `action`, `priority`, `body`, `snapshot`, `revision`.

## Files

```
<video dir>/review/<stem>/
  review.json  comments/<id>.json  snapshots/<id>.jpg  events.ndjson  timeline.json
  agent-plan.md          # yours: staging plan, one line per comment
```
