---
name: Vite/Vitest upgrade audit
description: Risultati audit pre-aggiornamento vite 6→8; completato vite 8.0.16.
---

## Regola
**vite 8.0.16 installato** (percorso: 6.4.3→7.3.5→8.0.16). vitest 4.1.8 resta invariato — supporta già `vite ^6||^7||^8`.

## Why
vitest 4.1.8 dichiara `peerDependencies.vite: "^6.0.0 || ^7.0.0 || ^8.0.0"`. Nessun lockstep richiesto.

## How to apply (se futura regressione)
- I file `vitest.config.ts`, `vitest.config.lib.ts`, `vitest.config.server.ts` **non vanno toccati**.
  - `resolve.alias`, `define`, `test.*` sono tutti invariati in vite 7/8.
- Node 20.20.0 soddisfa il requisito vite 7/8 (20.19+).
- Breaking changes vite 7: sass legacy API removal, Node 18 drop, HotBroadcaster removal — nessuno impatta il progetto (no sass, no HotBroadcaster).
- Breaking changes vite 8: rolldown-vite merge (bundler interno), import.meta.hot.accept fallback, browser target aggiornato — nessuno impatta i 3 config vitest.
- Failure test post-upgrade (~42) sono pre-esistenti: mock AI (getGroqParseModel, isOllamaReachable) e timeout thinkcentre. Non correlate a vite.
