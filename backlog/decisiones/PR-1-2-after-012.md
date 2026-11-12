# Para publicar después de 0.1.2

> Comentarios para Felipe en `guillebecerrao/frameback`, PR #1 (Docker) y PR #2 (webhook). Publicar solo cuando
> 0.1.2 esté en `main` del repo público y en npm. Base: `backlog/decisiones/PR-1-2-revision.md`.

## PR #1 (Docker)

> Hi Felipe, 0.1.2 is out (on `main` and on npm). It rewrites `startServer` in `src/server/index.ts` for the new
> `--share` mode, so this PR now conflicts there. Could you rebase onto `main`? After that it's ready to merge.
> If the `index.ts` conflict is a pain, just leave it as is and I'll resolve it myself, since the rewrite is mine.
> Either way I'll handle the clash between `FRAMEBACK_BIND` and `--share` on my side: `--share` will refuse to start
> with a non-loopback bind, because its listeners can't coexist with `0.0.0.0` inside the container.
> The two earlier suggestions (non-root user, `tini -g`) are still optional. Thanks!

## PR #2 (webhook)

> Hi Felipe, 0.1.2 is out, so could you rebase this onto `main` (ideally after #1 lands)? Before merging, the same
> three small changes as in my earlier review:
>
> 1. **Make `reviewDir` findable:** an optional `FRAMEBACK_WEBHOOK_ROOT` (e.g. `/videos` in compose) so the payload
>    says `client-a/review/final_v1` instead of an ambiguous `review/final_v1`. Still no absolute paths.
> 2. **Warn when `--webhook` attaches to a running server:** a one-line stderr notice, since the other process writes
>    the events and the flag silently does nothing.
> 3. **`redirect: "error"`** on the `fetch`, so the signed body (with the reviewer's text) is never re-posted elsewhere.
>
> Heads-up: 0.1.2 adds a `review.video_adopted` event with `actor: "human"`. It comes from `frameback open --force`,
> not from feedback, so please keep it out of the default event list. Thanks!
