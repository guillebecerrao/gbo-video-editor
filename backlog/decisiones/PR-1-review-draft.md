# Borrador — revisión del PR #1 (no publicado; lo publica Guillermo)

> BL-013 · revisar PR #1 externo. Revisión estática del diff, hecha el 2026-11-12. **No se ejecutó el código del PR:** correr
> código de terceros en esta máquina necesita tu visto bueno. Antes de mergear, alguien tiene que correr typecheck + test
> + build + smoke en la rama del PR (el fork no tiene CI).

---

Thanks a lot for this, @filipop — it's a careful PR: the defaults don't change, the compose file publishes loopback
only, the Host/Origin guard is untouched, and the webhook has tests. I'd like to take it, with a few changes, and as two
separate PRs.

**1. Docker (happy to merge with one change)**

- `FRAMEBACK_BIND`: the Host/Origin guard protects against DNS rebinding, but not against a client on the LAN, which can
  simply send `Host: localhost`. If someone sets `FRAMEBACK_BIND=0.0.0.0` outside Docker, the unauthenticated API is
  reachable from the network with no warning. Could you print a clear warning on stderr whenever the bind address is not
  loopback (e.g. "Frameback has no authentication; listening on 0.0.0.0 exposes it to your network")? The image can keep
  setting it, since the compose file publishes `127.0.0.1` only.
- Minor: the `sleep 3` in `docker-entrypoint.sh` races with server start-up on slow machines. Polling `/api/health`
  until it answers (with a timeout) would make registering the remaining videos deterministic.

**2. Webhook push (please split it into its own PR)**

The implementation looks solid (off by default, HMAC with timestamp, human events only, fire and forget). Two things
before I can consider it:

- The payload includes `reviewDir` as an absolute path on the user's machine, sent to an external service. Please make
  it relative to the video (or drop it and let the receiver resolve it from `review`).
- It's the first exception to the "no network access" promise in the README and SECURITY.md. I need to decide whether
  Frameback takes that on, so I'd rather review it on its own, without blocking Docker.

Thanks again — Docker support is a great addition.
