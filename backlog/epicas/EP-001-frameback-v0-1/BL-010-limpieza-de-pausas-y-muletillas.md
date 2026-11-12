---
id: BL-010
titulo: "Limpieza de pausas y muletillas (estilo «quitar pausas / quitar muletillas»)"
tipo: historia
via: evidencia
acepta: "Guillermo"
padre: EP-001
estado: borrador
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
trazabilidad: {objetivo: null, origen: "retro de videos editados, vía sesión de consolidación 2026-11-12", evidencia: [], spec: null}   # objetivo: nodo OST u objetivo; spec: Iteration PRD (ciclo completo)
retrabajos: 0
prs: []
release: null
resultado: {senal: "por definir en el refinamiento", revisar: null, observado: null, experimento: null}   # experimento: EXP-NN (ciclo completo)
historial:
  - {estado: borrador, fecha: 2026-11-12T13:30}
---

# BL-010 · Limpieza de pausas y muletillas (estilo «quitar pausas / quitar muletillas»)

## Problema / intención

Al editar un video promocional, la persona responsable propuso botones al estilo Descript («quitar pausas», «quitar muletillas»). En esa edición las vocales sostenidas («eeeh») se detectaron con un script ad hoc (pitch estable + similitud espectral). Ella misma anotó «hay que darle una vuelta»: es una idea por refinar, no un ítem listo.

## Resultado esperado

Pedir la limpieza de pausas y muletillas de un corte en un gesto, sin escribir un comentario por cada una.

## Criterios de aceptación

- [ ] (se definen en el refinamiento)

## Fuera de alcance

- Que Frameback edite el video: el corte lo sigue haciendo el agente.

## Preguntas abiertas

1. ¿Frameback **propone** (marca regiones candidatas en el timeline para aceptar o rechazar) y el agente **aplica**, o es solo una acción que crea un comentario global?
2. ¿Hace falta el transcript con tiempos por palabra en el sidecar (junto a `cuts`) para marcar muletillas, o basta con que la detección viva en gbo-video?
3. ¿La detección (silencios, vocales sostenidas) es de Frameback o de gbo-video? Hoy Frameback no analiza audio.

## Registro

- 2026-11-12 — creado (retro de videos editados, vía sesión de consolidación 2026-11-12).
