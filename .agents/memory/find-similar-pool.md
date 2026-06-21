---
name: findSimilar HNSW pool saturation
description: findSimilar() in embeddings/store.ts acquisiva pool.connect() senza withBgDbSlot — causa pool saturo + app freeze
---

## La regola
`findSimilar()` in `server/embeddings/store.ts` usa `pool.connect()` direttamente per la query HNSW pgvector. DEVE essere wrappata con `withBgDbSlot()` perché è chiamata da job di background (BioAffinity/MusicAffinity matcher).

**Fix applicato**: riga `const client = await withBgDbSlot(() => pool.connect())`.

## Perché
- BioAffinity matcher gira ogni 30 min e chiama `findSimilar()` per ogni coppia utente
- Senza `withBgDbSlot`, ogni chiamata acquisisce una conn dal pool direttamente → burst da N chiamate parallele satura le 10 conn
- Pool saturo per 46+ tick (≈46 min) → tutte le API del backend vanno in connection timeout (3s) → il JS thread dell'app aspetta pile di promise pendenti → **freeze percepito**

## Come rilevare la prossima volta
- `pool-collector.ts` lancia `probePgStatActivity()` via `pg.Client` diretta (fuori dal pool) al tick 5+ consecutivo con `waiting > 0` → compare nei log server come `[pool-collector/activity]`
- Endpoint admin `GET /api/admin/db/activity` per query on-demand di `pg_stat_activity`

## Come applicare
- Qualsiasi funzione che chiama `pool.connect()` da un job di background DEVE usare `withBgDbSlot()` attorno all'acquisizione (non all'intero lavoro)
- Funzioni callable sia da route utente che da job BG: non wrappare internamente — wrappare nel caller BG
