# Revisión estática, no publicada

> PR #1 «Docker support» (head `3d62d41`) y PR #2 «Optional webhook push for human events» (head `ef5b05e`) de
> filipop en `guillebecerrao/frameback`. 2026-11-12. Solo lectura: no se ejecutó código del PR, no se instalaron
> dependencias y no se escribió nada en GitHub. Se comparó contra nuestra 0.1.2 local (`frameback/`, aún no publicada).
> Las líneas citadas son las del head de cada PR, salvo que diga «0.1.2».

## Veredictos

| PR | Veredicto | Lo pedido en la primera revisión |
|----|-----------|----------------------------------|
| #1 Docker | **Aceptar**, y mergear **después** de publicar la 0.1.2 (el choque en `src/server/index.ts` lo resolvemos nosotros). Dos sugerencias no bloqueantes. | ✅ Aviso en stderr cuando el bind no es loopback (`src/server/index.ts:45-52`; avisa siempre, también dentro del contenedor). ✅ El `sleep 3` se reemplazó por un sondeo de `/api/health` con un límite de unos 30 s que además detecta si el servidor murió (`docker-entrypoint.sh:19-29`). |
| #2 Webhook | **Pedir cambios chicos** (3), luego aceptar. | ✅ `reviewDir` va relativo (`src/core/webhook.ts:46`) y un test lo prueba con `/videos/review/final_v1`. ⚠️ Pero relativo *a qué* queda ambiguo en el caso Docker con subcarpetas (hallazgo W1). |

## PR #1: hallazgos

**D1. El contenedor corre como root** (`Dockerfile:8-22`, no hay `USER`). Todo lo que escribe en `review/` dentro del
volumen montado queda con dueño root. En Linux, Hermes (en el host, fuera del contenedor) no puede escribir en esas
carpetas ni borrarlas, y en macOS con Docker Desktop no se nota. Además va contra el objetivo de Felipe, que es limitar el daño si algo sale mal.
Arreglo: `USER node` en la imagen, o `user: "${UID:-1000}:${GID:-1000}"` en el compose. *No bloqueante, pero muy
recomendado.*

**D2. `docker stop` no apaga Frameback limpio** (`Dockerfile:22`, `docker-entrypoint.sh:33`). tini le reenvía SIGTERM
solo al `sh`. El shell, que está en `wait`, termina sin avisarle a node, y node muere con SIGKILL a los 10 s, así que el
manejador de SIGTERM de `open.ts` nunca corre. Las escrituras atómicas lo amortiguan, pero un append a `events.ndjson`
puede quedar cortado. Arreglo de una línea: `ENTRYPOINT ["tini","-g","--","docker-entrypoint.sh"]`, o `trap` + `kill`.
*No bloqueante.*

**D3. El aviso de bind sale en cada arranque del contenedor**, donde es lo esperado. Cumple lo pedido, pero a un
usuario no técnico le aparece un «WARNING» que no le corresponde atender. Opcional: con `/.dockerenv` presente, mostrar
un mensaje informativo («inside a container; publish the port on 127.0.0.1 only»). *Nit de UX, no bloquea.*

**D4. La exposición de red está bien resuelta.** El compose publica `127.0.0.1:4747:4747` (`docker-compose.yml:11`),
el guard de Host/Origin sigue igual y README/SECURITY dicen la verdad: el guard frena el DNS rebinding, no a un
cliente que manda `Host: localhost` por su cuenta. Sin observaciones.

## PR #2: hallazgos

**W1. `reviewDir` relativo no alcanza para encontrar la revisión en el caso real** (`src/core/webhook.ts:46`). El
payload manda `review/<stem>` relativo a la carpeta del video, pero no dice cuál es esa carpeta. Con Docker, el
entrypoint registra videos hasta 3 niveles bajo `/videos` (`docker-entrypoint.sh:6`), así que Hermes recibe
`review/final_v1` y no puede saber si es `$VIDEOS/review/final_v1` o `$VIDEOS/cliente-a/review/final_v1`. Dos videos
con el mismo stem en carpetas distintas producen payloads idénticos. Arreglo simple y sin rutas absolutas: una variable
opcional `FRAMEBACK_WEBHOOK_ROOT` (en el compose, `/videos`). Con ella el campo pasa a ser relativo a esa raíz, p. ej.
`cliente-a/review/final_v1`. Sin la variable queda como está. **Bloqueante para el caso Docker + Hermes.**

**W2. `--webhook` se ignora en silencio si ya hay un servidor corriendo** (`src/cli/open.ts:69-70` y `:83-88`). El
flag solo modifica el `process.env` del proceso CLI. Si `open` se conecta a un servidor que ya existe (la rama
`found === "frameback"`), quien escribe los eventos es el otro proceso y el webhook nunca se activa. Tampoco hay aviso,
porque el mensaje «webhook push enabled» solo sale en la rama que levanta el servidor (`:110`). Arreglo mínimo: en la
rama de conexión, si vino `--webhook`, avisar en stderr «the running server was started without a webhook; restart
it with --webhook». **Bloqueante (barato).**

