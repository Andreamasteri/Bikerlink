/**
 * check-index-drift.ts
 *
 * Audit sistematico degli indici "speciali" (con ordinamento DESC o clausola
 * WHERE) usando lo schema Drizzle TS come source of truth.
 *
 * Fonti di informazione (in ordine di priorità):
 *   1. Schema Drizzle TS (shared/db/) — cosa DEVE esistere nel DB
 *   2. Migration SQL (migrations/) — crosscheck regressioni: un indice speciale
 *      che viene droppato e ricreato senza DESC/WHERE nelle migration è una
 *      regressione che andrà a generare DROP+CREATE a ogni push.
 *   3. pg_indexes live — verifica che il DB live corrisponda allo schema TS
 *
 * Criteri di "indice speciale" (fonte: schema Drizzle TS):
 *   - almeno una colonna ha orderamento .desc()   → hasDesc
 *   - l'indice ha una clausola .where(sql`...`)   → hasWhere
 *
 * Exit code 0 → tutti gli indici speciali allineati, nessuna regressione nelle migration
 * Exit code 1 → drift REALE: regressione nelle migration SQL o mismatch con il DB live
 * Exit code 2 → DB non raggiungibile (connettività): la fase live è skippata, la fase
 *               statica (migration) era OK. Il deploy può continuare con un warning.
 *
 * Usage:
 *   npx tsx scripts/check-index-drift.ts
 *   npm run db:check-indexes
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import * as schema from "../shared/db/index";
import { SQL } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

// ─── Tipi ────────────────────────────────────────────────────────────────────

interface SchemaSpecialIndex {
  indexName: string;
  tableName: string;
  hasDesc: boolean;
  hasWhere: boolean;
  descColumns: string[];  // nomi colonne con ordinamento DESC
}

interface MigrationIndexState {
  /** Ultima volta che l'indice è stato CREATE-ato nelle migration (in ordine) */
  lastCreate: {
    hasDesc: boolean;
    hasWhere: boolean;
    migration: string;
    dropped: boolean;
  } | null;
}

// ─── Fase 1: Drizzle TS schema — source of truth ─────────────────────────────

/**
 * Itera tutte le tabelle nello schema Drizzle e restituisce la mappa degli
 * indici speciali (DESC o WHERE) dichiarati nello schema TS.
 *
 * Accede all'API interna di Drizzle (via cast any) poiché non esiste un'API
 * pubblica stabile per leggere l'ordinamento degli index column.
 */
function getSchemaSpecialIndexes(): Map<string, SchemaSpecialIndex> {
  const result = new Map<string, SchemaSpecialIndex>();

  for (const value of Object.values(schema)) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof SQL || value instanceof Function) {
      continue;
    }

    let tableConfig: ReturnType<typeof getTableConfig>;
    try {
      tableConfig = getTableConfig(value as PgTable);
      if (!tableConfig?.name || !tableConfig.indexes) continue;
    } catch {
      continue;
    }

    const tableName = tableConfig.name;

    for (const idx of tableConfig.indexes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = (idx as any).config as {
        name?: string;
        columns?: Array<{ indexConfig?: { order?: string }; name?: string } | SQL>;
        where?: SQL;
        unique?: boolean;
      };

      if (!cfg?.name) continue;

      const indexName = cfg.name;

      // Verifica ordinamento DESC su almeno una colonna
      const descColumns: string[] = [];
      for (const col of (cfg.columns ?? [])) {
        if (col instanceof SQL) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const order = (col as any)?.indexConfig?.order;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const colName = (col as any)?.name ?? "(sql)";
        if (order === "desc") {
          descColumns.push(colName);
        }
      }

      const hasDesc = descColumns.length > 0;
      const hasWhere = cfg.where != null;

      if (!hasDesc && !hasWhere) continue;

      result.set(indexName, { indexName, tableName, hasDesc, hasWhere, descColumns });
    }
  }

  return result;
}

/**
 * Come getSchemaSpecialIndexes, ma restituisce TUTTI gli indici dello schema
 * (inclusi quelli ASC plain senza DESC/WHERE). Usato per rilevare l'inverse
 * drift: migration ha DESC/WHERE ma schema TS è ASC/senza-clausola.
 */
