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
retrabajos: 0
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

## Fuera de alcance

## Preguntas abiertas

## Registro

- 2026-11-12 — creado (pedido de Guillermo 2026-11-12: edita en un MacBook y revisa desde otro).
- 2026-11-12 — Aprobado por Guillermo («avanza»). Preguntas resueltas por el orquestador como defaults revisables: (1) `--share` explícito; el agente lo usa cuando quien revisa dice que está en otro equipo; (2) la clave dura lo que dura el proceso (link nuevo en cada arranque).
- 2026-11-12 — entregado (ea5bcc6) e integrado en main. Comprobado por el orquestador: typecheck, 164/164 tests, build, smoke; curl por LAN y Tailscale: 401 sin clave/clave mala, 302+cookie con ?key, 200/206 con cookie, 403 Host foráneo, 200 loopback. Falta: prueba real desde el otro MacBook.
