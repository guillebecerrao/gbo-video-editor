---
component: redactar-prd
type: skill
version: 1.2
status: active
agent_role: architect
last_sync: 2026-11-04
depends_on: [SKILL-format, artifacts, constitution, disenar-experimento, ADR-003]
---

# Redactar PRD — Spec

## Propósito
Dar protocolo al sub-proceso **Handoff** (antes solo tenía templates): madurar el PRD-brief seleccionado a la jerarquía PRD Maestro / PRD de feature / Iteration PRDs con gate dev-ready determinístico y congelamiento correcto.

## Contrato
- **Input:** PRD-brief `selected` + jerarquía de épicas existente.
- **Output:** Maestro creado/actualizado, PRD de feature con evidencia citada, Iteration PRDs dev-ready en `activas/` tras aprobación humana, ADRs de decisiones técnicas; recomendados: prototipo funcional junto al PRD y experimento diseñado, con su instrumentación en el Iteration PRD (ADR-003).
- **Invariantes:** el Maestro nunca queda desalineado de sus features; ningún Iteration PRD llega a `approved` con preguntas abiertas (salvo ADR-placeholder); congelado = no se toca sin comunicar; referencias por sigla/nodo, nunca duplicación.

## Criterios de aceptación
- [ ] `SKILL.md` lean con las 4 secciones; usa los templates de `p60/_framework/templates/artifacts/es/` (no crea templates propios).
- [ ] Gate dev-ready explícito y verificable (paso 5).
- [ ] Registrado en `p60/_framework/skills-index.md`.
- [x] Prototipo funcional y experimento recomendados (no exigidos); el gate pide la sección «Medición e instrumentación» resuelta (v1.2).

## Decisiones (ADR inline)
- **Sin template propio:** los 4 templates de artefactos ya existen y son la fuente; el skill aporta el *protocolo* (jerarquía, gate, congelamiento), no el formato. Evita deriva doble template/skill.
- **Gate dev-ready determinístico dentro del skill** (no como paso externo): es la primera línea de verificación — barata, sin juicio, ejecutable en cada corrida. Los gates de juicio (LLM-as-judge) quedan para una iteración futura del framework (análisis Fable 5, C2).
- **Rebanadas verticales por iteración:** práctica estándar de descomposición ágil; con agentes construyendo, cada rebanada es además un punto de verificación end-to-end natural.

## Changelog
| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | 2026-07-13 | Claude Fable 5 (Product-Builder) | Creación. Cubre el gap H6 (Handoff sin skill — el sub-proceso central del framework) del análisis de mejoras (pasada Fable 5). |
| 1.1 | 2026-10-19 | Claude Opus 5.5 (Product-Builder) | Rutas de instancia explícitas `p60/…` (layout único, `p60-cli.spec` 0.2). |
| 1.2 | 2026-11-04 | Claude Opus 5.5 (Product-Builder) | Handoff completo (ADR-003): prototipo funcional junto al PRD y experimento diseñado en Handoff, recomendados; el Iteration PRD lleva «Medición e instrumentación». |