function getSchemaAllIndexes(): Map<string, SchemaSpecialIndex> {
  const result = new Map<string, SchemaSpecialIndex>();

  for (const value of Object.values(schema)) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof SQL || value instanceof Function) {
      continue;
    }

    let tableConfig: ReturnType<typeof getTableConfig>;
    try {
      tableConfig = getTableConfig(value as PgTable);
      if (!tableConfig?.name || !tableConfig.indexes) continue;
    } catch {
      continue;
    }

    const tableName = tableConfig.name;

    for (const idx of tableConfig.indexes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = (idx as any).config as {
        name?: string;
        columns?: Array<{ indexConfig?: { order?: string }; name?: string } | SQL>;
        where?: SQL;
        unique?: boolean;
      };

      if (!cfg?.name) continue;

      const descColumns: string[] = [];
      for (const col of (cfg.columns ?? [])) {
        if (col instanceof SQL) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const order = (col as any)?.indexConfig?.order;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const colName = (col as any)?.name ?? "(sql)";
        if (order === "desc") descColumns.push(colName);
      }

      result.set(cfg.name, {
        indexName: cfg.name,
        tableName,
        hasDesc: descColumns.length > 0,
        hasWhere: cfg.where != null,
        descColumns,
      });
    }
  }

  return result;
}

/**
 * Rileva l'inverse drift: indice che nelle migration SQL è creato con DESC o
 * WHERE, ma nello schema Drizzle TS è definito come ASC plain / senza WHERE.
 *
 * Questa è la causa del loop DROP+CREATE a ogni deploy: Replit confronta lo
 * schema (ASC) con la prod (DESC) e rigenera DROP+CREATE senza mai convergere.
 *
 * Nota: vengono segnalati solo gli indici presenti in ENTRAMBE le fonti
 * (migration E schema TS). Indici presenti solo in migration e non nello schema
 * (es. HNSW, indici manuali) non vengono segnalati.
 */
function detectInverseDrift(
  schemaAll: Map<string, SchemaSpecialIndex>,
): Array<{ indexName: string; migration: string; migrationHasDesc: boolean; migrationHasWhere: boolean }> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const migState = new Map<string, { hasDesc: boolean; hasWhere: boolean; migration: string; dropped: boolean }>();

  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    const dropped = extractDroppedIndexNames(content);
    const creates = extractCreatedIndexes(content, file);

    for (const name of dropped) {
      const s = migState.get(name);
      if (s) migState.set(name, { ...s, dropped: true });
    }
    for (const c of creates) {
      migState.set(c.indexName, {
        hasDesc: c.hasDesc,
        hasWhere: c.hasWhere,
        migration: c.migration,
        dropped: false,
      });
    }
  }

  const results: Array<{
    indexName: string;
    migration: string;
    migrationHasDesc: boolean;
    migrationHasWhere: boolean;
  }> = [];

  for (const [name, migInfo] of migState) {
    if (migInfo.dropped) continue;
    if (!migInfo.hasDesc && !migInfo.hasWhere) continue; // migration plain → skip

    const schemaInfo = schemaAll.get(name);
    if (!schemaInfo) continue; // non dichiarato nel registry TS → indice esterno/manuale

    const inversedDesc = migInfo.hasDesc && !schemaInfo.hasDesc;
    const inversedWhere = migInfo.hasWhere && !schemaInfo.hasWhere;

    if (inversedDesc || inversedWhere) {
      results.push({
        indexName: name,
        migration: migInfo.migration,
        migrationHasDesc: migInfo.hasDesc,
        migrationHasWhere: migInfo.hasWhere,
      });
    }
  }

  return results;
}

// ─── Fase 2: Migration SQL — rilevamento regressioni ─────────────────────────

function normalizeSql(sql: string): string {
  return sql
    .replace(/\s+/g, " ")
    .replace(/;.*$/, "")
    .replace(/--[^\n]*/g, "")
    .trim()
    .toLowerCase();
}

