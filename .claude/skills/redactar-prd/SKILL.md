---
name: redactar-prd
description: Redacta y madura los PRDs del sub-proceso Handoff — PRD Maestro (épica), PRD de feature validado e Iteration PRD dev-ready, con su medición y su prototipo — desde el PRD-brief seleccionado, con la jerarquía y los estados correctos.
version: 1.2
status: active
triggers: ["redactar el prd", "madurar el brief a prd", "crear el prd maestro", "iteration prd", "descomponer la feature en sprints", "handoff de la solución", "dejar dev-ready"]
requires_context: ["el PRD-brief selected", "p60/handoff-delivery/epicas/ (jerarquía existente)", "p60/_framework/templates/artifacts/es/ (prd-maestro, prd-feature, iteration-prd, adr)"]
last_sync: 2026-11-04
---

# Redactar PRD

> Convierte al agente en el redactor del sub-proceso **Handoff**: del PRD-brief `selected` a la jerarquía épica → feature → iteraciones, con cada documento en su nivel, su estado y su carpeta.
> Mientras más completo llega el Handoff a Build, menos retrabajo: la medición y el prototipo se piensan aquí, no después (ADR-003).

## When to Use

Actívalo cuando un PRD-brief quedó `selected` en Validate y hay que **madurarlo a specs de desarrollo**, cuando una feature validada debe **descomponerse en Iteration PRDs**, o cuando el **PRD Maestro** debe actualizarse porque una feature entró o mutó.

**NO** lo uses para: escribir el PRD-brief (nace en Validate con su template), ni decidir qué se construye (eso ya se decidió con evidencia), ni specs de componentes del framework (eso es `p60/_framework/standards/component-spec.md`).

## Procedure

1. **Ubicar la feature en la jerarquía.** ¿El brief origina una **épica nueva** (→ crear carpeta + PRD Maestro) o una **feature bajo una épica existente** (→ actualizar el Maestro)? Si hay duda, es decisión del humano — cambia la estructura del repo.
2. **PRD Maestro** (template `prd-maestro.md`): si es épica nueva, redáctalo desde visión/alcance; si existe, **actualiza su índice de features y coherencia** — el Maestro nunca queda desactualizado respecto de sus features (es documento vivo).
3. **PRD de feature** (template `prd-feature.md`): madura el contenido del brief — descripción, alcance/no-alcance, **evidencia de validación con siglas `[EV-NNN]`**, criterios de aceptación de nivel feature. Toda decisión técnica no obvia → **ADR** (template `adr.md`; pendiente-de-tercero → ADR en `proposed` como placeholder).
   - **Prototipo funcional** (HTML o algo más elaborado) **junto al PRD**, en `features/[feature]/prototipo/`; si vive fuera (Figma, otro repo), su enlace en `prototipo:`. Es recomendado, y muy recomendado en ciclo completo cuando la feature tiene interfaz: quien construye no parte de cero. No bloquea el gate.
   - **Experimento:** propón diseñarlo ahora con `disenar-experimento`. Se recomienda siempre y nunca se exige; si el lanzamiento está decidido y no hay causalidad que probar, anota `experimento: ninguno` y el motivo.
4. **Descomponer en Iteration PRDs** (template `iteration-prd.md`): rebanadas verticales de valor por sprint (algo usable/verificable por rebanada, no capas técnicas). Por cada una: user stories con **Gherkin**, casos de borde, requerimientos técnicos resueltos o ADR-placeholder, **medición e instrumentación** (eventos, tags e interruptores del experimento, o lo mínimo para observar el outcome) y work items por stream.
5. **Gate dev-ready (determinístico) por Iteration PRD** — no pasa a `approved` si falla alguno:
   - cero preguntas abiertas / TBD (fuera de ADR-placeholder explícito);
   - toda US con criterios Gherkin y ≥1 caso de borde;
   - trazabilidad completa: feature → épica → nodo OST → evidencia `[EV-NNN]`;
   - «Medición e instrumentación» resuelta: si la feature tiene experimento, está `diseñado` y su instrumentación está en el Iteration PRD; si no, la sección lo dice;
   - frontmatter y estado correctos.
6. **Aprobación y congelamiento (puerta humana dura).** La tríada/humano revisa → `approved` → el archivo **se mueve a `activas/`** y queda **congelado**: no se modifica sin comunicarlo a quien construye.

## Pitfalls

- **Iteration PRD por capas técnicas** ("sprint 1: la base de datos"). → Rebanadas verticales: cada iteración deja algo observable.
- **El Maestro como formalidad.** Si una feature entró y el Maestro no cambió, el Maestro está mal. → Paso 2 nunca se salta.
- **Preguntas abiertas camufladas** ("a definir", "ver con el equipo"). → O se resuelve aquí o es ADR-placeholder explícito; no hay tercera opción.
- **Re-litigar la solución.** Handoff especifica lo validado; si aparece un cuestionamiento de fondo, vuelve a Validate con el hallazgo — no se "arregla" en el PRD.
- **Copiar contenido del OST o del brief.** Se referencia (nodo, siglas EV), nunca se duplica — fuente única.
- **Instrumentación para después.** Si el experimento se diseña tras Build, hay que refactorizar para agregar tags y eventos. → Paso 3 y sección de medición del paso 4.
- **Modificar un doc en `activas/`** sin aviso. → Congelado significa congelado; el cambio se comunica y se versiona.

## Verification

- [ ] Jerarquía correcta: Maestro actualizado; feature bajo su épica; iteraciones bajo su feature.
- [ ] Gate dev-ready del paso 5 pasado por cada Iteration PRD (checklist completa).
- [ ] Evidencia citada por sigla `[EV-NNN]`; trazabilidad al nodo OST en cada nivel.
- [ ] ADRs creados para toda decisión técnica no obvia (o placeholder `proposed`).
- [ ] Experimento diseñado o «sin experimento» con motivo; prototipo junto al PRD o su ausencia explicada si la feature tiene interfaz.
- [ ] Estados y ubicaciones consistentes (ubicación = estado); movimiento a `activas/` solo tras aprobación humana explícita.
