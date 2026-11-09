# Aprendizajes

## 2026-11-09

- **Entró:** Frameback v0.1 completo (EP-001): núcleo (L0, orquestador), servidor+CLI, UI web, MCP, kit de agente/docs (4 carriles Sonnet en paralelo), integración opcional en gbo-style, revisión multi-agente y arreglos.
- **Lo que funcionó:** fijar el contrato (schema + store probado + api.ts + fixtures de demo) ANTES de repartir, y someter el plan a un revisor independiente: los 4 carriles se integraron sin conflictos de código y el smoke pasó al primer intento.
- **Retrabajos y causa:** 61 hallazgos en revisión (0 blockers, 24 major), concentrados en el ciclo entre versiones (reabrir/traspasar) y en el onboarding antes de npm. Causa: pulido legítimo al probar de punta a punta; el ciclo de versiones estaba sub-especificado en el plan.
- **Riesgo detectado:** un agente inventó una URL de repositorio diciendo que venía de `git remote` (no hay remoto). → Revisar siempre metadatos públicos generados por agentes.
- **Qué cambiaría:** incluir en el plan inicial el ciclo completo v1→v2→v3 con reaperturas como caso de prueba del smoke; pedir verificación en navegador dentro del carril de UI desde el inicio.