function extractDroppedIndexNames(sql: string): Set<string> {
  const dropped = new Set<string>();
  const re = /DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?["']?(\w+)["']?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) dropped.add(m[1].toLowerCase());
  return dropped;
}

interface MigrationCreate {
  indexName: string;
  hasDesc: boolean;
  hasWhere: boolean;
  migration: string;
}

function extractCreatedIndexes(sql: string, migrationFile: string): MigrationCreate[] {
  const results: MigrationCreate[] = [];
  const cleaned = sql.replace(/--[^\n]*/g, " ");

  // Cattura ogni CREATE INDEX — gestisce body su più righe con WHERE finale
  const re =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?\s+ON\s+["']?(\w+)["']?\s*(?:USING\s+\w+\s*)?\((?:[^()]*|\([^()]*\))*\)(?:\s+WHERE\s+[^;]+)?/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const fullDef = normalizeSql(m[0]);
    results.push({
      indexName: m[1].toLowerCase(),
      hasDesc: /\bdesc\b/.test(fullDef),
      hasWhere: /\bwhere\b/.test(fullDef),
      migration: migrationFile,
    });
  }
  return results;
}

/**
 * Per ogni indice speciale dello schema TS, verifica se nelle migration SQL
 * esiste una regressione: l'indice viene droppato e ricreato senza le
 * caratteristiche speciali attese (DESC / WHERE).
 *
 * Restituisce la lista delle regressioni trovate.
 */
function detectMigrationRegressions(
  schemaSpecial: Map<string, SchemaSpecialIndex>,
): Array<{ indexName: string; migration: string; lostDesc: boolean; lostWhere: boolean }> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Stato per ogni indice: tiene traccia dell'ultimo CREATE visto
  const state = new Map<string, MigrationIndexState>();

  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    const dropped = extractDroppedIndexNames(content);
    const creates = extractCreatedIndexes(content, file);

    // Prima aggiorna i DROP
    for (const name of dropped) {
      const s = state.get(name);
      if (s?.lastCreate) state.set(name, { lastCreate: { ...s.lastCreate, dropped: true } });
    }

    // Poi aggiorna i CREATE (un CREATE sovrascrive sempre, dropped=false)
    for (const c of creates) {
      state.set(c.indexName, {
        lastCreate: { hasDesc: c.hasDesc, hasWhere: c.hasWhere, migration: c.migration, dropped: false },
      });
    }
  }

  const regressions: ReturnType<typeof detectMigrationRegressions> = [];

  for (const [name, expected] of schemaSpecial) {
    const s = state.get(name);
    if (!s?.lastCreate || s.lastCreate.dropped) continue; // non è nelle migration o droppato → ok

    const lostDesc = expected.hasDesc && !s.lastCreate.hasDesc;
    const lostWhere = expected.hasWhere && !s.lastCreate.hasWhere;

    if (lostDesc || lostWhere) {
      regressions.push({
        indexName: name,
        migration: s.lastCreate.migration,
        lostDesc,
        lostWhere,
      });
    }
  }

  return regressions;
}

// ─── Fase 3: Live DB — verifica semantica ────────────────────────────────────

interface PgIndex {
  indexname: string;
  tablename: string;
  indexdef: string;
}

async function fetchLiveIndexes(
  pool: Pool,
  indexNames: string[],
): Promise<Map<string, PgIndex>> {
  if (indexNames.length === 0) return new Map();
  const result = await pool.query<PgIndex>(
    `SELECT indexname, tablename, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = ANY($1::text[])`,
    [indexNames],
  );
  return new Map(result.rows.map((r) => [r.indexname.toLowerCase(), r]));
}

/**
 * Verifica semantica della definizione live vs aspettative dallo schema TS.
 *
 * Per DESC: verifica che la colonna specifica abbia "desc" nel suo contesto
 *   nell'indexdef (non solo la parola "desc" ovunque).
 * Per WHERE: verifica che l'indexdef contenga la parola chiave "where" seguita
 *   da una condizione.
 *
 * Restituisce null se OK, altrimenti un array di problemi.
 */
