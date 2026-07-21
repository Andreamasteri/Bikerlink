/**
 * verify-neon-boot.ts — Task #996 / Task #1009
 *
 * Verifica le 5 condizioni "Done looks like" per il boot su Neon:
 *   1. Nessun "[DB] Pool connection error" (SSL handshake OK)
 *   2. "[migrate] All migrations already applied" (no re-run)
 *   3. Pool principale si connette correttamente
 *   4. monitoringPool si connette e snapshotBlockedQueries() restituisce righe
 *   5. HNSW index self-heal: pgvector extension presente, indice creato/già
 *      esistente senza errori, connessione restituita al pool senza
 *      "[DB/monitor] pool error"
 *
 * Usa DATABASE_URL_DEV (la stringa Neon) per il test.
 * Non tocca DATABASE_URL di produzione.
 *
 * Esecuzione:
 *   npx tsx scripts/verify-neon-boot.ts
 */

import pg from "pg";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const { Pool } = pg;

async function main(): Promise<void> {
const NEON_URL = process.env.DATABASE_URL_DEV;
if (!NEON_URL) {
  console.error("FATAL: DATABASE_URL_DEV non impostato.");
  process.exit(1);
}

const isNeon = NEON_URL.includes("neon.tech");
const sslConfig = isNeon ? { rejectUnauthorized: true } : false;

console.log("═══════════════════════════════════════════════════════════");
console.log("  verify-neon-boot.ts — Task #996");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  URL host: ${new URL(NEON_URL).hostname}`);
console.log(`  SSL mode: ${isNeon ? "rejectUnauthorized=true (Neon)" : "false (non-Neon)"}`);
console.log("───────────────────────────────────────────────────────────");

let allPassed = true;

// ── Check 1: Pool principale — SSL handshake + SELECT 1 ─────────────────────
console.log("\n[1/5] Pool principale — SSL handshake + SELECT 1");

const mainPool = new Pool({
  connectionString: NEON_URL,
  application_name: "bikerlink-neon-boot-verify",
  max: 2,
  ssl: sslConfig,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 5_000,
});

const poolErrors: string[] = [];
mainPool.on("error", (err) => {
  poolErrors.push(err.message);
  console.error("  [DB] Pool connection error:", err.message);
});

let check1Passed = false;
let mainClient: pg.PoolClient | null = null;
try {
  mainClient = await mainPool.connect();
  const res = await mainClient.query<{ result: number }>("SELECT 1 AS result");
  if (res.rows[0]?.result === 1) {
    console.log("  ✓ Pool principale connesso — SELECT 1 OK");
    check1Passed = true;
  } else {
    console.error("  ✗ SELECT 1 ha restituito un valore inaspettato:", res.rows[0]);
  }
} catch (err) {
  console.error("  ✗ FAIL — connessione pool principale:", err instanceof Error ? err.message : err);
} finally {
  mainClient?.release();
}

if (!check1Passed) allPassed = false;

// ── Check 2: Migrations — schema_migrations intatto, nessun re-run ───────────
console.log("\n[2/5] Migrations — schema_migrations intatto, nessun re-run");

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const MIGRATIONS_HASH_CACHE = path.resolve(process.cwd(), "server_dist", ".migrations-hash");

function allMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("."))
    .sort();
}

function computeMigrationsHash(files: string[]): string {
  return crypto.createHash("sha256").update(files.join("|")).digest("hex");
}

let check2Passed = false;
let migClient: pg.PoolClient | null = null;
try {
  migClient = await mainPool.connect();

  // Verifica esistenza tabella schema_migrations
  const tableExists = await migClient.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'schema_migrations'
    ) AS exists
  `);

  if (!tableExists.rows[0]?.exists) {
    console.error("  ✗ FAIL — tabella schema_migrations NON trovata nel DB Neon.");
    allPassed = false;
  } else {
    // Conta le migration applicate
    const applied = await migClient.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM schema_migrations"
    );
    const appliedCount = parseInt(applied.rows[0]?.count ?? "0", 10);

    const allFiles = allMigrationFiles();
    const currentHash = computeMigrationsHash(allFiles);
    const cachedHash = fs.existsSync(MIGRATIONS_HASH_CACHE)
      ? fs.readFileSync(MIGRATIONS_HASH_CACHE, "utf-8").trim()
      : null;

    // Trova le migration NON applicate
    const appliedSet = new Set<string>(
      (await migClient.query<{ filename: string }>(
        "SELECT filename FROM schema_migrations ORDER BY filename"
      )).rows.map((r) => r.filename)
    );
    const pending = allFiles.filter((f) => !appliedSet.has(f));

    console.log(`  Migration files su disco: ${allFiles.length}`);
    console.log(`  Migration applicate nel DB: ${appliedCount}`);
    console.log(`  Migration pendenti: ${pending.length}`);
    console.log(`  Hash corrente:  ${currentHash.slice(0, 16)}...`);
    console.log(`  Hash in cache:  ${cachedHash ? cachedHash.slice(0, 16) + "..." : "(nessuna cache)"}`);

    if (pending.length === 0) {
      console.log("  ✓ [migrate] All migrations already applied — nessun re-run previsto");
      check2Passed = true;
    } else {
      console.error(`  ✗ FAIL — ${pending.length} migration pendenti nel DB Neon (devono essere 0 per il criterio "no re-run"):`);
      for (const f of pending.slice(0, 10)) {
        console.error(`    • ${f}`);
      }
      if (pending.length > 10) console.error(`    ... e altre ${pending.length - 10}`);
      console.error("  Azione: eseguire neon-migrate-standalone.ts prima di questo check.");
      check2Passed = false;
    }
  }
} catch (err) {
  console.error("  ✗ FAIL — controllo migration:", err instanceof Error ? err.message : err);
} finally {
  migClient?.release();
}

