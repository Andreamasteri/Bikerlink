---
name: ioredis ETIMEDOUT flooding fix
description: Soluzione definitiva al flooding [ioredis] Unhandled error event nei log backend quando Redis TCP è irraggiungibile dal cloud.
---

## Regola

> **AGGIORNAMENTO (migrazione a Upstash cloud):** il livello 1 è cambiato. `retryStrategy: () => null` (zero retry, nessuna riconnessione) era pensato per il Redis del ThinkCentre, irraggiungibile dal cloud. Con Upstash (cloud affidabile EU) la riconnessione automatica è **desiderata**: ora `retryStrategy: (times) => Math.min(times*1000, 30_000)` — backoff esponenziale capped a 30s. Il cap a 30s (al più un tentativo ogni 30s) + l'handler `error` che non logga per-evento + il filter console.error (livello 3, invariato) tengono comunque sotto controllo il flooding se Upstash è giù. **NON tornare a `()=>null`** o un blip di rete lascia il backend offline fino al restart.

Livelli combinati per eliminare il flooding:

1. **`retryStrategy` con backoff capped 30s** in `server/cache/redis.ts` — riconnessione automatica (vedi aggiornamento sopra). `tls:{}` auto-abilitato su URL `rediss://`.

2. **`client.disconnect()`** nel catch di `coordinator/index.ts` `subscribe()` — il duplicate creato per pub/sub va chiuso con `disconnect()` (non `quit()`). `quit()` è un comando che non viene inviato se non connesso; `disconnect()` forza la chiusura del socket TLS immediatamente.

3. **`console.error` filter** in `server/index.ts` (prima degli import) — blocca qualsiasi `[ioredis] Unhandled error event` residuo che bypassa i listener (ioredis v5 chiama `silentEmit` su oggetti interni che non ereditano sempre i listener del client principale).

## BullMQ richiede maxRetriesPerRequest:null

Il client cache condiviso ha `maxRetriesPerRequest: 2` (fail-fast). BullMQ però **lancia a runtime** "Your redis options maxRetriesPerRequest must be null" se gli passi quel client (le connessioni bloccanti dei Worker, `BRPOPLPUSH`, lo vietano). Soluzione: `getBullConnectionOptions()` in `redis.ts` ritorna **opzioni** (host/port/user/pass/tls derivati da `REDIS_URL`) con `maxRetriesPerRequest: null`; `queues.ts` e `db-integrity/worker.ts` passano queste opzioni a Queue/Worker — non il client cache condiviso. Così BullMQ crea e gestisce le proprie connessioni. Verificato empiricamente con bullmq 5.79.0 + ioredis 5.11.1.

**Why:** ioredis v5 `silentEmit` chiama `console.error` quando `this.listenerCount("error") === 0`. In alcuni path interni (TLS socket timeout via `eventHandler.errorHandler`) `this` non è il Redis client a cui abbiamo aggiunto il listener, ma un oggetto connection interno. Aggiungere un listener sul Redis client non è sufficiente in tutti i casi.

**How to apply:** Qualunque nuovo client ioredis (es. duplicate per pub/sub) deve: (a) avere il `retryStrategy` con backoff capped (riconnessione automatica), (b) essere chiuso con `disconnect()` al fallimento, (c) il filter in index.ts copre il flooding residuo.

## Contesto

- Provider attuale: **Upstash cloud (EU)** via `REDIS_URL` `rediss://` — non più ThinkCentre self-hosted.
- Fallback in-memory sempre attivo — nessun impatto funzionale se Redis è giù.
- Il coordinator usa correttamente il fanout in-process come fallback.
- Con Upstash la riconnessione è automatica (backoff capped 30s) — **non** serve più il restart del backend per riconnettersi dopo un blip.
