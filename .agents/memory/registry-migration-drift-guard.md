---
name: Registry↔migration drift guard
description: Bidirectional guard catching both forward drift (registry→migrations) and inverse drift (migrations→registry), plus the parser it relies on.
---

# Drift registry Drizzle ↔ migration numerate

La prod si allinea allo schema SOLO via migration numerate applicate al boot da
`server/migrate.ts`. La guardia copre ORA entrambe le direzioni.

**Guardia dev:** `server/scripts/check-schema-migration-drift.ts` (validazione
"schema-drift"). Usa il parser `server/ai/db-integrity/migration-schema-parser.ts`
(`buildMigrationSchema`) per ricostruire dalle migration una mappa `tabella → set
colonne`, poi verifica bidirezionalmente:

- **Forward (registry → migrations):** ogni tabella/colonna del registry deve
  essere creata da almeno una migration PER QUELLA TABELLA.
- **Inverse (migrations → registry):** ogni colonna presente nella storia delle
  migration deve ancora esistere nel registry, oppure avere un corrispondente
  DROP COLUMN / ALTER TABLE RENAME nella storia. Rileva colonne/tabelle rimosse
  dal registry senza migration.

**Parser DDL coperte (in ordine di applicazione):**
- `CREATE TABLE` / `DROP TABLE` / `ALTER TABLE ... RENAME TO new`
- `ADD COLUMN` / `DROP COLUMN` / `RENAME COLUMN old TO new`
- `CREATE UNIQUE INDEX` / `ADD CONSTRAINT ... UNIQUE`

**Trabocchetti noti del parser:**
- `"key"` è colonna legittima: NON mettere `KEY` tra i constraint keyword.
- Rimuovere `--` commenti PRIMA di cercare `ALTER TABLE`.
- Un `ALTER` può contenere più `ADD COLUMN`: scandire tutte le occorrenze.
- Richiedere la keyword `column` in ADD/DROP per non confondere con ADD CONSTRAINT.
- `RENAME TABLE` guard: verificare assenza di `rename column` prima di applicare
  `RENAME_TABLE_RE`, altrimenti RENAME COLUMN verrebbe interpretato come RENAME TABLE.
- `DROP TABLE` deve essere controllato PRIMA di `CREATE TABLE` nel loop statement.

**Baselines:**
- `KNOWN_UNMIGRATED` — forward drift pre-esistente (tabella/colonna in registry
  ma non in migration).
- `KNOWN_UNMIGRATED_UNIQUE_INDEXES` — uniqueIndex() senza migration.
- `KNOWN_DROPPED_WITHOUT_MIGRATION` — NUOVA: inverse drift pre-esistente (colonna
  in migration ma non in registry, senza DROP COLUMN). Es.: `user_music_tokens.spotify_user_id`.

**Baseline `KNOWN_UNMIGRATED`:** drift pre-esistente noto e già in prod viene
allow-listato così la guardia resta verde sul noto MA blocca ogni NUOVO drift.

**Why:** il semaforo della validazione deve restare azionabile (verde sul noto, rosso
sul nuovo); un check permanentemente rosso su drift storico bloccherebbe ogni merge.

**How to apply:**
- Aggiungi colonna/tabella al registry → crea SEMPRE migration numerata.
- Rimuovi colonna/tabella dal registry → crea DROP COLUMN / DROP TABLE migration.
- Se la guardia segnala drift intenzionale e già in prod, aggiungilo alla baseline
  appropriata con commento; altrimenti crea `migrations/NNNN_*.sql` idempotente.
- Il boot-sequence (Phase 2b) chiama `runDriftCheck()` — ora stampa ANCHE
  `droppedColumns` e `removedTables` nei log di crash per diagnosi.