**W3. `fetch` sigue redirecciones** (`src/core/webhook.ts:59`, `redirect` por defecto `"follow"`). Ante un 307 o 308,
el POST firmado, con el texto de los mensajes, se reenvía a otro host. Como la URL la configura el operador, el riesgo
de SSRF es bajo, pero agregar `redirect: "error"` cuesta una palabra. **Bloqueante (trivial).**

**W4. Firma HMAC: el esquema es correcto, pero el receptor queda sin guía** (`src/core/webhook.ts:50-55`). Firma
`"<ts>.<body>"` con un timestamp en segundos y reutiliza los mismos headers en los reintentos (bien: un `x-request-id`
estable sirve para deduplicar). Falta decir en el README que el receptor debe (a) comparar en tiempo constante, (b)
rechazar timestamps de más de unos 5 min y (c) deduplicar por `x-request-id` o por `review`+`seq`. Sin secreto, cualquier proceso que
alcance el endpoint despierta al agente. En Linux, `host.docker.internal` (vía `host-gateway`) obliga a que Hermes
escuche en la interfaz docker0 o en 0.0.0.0, no en loopback, así que el secreto pasa de opcional a necesario.
Sugerencia: avisar en stderr si hay URL sin secreto y el host no es loopback. Además hay que **confirmar que Hermes
verifica exactamente `X-Webhook-Signature-V2` con este formato**; no lo pude comprobar desde aquí. *No bloqueante
(docs).*

**W5. Reintentos.** Hace 3 intentos con un timeout de 5 s y backoff de 0,5 s y 1 s, sin bloquear la UI, y los logs no
filtran la URL ni el secreto (solo el tipo de evento y el status; al arrancar imprime solo el origin; `:61,63`). Bien.
Detalle: también reintenta los 4xx (un 401 por firma mala se repite 3 veces). Sugerir no reintentar `4xx`. *Nit.*

**W6. Privacidad del payload** (`src/core/webhook.ts:47`). `data` va completo: en `thread.message` incluye `text`, es
decir, el texto que escribió el revisor (0.1.2 `store.ts:745-746`). En el caso real no sale de la máquina, pero el
README debería decir «the payload includes the text of your messages». No hay rutas absolutas en `data` para los
eventos por defecto.

**W7. Tests: prueban lo que dicen, con huecos** (`src/core/webhook.test.ts`). Los 6 tests son coherentes: off por
defecto, filtro de actor y de tipo, firma verificable, ruta relativa a partir de una absoluta y el disparo real desde
`submitReview`. Huecos: el test de reintento solo cubre un `fetch` rechazado, no un HTTP 500; nada verifica el tope de
3 intentos; no hay test del flag `--webhook` (W2). El test de firma recalcula con la misma fórmula, así que valida el
formato y no un vector externo (aceptable). *No bloqueante.*

**W8. Decisión de producto para Guillermo, no para Felipe.** El default `review.submitted,thread.message` despierta
al agente en cada respuesta humana de un hilo. En Hermes, cada despertar es una corrida con su costo. Alternativa:
dejar `review.submitted` como único default y `thread.message` como opt-in. Si Guillermo está conforme con el default
actual, no se pide nada.

## Conflictos previstos con la 0.1.2

1. **`src/server/index.ts`: conflicto textual seguro.** PR #1 cambia `app.listen(opts.port ?? 0, HOST)` y la 0.1.2
   reescribió `startServer` entera (0.1.2 `index.ts:75-138`, `listen(main, …, HOST)` en `:108`). Hay que portarlo a
   mano: el aviso más `listen(main, port, bind)`.
