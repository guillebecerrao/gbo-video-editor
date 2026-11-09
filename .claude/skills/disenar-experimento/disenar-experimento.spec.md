---
component: disenar-experimento
type: skill
version: 2.0
status: active
agent_role: architect
last_sync: 2026-11-04
depends_on: [SKILL-format, redactar-prd, ADR-003]
---

# Diseñar Experimento — Spec

## Propósito
Diseñar en el **Handoff** cómo se validará una feature con uso real (propósito, método, métrica del outcome, umbral pre-registrado e instrumentación), para que Build implemente la medición de una vez, y lanzarlo en **Experimentación** (ADR-003).

## Contrato
- **Input:** en Handoff, el PRD de feature y sus Iteration PRDs en borrador + su nodo OST; en Experimentación, la feature desplegada.
- **Output:** en Handoff, `p60/experimentacion/experimentos/EXP-NN-[slug].md` en `diseñado`, `experimento: EXP-NN` en el PRD de feature y los Iteration PRDs, y la instrumentación en su sección «Medición e instrumentación»; en Experimentación, el experimento `running` con fecha de corte en `pipeline.md`.
- **Recomendado, nunca exigido:** sin experimento, el PRD de feature declara `experimento: ninguno` y el motivo.
- **Invariantes:** métrica primaria = outcome del nodo; umbral y ventana antes de exponer usuarios; instrumentación verificada antes del launch; guardarraíles siempre.

## Criterios de aceptación
- [ ] `SKILL.md` lean con las 4 secciones; template `experimento.md` en `templates/`.
- [ ] Tabla de selección de método por tráfico/riesgo.
- [ ] Registrado en `p60/_framework/skills-index.md`.
- [x] Diseño en Handoff con propósito `rollout | causalidad`; instrumentación llevada al Iteration PRD; lanzamiento como paso aparte (v2.0).

## Decisiones (ADR inline)
- **Pre-registro como invariante** (no como buena práctica opcional): con agentes generando análisis a demanda, la tentación de racionalizar umbrales post-hoc crece — el pre-registro es el antídoto estructural.
- **Diseño en Handoff, no post-build** (ADR-003): la instrumentación que no está en la spec se agrega después con refactor. Recomendado siempre, nunca exigido: cuando el lanzamiento está decidido y no hay causalidad que probar, forzarlo es un trámite.
- **Split diseño/decisión en dos skills** (`disenar-experimento` / `decision-ship`): momentos distintos del ciclo, contextos distintos (pre-launch vs. datos en mano) y el segundo es un checkpoint de juicio humano; separarlos evita que la decisión se cuele en el diseño.

## Changelog
| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | 2026-07-13 | Claude Fable 5 (Product-Builder) | Creación. Cubre el gap H6 (Experimentación sin skill) del análisis de mejoras (pasada Fable 5). |
| 1.1 | 2026-10-19 | Claude Opus 5.5 (Product-Builder) | Rutas de instancia explícitas `p60/…` (layout único, `p60-cli.spec` 0.2). |
| 2.0 | 2026-11-04 | Claude Opus 5.5 (Product-Builder) | Se diseña en Handoff (propósito, métricas, umbral, instrumentación al Iteration PRD) y se lanza en Experimentación; recomendado, nunca exigido (ADR-003). |
