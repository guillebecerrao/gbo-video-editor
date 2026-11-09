---
type: adr
id: ADR-003
status: accepted
scope: framework
decision_owner: Guille Becerra O (Product Builder)
created: 2026-11-04
last_modified: 2026-11-04
supersedes: []
---

# ADR-003 — Handoff completo: medición y prototipo antes de Build

> Tercera decisión estructural del framework. Salió de la conversación conceptual para la landing p60.lat: mientras más
> completo llega el Handoff a Build, menos retrabajo.

## Contexto

Hasta la v2.3, el experimento se diseñaba **después** de Build (`disenar-experimento` era «validación post-build») y la
instrumentación se verificaba recién antes de lanzar. En la práctica, si una feature llega a Build sin haber pensado
cómo se va a medir, después hay que refactorizar para agregar eventos, tags e interruptores.

Algo parecido pasaba con el prototipo: la Guía decía que el PRD de feature iba con un prototipo alta-fi, pero ningún
skill lo pedía ni decía dónde vivía. Quien construía partía de cero.

Al mismo tiempo, no todo lo que se construye necesita un experimento. A veces el lanzamiento ya está decidido por un
compromiso contractual o una urgencia, y forzar un experimento no aporta nada a la decisión.

## Decisión

1. **El experimento se diseña en el Handoff.** `disenar-experimento` corre junto a `redactar-prd`, antes de aprobar los
   Iteration PRDs: propósito, método, métrica primaria (la del outcome), guardarraíles, umbral pre-registrado e
   instrumentación. En Experimentación se verifica la instrumentación en producción, se lanza y, al corte, se decide con
   `decision-ship`.
2. **El experimento se recomienda siempre y nunca se exige.** Declara su propósito:
   - `rollout`: el resultado condiciona si se consolida, se itera o se retira.
   - `causalidad`: el lanzamiento ya está decidido, pero se quiere fundamentar que la feature causó un cambio de
     comportamiento.
   - Sin experimento: el lanzamiento está decidido y no hay causalidad que probar. El PRD de feature lo declara
     (`experimento: ninguno`) con su motivo.
3. **La instrumentación es parte de la spec.** El Iteration PRD lleva una sección «Medición e instrumentación» (eventos,
   tags, interruptores) como trabajo de Build y en su definición de terminado. El gate dev-ready de `redactar-prd` pide
   esa sección resuelta, sin exigir un experimento.
4. **Prototipo funcional junto a su PRD.** El Handoff puede entregar un prototipo funcional (HTML o algo más elaborado)
   en `features/[feature]/prototipo/`, al lado del PRD de feature; si vive fuera, su enlace va en `prototipo:`. Es
   recomendado, y muy recomendado en ciclo completo cuando la feature tiene interfaz. No es obligatorio ni bloquea el
   gate.

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| Mantener el diseño del experimento post-build | La instrumentación se agrega después con refactor |
| Exigir un experimento para aprobar el Iteration PRD | Fuerza experimentos sin sentido cuando el lanzamiento ya está decidido |
| Exigir prototipo en todo Handoff | Hay features sin interfaz, y la vía rápida no lo amerita |
| Prototipos en una carpeta global de prototipos | Se separan de su PRD; junto a él se leen y se archivan juntos |

## Consecuencias

- Habilita: Build implementa la medición una sola vez; quien construye parte de un prototipo; el experimento existe
  antes del deploy y su propósito queda explícito.
- Sacrifica: el Handoff es más largo, porque diseña el experimento y el prototipo antes de construir.
- `decision-ship` distingue el propósito: con `causalidad`, la lectura alimenta el aprendizaje y no elige entre ship y
  no-ship; sin experimento, solo se propaga al verificar en producción.
- Revisitar cuando: haya features cuya medición no pueda definirse antes de construir.

## Estado

`accepted`. Decisiones de Guillermo del 2026-11-04: adelantar el experimento y la instrumentación al Handoff; prototipo
recomendado (muy recomendado en ciclo completo con interfaz), no obligatorio, junto a su PRD; experimento siempre
recomendado, nunca exigido.

## Changelog
| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | 2026-11-04 | Claude Opus 5.5 (Product-Builder) | Creación (P60 2.4.0). |
