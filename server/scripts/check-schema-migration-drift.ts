// Guardia pre-merge: lo schema Drizzle (@shared/db) NON deve divergere dai file
// di migration numerati (migrations/*.sql).
//
// Scenario coperto: qualcuno modifica il registry e applica il cambiamento in
// dev con `drizzle-kit push` SENZA creare il corrispondente .sql numerato. In
// dev il DB combacia col registry → il check runtime non vede drift, ma al
// merge la prod (che applica solo le migration numerate al boot) resta indietro.
//
// Verifica STRUTTURALE e table-qualified (no connessione al DB): si ricostruisce
// dalle migration una mappa tabella → colonne, leggendo i CREATE TABLE e gli
// ALTER TABLE ... ADD/DROP/RENAME COLUMN in ordine documentale. Poi ogni
// tabella/colonna dichiarata nel registry DEVE risultare creata da almeno una
// migration PER QUELLA TABELLA. Una semplice presenza del nome colonna in un
// altro contesto (es. stessa colonna `status`/`created_at` in un'altra tabella)
// NON conta più come coperta → niente falsi negativi cross-tabella.
//
// NB: i nomi di sistema (session, schema_migrations, PostGIS, integrity_*) sono
// esclusi dal registry, quindi non entrano nel confronto.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { listDeclaredTables } from "../ai/db-integrity/registry-introspect";
import { buildMigrationSchema } from "../ai/db-integrity/migration-schema-parser";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

// Baseline di drift PRE-ESISTENTE noto e documentato.
// Questi identificatori sono dichiarati nel registry ed esistono nel DB dev, ma
// NON sono creati da alcun file di migration numerato (probabile `drizzle-kit
// push` storico senza .sql). NON vengono corretti qui: il task vieta migration
// correttive e prod li possiede già (vi sono migration storiche che vi creano
// indici / cancellano righe — es. CREATE INDEX ... ON match_negative_preferences
// in 0062, DELETE da ai_messages in 0064 — quindi le tabelle erano già in prod
// quando quelle migration sono state applicate). Sono allow-listati così la
// guardia resta verde sul drift noto MA continua a bloccare ogni NUOVO drift.
// Formato: "table" per tabelle intere, "table.column" per singole colonne.
const KNOWN_UNMIGRATED = new Set<string>([
  // pending_auto_suggestions, ai_messages e le loro colonne reject_count /
  // scopes sono coperte da migrations/0076_align_three_unmigrated_columns.sql
  // (CREATE TABLE IF NOT EXISTS completi) — rimosse dall'allow-list.
  // user_music_tokens.provider_user_id è coperta dallo stesso file (ALTER TABLE).
  // match_negative_preferences è coperta da 0077_align_match_negative_preferences.sql.
]);

// ── Exported result type ────────────────────────────────────────────────────

export interface DriftCheckResult {
  ok: boolean;
  /** Tables declared in the registry with no covering CREATE TABLE in any migration. */
  newTables: string[];
  /** Columns declared in the registry with no covering ADD COLUMN for their table. */
  newColumns: string[];
  /** Known-baseline drift entries that were found (non-blocking). */
  knownHits: string[];
}

// ── I/O helpers ─────────────────────────────────────────────────────────────

/**
 * Reads migration file contents in sort order.
 * Throws an Error on I/O failure (never calls process.exit).
 * Used by runDriftCheck() so it can be embedded in the boot pipeline.
 */
function loadMigrationContents(): string[] {
  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch (e) {
    throw new Error(
      `[schema-drift] impossibile leggere ${MIGRATIONS_DIR}: ${(e as Error).message}`,
    );
  }
  if (!files.length) {
    throw new Error(
      "[schema-drift] nessun file .sql in migrations/ — atteso almeno il baseline",
    );
  }
  return files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
}

// ── Core check (exported for programmatic use) ───────────────────────────────

/**
 * Compares every table/column declared in the Drizzle registry against the set
 * of numbered migration files. Pure structural check — no DB connection needed.
 *
 * Throws if the migrations directory cannot be read (let the caller decide
 * whether to treat that as fatal or non-fatal).
 */
export function runDriftCheck(): DriftCheckResult {
  const migrationSchema = buildMigrationSchema(loadMigrationContents());
  const declared = listDeclaredTables();

  const newTables: string[] = [];
  const newColumns: string[] = [];
  const knownHits: string[] = [];

  for (const t of declared) {
    const tableName = t.name.toLowerCase();
    const migCols = migrationSchema.get(tableName);
    if (!migCols) {
      if (KNOWN_UNMIGRATED.has(tableName)) knownHits.push(tableName);
      else newTables.push(tableName);
      continue;
    }
    for (const c of t.columns) {
      if (migCols.has(c.name.toLowerCase())) continue;
      const key = `${tableName}.${c.name.toLowerCase()}`;
      if (KNOWN_UNMIGRATED.has(key)) knownHits.push(key);
      else newColumns.push(key);
    }
  }

  return {
    ok: newTables.length === 0 && newColumns.length === 0,
    newTables,
    newColumns,
    knownHits,
  };
}

// ── CLI entry-point ──────────────────────────────────────────────────────────

function main(): void {
  let result: DriftCheckResult;
  try {
    result = runDriftCheck();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
  }

  const { ok, newTables, newColumns, knownHits } = result;

  if (knownHits.length) {
    console.log(`[schema-drift] drift noto (baseline, non bloccante): ${knownHits.length}`);
    for (const k of knownHits) console.log(`  • ${k}`);
  }

  if (ok) {
    const declared = newTables.length + newColumns.length + knownHits.length;
    console.log(
      `[schema-drift] OK — tabelle dichiarate coperte dalle migration (verifica table-qualified); nessun NUOVO drift registry↔migration.`,
    );
    process.exit(0);
  }

  console.error("──────────────────────────────────────────────────────────────");
  console.error("[schema-drift] NUOVO DRIFT REGISTRY ↔ MIGRATION RILEVATO");
  console.error("Identificatori dichiarati in @shared/db ma non creati da alcuna");
  console.error("migration numerata PER QUELLA TABELLA.");
  console.error("Probabile causa: schema modificato (es. drizzle-kit push) senza creare");
  console.error("il file di migration numerato corrispondente. La prod resterebbe indietro.");
  console.error("──────────────────────────────────────────────────────────────");
  if (newTables.length) {
    console.error(`\nTabelle senza migration (${newTables.length}):`);
    for (const t of newTables) console.error(`  • ${t}`);
  }
  if (newColumns.length) {
    console.error(`\nColonne senza migration (${newColumns.length}):`);
    for (const c of newColumns) console.error(`  • ${c}`);
  }
  console.error("\nAzione: crea il file migrations/NNNN_*.sql con le DDL mancanti e ri-esegui.");
  console.error("(Se il drift è intenzionale e già in prod, aggiungilo a KNOWN_UNMIGRATED.)");
  process.exit(1);
}

// Guard: only run as CLI entry-point, never when imported as a module.
// When this file is `import()`-ed by boot-sequence.ts at runtime, `main()` must
// NOT execute — otherwise `process.exit(0)` would kill the whole server.
const _currentFile = process.argv[1] ?? "";
if (_currentFile.includes("check-schema-migration-drift")) {
  main();
}
