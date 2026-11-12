---
id: BL-014
titulo: "Frameback 0.1.2: GIF del README y deprecar 0.0.0-stage"
tipo: chore
via: mantenimiento
acepta: "Guillermo"
padre: EP-001
estado: pospuesto
creado: 2026-11-12
actualizado: 2026-11-12
valor: {estrategico: null, urgencia: null, habilita: null}
tamano: null          # XS | S | M | L
riesgo: null          # bajo | medio | alto
puntaje: null
toca: []              # rutas o áreas reales del repo, entre comillas si llevan corchetes o paréntesis
depende_de: []
asignacion: {carril: null, agente: null, worktree: null, rama: null}
lote: null
trazabilidad: {objetivo: null, origen: "RETORNO 2026-11-09", evidencia: [], spec: null}   # objetivo: nodo OST u objetivo; spec: Iteration PRD (ciclo completo)
retrabajos: 0
prs: []
release: null
resultado: {senal: "ninguna: higiene", revisar: null, observado: null, experimento: null}   # experimento: EXP-NN (ciclo completo)
historial:
  - {estado: propuesto, fecha: 2026-11-12T13:30}
  - {estado: pospuesto, fecha: 2026-11-12T13:53, por: "Guillermo (dueño de gbo-video, antes gbo-style)"}
---

# BL-014 · Frameback 0.1.2: GIF del README y deprecar 0.0.0-stage

## Problema / intención

Pendientes de la publicación de 0.1.1.

## Criterios de aceptación

- [ ] La persona responsable graba ~15 s (Cmd+Shift+5) → `docs/media/frameback.gif` → se inserta en el placeholder del README.
- [ ] Bump a 0.1.2 + CHANGELOG; la persona responsable publica en npm.
- [ ] Opcional: `npm deprecate frameback@0.0.0-stage` (lo corre la persona responsable).

## Registro

- 2026-11-12 — creado (RETORNO 2026-11-09).
- 2026-11-12 — Guillermo posterga la validación del lote 0.1.2 y la publicación de 0.1.2.
- 2026-11-12 — Candidato 0.1.2 listo en rama `release/0.1.2` (393f6fe, worktree ../gbo-video-editor-release-012): versión, CHANGELOG (fecha YYYY-MM-DD a completar), 178/178 tests, build, smoke. Comparado con el repo público 0.1.1: nada que se pierda (la copia y el público eran idénticos en 0.1.1, según la sesión video-creation-ff). Falta: validación V1–V5, GIF y fecha; publica Guillermo.
