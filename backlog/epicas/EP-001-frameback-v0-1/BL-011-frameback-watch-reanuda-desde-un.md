---
id: BL-011
titulo: "frameback watch reanuda desde un cursor persistido tras reiniciarse"
tipo: fix
via: evidencia
acepta: "Guillermo"
padre: EP-001
estado: validado
creado: 2026-11-12
actualizado: 2026-11-12
valor: {estrategico: null, urgencia: null, habilita: null}
tamano: null          # XS | S | M | L
riesgo: null          # bajo | medio | alto
puntaje: null
toca: ["frameback/src/cli/watch.ts", "frameback/docs/PROTOCOL.md"]              # rutas o áreas reales del repo, entre comillas si llevan corchetes o paréntesis
depende_de: []
asignacion: {carril: "1", agente: "bl011-watch", worktree: "../gbo-video-editor-watch-cursor", rama: "fix/watch-cursor"}
lote: 0.1.2
trazabilidad: {objetivo: null, origen: "retro de videos editados, vía sesión de consolidación 2026-11-12", evidencia: [], spec: null}   # objetivo: nodo OST u objetivo; spec: Iteration PRD (ciclo completo)
retrabajos: 0
prs: []
release: null
resultado: {senal: "próxima revisión con reinicio del watcher: 0 comentarios perdidos o duplicados", revisar: null, observado: null, experimento: null}   # experimento: EXP-NN (ciclo completo)
historial:
  - {estado: propuesto, fecha: 2026-11-12T13:30}
  - {estado: aprobado, fecha: 2026-11-12T13:37, por: "Guillermo (dueño de gbo-video, antes gbo-style)"}
  - {estado: en-curso, fecha: 2026-11-12T13:37}
  - {estado: en-revision, fecha: 2026-11-12T13:42}
  - {estado: en-validacion, fecha: 2026-11-12T13:44}
  - {estado: validado, fecha: 2026-11-12T18:29, por: "Guillermo"}
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
- 2026-11-12 — entregado en `fix/watch-cursor` (03ebd7a). Comprobado por el orquestador: typecheck OK, 143/143 tests. Riesgos aceptables: entrega al-menos-una-vez si el proceso muere entre emitir y guardar; log recreado más largo que el cursor no se detecta.
- 2026-11-12 — Guillermo posterga la validación del lote 0.1.2 y la publicación de 0.1.2.
- 2026-11-12 — Validado por Guillermo (guía 0.1.2: V1–V5).
