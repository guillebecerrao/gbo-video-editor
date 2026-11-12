---
id: BL-015
titulo: "Revisar desde otro computador (wifi o Tailscale) con un link seguro"
tipo: historia
via: evidencia
acepta: "Guillermo"
padre: EP-001
estado: en-validacion
creado: 2026-11-12
actualizado: 2026-11-12
valor: {estrategico: null, urgencia: null, habilita: null}
tamano: null          # XS | S | M | L
riesgo: null          # bajo | medio | alto
puntaje: null
toca: ["frameback/src/server/app.ts", "frameback/src/server/index.ts", "frameback/src/cli/open.ts", "frameback/src/cli/index.ts", "frameback/skills/frameback-review/SKILL.md"]              # rutas o áreas reales del repo, entre comillas si llevan corchetes o paréntesis
depende_de: []
asignacion: {carril: "1", agente: "bl015-share", worktree: "../gbo-video-editor-share-link", rama: "feat/share-link"}
lote: 0.1.2
trazabilidad: {objetivo: null, origen: "pedido de Guillermo 2026-11-12: edita en un MacBook y revisa desde otro", evidencia: [], spec: null}   # objetivo: nodo OST u objetivo; spec: Iteration PRD (ciclo completo)
retrabajos: 2
prs: []
release: null
resultado: {senal: "Guillermo revisa sus ediciones desde el otro MacBook sin pasos técnicos", revisar: null, observado: null, experimento: null}   # experimento: EXP-NN (ciclo completo)
historial:
  - {estado: propuesto, fecha: 2026-11-12T14:22}
  - {estado: aprobado, fecha: 2026-11-12T14:25, por: "Guillermo (dueño de gbo-video, antes gbo-style)"}
  - {estado: en-curso, fecha: 2026-11-12T14:25}
  - {estado: en-revision, fecha: 2026-11-12T14:31}
  - {estado: en-validacion, fecha: 2026-11-12T14:31}
---

## Problema / intención

## Resultado esperado

## Criterios de aceptación

- [ ]

## Seguridad del modo share (retrabajo 2026-11-12, antes de cualquier push)

Principio: quien tiene el link puede **revisar** (ver, comentar, enviar la revisión) y nada más. Todo lo demás es solo del Mac propio.

| # | Brecha | Solución |
|---|---|---|
| S1 | **Lectura de archivos arbitrarios:** con el link, `POST /api/reviews` registra cualquier ruta del disco y `/media/:rid/video` la sirve | Rutas administrativas **solo loopback** (registrar videos, `video-info`, `/api/share`, todo lo que reciba rutas o cambie el servidor). La lista de rutas remotas es explícita (allowlist): lo no listado → 403 para remotos |
| S2 | **Bypass por proxy local** (p. ej. `tailscale serve`, reverse proxy): llega desde 127.0.0.1 y no pide clave | Sin clave solo si el socket es loopback **y** el Host es loopback (`localhost`/`127.0.0.1`/`[::1]`) **y** no hay `X-Forwarded-For`/`Forwarded`. En cualquier otro caso, clave |
| S3 | **Escucha en 0.0.0.0** (todas las interfaces, incluida una pública si existiera) | Escuchar solo en loopback + IPs privadas de LAN (RFC1918) + Tailscale (100.64.0.0/10); además, rechazar peticiones cuyo `localAddress` no esté en ese conjunto |
| S4 | **HTTP sin cifrar en una wifi no confiable** | El link de Tailscale se imprime primero, marcado como cifrado; los de LAN, marcados como «solo redes de confianza (casa/oficina)». `--share tailscale` publica solo por Tailscale |
| S5 | **Proceso olvidado compartiendo para siempre** | La clave vence a las 12 h (`--share-ttl`, con un máximo); al vencer, 401 y aviso en stderr; un reinicio genera una nueva. La cookie usa `Max-Age` igual al TTL |
| S6 | **Fuerza bruta / ruido** | Límite de intentos fallidos por IP (p. ej. 20/min → 429) |
| S7 | **Fugas de rutas y de la clave** | Para remotos, las respuestas no incluyen rutas absolutas del disco; la clave nunca se escribe en `review/`, en eventos ni en logs (solo en el stdout del arranque); `Cache-Control: no-store` en las respuestas autenticadas |
| S8 | **Regresión** | Un test por cada fila: allowlist (incluido el intento de registrar `/etc/hosts` con clave válida → 403), proxy con Host foráneo, interfaz no permitida, vencimiento, 429, sin rutas absolutas |

Las versiones sin `--share` no cambian: siguen escuchando solo en 127.0.0.1 con el guard actual.

## Fuera de alcance

## Preguntas abiertas

## Registro

- 2026-11-12 — creado (pedido de Guillermo 2026-11-12: edita en un MacBook y revisa desde otro).
- 2026-11-12 — Aprobado por Guillermo («avanza»). Preguntas resueltas por el orquestador como defaults revisables: (1) `--share` explícito; el agente lo usa cuando quien revisa dice que está en otro equipo; (2) la clave dura lo que dura el proceso (link nuevo en cada arranque).
- 2026-11-12 — entregado (ea5bcc6) e integrado en main. Comprobado por el orquestador: typecheck, 164/164 tests, build, smoke; curl por LAN y Tailscale: 401 sin clave/clave mala, 302+cookie con ?key, 200/206 con cookie, 403 Host foráneo, 200 loopback. Falta: prueba real desde el otro MacBook.
- 2026-11-12 — retrabajo 1: Endurecimiento de seguridad del modo share antes de cualquier push (S1-S8 en el ítem)
- 2026-11-12 — retrabajo de seguridad S1–S8 hecho y comprobado por el orquestador (178/178 tests, build, smoke; curl por LAN y Tailscale: registrar /etc/hosts con clave → 403, /api/share remoto → 403, sin rutas absolutas, XFF → 401, 21 intentos → 429, clave fuera de disco y stderr; comentar y enviar desde remoto → 200). Historia reescrita antes del push para que ninguna versión publicada tenga la brecha: un solo commit 0b566d2. Push a origin/main de gbo-video-editor por orden de Guillermo; npm y el repo público de Frameback sin tocar.
- 2026-11-12 — retrabajo 2: V1 falla al abrir el link con un clic desde otra app: cookie SameSite=Strict no viaja tras el 302 cross-site → 401 (app.ts:137). Arreglo: SameSite=Lax + test. Encontrado por Guillermo en la validación; diagnóstico con navegador real.
- 2026-11-12 — Feedback de UX de Guillermo en V1: `--share` imprime demasiados links y no queda claro cuál usar; copió el de MagicDNS (*.ts.net) y falló, con la IP funcionó. Se suma al retrabajo 2: un solo link recomendado (IP de Tailscale o, si no hay, IP de LAN), el resto como alternativas; investigar si el link MagicDNS falla aunque se pegue.
- 2026-11-12 — Retrabajo 2 integrado en release/0.1.2 (e8cca67): SameSite=Lax (probado con clic cross-site en navegador real) + salida con un link recomendado. 182/182 tests, smoke, audit runtime 0. Falta: Guillermo repite V1 con clic sobre release/0.1.2.
- 2026-11-12 — V3 falla: el link de red local (wifi segura) no funciona desde el otro Mac; Tailscale sí. En diagnóstico (diag-lan).
