---
id: BL-013
titulo: "Revisar PR #1 externo: Docker + webhooks opcionales"
tipo: chore
via: mantenimiento
acepta: "Guillermo"
padre: EP-001
estado: bloqueado-humano
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
trazabilidad: {objetivo: null, origen: "PR externo en el repo público, 2026-11-12", evidencia: [], spec: null}   # objetivo: nodo OST u objetivo; spec: Iteration PRD (ciclo completo)
retrabajos: 0
prs: []
release: null
resultado: {senal: "ninguna: higiene", revisar: null, observado: null, experimento: null}   # experimento: EXP-NN (ciclo completo)
historial:
  - {estado: propuesto, fecha: 2026-11-12T13:30}
  - {estado: bloqueado-humano, fecha: 2026-11-12T13:38}
---

# BL-013 · Revisar PR #1 externo: Docker + webhooks opcionales

## Problema / intención

PR #1 en el repo público, de un contribuidor externo: soporte Docker (Dockerfile, compose, entrypoint y variable `FRAMEBACK_BIND`) y un webhook opcional para eventos humanos (+290/−5, 15 archivos, 6 tests nuevos). El fork no corre CI.

## Revisión (orquestador, 2026-11-12)

- **Docker:** bien hecho. El compose publica solo `127.0.0.1:4747` y el guard de Host/Origin no cambia.
- **`FRAMEBACK_BIND`:** el guard de Host (`src/server/app.ts`) frena el DNS rebinding, pero no a un cliente de la LAN, que puede mandar `Host: localhost` a mano. Si alguien pone `FRAMEBACK_BIND=0.0.0.0` fuera de Docker, la API, que no tiene autenticación, queda abierta a la red sin ningún aviso. → Pedir un aviso visible en stderr cuando el bind no sea loopback.
- **Webhook:** apagado por defecto, firma HMAC con timestamp, solo eventos humanos, fire-and-forget y URL validada. Pero el payload manda `reviewDir` como ruta absoluta de la máquina a un servicio externo. → Pedir que vaya relativa o que se omita. Además, rompe la promesa de «sin red» del README (aunque sea opt-in): es una decisión de producto.
- **Entrypoint:** el `sleep 3` antes de registrar los demás videos es frágil (carrera con el arranque del servidor). Es menor.

## Recomendación

**Pedir cambios y separar:** aceptar Docker con el aviso del bind; el webhook en un PR aparte, sin rutas absolutas, y solo si la persona responsable acepta la excepción a «sin red». Antes de mergear, correr typecheck + test + build + e2e en local.

## Criterios de aceptación

- [ ] La persona responsable decide si se acepta, se piden cambios o se cierra.
- [ ] El comentario al PR lo publica la persona responsable (o el orquestador, con su orden explícita).

## Registro

- 2026-11-12 — creado (PR externo en el repo público, 2026-11-12).
- 2026-11-12 — borrador del comentario en `backlog/decisiones/PR-1-review-draft.md`. No se ejecutó el código del PR (bloqueado por política: código externo); falta verificarlo en local antes de mergear. Espera que Guillermo publique el comentario.
- 2026-11-12 — Contexto de Guillermo: Felipe (filipop) es amigo. El PR no resuelve revisar desde otro computador (el guard exige localhost) → BL-015. Postura: Docker como opción extra; webhook en un PR aparte (configuración técnica y manual, nicho). Sugerido: hablar con Felipe antes de responder en GitHub.
