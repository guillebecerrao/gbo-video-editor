# Skills — índice

> **Progressive disclosure nivel 1.** Léelo primero para elegir el skill. Abre el `SKILL.md` completo solo del que matchee la tarea. No abras `references/` por defecto. Si dos skills podrían aplicar, lee ambos — están diseñados para encadenarse.
> Formato de cada skill: `https://github.com/guillebecerrao/p60/blob/main/skills/_standards/SKILL-format.md`.

| Skill | Cuándo cargarlo | Sub-proceso |
|-------|-----------------|-------------|
| [fundacion-etapa-0](../../.claude/skills/fundacion-etapa-0/SKILL.md) | Poblar la fundación de un producto recién instanciado (entrevista guiada de Etapa 0) | Etapa 0 |
| [ost-facilitator](../../.claude/skills/ost-facilitator/SKILL.md) | Crear, actualizar, revisar o priorizar el Opportunity Solution Tree | Shape |
| [interview-snapshot](../../.claude/skills/interview-snapshot/SKILL.md) | Documentar transcripciones de entrevistas en formato snapshot | Shape |
| [brief-entrevista](../../.claude/skills/brief-entrevista/SKILL.md) | Diseñar una guía de entrevista para nodos del OST con gaps de evidencia | Shape |
| [ideacion-estructurada](../../.claude/skills/ideacion-estructurada/SKILL.md) | Generar y preseleccionar candidatas de solución para la oportunidad target | Ideate |
| [assumption-testing](../../.claude/skills/assumption-testing/SKILL.md) | Mapear supuestos de una candidata, rankearlos por riesgo y diseñar su test más barato | Validate |
| [brief-test-no-moderado](../../.claude/skills/brief-test-no-moderado/SKILL.md) | Diseñar un test no moderado (Lyssna u otra) para validar comprensión o usabilidad | Validate |
| [redactar-prd](../../.claude/skills/redactar-prd/SKILL.md) | Madurar el brief seleccionado a PRD Maestro / PRD de feature / Iteration PRDs dev-ready, con prototipo y medición | Handoff |
| orquestar-pb | Orquestar la construcción con agentes en paralelo desde un backlog en el repo de código (skill global: `p60 skills add orquestar-pb`) | Build |
| [disenar-experimento](../../.claude/skills/disenar-experimento/SKILL.md) | Diseñar en Handoff cómo se valida la feature (propósito, métrica, umbral, instrumentación) y lanzarlo tras Build | Handoff · Experimentación |
| [decision-ship](../../.claude/skills/decision-ship/SKILL.md) | Leer resultados del experimento y facilitar la decisión ship/no-ship/iterar | Experimentación |
| [bibliotecario-evidencia](../../.claude/skills/bibliotecario-evidencia/SKILL.md) | Procesar el `_inbox` de evidencia: ficha EV-NNN, archivado e índice buscable | Transversal |
| [actualizar-bitacora-humana](../../.claude/skills/actualizar-bitacora-humana/SKILL.md) | Consolidar notas personales del equipo en la bitácora humana | Transversal |
| [cierre-de-ciclo](../../.claude/skills/cierre-de-ciclo/SKILL.md) | Cerrar un ciclo de sub-proceso: retro, archivar, actualizar bitácora | Transversal |
| [generar-presentacion-html](../../.claude/skills/generar-presentacion-html/SKILL.md) | Convertir un artefacto estratégico en HTML ejecutivo para stakeholders | Transversal |

> **Cobertura del pipeline (v2.3, 2026-11-02):** Etapa 0 y los 6 sub-procesos tienen skill — Etapa 0 (1), Shape (3), Ideate (1), Validate (2), Handoff (1), Build (1), Experimentación (2), transversales (4). Build se orquesta con `orquestar-pb` (ADR-002) o con el proceso propio del equipo que construye (ADR-001). Todos invocables también como skill nativo (`.claude/skills/`), salvo las skills globales (`scope: global`), que cada persona instala en sus skills de usuario con `p60 skills add <skill>`.
