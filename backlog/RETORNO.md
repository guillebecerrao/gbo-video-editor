---
fecha: 2026-11-09 08:50
motivo: pausa decidida (lote entregado, espera validación humana)
sesion: —
---

# Punto de retorno

**Se retoma cuando:** Guillermo marca la guía `backlog/revisiones/2026-11-09-frameback-v0-1.md` y/o responde `backlog/decisiones/DEC-2026-11-09.md`.

## Pasos exactos, en orden

1. Leer la guía marcada: los `[!]` y `[~]` pasan a ítems `fix`/retrabajo del lote siguiente.
2. Aplicar las decisiones de publicación (nombre, OWNER, links, historia limpia) — publicar solo con orden explícita.
3. ~~Pendientes menores~~ resueltos en 0.1.1 (2026-11-09): la tarjeta respondida ya no muestra la caja de espera; descartar con Esc dos veces en vez de `window.confirm`; filtros en una fila con scroll lateral; "Round N" solo tras reabrir.
4. Publicar `frameback@0.1.1` en npm (lo corre Guillermo en Terminal.app por la passkey). GIF del README pendiente de su grabación.

## Estado

| Ítem | Estado | Siguiente paso |
|---|---|---|
| BL-002..BL-005 | en-revision (en main) | validación humana |
| BL-006 gbo-style → gbo-video | en-revision (la integración vive ahora en gbo-video `references/frameback.md`) | validación humana (B1–B5) |
| BL-007 revisión | en-revision | — |

- **Entornos:** ninguno levantado. `cd frameback && npm run demo`.
- **Agentes activos:** ninguno. Sin worktrees pendientes.