if (!check2Passed) allPassed = false;

// ── Check 3: Pool di monitoraggio (max:1) ────────────────────────────────────
console.log("\n[3/5] Pool di monitoraggio (max:1) — connessione separata");

const monitorPool = new Pool({
  connectionString: NEON_URL,
  application_name: "bikerlink-neon-boot-verify-monitor",
  max: 1,
  ssl: sslConfig,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 5_000,
  statement_timeout: 10_000,
});

const monitorErrors: string[] = [];
monitorPool.on("error", (err) => {
  monitorErrors.push(err.message);
  console.error("  [DB/monitor] pool error:", err.message);
});

let check3Passed = false;
let monClient: pg.PoolClient | null = null;
try {
  monClient = await monitorPool.connect();
  const res = await monClient.query<{ result: number }>("SELECT 1 AS result");
  if (res.rows[0]?.result === 1) {
    console.log("  ✓ Pool di monitoraggio connesso — SELECT 1 OK");
    check3Passed = true;
  } else {
    console.error("  ✗ Pool di monitoraggio — SELECT 1 inaspettato:", res.rows[0]);
  }
} catch (err) {
  console.error("  ✗ FAIL — pool di monitoraggio:", err instanceof Error ? err.message : err);
} finally {
  monClient?.release();
}

if (!check3Passed) allPassed = false;

// ── Check 4: snapshotBlockedQueries() — monitoring pool query pg_stat_activity ─
console.log("\n[4/5] snapshotBlockedQueries() — query pg_stat_activity via pool monitor");

