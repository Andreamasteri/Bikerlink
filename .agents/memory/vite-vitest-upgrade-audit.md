---
name: Vite/Vitest upgrade audit
description: Risultati audit pre-aggiornamento vite 6→8; piano preciso per la build di upgrade.
---

## Regola
Aggiornare **solo vite** (6.4.3 → 8.0.16). vitest 4.1.8 resta invariato — supporta già `vite ^6||^7||^8`.

## Why
vitest 4.1.8 dichiara `peerDependencies.vite: "^6.0.0 || ^7.0.0 || ^8.0.0"`. Nessun lockstep richiesto.

## How to apply
- Modifica `package.json`: `"vite": "^8.0.16"` (o `"^8.0.0"`).
- I file `vitest.config.ts`, `vitest.config.lib.ts`, `vitest.config.server.ts` **non vanno toccati**.
  - `resolve.alias`, `define`, `test.*` sono tutti invariati in vite 7/8.
- Override `"esbuild": "0.27.2"` compatibile con vite 8 (peer range `^0.27.0`).
- Node 20.20.0 soddisfa il requisito vite 7+ (20.19+).
- Baseline pre-upgrade: 19/19 test pass su subset non-DB; 3 failure pre-esistenti in ai-schema-compatibility (non correlate a vite).
- Dopo l'upgrade: rieseguire `npx vitest run --config vitest.config.ts` e verificare che le failure siano ≤ 3 (stesse di prima).
- Report completo: `.local/vite-upgrade-audit.md`.
