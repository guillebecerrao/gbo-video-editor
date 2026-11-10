# Aprendizajes

## 2026-11-09

- **Entró:** Frameback v0.1 completo (EP-001): núcleo (L0, orquestador), servidor+CLI, UI web, MCP, kit de agente/docs (4 carriles Sonnet en paralelo), integración opcional en gbo-style, revisión multi-agente y arreglos.
- **Lo que funcionó:** fijar el contrato (schema + store probado + api.ts + fixtures de demo) ANTES de repartir, y someter el plan a un revisor independiente: los 4 carriles se integraron sin conflictos de código y el smoke pasó al primer intento.
- **Retrabajos y causa:** 61 hallazgos en revisión (0 blockers, 24 major), concentrados en el ciclo entre versiones (reabrir/traspasar) y en el onboarding antes de npm. Causa: pulido legítimo al probar de punta a punta; el ciclo de versiones estaba sub-especificado en el plan.
- **Corrección (2026-11-09, tarde):** dije que un agente había inventado la URL `github.com/guillebecerrao/gbo-video-editor`; en realidad sí existe ese remoto (`origin`). El error fue mío por no correr `git remote -v`. La URL sí era incorrecta para Frameback (era el repo del proyecto). → Verificar con el comando antes de desmentir a un agente.
- **Qué cambiaría:** incluir en el plan inicial el ciclo completo v1→v2→v3 con reaperturas como caso de prueba del smoke; pedir verificación en navegador dentro del carril de UI desde el inicio.
- **Privacidad al publicar (2026-11-09):** crear un repo en GitHub con licencia o README genera un "Initial commit" con el correo principal de la cuenta. Construir encima lo deja en la historia pública. → Antes de pushear a un repo recién creado, revisar `git log --format='%ae %ce'` del remoto; se reescribió la historia de Frameback sin ese commit.
- **Ecosistema (2026-11-09, noche):** gbo-style pasó a ser `gbo-video` (pública) + `gbo-video-profile` (privada). Se revisó todo lo público: Frameback solo nombraba gbo-style en un comentario de `remap.ts`; ahora README y docs enlazan a gbo-video. El sidecar de `gbo_render.py` ya emite la pista `cuts` con `source`, así que el remapeo de comentarios funciona igual. → Al renombrar o partir una skill, buscar su nombre en todos los repos públicos y separar método (público) de perfil (privado).
