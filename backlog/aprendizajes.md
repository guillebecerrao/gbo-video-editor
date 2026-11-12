# Aprendizajes

## 2026-11-09

- **Entró:** Frameback v0.1 completo (EP-001): núcleo (L0, orquestador), servidor+CLI, UI web, MCP, kit de agente/docs (4 carriles Sonnet en paralelo), integración opcional en gbo-style, revisión multi-agente y arreglos.
- **Lo que funcionó:** fijar el contrato (schema + store probado + api.ts + fixtures de demo) ANTES de repartir, y someter el plan a un revisor independiente: los 4 carriles se integraron sin conflictos de código y el smoke pasó al primer intento.
- **Retrabajos y causa:** 61 hallazgos en revisión (0 blockers, 24 major), concentrados en el ciclo entre versiones (reabrir/traspasar) y en el onboarding antes de npm. Causa: pulido legítimo al probar de punta a punta; el ciclo de versiones estaba sub-especificado en el plan.
- **Corrección (2026-11-09, tarde):** dije que un agente había inventado la URL `github.com/guillebecerrao/gbo-video-editor`; en realidad sí existe ese remoto (`origin`). El error fue mío por no correr `git remote -v`. La URL sí era incorrecta para Frameback (era el repo del proyecto). → Verificar con el comando antes de desmentir a un agente.
- **Qué cambiaría:** incluir en el plan inicial el ciclo completo v1→v2→v3 con reaperturas como caso de prueba del smoke; pedir verificación en navegador dentro del carril de UI desde el inicio.
- **Privacidad al publicar (2026-11-09):** crear un repo en GitHub con licencia o README genera un "Initial commit" con el correo principal de la cuenta. Construir encima lo deja en la historia pública. → Antes de pushear a un repo recién creado, revisar `git log --format='%ae %ce'` del remoto; se reescribió la historia de Frameback sin ese commit.
- **Ecosistema (2026-11-09, noche):** gbo-style pasó a ser `gbo-video` (pública) + `gbo-video-profile` (privada). Se revisó todo lo público: Frameback solo nombraba gbo-style en un comentario de `remap.ts`; ahora README y docs enlazan a gbo-video. El sidecar de `gbo_render.py` ya emite la pista `cuts` con `source`, así que el remapeo de comentarios funciona igual. → Al renombrar o partir una skill, buscar su nombre en todos los repos públicos y separar método (público) de perfil (privado).

## 2026-11-12

- **Entró (feedback de la sesión de consolidación, retros de videos editados):** BL-010 · limpieza de pausas y muletillas (borrador, por refinar), BL-011 · watch reanuda desde un cursor persistido, BL-012 · avisar si el video cambió bajo la misma ruta, BL-013 · revisar PR #1 externo (Docker + webhooks), BL-014 · Frameback 0.1.2 (GIF + deprecar 0.0.0-stage). Todo `propuesto`, sin construir hasta que Guillermo apruebe.
- **Cerrado sin ítem:** el bloqueo de comentarios cuando un agente cerró la revisión (closed → delivered con `--force`) ya está mitigado en 0.1.1 (commit c3ead59 del repo público, 4277ed4 aquí): quien revisa puede reabrir la última versión aunque el agente la haya cerrado, y el protocolo pide cerrar solo la versión reemplazada.
- **Lección de las retros:** lo que falla en uso real está en los bordes del ciclo de vida (reinicios del watcher, archivos sobrescritos), no en la UI. → Al planificar, incluir en el smoke los reinicios y las sobrescrituras.
- **Lote 0.1.2 (BL-011, BL-012):** dos carriles Sonnet en paralelo + integrador; sin retrabajos ni conflictos (los archivos compartidos eran solo CLI y docs). Lo que consumió más fue la verificación visual del banner: Aside no está instalado y se usó el navegador headless de gstack. → El encargo de UI debería pedir la captura con `/browse` dentro del carril (CLAUDE.md prohíbe Chrome y el agente no la hizo).
- **Código externo:** la política de permisos bloquea ejecutar el código de un PR de terceros. → Revisarlo de forma estática y dejar la ejecución para cuando el responsable la autorice.
