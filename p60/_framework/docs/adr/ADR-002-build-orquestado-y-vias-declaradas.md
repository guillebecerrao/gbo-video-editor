---
type: adr
id: ADR-002
status: accepted
scope: framework
decision_owner: Guille Becerra O (Product Builder)
created: 2026-11-02
last_modified: 2026-11-04
supersedes: []
---

# ADR-002 — Build orquestado por agentes, vías declaradas y skills globales

> Segunda decisión estructural del framework. Incorpora `orquestar-pb` (nacida operando Builderia) y, con ella, el
> cambio de enfoque del principio 1 de la constitución (3.0).

## Contexto

Hasta la v2.1, la Guía decía que Build lo orquesta Speckit (si construye un agente) o el proceso propio del dev team, y
la constitución partía de «nada se construye sin spec». En la práctica:

- Una persona o tríada que hace el end-to-end construye con varios agentes en paralelo, y necesita un backlog vivo en el
  repo de código, no solo Iteration PRDs.
- Las empresas tienen *keep the lights on*, urgencias contractuales e ideas que alguien quiere probar asumiendo el
  riesgo. Un framework que solo admite «spec con evidencia» empuja ese trabajo fuera del sistema, donde no se ve ni se
  aprende de él.
- El CLI copiaba todas las skills a cada instancia, y el orquestador es un rol de una persona, no de un proyecto: con
  repos de código y contexto separados (la topología por defecto), copiarlo a cada context repo no lo deja donde se usa
  y se lo muestra a quien no lo necesita.

## Decisión

1. **Build orquestado por agentes.** `orquestar-pb` es la forma de P60 de orquestar el Build cuando la misma persona
   o tríada aprueba el alcance, valida y autoriza producción (en tríada: un orquestador y un responsable por backlog).
   Speckit sigue siendo válido para construir un componente; para squads con dev team rige ADR-001 sin cambios.
2. **Dueños.** El orquestador prepara, reparte, verifica y registra. La persona responsable mueve `aprobado`,
   `validado`, `pospuesto` y `descartado`, y autoriza cada deploy. En ciclo completo, ship/no-ship sigue siendo de
   `decision-ship` (constitución, regla 3c): `en-prod` cierra el Build, no la feature.
3. **`backlog/` vive en la raíz del repo de código, fuera de `p60/`.** Es estado operativo de Build, no contexto: cambia
   varias veces al día y lo leen los trabajadores. El principio 3 no cambia: el contexto sigue autocontenido en `p60/`.
   Durante la construcción el context repo solo se lee; lo aprendido vuelve al cerrar cada lote como paso explícito
   (retro a `_retro/`, material bruto a `_inbox/`, una fila en la bitácora).
4. **Vías declaradas** (constitución 3.0, principio 1). Todo ítem declara `via: evidencia | mantenimiento | urgencia |
   apuesta`. Fuera de `evidencia`, `acepta` nombra a quien asume el riesgo; una apuesta además declara la señal que se
   va a observar para que lo aprendido vuelva como evidencia. Las métricas separan por vía.
5. **Dos modos, no excluyentes, inferidos por pedido.** En **construcción directa** (`direct`), una vía y no un bypass,
   **un ítem con criterios de aceptación verificables cuenta como spec, para cualquier tamaño**; si hay context repo,
   se lee para diseñar e implementar mejor, sin obligaciones de traza. En **ciclo completo** (`full-cycle`), cuando el
   pedido materializa una feature del ciclo de vida y el context repo tiene contenido real (outcome y árbol en el OST),
   el ítem cita su Iteration PRD (no lo copia) y se traza a un nodo. El modo no se fija en el perfil: se infiere de
   cada pedido, se anuncia y la persona responsable lo cambia cuando quiera.
6. **Skills con `scope: global`, instaladas a pedido.** Una skill global se distribuye con P60 pero `init`/`update` no la
   copian a las instancias. Cada persona la instala en sus skills de usuario con `p60 skills add <skill>`; desde ahí
   `install.sh` (y por lo tanto `self-update`) la mantiene al día con un manifiesto propio
   (`~/.p60/global-manifest.json`) que no pisa cambios locales. Revierte, solo para estas skills, la decisión de la
   spec del CLI «skills solo en la carpeta de la herramienta».

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| Copiar `orquestar-pb` a toda instancia, como las demás skills | Aparece en context repos sin código y a developers que no orquestan; con repos separados no queda donde se usa |
| Sincronizar las skills globales en cada `update`, para todos | Instala a quien no lo pidió; el orquestador es un rol de una persona |
| Backlog dentro de `p60/` | Mezcla estado operativo de alta frecuencia con contexto, y en repos separados queda lejos de los trabajadores |
| Bypass por tamaño (solo XS/S sin spec) | Un ítem con criterios verificables ya es una spec; limitarlo por tamaño empuja lo grande fuera del sistema en vez de hacerlo visible |
| Fijar el modo en el perfil del proyecto | Una misma sesión alterna entre trabajo con y sin ciclo de vida |
| Una variante P60 de la skill, aparte de la general | Dos copias derivan; se comparte con gente que no usa P60 |

## Consecuencias

- Habilita: construir con varios agentes con trazabilidad al OST cuando existe, y sin bloquear cuando no; ver cuánto
  trabajo entra por cada vía y cuánto va sin traza.
- Sacrifica: la regla simple «nada sin spec» para el producto. La reemplaza «evidencia primero; cualquier otra vía se
  declara y alguien acepta el riesgo». La regla 1 de comportamiento (todo componente del framework tiene su `.spec.md`)
  no cambia.
- Deuda asumida: la skill llega en español aunque el producto se instancie en `en`/`pt`; `cierre-de-ciclo` aún no
  cubre Build; `validado` del backlog convive con `validated` de P60 (se explica en la skill).
- Revisitar cuando: haya squads que quieran orquestar con esta skill, o una segunda skill global.

## Estado

`accepted` — decisiones de Guillermo del 2026-11-02 (instalación global a pedido, ítem con criterios como spec en
construcción directa, vías declaradas y enmienda del principio 1 en la misma versión), enmendadas el 2026-11-04
(nombre `orquestar-pb`, modos inferidos por pedido).

## Changelog
| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | 2026-11-02 | Claude Opus 5.5 (Product-Builder) | Creación, con la incorporación de `orquestar-entrega` (P60 2.2.0) y la constitución 3.0. |
| 1.1 | 2026-11-04 | Claude Opus 5.5 (Product-Builder) | Enmienda de Guillermo: la skill se llama `orquestar-pb` (en 2.2.0 se publicó como `orquestar-entrega`); los modos pasan a construcción directa y ciclo completo, inferidos por pedido y no fijados en el perfil; en construcción directa el contexto igual informa el diseño. |
