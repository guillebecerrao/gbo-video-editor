---
id: BL-012
titulo: "Avisar si el video cambió bajo la misma ruta tras abrirlo"
tipo: fix
via: evidencia
acepta: "Guillermo"
padre: EP-001
estado: propuesto
creado: 2026-11-12
actualizado: 2026-11-12
valor: {estrategico: null, urgencia: null, habilita: null}
tamano: null          # XS | S | M | L
riesgo: null          # bajo | medio | alto
puntaje: null
toca: ["frameback/src/core/store.ts", "frameback/src/server/app.ts", "frameback/src/cli/open.ts"]              # rutas o áreas reales del repo, entre comillas si llevan corchetes o paréntesis
depende_de: []
asignacion: {carril: null, agente: null, worktree: null, rama: null}
lote: null
trazabilidad: {objetivo: null, origen: "retro de videos editados, vía sesión de consolidación 2026-11-12", evidencia: [], spec: null}   # objetivo: nodo OST u objetivo; spec: Iteration PRD (ciclo completo)
retrabajos: 0
prs: []
release: null
resultado: {senal: "próximas revisiones: 0 casos de revisar un video que cambió sin aviso", revisar: null, observado: null, experimento: null}   # experimento: EXP-NN (ciclo completo)
historial:
  - {estado: propuesto, fecha: 2026-11-12T13:30}
---

# BL-012 · Avisar si el video cambió bajo la misma ruta tras abrirlo

## Problema / intención

En un reel, el agente volvió a renderizar un preview con el mismo nombre de archivo después de que ya estaba abierto en Frameback. La persona responsable revisó sin saber que el video había cambiado y se confundió: los comentarios quedan anclados a los tiempos de un corte que ya no existe.

## Resultado esperado

Si el archivo cambia bajo la misma ruta, Frameback lo avisa; la forma correcta de entregar un corte nuevo es una versión nueva.

## Criterios de aceptación

- [ ] Al abrir una revisión, Frameback guarda una huella del video (tamaño + mtime y, si hace falta, un hash parcial).
- [ ] Si la huella cambia, la UI muestra un aviso visible, y `frameback open` sobre la misma ruta avisa (o se niega sin `--force`) y sugiere crear `_v(N+1)`.
- [ ] La skill del agente dice que nunca se sobrescribe un archivo en revisión.
- [ ] Test de la detección.

## Preguntas abiertas

- ¿Avisar o bloquear? Recomendación: avisar en la UI y bloquear en la CLI salvo `--force`.

## Registro

- 2026-11-12 — creado (retro de videos editados, vía sesión de consolidación 2026-11-12).
