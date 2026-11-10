# gbo-video-editor · cómo se construyó Frameback

> **¿Quieres usar Frameback?** Está en **[guillebecerrao/frameback](https://github.com/guillebecerrao/frameback)**:
> ahí están la instalación, la documentación y los issues.
> *Looking for Frameback itself? Go to [guillebecerrao/frameback](https://github.com/guillebecerrao/frameback).*

Este repo es el **registro de construcción**: el espacio de trabajo donde un equipo de agentes de IA construyó
Frameback en una noche, operado con el framework de producto **P60** y su orquestador de entrega `orquestar-pb`.
Lo dejo público para mostrar cómo construyo productos: no solo el código final, sino el backlog, las decisiones, las
revisiones y lo que salió mal.

Por **Guillermo Becerra (GBO)** · [@guillebecerrao](https://github.com/guillebecerrao) ·
[YouTube](https://www.youtube.com/@guillebecerrao) · [X](https://x.com/guillebecerrao) ·
[Instagram](https://www.instagram.com/guillebecerrao) · [Builderia](https://builderia.lat)

## Qué es Frameback

Una herramienta local para dar feedback anclado (a un frame, una región, un rango, un corte o una transición) a un
agente que edita video. El agente recibe cada comentario mientras sigues revisando, prepara los cambios en paralelo y
renderiza la versión siguiente una sola vez. Nació como compañero de
[gbo-video](https://github.com/guillebecerrao/gbo-video), mi skill pública de edición de video agéntica.

## Cómo se construyó

1. **Una ronda de preguntas, luego autonomía.** Defino el objetivo y las restricciones; el orquestador pregunta lo
   indispensable (integración, stack, publicación) y registra el resto como decisiones razonables.
2. **Plan + revisión independiente.** Un modelo escribe la arquitectura y el protocolo; otro, sin ver el razonamiento,
   la revisa. Encontró 10 problemas de contrato que se corrigieron antes de escribir código.
3. **Carriles en paralelo.** 4 agentes construyen servidor/CLI, interfaz web, servidor MCP y kit de agente, cada uno
   en su propio worktree. Se integraron sin conflictos de código.
4. **Revisión multi-agente.** 5 revisores (UX en navegador real, correctitud adversarial, ergonomía del agente,
   privacidad/seguridad, onboarding desde cero) → 61 hallazgos → 3 arregladores los corrigen.
5. **Validación humana y retrabajo.** Probé la v0.1 con videos reales; mi feedback entró como ítems nuevos
   (BL-008, BL-009) y volvió a pasar por el mismo ciclo.

Resultado: 140 tests, smoke de punta a punta y CI en verde, publicado con historia limpia en su propio repo.

## Cómo leer este repo

| Para ver… | Abre |
|-----------|------|
| El backlog y el estado del trabajo | [`backlog/BACKLOG.md`](backlog/BACKLOG.md) |
| La épica y cada ítem, con criterios de aceptación | [`backlog/epicas/EP-001-frameback-v0-1/`](backlog/epicas/EP-001-frameback-v0-1/) |
| Cómo se repartió el trabajo entre agentes | [`LANES.md`](backlog/epicas/EP-001-frameback-v0-1/LANES.md) |
| Reglas de trabajo que fui decidiendo | [`backlog/PERFIL.md`](backlog/PERFIL.md) |
| Decisiones pendientes y resueltas | [`backlog/decisiones/`](backlog/decisiones/) |
| La guía de prueba que recibí en la mañana | [`backlog/revisiones/`](backlog/revisiones/) |
| Qué se aprendió (incluidos errores de los agentes) | [`backlog/aprendizajes.md`](backlog/aprendizajes.md) |
| La arquitectura y el protocolo | [`frameback/docs/`](frameback/docs/) |
| El framework P60 completo | [`p60/`](p60/) y [`.claude/`](.claude/) |

**Sobre `frameback/`:** es la copia de desarrollo. El código canónico, el que se instala y versiona, está en
[guillebecerrao/frameback](https://github.com/guillebecerrao/frameback); los cambios se hacen aquí y se publican allá.

**Sobre `gbo-style`:** en el backlog y las revisiones aparece con ese nombre la skill de edición que integró Frameback
durante la construcción. Hoy esa capacidad es pública como [gbo-video](https://github.com/guillebecerrao/gbo-video);
las preferencias personales viven aparte, en un perfil local que no se publica.

**Sobre los commits:** los firma `AgenticOps-GBO`, la cuenta de la máquina donde corren mis agentes.

## P60

P60 es un framework para operar producto con agentes: discovery, specs, evidencia y decisiones viven en archivos
versionados (`p60/`), y skills y agentes (`.claude/`) conducen cada sub-proceso. Para Frameback lo usé en modo
**construcción directa** (el producto está en su Etapa 0, sin árbol de oportunidades todavía): el backlog con criterios
de aceptación verificables fue la spec, y `orquestar-pb` llevó la entrega. La guía del método está en
[`p60/_framework/docs/P60-Framework-Guide.md`](p60/_framework/docs/P60-Framework-Guide.md).
