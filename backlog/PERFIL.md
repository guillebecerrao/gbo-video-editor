---
proyecto: frameback (gbo-video-editor)
contexto: .
revisado: 2026-11-09
---

# Perfil de orquestación

## Personas

- **Responsable:** Guillermo (dueño de gbo-video, antes gbo-style). Aprueba alcance, valida y autoriza publicación.
- **Otras sesiones que tocan el repo:** ninguna (sesión nocturna autónoma del orquestador + subagentes).
- **Idioma y tono:** español para backlog/decisiones; **inglés para el código y la documentación pública** del producto (es open source).
- **Disponibilidad:** revisa por la mañana (sesión nocturna autónoma, 2026-11-09).

## Repo y verificación

- **Rama principal:** main (remoto `origin` = github.com/guillebecerrao/gbo-video-editor, público).
- **Producto:** vive en `frameback/` (extraíble como repo propio con `git subtree split --prefix=frameback`). `p60/`, `backlog/` y `.claude/` son privados.
- **Crear un worktree:** `git worktree add ../gbo-video-editor-<slug> -b feat/<slug> main`
- **Verificación liviana:** `cd frameback && npm run typecheck && npm test`
- **Verificación pesada:** `cd frameback && npm run build && npm run smoke` (demo sintético; no existe script `e2e`).
- **Levantar el entorno local:** `cd frameback && npm run demo` (genera proyecto demo y abre la app).

## Entornos

| Entorno | Refleja | Cómo se despliega | Quién | Cómo verificar |
|---|---|---|---|---|
| local | main | `npm run demo` | orquestador | navegador en http://localhost:4747 |

## Entrega

- **Modo:** lotes (validación local por la mañana).
- **Dónde valida:** local.
- **Quién mergea a main:** orquestador, tras verificación liviana + pesada en verde.

## Producción

- **Quién la lanza:** el responsable. "Producción" = publicar el repo en GitHub / npm. **Nunca el orquestador.**

## Recursos

- **Carriles máximos:** 4.

## Riesgo

- **Zonas calientes:** `frameback/packages/core/src/schema.ts` (contrato compartido), `frameback/docs/PROTOCOL.md`.
- **Riesgo alto:** cualquier dato personal en `frameback/` (repo público).

## Prohibido sin orden explícita

- Publicar en GitHub/npm, push a remotos (salvo orden explícita para ese push).
- Incluir en `frameback/` datos personales, rutas de la máquina, nombres de proyectos/clientes/personas, tokens de marca reales.

## Estrategia

- **Fuente:** pedido del responsable 2026-11-09 (sesión). P60 en Etapa 0, sin OST → modo construcción directa.

## Dónde queda cada cosa

- **Punto de retorno:** `backlog/RETORNO.md`
- **Revisiones:** `backlog/revisiones/`
- **Decisiones:** `backlog/decisiones/`

## Reglas decididas

| Fecha | Regla | Por qué |
|---|---|---|
| 2026-11-09 | Integración con la sesión de Claude Code por archivos + `frameback watch` (Monitor) **y** servidor MCP opcional | Decisión del responsable en ronda de preguntas |
| 2026-11-09 | Stack Node + TypeScript + React/Vite, CLI `npx frameback` | Decisión del responsable |
| 2026-11-09 | gbo-style se modifica directamente (commit en su repo) para integrar Frameback | Decisión del responsable |
| 2026-11-09 | Solo commits locales; nada se publica sin el responsable | Decisión del responsable |
| 2026-11-09 | Planificar/revisar con Opus; implementar con subagentes Sonnet en paralelo; ronda de revisores al final | Pedido del responsable |
| 2026-11-09 | **gbo-style debe operar sin Frameback.** La integración es opcional: se detecta (`command -v frameback` / `npx frameback --version`) y si no está, gbo-style sigue su flujo de checkpoints actual sin cambios | Pedido explícito del responsable: Frameback va on top, no es condición necesaria |
| 2026-11-09 | Nombre del producto: **Frameback** (antes "Glosa"). Libres en npm como alternativa: pinframe, cutnote, reelback | Pedido del responsable: nombre brandeable para su marca personal |
| 2026-11-09 | **gbo-style se reemplazó** por `gbo-video` (skill pública, github.com/guillebecerrao/gbo-video-method) + un perfil local privado. Lo público de Frameback y de este repo enlaza solo a gbo-video; nunca al perfil privado. Las reglas de arriba sobre gbo-style aplican ahora a gbo-video (integración opcional, sin dependencia dura) | Cambio del ecosistema informado por el responsable |
| 2026-11-09 | El README y la LICENCIA atribuyen la autoría a Guillermo Becerra (GBO); sin otros datos personales | Marca personal + repo público |
| 2026-11-12 | Lo que no necesita a Guillermo se avanza sin preguntar; con otras sesiones se **informan** nuestras decisiones, no se les piden | Pedido del responsable |
| 2026-11-12 | **Ninguna versión publicada con brechas de seguridad.** Todo lo que abra Frameback a la red pasa una revisión de seguridad (allowlist de rutas, quién confía en quién) y se prueba con ataques antes de cualquier push; si hubo un commit vulnerable sin publicar, se reescribe la historia local antes de empujar | Pedido del responsable |
| 2026-11-12 | **El orquestador no construye ni integra.** Planifica, registra, decide y revisa informes; verificaciones (tests, curl, navegador), merges, limpieza de historia y push se delegan a agentes cortos. La sesión principal queda libre para el backlog y las preguntas del responsable | Corrección del responsable: el orquestador estaba haciendo verificación e integración a mano |

