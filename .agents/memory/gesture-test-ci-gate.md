---
name: Gesture test CI gate
description: Gate bloccante post-merge per i test automatici gesture/componenti in components/__tests__/
---

# Gesture test CI gate

## Regola
`npx vitest run components/__tests__` è un gate bloccante in `scripts/post-merge.sh` (sezione "Gate test gesture componenti"), posizionato dopo il guard Index Drift e prima del cleanup smoke.

**Why:** Un refactor che torna FloatingWidget a Pressable (invece di TouchableOpacity/GestureDetector) non viene rilevato dal typecheck; i test gesture coprono questa regressione specifica.

**How to apply:** Qualunque nuovo file `*.test.ts` in `components/__tests__/` viene automaticamente incluso dal gate (vitest usa la directory intera). Non serve modificare post-merge.sh per aggiungere nuovi test.

## Convenzione commento (21 giu 2026)
Il commento del gate in post-merge.sh NON elenca i singoli file di test (lista volatile); descrive invece il comportamento del glob ("tutti i *.test.ts in components/__tests__/ vengono inclusi automaticamente") con solo pochi esempi non esaustivi. Questo evita che il commento diventi stale a ogni nuovo file aggiunto.
