---
id: BL-018
titulo: "Revisar las 7 vulnerabilidades de npm audit antes de publicar 0.1.2"
tipo: chore
via: mantenimiento
acepta: "Guillermo"
padre: EP-001
estado: validado
creado: 2026-11-12
actualizado: 2026-11-12
valor: {estrategico: null, urgencia: null, habilita: null}
tamano: null          # XS | S | M | L
riesgo: null          # bajo | medio | alto
puntaje: null
toca: ["frameback/package.json", "frameback/package-lock.json"]              # rutas o áreas reales del repo, entre comillas si llevan corchetes o paréntesis
depende_de: []
asignacion: {carril: "1", agente: "audit-012", worktree: "../gbo-video-editor-audit", rama: "chore/npm-audit"}
lote: 0.1.2
trazabilidad: {objetivo: null, origen: "salida de npm ci de Guillermo, 2026-11-12: 7 vulnerabilidades (3 moderate, 2 high, 2 critical)", evidencia: [], spec: null}   # objetivo: nodo OST u objetivo; spec: Iteration PRD (ciclo completo)
retrabajos: 0
prs: []
release: null
resultado: {senal: "ninguna: higiene", revisar: null, observado: null, experimento: null}   # experimento: EXP-NN (ciclo completo)
historial:
  - {estado: aprobado, fecha: 2026-11-12T16:59}
  - {estado: en-curso, fecha: 2026-11-12T16:59}
  - {estado: en-revision, fecha: 2026-11-12T17:04}
  - {estado: en-validacion, fecha: 2026-11-12T17:04}
  - {estado: validado, fecha: 2026-11-12T18:29, por: "Guillermo"}
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
- 2026-11-12 — Triage (audit-012): 7 hallazgos, 6 de desarrollo (vitest/tinypool/vite/esbuild; no llegan al paquete) y 1 de runtime: zod 3.25.76 (GHSA-mrhx-c7xc-m3w5, high, DoS de memoria con colecciones acotadas; improbable en Frameback). Sin parche en 3.x. Decisión del orquestador por la regla «ninguna versión publicada con brechas»: migrar zod a 4 antes de 0.1.2 (el SDK MCP acepta ^4). vitest 5 queda para 0.1.3 (solo dev).
- 2026-11-12 — zod 4.6.7 integrado en release/0.1.2 (057a442): schema.ts 2 líneas, 178/178 tests, smoke, MCP 12/12, `npm audit --omit=dev` = 0. Quedan 6 avisos solo de desarrollo (vitest/vite) → 0.1.3.
- 2026-11-12 — Validado por Guillermo (guía 0.1.2: V1–V5).