let check4Passed = false;
let snapClient: pg.PoolClient | null = null;
try {
  snapClient = await monitorPool.connect();
  const r = await snapClient.query<{
    pid: number;
    state: string;
    duration_s: number;
    state_duration_s: number;
    query: string;
    wait_event: string | null;
    wait_event_type: string | null;
    application_name: string;
  }>(`
    SELECT
      pid,
      state,
      EXTRACT(EPOCH FROM (now() - query_start))::int   AS duration_s,
      EXTRACT(EPOCH FROM (now() - state_change))::int  AS state_duration_s,
      LEFT(query, 200)                                 AS query,
      wait_event,
      wait_event_type,
      COALESCE(application_name, '')                   AS application_name
    FROM pg_stat_activity
    WHERE datname  =  current_database()
      AND pid      <> pg_backend_pid()
      AND state    IS NOT NULL
    ORDER BY state_duration_s DESC NULLS LAST
    LIMIT 15
  `);
  if (r.rows.length === 0) {
    console.error("  ✗ FAIL — snapshotBlockedQueries() ha restituito 0 righe: la query è arrivata a Neon ma nessuna sessione attiva visibile.");
    console.error("  (Atteso ≥1 riga: almeno la connessione del pool di monitoraggio stesso dovrebbe apparire in pg_stat_activity)");
    check4Passed = false;
  } else {
    console.log(`  ✓ snapshotBlockedQueries() restituisce ${r.rows.length} riga/e da Neon`);
    console.log("  Sessioni attive (sample):");
    for (const row of r.rows.slice(0, 3)) {
      console.log(`    pid=${row.pid} state=${row.state} app=${row.application_name}`);
    }
    check4Passed = true;
  }
} catch (err) {
  console.error("  ✗ FAIL — snapshotBlockedQueries():", err instanceof Error ? err.message : err);
} finally {
  snapClient?.release();
}

if (!check4Passed) allPassed = false;

// ── Check 5: HNSW index self-heal (mirrors boot-phase3-db-init.ts) ───────────
// Replicates the two-step logic from runBootPhase3DbInit():
//   a) CREATE EXTENSION IF NOT EXISTS vector  (non-fatal if already present)
//   b) rebuildHnswIndex() logic:
//      - Dedicated connection, statement_timeout=0 (build can take minutes)
//      - Check pg_indexes + pg_index.indisvalid
//      - CREATE INDEX CONCURRENTLY IF NOT EXISTS when missing
//      - Restore statement_timeout=5000 before release
// A "[DB/monitor] pool error" during this phase would mark the health degraded.
console.log("\n[5/5] HNSW index self-heal — pgvector extension + indice cosine");

