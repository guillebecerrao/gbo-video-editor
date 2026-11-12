# Comentario del PR #1 — PUBLICADO el 2026-11-12 como «Request changes»

> BL-013 · revisar PR #1 externo. Versión 2 (2026-11-12), con el contexto de Guillermo: Felipe es amigo, el repo es
> público como parte del building in public y el caso real es revisar desde otro computador (BL-015). Revisión estática;
> el código del PR no se ejecutó.
> Para publicarlo: PR → Files changed → Review changes → pegar → «Request changes» → Submit.

---

Felipe, thanks a lot for this. It's the first outside contribution to Frameback, and a careful one: the defaults stay the
same, the compose file only publishes on loopback, the Host/Origin guard is untouched, and the webhook comes with tests.

Reading it made me rethink what Frameback is missing. My own setup is close to yours: the agent edits on one Mac and I
review from another one, on the same Wi‑Fi or over Tailscale. Today that doesn't work, with or without Docker, because
the server only accepts `localhost`. So that's what I'm building next:

```sh
frameback open final_v1.mp4 --share
# Open this on the other computer: http://studio-mac.local:4747/?r=final_v1&key=…
```

One command, one link with a per-session key. Anyone on the network without the link gets a 401, and localhost keeps
working as it does today. No Docker or config needed. I'd really value your eyes on it from a security angle when the PR
is up.

On this PR, here's where I'd like to land:

**Docker: yes, with one change.** It's a nice option for running Frameback on a server. `FRAMEBACK_BIND=0.0.0.0` makes
the unauthenticated API reachable from the LAN (the Host guard stops DNS rebinding, not a client that sends
`Host: localhost` itself). Could you print a clear warning on stderr whenever the bind address isn't loopback? Once
`--share` lands, the container can rely on its key instead. Minor: the `sleep 3` in the entrypoint races with server
start-up; polling `/api/health` would make it deterministic.

**Webhook: let's split it out and talk.** The implementation looks solid. I'm holding it back for two reasons:
- It's the first exception to "no network access" in the README and SECURITY.md, and the setup (URL, secret, event
  list) asks a lot of non-technical users. I want Frameback to stay one command for everyone, so I'd like to understand
  the use case first. What receives it on your side?
- The payload sends `reviewDir` as an absolute path from the user's machine. If it stays, it should be relative to the
  video, or dropped.

Could you move the webhook to its own PR? Then the Docker part can go in as soon as the warning is there. Thanks again!
