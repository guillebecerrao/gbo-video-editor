---
name: disenar-experimento
description: Diseña en el Handoff cómo se validará una feature con uso real — propósito (decidir el rollout o probar causalidad), método, métrica primaria, guardarraíles, umbral pre-registrado e instrumentación — y lo lanza en Experimentación.
version: 2.0
status: active
triggers: ["diseñar el experimento", "cómo vamos a medir esta feature", "cómo validamos la feature", "a/b test de la feature", "fake door", "plan de experimentación", "lanzar el experimento"]
requires_context: ["el PRD de feature y sus Iteration PRDs en borrador (Handoff)", "p60/experimentacion/pipeline.md", "outcome del nodo OST correspondiente"]
last_sync: 2026-11-04
---

# Diseñar Experimento

> Convierte al agente en diseñador de experimentos. Se diseña en el **Handoff**, junto a la spec, para que la
> instrumentación entre en el Iteration PRD y Build la implemente de una vez; se lanza y se lee en **Experimentación**.
> Lo construido se valida con uso real, contra un umbral definido antes de mirar los datos.

## When to Use

- **En Handoff**, mientras `redactar-prd` madura el PRD de feature y antes de aprobar sus Iteration PRDs: diseñar cómo
  se validará la feature.
- **En Experimentación**, cuando la feature ya está desplegada: verificar la instrumentación en producción y lanzar el
  experimento diseñado.

**Se recomienda siempre y nunca se exige.** Tiene sentido cuando el resultado puede condicionar el rollout, o cuando el
lanzamiento ya está decidido pero se quiere fundamentar causalidad en un cambio de comportamiento. Si el lanzamiento está
decidido de antemano (un compromiso contractual, una urgencia) y no hay causalidad que probar, la feature va sin
experimento: el PRD de feature lo declara con su motivo, sin forzar un experimento que nadie va a usar para decidir.

**NO** lo uses para: tests de supuestos pre-build (eso es `assumption-testing`, con prototipos), ni para tomar la decisión
final (eso es `decision-ship`, con los resultados en la mano).

## Procedure

### En Handoff: diseñar

1. **Recuperar la promesa.** Del PRD de feature y su nodo OST: ¿qué outcome (cambio de comportamiento medible) prometía
   mover esta feature? El experimento mide **eso**, no clicks genéricos ni "engagement".
2. **Declarar el propósito**, con la persona responsable:
   - `rollout`: el resultado decide si se consolida, se itera o se retira.
   - `causalidad`: el lanzamiento ya está decidido; el experimento sirve para saber si la feature causó el cambio.
   - Sin experimento: el lanzamiento está decidido y no hay causalidad que probar. Se anota en el PRD de feature
     (`experimento: ninguno` y el motivo) y aquí termina el skill.
3. **Elegir el método más barato que dé señal real**, según tráfico y riesgo:
   | Situación | Método |
   |-----------|--------|
   | Tráfico suficiente para partir | **A/B** (control vs. variante) |
   | Poco tráfico | **Antes/después con cohorte** (misma métrica, ventanas comparables) |
   | Riesgo alto / reversibilidad dudosa | **Rollout gradual** (5% → 25% → 100% con criterios de avance) |
   | Validar demanda antes de invertir más | **Fake door / smoke test** |
4. **Definir métricas**: **una primaria** (la del outcome), 1–2 secundarias de contexto y **guardarraíles** (lo que no
   puede empeorar: churn, errores, latencia, quejas).
5. **Pre-registrar el umbral y la duración**: "éxito si [métrica primaria] mejora ≥X% con [ventana/n] — decidimos a los
   [N días del lanzamiento]". Escrito **antes** de exponer usuarios; sin extensión silenciosa de la ventana ("seguir
   mirando hasta que dé" invalida el experimento).
6. **Especificar la instrumentación**: eventos, tags, propiedades e interruptor de la asignación. Va en el documento del
   experimento y **se lleva a la sección «Medición e instrumentación» de cada Iteration PRD** como trabajo de Build, con
   su criterio en la definición de terminado.
7. **Registrar**: documento en `p60/experimentacion/experimentos/EXP-NN-[slug].md` (template `templates/experimento.md`)
   con estado `diseñado`, `experimento: EXP-NN` en el PRD de feature y en sus Iteration PRDs, y una fila en
   `p60/experimentacion/pipeline.md`.

### En Experimentación: lanzar

8. **Verificar en producción** que cada evento de la instrumentación llega con datos reales, antes de exponer usuarios.
9. **Lanzar**: fija `fecha_lanzamiento` y `fecha_corte`, pasa el experimento a `running` y actualiza `pipeline.md`. Al
   llegar la fecha de corte → `decision-ship`.

## Pitfalls

- **Métrica de vanidad como primaria.** Clicks suben y el outcome ni se movió. → La primaria es la del nodo OST, siempre.
- **Umbral post-hoc.** Con datos a la vista todo umbral se racionaliza. → Pre-registrado en el paso 5, sin excepción.
- **Instrumentación fuera de la spec.** Si no está en el Iteration PRD, Build no la construye y después hay que
  refactorizar para agregarla. → Paso 6, antes de aprobar el Iteration PRD.
- **Forzar un experimento.** Si el lanzamiento está decidido y no hay causalidad que probar, el experimento es un trámite.
  → Declara «sin experimento» con su motivo; recomendar no es exigir.
- **Extender la ventana "para estar seguros".** Peeking + extensión = falso positivo casi garantizado. → La fecha de
  corte se respeta; si la señal es insuficiente, esa ES la lectura.
- **Experimento sin guardarraíles.** La primaria mejora mientras el churn sube. → Guardarraíles explícitos en el paso 4.

## Verification

- [ ] Propósito declarado (`rollout` o `causalidad`), o «sin experimento» con su motivo en el PRD de feature.
- [ ] Métrica primaria = outcome del nodo OST; guardarraíles definidos.
- [ ] Umbral y ventana pre-registrados en el doc del experimento.
- [ ] Método justificado contra tráfico/riesgo (el más barato con señal).
- [ ] Instrumentación en la sección «Medición e instrumentación» de cada Iteration PRD, antes de su aprobación.
- [ ] Antes de lanzar: eventos verificados en producción; experimento `running` en `pipeline.md` con fecha de corte.