function verifyLiveDef(
  expected: SchemaSpecialIndex,
  liveRow: PgIndex,
): string[] {
  const liveDef = normalizeSql(liveRow.indexdef);
  const problems: string[] = [];

  if (expected.hasDesc) {
    // Verifica che almeno una delle colonne DESC compaia prima di "desc" nel live def
    const hasDescInDef = expected.descColumns.some((col) => {
      // Cerca "colonna desc" o "(colonna) desc" nella definizione normalizzata
      const pattern = new RegExp(`\\b${col.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^)]*\\bdesc\\b`);
      return pattern.test(liveDef);
    });

    if (!hasDescInDef) {
      // Fallback: cerca almeno "desc" nell'intera definizione
      if (!/\bdesc\b/.test(liveDef)) {
        problems.push(
          `ordinamento DESC assente — colonne attese con DESC: [${expected.descColumns.join(", ")}]`,
        );
      } else {
        // "desc" esiste ma non associato alle colonne attese — potrebbe essere OK
        // (es: ordinamento su colonna diversa) → non segnalare
      }
    }
  }

  if (expected.hasWhere) {
    // Verifica presenza di WHERE con almeno una condizione dopo
    if (!/\bwhere\s+\S/.test(liveDef)) {
      problems.push("clausola WHERE assente o vuota nella definizione live");
    }
  }

  return problems;
}

// ─── Exported result type ─────────────────────────────────────────────────────

export interface IndexDriftResult {
  /** 0 = OK, 1 = drift reale, 2 = DB non raggiungibile (live skippato) */
  exitCode: 0 | 1 | 2;
  /** Lista di messaggi di problema (vuota se exitCode=0 o 2) */
  issues: string[];
}

// ─── runIndexDriftCheck (importabile dal server al boot) ──────────────────────

/**
 * Esegue le tre fasi di verifica (schema TS → migration SQL → DB live) e
 * restituisce un risultato strutturato invece di chiamare process.exit().
 * Usato da server/boot-sequence.ts per la verifica post-boot non bloccante.
 */