const HNSW_INDEX_NAME = "embeddings_vec_hnsw_cosine_idx";
let check5Passed = false;
let hnswClient: pg.PoolClient | null = null;
try {
  // Step 5a: ensure pgvector extension (same as boot-phase3-db-init.ts line 6-15)
  let extClient: pg.PoolClient | null = null;
  try {
    extClient = await mainPool.connect();
    await extClient.query("CREATE EXTENSION IF NOT EXISTS vector");
    console.log("  ✓ pgvector extension: presente (CREATE EXTENSION IF NOT EXISTS OK)");
  } catch (extErr) {
    // Non-fatal at boot — log a clear warning but don't fail the check yet
    console.warn(
      "  ⚠ pgvector extension ensure fallito (non-fatale al boot):",
      extErr instanceof Error ? extErr.message : extErr,
    );
  } finally {
    extClient?.release();
  }

  // Step 5b: HNSW index check + create — dedicated connection, no statement_timeout
  hnswClient = await mainPool.connect();

  // Disable statement_timeout so CREATE INDEX CONCURRENTLY is not killed at 5s
  try {
    await hnswClient.query("SET statement_timeout = 0");
    console.log("  ✓ statement_timeout=0 impostato sulla connessione dedicata");
  } catch {
    console.warn("  ⚠ SET statement_timeout=0 fallito (best-effort, continuiamo)");
  }

  // Mirror the index existence + validity check from rebuildHnswIndex()
  const idxCheck = await hnswClient.query<{ exists: boolean; valid: boolean }>(
    `SELECT
       EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename  = 'embeddings'
           AND indexname  = $1
       ) AS exists,
       COALESCE(
         (SELECT i.indisvalid
          FROM pg_class  c
          JOIN pg_index  i  ON i.indrelid  = c.oid
          JOIN pg_class  ic ON ic.oid      = i.indexrelid
          WHERE c.relname  = 'embeddings'
            AND ic.relname = $1
            AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
         ),
         false
       ) AS valid`,
    [HNSW_INDEX_NAME],
  );

  const idxExists = idxCheck.rows[0]?.exists ?? false;
  const idxValid  = idxCheck.rows[0]?.valid  ?? false;
  console.log(`  Index '${HNSW_INDEX_NAME}': exists=${idxExists} valid=${idxValid}`);

  let hnswAction: "created" | "rebuilt" | "noop";
  if (!idxExists) {
    console.log("  Index mancante — eseguo CREATE INDEX CONCURRENTLY IF NOT EXISTS …");
    await hnswClient.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${HNSW_INDEX_NAME}"
         ON "embeddings" USING hnsw ("embedding" vector_cosine_ops)`,
    );
    hnswAction = "created";
    console.log("  ✓ HNSW self-heal: index mancante creato con successo (action=created)");
  } else if (!idxValid) {
    console.log("  Index INVALIDO (build interrotta?) — DROP + CREATE …");
    await hnswClient.query(`DROP INDEX CONCURRENTLY IF EXISTS "${HNSW_INDEX_NAME}"`);
    await hnswClient.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${HNSW_INDEX_NAME}"
         ON "embeddings" USING hnsw ("embedding" vector_cosine_ops)`,
    );
    hnswAction = "rebuilt";
    console.log("  ✓ HNSW self-heal: index invalido rimosso e ricreato (action=rebuilt)");
  } else {
    hnswAction = "noop";
    console.log("  ✓ HNSW index verificato OK — exists=true, valid=true (action=noop)");
  }

  // Post-create verification: confirm index now exists AND is valid
  const postCheck = await hnswClient.query<{ exists: boolean; valid: boolean }>(
    `SELECT
       EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename  = 'embeddings'
           AND indexname  = $1
       ) AS exists,
       COALESCE(
         (SELECT i.indisvalid
          FROM pg_class  c
          JOIN pg_index  i  ON i.indrelid  = c.oid
          JOIN pg_class  ic ON ic.oid      = i.indexrelid
          WHERE c.relname  = 'embeddings'
            AND ic.relname = $1
            AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
         ),
         false
       ) AS valid`,
    [HNSW_INDEX_NAME],
  );
  const postExists = postCheck.rows[0]?.exists ?? false;
  const postValid  = postCheck.rows[0]?.valid  ?? false;

  if (postExists && postValid) {
    console.log(`  ✓ Post-check: index presente e valido dopo action=${hnswAction}`);
    check5Passed = true;
  } else {
    console.error(
      `  ✗ Post-check FAIL: index exists=${postExists} valid=${postValid} dopo action=${hnswAction}`,
    );
  }
} catch (err) {
  console.error(
    "  ✗ FAIL — HNSW self-heal:",
    err instanceof Error ? err.message : err,
  );
} finally {
  // Restore default statement_timeout (5s) before returning connection to pool,
  // matching the finally block in store.ts rebuildHnswIndex().
  if (hnswClient) {
    try {
      await hnswClient.query("SET statement_timeout = 5000");
    } catch {
      /* best-effort */
    }
    hnswClient.release();
    hnswClient = null;
  }
}

if (!check5Passed) allPassed = false;

// ── Check pool errors accumulated ────────────────────────────────────────────
await new Promise((r) => setTimeout(r, 200)); // flush async pool events
if (poolErrors.length > 0) {
  console.error(`\n  ⚠ [DB] Pool connection error rilevati: ${poolErrors.length}`);
  for (const e of poolErrors) console.error(`    • ${e}`);
  allPassed = false;
} else {
  console.log("\n  ✓ Nessun [DB] Pool connection error durante il test");
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
await mainPool.end();
await monitorPool.end();

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log(`  Risultato: ${allPassed ? "✅ TUTTI I CHECK SUPERATI" : "❌ UNO O PIÙ CHECK FALLITI"}`);
console.log("═══════════════════════════════════════════════════════════");

process.exit(allPassed ? 0 : 1);
} // end main()

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
