---
type: prd-feature
level: 2
scope: feature          # feature nueva | ajuste de feature existente
status: draft           # draft | validado
epica: [epica-slug]     # gobernado por el PRD Maestro de esta épica
prd_brief_origen: [ruta al prd-brief seleccionado]
prototipo: null         # prototipo/ junto a este PRD, o URL si vive fuera; null si no hay (recomendado si hay interfaz)
experimento: null       # EXP-NN | ninguno (el motivo va en «Medición y experimento»)
adr: [ruta al ADR asociado]
created: YYYY-MM-DD
last_modified: YYYY-MM-DD
---

# PRD de Feature — [Nombre]

> **Nivel 2 · Feature.** El PRD-brief seleccionado que maduró a **validado**, acompañado de **ADR** y, recomendados, un **prototipo funcional** y el **experimento** que lo validará. Gobernado (subrogado) por el PRD Maestro de su épica. Se descompone en Iteration PRDs para los sprints.
> **Ubicación:** `p60/handoff-delivery/epicas/[epica]/features/[feature-slug]/prd-[feature].md`; el prototipo, junto a él en `prototipo/`.

## Trazabilidad
- **Épica (PRD Maestro):** [link]
- **PRD-brief de origen:** [link] · **Oportunidad OST:** [nodo]

## Descripción de la solución
Qué es la feature, qué problema resuelve, para quién.

## Alcance
User journeys / capacidades incluidas. No-alcance explícito.

## Evidencia de validación
Qué supuestos se validaron y con qué evidencia (siglas `[EV-NNN]`).

## Prototipo
Prototipo funcional (HTML o más elaborado) en `prototipo/`, o enlace si vive fuera. Qué muestra y qué no. Si no hay: por qué.

## Medición y experimento
- **Experimento:** `EXP-NN` con su propósito (`rollout`: el resultado decide; `causalidad`: el lanzamiento ya está decidido), o «sin experimento» y el motivo (p. ej., compromiso contractual).
- **Métrica primaria:** la del outcome del nodo OST. **Guardarraíles:** lo que no puede empeorar.
- La instrumentación se detalla en cada Iteration PRD.

## Decisiones técnicas (ADR)
Resumen + link al ADR. Decisiones pendientes de tercero → placeholder explícito.

## Criterios de aceptación (nivel feature)
- [ ] Verificable de alto nivel 1
- [ ] Verificable de alto nivel 2

## Iteration PRDs
| # | Iteration PRD | Estado |
|---|---------------|--------|
| 01 | `activas/01-[slug].md` | draft/approved/in_dev/validated |

## Changelog
| Version | Date | Author | Description |