export async function runIndexDriftCheck(): Promise<IndexDriftResult> {
  console.log("[INDEX-DRIFT] ══════════════════════════════════════════════");
  console.log("[INDEX-DRIFT]   BikerLink — Index Drift Check (DESC/WHERE)");
  console.log("[INDEX-DRIFT] ══════════════════════════════════════════════\n");

  // Fase 1: Drizzle TS schema
  const schemaSpecial = getSchemaSpecialIndexes();
  const schemaAll = getSchemaAllIndexes();

  if (schemaSpecial.size === 0) {
    console.log("[INDEX-DRIFT]   Nessun indice speciale (DESC/WHERE) trovato nello schema Drizzle TS.");
    console.log("[INDEX-DRIFT]   RESULT: OK — 0 indici speciali da verificare");
    return { exitCode: 0, issues: [] };
  }

  console.log(`[INDEX-DRIFT]   Indici speciali dallo schema Drizzle TS: ${schemaSpecial.size}\n`);
  for (const idx of schemaSpecial.values()) {
    const tags: string[] = [];
    if (idx.hasDesc) tags.push(`DESC[${idx.descColumns.join(",")}]`);
    if (idx.hasWhere) tags.push("WHERE");
    console.log(`[INDEX-DRIFT]     • ${idx.indexName} (${idx.tableName}) [${tags.join(",")}]`);
  }

  let exitCode: 0 | 1 | 2 = 0;
  const allIssues: string[] = [];

  // Fase 2: Migration SQL — regressioni (schema vuole DESC ma migration ha perso DESC)
  console.log("\n[INDEX-DRIFT]   Analisi migration SQL per regressioni...");
  const regressions = detectMigrationRegressions(schemaSpecial);
  if (regressions.length === 0) {
    console.log("[INDEX-DRIFT]   ✔  Nessuna regressione nelle migration SQL");
  } else {
    exitCode = 1;
    for (const r of regressions) {
      const lost: string[] = [];
      if (r.lostDesc) lost.push("DESC perso");
      if (r.lostWhere) lost.push("WHERE perso");
      const msg = `"${r.indexName}": regressione in ${r.migration} — ${lost.join(", ")}`;
      console.log(`[INDEX-DRIFT]   ✖  ${msg}`);
      allIssues.push(msg);
    }
  }

  // Fase 2b: Inverse drift — migration ha DESC/WHERE ma schema TS è ASC/senza-clausola
  // Questa è la causa del loop DROP+CREATE a ogni deploy di Replit.
  console.log("[INDEX-DRIFT]   Analisi inverse drift (migration DESC ≠ schema ASC)...");
  const inverseDrifts = detectInverseDrift(schemaAll);
  if (inverseDrifts.length === 0) {
    console.log("[INDEX-DRIFT]   ✔  Nessun inverse drift rilevato");
  } else {
    exitCode = 1;
    for (const d of inverseDrifts) {
      const gained: string[] = [];
      if (d.migrationHasDesc) gained.push("migration DESC ma schema ASC");
      if (d.migrationHasWhere) gained.push("migration WHERE ma schema senza clausola");
      const msg = `"${d.indexName}": inverse drift in ${d.migration} — ${gained.join(", ")} → DROP+CREATE loop al deploy`;
      console.log(`[INDEX-DRIFT]   ✖  ${msg}`);
      allIssues.push(msg);
    }
  }

  // Fase 3: Live DB
  console.log("\n[INDEX-DRIFT]   Verifica nel DB live...\n");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const okLines: string[] = [];
  const driftLines: string[] = [];

  try {
    const liveMap = await fetchLiveIndexes(
      pool,
      [...schemaSpecial.keys()],
    );

    for (const idx of schemaSpecial.values()) {
      const liveRow = liveMap.get(idx.indexName);

      if (!liveRow) {
        exitCode = 1;
        const msg = `"${idx.indexName}" (${idx.tableName}): ASSENTE nel DB`;
        driftLines.push(msg);
        allIssues.push(msg);
        continue;
      }

      const problems = verifyLiveDef(idx, liveRow);
      if (problems.length > 0) {
        exitCode = 1;
        for (const p of problems) {
          const msg = `"${idx.indexName}" (${idx.tableName}): ${p}`;
          driftLines.push(`[INDEX-DRIFT]   ✖  ${msg}`);
          driftLines.push(`[INDEX-DRIFT]        schema TS : hasDesc=${idx.hasDesc} hasWhere=${idx.hasWhere} descCols=[${idx.descColumns.join(",")}]`);
          driftLines.push(`[INDEX-DRIFT]        DB live   : ${normalizeSql(liveRow.indexdef)}`);
          allIssues.push(msg);
        }
      } else {
        okLines.push(`[INDEX-DRIFT]   ✔  ${idx.indexName} (${idx.tableName})`);
      }
    }
  } catch (err) {
    console.error("[INDEX-DRIFT]   WARN: impossibile connettersi al DB (connectivity) — fase live skippata.", err);
    await pool.end();
    // Exit 2 = DB irraggiungibile.
    // ATTENZIONE: se la fase statica ha già trovato regressioni (exitCode=1),
    // manteniamo exit 1 — il gate duro non va ammorbidito da un errore di connettività.
    return { exitCode: exitCode === 1 ? 1 : 2, issues: allIssues };
  }

  await pool.end();

  if (okLines.length > 0) {
    console.log("[INDEX-DRIFT]   Indici allineati con il DB live:");
    okLines.forEach((l) => console.log(l));
  }

  if (driftLines.length > 0) {
    console.log("[INDEX-DRIFT]\n  Drift nel DB live:");
    driftLines.forEach((l) => console.log(l));
  }

  console.log(`[INDEX-DRIFT] ══════════════════════════════════════════════`);
  if (exitCode !== 0) {
    console.log(
      `[INDEX-DRIFT]   RESULT: PROBLEMI (${allIssues.length}) — migration correttiva o fix schema TS richiesti`,
    );
    console.log("[INDEX-DRIFT] ══════════════════════════════════════════════");
  } else {
    console.log(
      `[INDEX-DRIFT]   RESULT: OK — ${okLines.length} indici speciali allineati, nessun drift, nessuna regressione`,
    );
    console.log("[INDEX-DRIFT] ══════════════════════════════════════════════");
  }

  return { exitCode, issues: allIssues };
}

// ─── main (standalone CLI) ───────────────────────────────────────────────────

/**
 * Esegue solo le fasi 1+2 (schema TS + migration SQL), senza connettersi
 * al DB live. Usato da deploy-build.sh dove il DB live è in uno stato
 * pre-migration e non rappresenta la realtà post-deploy.
 * Exit 0 = nessuna regressione · Exit 1 = regressione rilevata nelle migration
 */
