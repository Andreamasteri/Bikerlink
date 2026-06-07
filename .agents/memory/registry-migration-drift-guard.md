---
name: Registry↔migration drift guard
description: Preventive guard that catches Drizzle registry columns/tables not created by any numbered migration, plus the known-baseline allow-list and the table-qualified parser it relies on.
---

# Drift registry Drizzle ↔ migration numerate

La prod si allinea allo schema SOLO via migration numerate applicate al boot da
`server/migrate.ts`. Se una colonna/tabella è nel registry (`shared/db/`) ed esiste
nel DB dev ma NON è creata da nessun file `migrations/*.sql`, la prod resta indietro.
Causa tipica: `drizzle-kit push` storico senza creare la migration numerata.

**Guardia dev:** `server/scripts/check-schema-migration-drift.ts` (validazione
"schema-drift"). Usa il parser `server/ai/db-integrity/migration-schema-parser.ts`
(`buildMigrationSchema`) per ricostruire dalle migration una mappa `tabella → set
colonne`, poi verifica che ogni tabella/colonna del registry sia coperta PER QUELLA
TABELLA.

**Perché table-qualified e non token-search globale:** una ricerca a token su tutte
le migration concatenate dà falsi negativi cross-tabella — una nuova colonna `status`
su `orders` risulterebbe "migrata" solo perché `status` compare nel CREATE di un'altra
tabella. Il parser tiene le colonne separate per tabella, così questo non accade.

**Trabocchetti del parser (tutti coperti da test):**
- `"key"` è un nome di colonna legittimo (es. `app_settings.key`): NON mettere `KEY`
  tra le keyword di vincolo da saltare nel corpo del CREATE.
- I commenti SQL `--` vanno rimossi PRIMA di cercare `ALTER TABLE`, altrimenti una
  frase tipo "aggiunta via ALTER TABLE manuale" in un commento crea una tabella
  fantasma e fa fallire il parsing dell'ALTER reale.
- Un singolo `ALTER TABLE` può contenere PIÙ `ADD COLUMN` separati da virgola:
  scandire TUTTE le occorrenze, non solo la prima.
- Richiedere la keyword `column` negli ADD/DROP per non scambiare `ADD CONSTRAINT`
  per una colonna.

**Baseline `KNOWN_UNMIGRATED`:** drift pre-esistente noto e già in prod viene
allow-listato (chiave `table` o `table.column`) così la guardia resta verde sul drift
noto MA blocca ogni NUOVO drift. Non nasconde: stampa comunque i drift noti. Alcune
tabelle intere (es. `match_negative_preferences`, `pending_auto_suggestions`,
`ai_messages`) non hanno alcun `CREATE TABLE` ma compaiono in migration storiche come
`CREATE INDEX ... ON <t>` / `DELETE FROM <t>` → erano già in prod quando quelle
migration sono state applicate, quindi sono baseline, non drift nuovo. Non si
correggono con ALTER/CREATE perché il task vieta migration correttive.

**Why:** il semaforo della validazione deve restare azionabile (verde sul noto, rosso
sul nuovo); un check permanentemente rosso su drift storico bloccherebbe ogni merge.

**How to apply:** quando aggiungi una colonna/tabella al registry crea SEMPRE la
migration numerata. Se la guardia segnala drift intenzionale e già in prod, aggiungilo
a `KNOWN_UNMIGRATED` con commento; altrimenti crea `migrations/NNNN_*.sql` idempotente.
