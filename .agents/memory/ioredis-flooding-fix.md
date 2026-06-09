---
name: ioredis ETIMEDOUT flooding fix
description: Soluzione definitiva al flooding [ioredis] Unhandled error event nei log backend quando Redis TCP è irraggiungibile dal cloud.
---

## Regola

Tre livelli combinati per eliminare il flooding:

1. **`retryStrategy: () => null`** in `server/cache/redis.ts` — zero retry dopo il primo tentativo fallito. Un solo ETIMEDOUT per client invece di infiniti.

2. **`client.disconnect()`** nel catch di `coordinator/index.ts` `subscribe()` — il duplicate creato per pub/sub va chiuso con `disconnect()` (non `quit()`). `quit()` è un comando che non viene inviato se non connesso; `disconnect()` forza la chiusura del socket TLS immediatamente.

3. **`console.error` filter** in `server/index.ts` (prima degli import) — blocca qualsiasi `[ioredis] Unhandled error event` residuo che bypassa i listener (ioredis v5 chiama `silentEmit` su oggetti interni che non ereditano sempre i listener del client principale).

**Why:** ioredis v5 `silentEmit` chiama `console.error` quando `this.listenerCount("error") === 0`. In alcuni path interni (TLS socket timeout via `eventHandler.errorHandler`) `this` non è il Redis client a cui abbiamo aggiunto il listener, ma un oggetto connection interno. Aggiungere un listener sul Redis client non è sufficiente in tutti i casi.

**How to apply:** Qualunque nuovo client ioredis (es. duplicate per pub/sub) che opera in ambiente cloud senza Redis TCP deve: (a) avere `retryStrategy: () => null`, (b) essere chiuso con `disconnect()` al fallimento, (c) il filter in index.ts copre tutto.

## Contesto

- Redis TCP non è forwarded dal router di casa → irraggiungibile dal cloud Replit
- Fallback in-memory sempre attivo — nessun impatto funzionale
- Il coordinator usa correttamente il fanout in-process come fallback
- Se Redis diventa disponibile, serve restart del backend (nessuna auto-riconnessione per design)
