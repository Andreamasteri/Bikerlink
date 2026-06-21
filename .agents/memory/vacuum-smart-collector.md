---
name: Vacuum smart + db-collector dedicated connection
description: Decisioni durature sul vacuum notturno "smart", la connessione singola del db-collector e il quirk SET LOCAL.
---

# Vacuum smart + db-collector connessione dedicata

## Vacuum notturno: ANALYZE default, FULL solo su bloat
Il vacuum notturno NON deve fare sempre `VACUUM FULL ANALYZE`: tiene 1 connessione
occupata per minuti + lock esclusivo su ogni tabella, inutile senza bloat → satura il
pool (max=10). Regola: per ogni tabella leggere il dead-tuple ratio da
`pg_stat_user_tables` e fare `VACUUM ANALYZE` (no lock) di default, `VACUUM FULL ANALYZE`
solo se ratio > soglia.
- Soglia configurabile: AppSetting `vacuum_full_bloat_threshold` (0–1, default 0.20).
- AppSetting dell'ultimo run: key `db_vacuum_smart_v1` (+ `_detail` con `mode` e `bloatRatio`).
- L'esecuzione passa da `withBgDbSlot` per non affamare il traffico utente.
**Why:** incidente saturazione pool; il FULL incondizionato era la causa principale.

## Quirk SET LOCAL fuori da transazione
`SET LOCAL statement_timeout` è un **no-op** (solo warning) se NON sei dentro una
transazione. Per un timeout per-query su un client del pool senza txn: usa
`SET statement_timeout='<ms>'` e **ripristina il default del pool nel finally** prima del
release, altrimenti la connessione torna nel pool col timeout alterato.

## db-collector: early-exit + connessione singola
Se `!isPoolHealthy()` il collector deve uscire SUBITO con un solo segnale
`db.ping_saturated` (reason `pool_saturated_skip`) senza acquisire connessioni — aggiungere
pressione quando il pool è pieno peggiora la saturazione. Tutte le query diagnostiche girano
su UNA sola connessione (`pool.connect()` + release nel finally), non più N `db.execute()`.
