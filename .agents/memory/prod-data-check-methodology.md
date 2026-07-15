---
name: Production data-check methodology (executeSql environment=production)
description: How to run the dev-only DB coherence checklist (FK orphans, range, duplicates) against real production data when prod is unreachable via connection string.
---

# Verifica dati reali di produzione senza connection string

## Il problema
Il generatore `scripts/generate-db-check-report.ts` interroga solo il DB dev (`DATABASE_URL`), che è quasi vuoto. I check DATI (FK orfane, range, duplicati) restituiscono "0 violazioni" per assenza di dati, non per correttezza garantita. La prod non è raggiungibile con una connection string dalla sandbox Replit (nessun `PROD_DATABASE_URL` diretto usabile da `pg.Pool`).

## La soluzione: executeSql con environment "production"
La skill `database` espone `executeSql({ sqlQuery, environment: "production" })`: SELECT-only contro una **replica read-only** del DB prod. Non serve una connection string — la chiamata bypassa il problema di raggiungibilità.

**Come applicare:** per rieseguire la stessa logica dei moduli `scripts/db-check/*` (che assumono un `Pool` di `pg`) contro prod, non serve wrapparli — basta tradurre le stesse query SQL in chiamate `executeSql` dirette dal CodeExecution sandbox:
1. `pg_stat_user_tables.n_live_tup` può essere stale/azzerato (mai fatto ANALYZE) → usare `COUNT(*)` reale via una singola query `UNION ALL` su tutte le tabelle candidate, non l'estimate.
2. Query FK/coordinate/timestamp/contatori/duplicati sono le stesse di `shared.ts`/`checklist.ts`/`fk-duplicates.ts`: batchare in `UNION ALL` per minimizzare round-trip (una `executeSql` per categoria, non una per colonna).
3. Report i risultati in una sezione dedicata (es. "§7 dati reali") nel report esistente, distinta dalle sezioni dev-only a bassa confidenza — non sovrascrivere quelle, servono a documentare la differenza di confidenza.

## Esito noto (2026-07-15)
Su BikerLink prod (49/168 tabelle popolate, 8 utenti reali): 0 violazioni bloccanti su FK/coordinate/timestamp/contatori/duplicati. Unica anomalia reale: 6 righe `user_profiles` con `hide_from_map=false` ma lat/lon NULL (profili che dovrebbero essere visibili in mappa ma non lo sono) — severità Importante, non bloccante. Le tabelle di telemetria/percorsi erano a 0 righe (nessuna corsa ancora registrata): check non applicabile, non "pulito".
