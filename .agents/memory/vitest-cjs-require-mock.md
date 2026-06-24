---
name: vitest-cjs-require-mock
description: Il lazy require() dentro moduli ESM bypassa vi.mock in vitest; la fix è usare import ESM statico.
---

# Lazy require() bypassa vi.mock in vitest ESM

## La regola
Se un modulo TS usa `require("some-module")` dentro una funzione (lazy loader pattern),
`vi.mock("some-module", ...)` NON intercetta la chiamata in modalità vitest ESM.
Gli errori vengono catturati silenziosamente dai try/catch interni → 0 chiamate al mock.

**Fix**: sostituire il lazy `require()` con un import ESM statico al top del file.
Vitest intercetta sempre gli import ESM statici quando il modulo è mockato con `vi.mock`.

## Perché
Il pattern `let _mod = null; function get() { _mod = require("x"); }` era usato in
`lib/location-context.tsx` per expo-location. In ambiente native Expo il pattern
funziona; in vitest ESM il `require()` dentro un modulo ESM non passa per
l'interceptor di vi.mock.

## Come applicare
- Prima di scrivere test che mockano un modulo: grep il sorgente per `require(` inline.
- Se trovato in un contesto ESM (file con `import`/`export`), cambiare a `import * as Mod from "module"`.
- Il comportamento runtime è identico (Expo supporta l'import statico); i test diventano testabili.
- Aggiornare il tipo di eventuali ref che usavano `typeof import("module")` → `Mod.Type`.
