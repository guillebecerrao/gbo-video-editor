---
id: BL-019
titulo: "Cada comentario llega al agente al enviarlo, no recién en Process review"
tipo: fix
via: evidencia
acepta: "Guillermo"
padre: EP-001
estado: en-curso
creado: 2026-11-12
actualizado: 2026-11-12
valor: {estrategico: null, urgencia: null, habilita: null}
tamano: null          # XS | S | M | L
riesgo: null          # bajo | medio | alto
puntaje: null
toca: []              # rutas o áreas reales del repo, entre comillas si llevan corchetes o paréntesis
depende_de: []
asignacion: {carril: "1", agente: "realtime-skill", worktree: "../gbo-video-editor-realtime", rama: "fix/realtime-skill"}
lote: null
trazabilidad: {objetivo: null, origen: "validación V1–V3 de Guillermo, 2026-11-12", evidencia: [], spec: null}   # objetivo: nodo OST u objetivo; spec: Iteration PRD (ciclo completo)
retrabajos: 0
prs: []
release: null
resultado: {senal: "en la próxima revisión real, el agente empieza a trabajar antes de Process review", revisar: null, observado: null, experimento: null}   # experimento: EXP-NN (ciclo completo)
historial:
  - {estado: aprobado, fecha: 2026-11-12T17:13}
  - {estado: en-curso, fecha: 2026-11-12T17:16}
---

## Problema / intención

## Resultado esperado

## Criterios de aceptación

- [ ]

## Fuera de alcance

## Preguntas abiertas

## Registro

- 2026-11-12 — creado (validación V1–V3 de Guillermo, 2026-11-12).
- 2026-11-12 — Diagnóstico: UI, servidor y watch ya son tiempo real (POST al enviar; watch muestra comment.created en ≤ 600 ms; en la prueba, el primer comentario se registró 84 s antes del submit). Lo que rompe el tiempo real es la skill: ofrece como alternativa equivalente `watch --exit-on review.submitted`, que solo avisa al cerrar la ronda. Arreglo: Monitor con `watch --json` como camino principal y obligatorio; la alternativa queda degradada y explícita («sin tiempo real»); `watch` en TTY avisa que es una vista humana. Avisar a la integración de gbo-video (otro repo).
