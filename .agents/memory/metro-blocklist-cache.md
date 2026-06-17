---
name: Metro blockList regex + cache OTA optimization
description: blockList lookbehind fix, maxWorkers, e perché NON cancellare metro-file-map automaticamente
---

## Regola

`config.maxWorkers = 4` in metro.config.js (era 1 → export troppo lento su codebase grande).

**NON cancellare `/tmp/metro-file-map-*` automaticamente** nello script OTA.
Usare `CLEAN_METRO_CACHE=1` solo se la cache è davvero corrotta.

## BlockList regex

La regex `blockList` per `/logs/` DEVE usare il lookbehind negativo:
```js
/(?<!node_modules.*)\/logs\//
```
Senza lookbehind, blocca `node_modules/@sentry/core/build/esm/logs/` → Metro crasha.

## Perché non cancellare metro-file-map automaticamente

La pulizia sistematica di `/tmp/metro-file-map-*` era necessaria perché la regex
blockList sbagliata corrompeva la cache. Il fix è in place da maggio 2026.

Cancellarla ad ogni OTA forza Metro a riscansionare ~70k file di node_modules
da zero: +30-40s extra per run. Con `maxWorkers=1` questo portava export da
24s → 129s nel corso di 20+ OTA.

**Why:** metro-file-map è la cache del resolver (quali file esistono). La cache
di trasformazione (`.metro-cache/` FileStore) è separata e non va mai toccata.

**How to apply:** se Metro crasha con errori strani di risoluzione moduli,
impostare `CLEAN_METRO_CACHE=1` nel workflow OTA e rilanciare una volta sola.
