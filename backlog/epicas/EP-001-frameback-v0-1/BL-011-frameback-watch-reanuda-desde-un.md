---
id: BL-011
titulo: "frameback watch reanuda desde un cursor persistido tras reiniciarse"
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
toca: ["frameback/src/cli/watch.ts", "frameback/docs/PROTOCOL.md"]              # rutas o áreas reales del repo, entre comillas si llevan corchetes o paréntesis
depende_de: []
asignacion: {carril: null, agente: null, worktree: null, rama: null}
lote: null
trazabilidad: {objetivo: null, origen: "retro de videos editados, vía sesión de consolidación 2026-11-12", evidencia: [], spec: null}   # objetivo: nodo OST u objetivo; spec: Iteration PRD (ciclo completo)
retrabajos: 0
prs: []
release: null
resultado: {senal: "próxima revisión con reinicio del watcher: 0 comentarios perdidos o duplicados", revisar: null, observado: null, experimento: null}   # experimento: EXP-NN (ciclo completo)
historial:
  - {estado: propuesto, fecha: 2026-11-12T13:30}
---

# BL-011 · frameback watch reanuda desde un cursor persistido tras reiniciarse

## Problema / intención

Durante la revisión de un recap, `frameback watch` perdió comentarios: el agente reinició el watcher (para cambiar el umbral) y los eventos escritos mientras no corría no le llegaron. Hoy `watch` acepta `--since <seq>`, pero el cursor no se guarda: si se reinicia sin `--since`, arranca desde el final o desde cero.

## Resultado esperado

Reiniciar `watch` no pierde eventos ni los duplica.

## Criterios de aceptación

- [ ] `watch` guarda el último `seq` entregado y, al reiniciar, sigue desde ahí por defecto.
- [ ] Hay una forma explícita de empezar de cero o desde el final (`--since 0`, `--tail`).
- [ ] Test: los eventos escritos con el watcher detenido se entregan al reiniciarlo, una sola vez.
- [ ] PROTOCOL.md y la skill del agente explican el cursor.

## Preguntas abiertas

- ¿Dónde se guarda el cursor (dentro de `review/` o fuera, para no ensuciar los datos de la revisión)? ¿Uno por consumidor (watch, MCP)?

## Registro

- 2026-11-12 — creado (retro de videos editados, vía sesión de consolidación 2026-11-12).
