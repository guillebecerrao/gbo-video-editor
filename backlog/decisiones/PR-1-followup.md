# OBSOLETO — no publicar. Felipe ya separó el webhook (PR #2) y aplicó los ajustes.

---

Felipe, thanks for explaining the setup. I had it wrong, so here's my updated take.

**What I misunderstood.** I treated Docker as a "server" option and the webhook as a way to reach an agent on another
machine. Neither is the point:

- **Docker is about compartmentalization:** Frameback, Node, ffmpeg and every dependency live in a box, so a compromised
  package can't reach the rest of the machine. That's valuable for a public tool, and it's orthogonal to `--share`
  (reviewing from another computer), which is coming in 0.1.2.
- **The webhook is about timing, not distance:** Hermes runs on the same machine, outside the container, and wakes up
  on HTTP. Without a push it would need a cron that polls every few seconds. `frameback watch` covers agents that can
  keep a process running; the webhook covers event-driven ones. Both make sense.

So I'd like to merge **both parts in this PR** (no need to split it anymore), with two small changes:

1. **`reviewDir` in the payload.** Inside the container it arrives as `/videos/review/final_v1`, a path that doesn't
   exist on the host where Hermes runs. Please send it relative to the videos root (e.g. `review/final_v1`) plus the
   video's relative path, so the receiver can resolve it on its side. This also keeps absolute paths out of the payload.
2. **A warning for `FRAMEBACK_BIND` outside a container.** Inside Docker, `0.0.0.0` is fine because the compose file
   only publishes on loopback. On a bare machine it exposes an unauthenticated API to the LAN. A one-line stderr
   warning when the bind isn't loopback and `/.dockerenv` doesn't exist is enough.

The `sleep 3` in the entrypoint can stay for now.

**Heads-up on timing.** 0.1.2 is almost ready. It adds `open --share` (a keyed link to review from another computer),
a persisted cursor for `watch`, and a warning when a video changes under the same path. It touches
`src/server/index.ts`, `src/core/store.ts`, `src/cli/open.ts` and the README/SECURITY docs, so it will conflict with this
branch. Once it's published I'll ping you here so you can rebase on top of it. Sorry for the extra round, and thanks
again!
