---
id: BL-018
titulo: "Revisar las 7 vulnerabilidades de npm audit antes de publicar 0.1.2"
tipo: chore
via: mantenimiento
acepta: "Guillermo"
padre: EP-001
estado: en-curso
creado: 2026-11-12
actualizado: 2026-11-12
valor: {estrategico: null, urgencia: null, habilita: null}
tamano: null          # XS | S | M | L
riesgo: null          # bajo | medio | alto
puntaje: null
toca: ["frameback/package.json", "frameback/package-lock.json"]              # rutas o áreas reales del repo, entre comillas si llevan corchetes o paréntesis
depende_de: []
asignacion: {carril: "1", agente: "audit-012", worktree: "../gbo-video-editor-audit", rama: "chore/npm-audit"}
lote: null
trazabilidad: {objetivo: null, origen: "salida de npm ci de Guillermo, 2026-11-12: 7 vulnerabilidades (3 moderate, 2 high, 2 critical)", evidencia: [], spec: null}   # objetivo: nodo OST u objetivo; spec: Iteration PRD (ciclo completo)
retrabajos: 0
prs: []
release: null
resultado: {senal: "ninguna: higiene", revisar: null, observado: null, experimento: null}   # experimento: EXP-NN (ciclo completo)
historial:
  - {estado: aprobado, fecha: 2026-11-12T16:59}
  - {estado: en-curso, fecha: 2026-11-12T16:59}
---

## Problema / intención

## Resultado esperado

## Criterios de aceptación

- [ ]

## Fuera de alcance

## Preguntas abiertas

## Registro

- 2026-11-12 — creado (salida de npm ci de Guillermo, 2026-11-12: 7 vulnerabilidades (3 moderate, 2 high, 2 critical)).

- Regla del perfil: ninguna versión publicada con brechas. Criterio: separar dependencias de runtime (llegan al usuario por npm) de las de desarrollo; arreglar las de runtime sin breaking changes; documentar el resto.