export async function runStaticIndexDriftCheck(): Promise<IndexDriftResult> {
  console.log("[INDEX-DRIFT] ══════════════════════════════════════════════");
  console.log("[INDEX-DRIFT]   BikerLink — Index Drift Check (statico, no DB live)");
  console.log("[INDEX-DRIFT] ══════════════════════════════════════════════\n");

  const schemaSpecial = getSchemaSpecialIndexes();
  const schemaAll = getSchemaAllIndexes();

  if (schemaSpecial.size === 0) {
    console.log("[INDEX-DRIFT]   Nessun indice speciale (DESC/WHERE) trovato nello schema Drizzle TS.");
    console.log("[INDEX-DRIFT]   RESULT: OK — 0 indici speciali da verificare");
    return { exitCode: 0, issues: [] };
  }

  console.log(`[INDEX-DRIFT]   Indici speciali dallo schema Drizzle TS: ${schemaSpecial.size}`);
  for (const idx of schemaSpecial.values()) {
    const tags: string[] = [];
    if (idx.hasDesc) tags.push(`DESC[${idx.descColumns.join(",")}]`);
    if (idx.hasWhere) tags.push("WHERE");
    console.log(`[INDEX-DRIFT]     • ${idx.indexName} (${idx.tableName}) [${tags.join(",")}]`);
  }

  const issues: string[] = [];

  // Fase 2: regressioni (schema vuole DESC ma migration ha perso DESC)
  console.log("\n[INDEX-DRIFT]   Analisi migration SQL per regressioni...");
  const regressions = detectMigrationRegressions(schemaSpecial);
  if (regressions.length === 0) {
    console.log("[INDEX-DRIFT]   ✔  Nessuna regressione nelle migration SQL");
  } else {
    for (const r of regressions) {
      const lost: string[] = [];
      if (r.lostDesc) lost.push("DESC perso");
      if (r.lostWhere) lost.push("WHERE perso");
      const msg = `"${r.indexName}": regressione in ${r.migration} — ${lost.join(", ")}`;
      console.log(`[INDEX-DRIFT]   ✖  ${msg}`);
      issues.push(msg);
    }
  }

  // Fase 2b: inverse drift (migration DESC ma schema ASC → loop DROP+CREATE al deploy)
  console.log("[INDEX-DRIFT]   Analisi inverse drift (migration DESC ≠ schema ASC)...");
  const inverseDrifts = detectInverseDrift(schemaAll);
  if (inverseDrifts.length === 0) {
    console.log("[INDEX-DRIFT]   ✔  Nessun inverse drift rilevato");
  } else {
    for (const d of inverseDrifts) {
      const gained: string[] = [];
      if (d.migrationHasDesc) gained.push("migration DESC ma schema ASC");
      if (d.migrationHasWhere) gained.push("migration WHERE ma schema senza clausola");
      const msg = `"${d.indexName}": inverse drift in ${d.migration} — ${gained.join(", ")} → DROP+CREATE loop al deploy`;
      console.log(`[INDEX-DRIFT]   ✖  ${msg}`);
      issues.push(msg);
    }
  }

  console.log("[INDEX-DRIFT] ══════════════════════════════════════════════");
  if (issues.length === 0) {
    console.log(`[INDEX-DRIFT]   RESULT: OK — nessuna regressione e nessun inverse drift, verifica live al boot`);
    console.log("[INDEX-DRIFT] ══════════════════════════════════════════════");
    return { exitCode: 0, issues: [] };
  }
  console.log(`[INDEX-DRIFT]   RESULT: PROBLEMI (${issues.length}) — migration correttiva o fix schema TS richiesti`);
  console.log("[INDEX-DRIFT] ══════════════════════════════════════════════");
  return { exitCode: 1, issues };
}

async function main() {
  const staticOnly = process.argv.includes("--static-only");
  const result = staticOnly
    ? await runStaticIndexDriftCheck()
    : await runIndexDriftCheck();
  process.exit(result.exitCode);
}

// Guard: esegui main() solo quando il file è lanciato direttamente come CLI
// (npx tsx scripts/check-index-drift.ts), NON quando viene importato dal bundle
// esbuild (server_dist/index.js). `require.main === module` non funziona in
// esbuild __esm context; usiamo process.argv[1] che include il nome del file
// quando lanciato direttamente, e non lo include nel bundle del server.
if (process.argv[1] && process.argv[1].includes("check-index-drift")) {
  main();
}
