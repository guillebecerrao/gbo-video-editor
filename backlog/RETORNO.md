---
fecha: 2026-11-09 08:05
motivo: sesión nocturna autónoma (prevención ante corte)
sesion: workflow de revisión wf_6b11ad8f-1ee
---

# Punto de retorno

**Se retoma cuando:** existe una sesión de Claude Code abierta en este repo.

## Pasos exactos, en orden

1. L1–L4 YA integrados en main (106 tests, smoke PASS). `git worktree list` → ramas de los arregladores (fix:web/backend/docs) del workflow de revisión.
2. Si el workflow no terminó: relanzar con `resumeFromRunId: wf_6b11ad8f-1ee`.
3. Integrar ramas de arreglos en main; `cd frameback && npm install && npm run typecheck && npm test && npm run build && npm run smoke`.
5. Commitear la integración en gbo-style (cambios ya hechos y sin commitear en `~/.claude/skills/gbo-style`: sección "Revisión con Frameback (opcional)" en SKILL.md + sidecar `write_frameback_timeline` en `scripts/gbo_render.py`). Antes, alinear los comandos con la CLI final.
6. Workflow de revisores (BL-007) → ronda de arreglos → guía de prueba en `backlog/revisiones/`.

## Estado

| Ítem | Estado | Rama y worktree | Siguiente paso |
|---|---|---|---|
| BL-002 L1 servidor+CLI | en-curso | worktree del workflow | integrar |
| BL-003 L2 UI web | en-curso | worktree del workflow | integrar |
| BL-004 L3 MCP | en-curso | worktree del workflow | integrar |
| BL-005 L4 kit+docs | en-curso | worktree del workflow | integrar + smoke |
| BL-006 L5 gbo-style | en-curso | `~/.claude/skills/gbo-style` (sin commit) | alinear con CLI y commitear |
| BL-007 revisión | aprobado | — | tras integrar |

## Decisiones tomadas que aún no están en un ítem

- Todas están en `backlog/PERFIL.md` → Reglas decididas.
