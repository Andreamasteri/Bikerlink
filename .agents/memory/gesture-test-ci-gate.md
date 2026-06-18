---
name: Gesture test CI gate
description: Gate bloccante post-merge per i test automatici gesture/componenti in components/__tests__/
---

# Gesture test CI gate

## Regola
`npx vitest run components/__tests__` è un gate bloccante in `scripts/post-merge.sh` (sezione "Gate test gesture componenti"), posizionato dopo il guard Index Drift e prima del cleanup smoke.

**Why:** Un refactor che torna FloatingWidget a Pressable (invece di TouchableOpacity/GestureDetector) non viene rilevato dal typecheck; i test gesture coprono questa regressione specifica.

**How to apply:** Qualunque nuovo file `*.test.ts` in `components/__tests__/` viene automaticamente incluso dal gate (vitest usa la directory intera). Non serve modificare post-merge.sh per aggiungere nuovi test.

## Stato attuale (18 giu 2026)
- 2 file di test: `FloatingWidget.gesture.test.ts`, `AssistantFab.bottom.test.ts`
- 38 test, tutti passanti (1.17s)
- vitest.config.ts già include `components/__tests__/**/*.test.ts`
