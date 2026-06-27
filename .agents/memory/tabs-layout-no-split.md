---
name: tabs layout — no re-split, options module-level
description: app/(tabs)/_layout.tsx è boot-critical; non ri-splittarlo in .partN e tenere le options dei Tabs.Screen module-level
---

# app/(tabs)/_layout.tsx — regola anti-loop

`app/(tabs)/_layout.tsx` porta il marker `// @no-split` in testa.

**Regola:**
1. NON ri-splittare questo file in `_layout.partN.tsx`. Lo split precedente
   (`getTabScreens` estratta in `_layout.part2.tsx`) reintroduceva options object
   creati fuori dal componente ma usati in modo da rigenerare riferimenti →
   contribuiva al crash-loop OTA "Maximum update depth exceeded".
2. Le `options` dei 15 `Tabs.Screen` DEVONO restare costanti module-level:
   oggetti statici dove non c'è `t()`/config; **factory functions** module-level
   dove servono `t()` (i18n runtime), `gpsTabHref` o il ternario `isBikerOrCoppia`
   (una const non può valutare `t()` al load del modulo).
3. L'anti-loop vero resta `frozenTabScreensRef`: `getTabScreens(...)` è chiamata
   UNA sola volta al primo render; l'array di `Tabs.Screen` non si ricrea mai.

**Why:** options inline (o ricreate ad ogni render) = nuovi ref → useLayoutEffect ×15
→ setOptions ×15 → cascata → loop. Tenere il file unito evita che un futuro ratchet
600-righe spinga di nuovo a splittare e re-inlinare le options.

**How to apply:** il marker `@no-split` è DOCUMENTALE, non un bypass del ratchet
(`scripts/lib/large-files-core.ts` conosce solo `LARGE-FILE-ALLOW`/`LARGE-FILE-LOCKED`).
Se il file supera 600 righe in futuro, usare i marker ufficiali, NON re-splittare.
