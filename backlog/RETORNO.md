---
fecha: 2026-11-09 21:45
motivo: fin de sesión (todo publicado y pusheado; espera validación humana y GIF)
sesion: —
---

# Punto de retorno

**Se retoma cuando:** Guillermo marca la guía `backlog/revisiones/2026-11-09-frameback-v0-1.md` y/o responde `backlog/decisiones/DEC-2026-11-09.md`.

## Pasos exactos, en orden

1. Leer la guía marcada: los `[!]` y `[~]` pasan a ítems `fix`/retrabajo del lote siguiente.
2. Aplicar las decisiones de publicación (nombre, OWNER, links, historia limpia) — publicar solo con orden explícita.
3. ~~Pendientes menores~~ resueltos en 0.1.1 (2026-11-09): la tarjeta respondida ya no muestra la caja de espera; descartar con Esc dos veces en vez de `window.confirm`; filtros en una fila con scroll lateral; "Round N" solo tras reabrir.
4. `frameback@0.1.1` publicado por Guillermo (2026-11-09). Pendiente: GIF del README (Guillermo graba ~15 s con Cmd+Shift+5 → convertir a `docs/media/frameback.gif`, insertar en el placeholder del README, publicar 0.1.2) y, opcional, `npm deprecate frameback@0.0.0-stage`.
5. Repos: `guillebecerrao/gbo-video-editor` (este, registro), `guillebecerrao/frameback` (clon limpio en `~/code/frameback`, rsync desde `frameback/`), `guillebecerrao/gbo-video` (skill de edición, integra Frameback en `references/frameback.md`).

## Estado

| Ítem | Estado | Siguiente paso |
|---|---|---|
| BL-002..BL-005 | en-revision (en main) | validación humana |
| BL-006 gbo-style → gbo-video | en-revision (la integración vive ahora en gbo-video `references/frameback.md`) | validación humana (B1–B5) |
| BL-007 revisión | en-revision | — |

- **Entornos:** ninguno levantado. `cd frameback && npm run demo`.
- **Agentes activos:** ninguno. Sin worktrees pendientes.