2. **`FRAMEBACK_BIND` frente a `--share`: choque de diseño.** Con `bind=0.0.0.0` y `--share`:
   - los listeners extra en IPs privadas al mismo puerto fallan con `EADDRINUSE`. 0.1.2 `index.ts:120-121` lo atrapa
     y solo avisa, así que `cfg.listen` queda con `127.0.0.1`.
   - toda petición que llega por otra dirección local recibe **403 «forbidden interface»** (0.1.2 `app.ts:126`).
   - dentro de Docker, el usuario del host llega desde la red del contenedor y no por loopback: no es
     `isTrustedLocal` (0.1.2 `share.ts:82`) y además choca con el 403. **Docker + `--share` queda roto**, y además
     contradice el invariante «never 0.0.0.0» (0.1.2 `index.ts:71`).

   Propuesta al portar: si `share` está activo y `FRAMEBACK_BIND` no es loopback, terminar con un error claro
   («`--share` doesn't work with FRAMEBACK_BIND; inside Docker use the published port»). Que conversen bien queda para
   después (era la pregunta abierta de BL-013).
3. **`src/core/store.ts`: conflicto chico.** El hook va en `appendEventLocked` (PR #2 `store.ts:201`), cuyo cuerpo la
   0.1.2 no tocó (0.1.2 `:189-203`). Lo más probable es que solo choque el bloque de imports (`createHash` y otros en
   0.1.2). Semántica: el hook dispara después del append y de `.seq`, y `submitReview` escribe `review.json` antes del
   evento (0.1.2 `:449-451`), así que el agente despertado ve un estado consistente. Bien.
4. **`review.video_adopted` no debería disparar el webhook por defecto.** Es `actor: "human"` (0.1.2 `store.ts:399`),
   pero sale de un `frameback open --force` en la terminal, no de feedback. Con el default de PR #2 no dispara (no está
   en la lista) y quien lo quiera lo agrega a `FRAMEBACK_WEBHOOK_EVENTS`. Sus datos (`size`, `mtimeMs`, `hash`) no
   traen rutas. Hay que documentarlo en el README al portar.
5. **Cursor persistido de `watch`.** Es complementario: el payload trae `seq`, así que el agente despertado puede leer
   con `frameback watch --since`/`--cursor` sin perder eventos si un POST falla. Vale la pena una línea en el README
   («the webhook is a wake-up; read the log with `watch --cursor` for the full state»).
6. **Docs.** README (los dos PRs insertan una sección después de la misma línea, la 81), CHANGELOG `[Unreleased]` y
   SECURITY.md (el bullet de «no outbound network», que la 0.1.2 también reescribe por `--share`): conflictos triviales
   pero seguros, también **entre #1 y #2**.
7. **Docker + webhook juntos:** PR #2 no toca el compose. Al combinarlos falta pasar `FRAMEBACK_WEBHOOK_*` (y
   `FRAMEBACK_WEBHOOK_ROOT=/videos` por W1) en `environment:`, y `extra_hosts: ["host.docker.internal:host-gateway"]`
   para Linux.

## Orden de merge recomendado

1. **Publicar la 0.1.2** en el repo público. Es nuestra y más grande; así no somos nosotros quienes rebaseamos sobre
   código externo.
2. **PR #1.** Ofrecerle a Felipe que **nosotros** resolvamos el conflicto de `index.ts`, porque el rediseño es nuestro,
   e incluir la regla de BIND + `--share` (conflicto 2). D1 y D2 si él quiere. Antes del merge, CI en GitHub (aislado) o
   typecheck + test + build + e2e en un entorno que no sea el Mac.
3. **PR #2**, rebaseado sobre #1, con W1–W3 y el bloque del compose (conflicto 7) para documentar el caso Docker +
   Hermes de punta a punta.

---

## Borrador de comentario: PR #1 (inglés)

> Thanks Felipe, this is exactly what I asked for: the bind warning is clear and the health poll is much better than the
> sleep. I'd like to merge it right after I publish 0.1.2, which rewrites `startServer` for `--share`, so it will
> conflict in `src/server/index.ts`. I'm happy to resolve that one myself since the rewrite is mine. When I port it I'll
> make `--share` refuse to start with a non-loopback `FRAMEBACK_BIND`, because inside the container the share listeners
> can't coexist with `0.0.0.0`.
>
> Two optional suggestions, both in the spirit of keeping the container contained:
> - Run as a non-root user (`USER node`, or `user: "${UID}:${GID}"` in compose). Otherwise on Linux the `review/` files
>   end up owned by root and an agent on the host can't write to them.
> - `tini -g` (or a `trap` in the entrypoint), so `docker stop` reaches the node process instead of only the shell and
>   Frameback shuts down cleanly.
>
> Thanks again!

## Borrador de comentario: PR #2 (inglés)

> Thanks for splitting this out and for explaining the Hermes use case. Waking the agent instantly instead of polling
> makes sense, and the design (off by default, human events only, signed, never blocks the UI) is right. Three small
> changes before merging:
>
> 1. **Make `reviewDir` findable.** `review/final_v1` is relative to a folder the receiver doesn't know. With Docker
>    scanning subfolders of `/videos`, two videos with the same name collide. An optional `FRAMEBACK_WEBHOOK_ROOT` (set
>    to `/videos` in compose) would let the payload say `client-a/review/final_v1`, still with no absolute paths.
> 2. **`--webhook` when attaching.** If a server is already running, `frameback open --webhook …` silently does nothing,
>    because the other process writes the events. A one-line stderr warning in that branch would save someone an
>    hour of debugging.
> 3. **`redirect: "error"`** on the `fetch`, so a signed body (with the reviewer's message text) is never re-posted to
>    another host.
>
> Nice to have: a few lines in the README for receivers (constant-time compare, reject old timestamps, dedupe by
> `x-request-id`), noting that the payload includes the message text. And once #1 is in, the compose env vars plus
> `extra_hosts: host.docker.internal:host-gateway` for Linux. I'll merge this after #1. Thanks!
