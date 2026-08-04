import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { pool } from "./db";
import { assertNoDuplicateMigrationPrefixes } from "./migration-prefix-guard";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const MIGRATIONS_HASH_CACHE = path.resolve(process.cwd(), "server_dist", ".migrations-hash");

/**
 * Task #5314 — Advisory lock key dedicated to the migration-apply phase.
 * Distinct from the db-integrity scan lock (0x4242_4242) and the AI-audit
 * per-day hashtext lock so the three never collide.
 *
 * Boot-race root cause: two overlapping boot processes (redeploy overlap, or
 * a health-check-triggered restart racing a still-finishing previous
 * instance) both read "migration X is pending" and both try to apply it. The
 * loser's final INSERT INTO schema_migrations hits a duplicate-key violation,
 * which runMigrations() treated as FATAL — crashing the process and
 * triggering the anti-crash-loop backoff (visible as a burst of healthcheck
 * 500s / restarts). This session-level pg_advisory_lock serializes the
 * apply phase across processes: the loser BLOCKS until the winner finishes
 * and releases the lock, then re-checks schema_migrations for anything still
 * pending, instead of racing to apply the same file.
 */
const MIGRATION_ADVISORY_LOCK_KEY = 0x4d69_6772; // "Migr" — arbitrary, must stay <2^31.

/**
 * PostgreSQL error codes that are safe to skip when bootstrapping on an existing
 * database whose schema_migrations table is empty (legacy DB pre-tracking).
 *
 * "Already exists" — the object was created by a previous manual apply:
 *   42P07 — duplicate_table     (CREATE TABLE)
 *   42701 — duplicate_column    (ALTER TABLE ADD COLUMN)
 *   42710 — duplicate_object    (CREATE TYPE, CREATE INDEX, CREATE SEQUENCE)
 *   42P16 — invalid_table_definition (CREATE TABLE LIKE / partition-related duplicates)
 *
 * "Does not exist" — the object was DROPPED by a later migration that's also
 * pending in this same batch. Example: 0000_baseline creates an index on
 * `motorcycle_model`, and 0009_drop_motorcycle_model_column.sql later drops
 * the column. On a legacy prod DB where 0009 was already applied manually,
 * the old baseline CREATE INDEX hits 42703 — safe to skip, the later
 * migration in this batch is the source of truth.
 *   42703 — undefined_column  (CREATE INDEX/CONSTRAINT on dropped column)
 *   42P01 — undefined_table   (operation on dropped table)
 *
 * "Object does not exist" — the object was already removed by a migration
 * that was previously applied manually, so the DROP is a no-op:
 *   42704 — undefined_object  (DROP CONSTRAINT / DROP TYPE / DROP INDEX on a
 *                              missing object — e.g. a FK constraint that was
 *                              renamed or dropped by an earlier manual apply)
 */
const SKIPPABLE_ERROR_CODES = new Set([
  "42P07", "42701", "42710", "42P16",
  "42703", "42P01",
  "42704",
]);

/**
 * Returns true when a 42704 (undefined_object) error is caused by a missing
 * GIN operator class (e.g. `gin_trgm_ops` when pg_trgm is not enabled).
 *
 * 42704 is normally skippable for DROP CONSTRAINT / DROP TYPE / DROP INDEX on
 * a missing object. But when a CREATE INDEX ... USING gin (col gin_trgm_ops)
 * fails with 42704, it means the operator class itself doesn't exist — the
 * extension is not enabled. This is a FATAL error that must NOT be silently
 * skipped: the index would never be created and the migration would be marked
 * as applied with no actual work done.
 *
 * Detection: message contains both "operator class" and "gin" when code=42704.
 */
function isGinOperatorClassError(err: unknown): boolean {
  if ((err as { code?: string })?.code !== "42704") return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes("operator class") && msg.includes("gin");
}

function isSkippableError(err: unknown): boolean {
  if (isGinOperatorClassError(err)) return false;
  const code = (err as { code?: string })?.code;
  return typeof code === "string" && SKIPPABLE_ERROR_CODES.has(code);
}

const POSTGIS_SYSTEM_TABLES = ["spatial_ref_sys", "geography_columns", "geometry_columns"];

/**
 * Returns true when a 42501 (insufficient_privilege) error is caused by an
 * attempt to modify a PostGIS-owned system table.  Those tables belong to the
 * `postgres` role; the application user can never own them.  The PK on
 * `spatial_ref_sys.srid` (and similar constraints) already exists, so the
 * statement is a safe no-op that should be skipped rather than crashing the
 * server.
 *
 * Any 42501 on an application-owned table is still a real bug and must
 * propagate normally.
 */
export function isPostgisOwnerError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code !== "42501") return false;
  const message = err instanceof Error ? err.message : String(err);
  return POSTGIS_SYSTEM_TABLES.some((table) => message.includes(table));
}

/**
 * Bootstrap the migration-tracking table.
 *
 * This is the single necessary DDL exception in the boot path. The table
 * cannot be tracked inside itself, so it must be created before the runner
 * can query which migrations have already been applied.
 *
 * The canonical schema definition lives in migrations/0000_baseline.sql so
 * that schema history remains a single source of truth. When 0000_baseline.sql
 * is applied on a fresh DB it will hit the "already exists" SAVEPOINT guard
 * and skip gracefully.
 */
async function ensureMigrationsTable(client: import("pg").PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(client: import("pg").PoolClient): Promise<Set<string>> {
  const result = await client.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations ORDER BY filename"
  );
  return new Set(result.rows.map((r) => r.filename));
}

function allMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("."))
    .sort();
}

function pendingFiles(all: string[], applied: Set<string>): string[] {
  return all.filter((f) => !applied.has(f));
}

export function splitStatements(sql: string): string[] {
  return sql
    .split(/--> statement-breakpoint/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Compute a hash of all migration filenames (sorted).
 *
 * The hash is diagnostic only. It is deliberately never used to bypass the
 * database check: a build directory can be reused against a different Neon
 * branch, whose schema_migrations state may legitimately be different.
 */
function computeMigrationsHash(files: string[]): string {
  return crypto.createHash("sha256").update(files.join("|")).digest("hex");
}

function readCachedHash(): string | null {
  try {
    if (!fs.existsSync(MIGRATIONS_HASH_CACHE)) return null;
    return fs.readFileSync(MIGRATIONS_HASH_CACHE, "utf-8").trim();
  } catch {
    return null;
  }
}

function writeCachedHash(hash: string): void {
  try {
    const dir = path.dirname(MIGRATIONS_HASH_CACHE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MIGRATIONS_HASH_CACHE, hash, "utf-8");
  } catch {
    // non-fatal: cache write failure is OK
  }
}

/**
 * Returns true when the raw SQL contains the `-- migrate:no-transaction`
 * pragma.  Migrations tagged with this pragma are applied outside of a
 * BEGIN/COMMIT block so that statements like CREATE INDEX CONCURRENTLY — which
 * PostgreSQL forbids inside a transaction — can be used safely.
 */
export function isNoTransactionMigration(sql: string): boolean {
  return /--\s*migrate:no-transaction/i.test(sql);
}

/**
 * Apply a single migration file OUTSIDE of a transaction (autocommit mode).
 *
 * Used for migrations tagged with `-- migrate:no-transaction`, e.g. those
 * that contain `CREATE INDEX CONCURRENTLY` statements.  Because there is no
 * surrounding transaction, partial failures cannot be rolled back atomically —
 * the migration will simply not be recorded in schema_migrations and will
 * retry on the next restart, which is the correct behaviour for idempotent DDL.
 *
 * Skippable errors (already-exists / already-dropped) are still handled the
 * same way, but without SAVEPOINTs (each statement is its own implicit txn).
 */
export async function applyMigrationNoTransaction(
  client: import("pg").PoolClient,
  filename: string,
  statements: string[]
): Promise<void> {
  let skipped = 0;
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await client.query(stmt);
    } catch (err) {
      if (isSkippableError(err)) {
        const code = (err as { code?: string }).code;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[migrate]   skip stmt #${i + 1} in ${filename} (code ${code}): ${msg}`);
        skipped++;
      } else if (isPostgisOwnerError(err)) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[migrate]   skip stmt #${i + 1} in ${filename} (42501 on PostGIS system table — not owner, safe to ignore): ${msg}`
        );
        skipped++;
      } else {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`[migrate] Migration "${filename}" failed at stmt #${i + 1}: ${message}`);
      }
    }
  }

  // Task #5314 — Defense in depth alongside the advisory lock in
  // runMigrations(): ON CONFLICT DO NOTHING makes this insert race-safe even
  // if two processes somehow reach here concurrently (e.g. lock unavailable).
  // A rowCount of 0 means another process already recorded this exact
  // filename — treat that as "already applied concurrently", not a crash.
  const insertResult = await client.query(
    "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
    [filename]
  );

  const note = skipped > 0 ? ` (${skipped}/${statements.length} stmt already existed, skipped)` : "";
  if ((insertResult.rowCount ?? 0) === 0) {
    console.warn(
      `[migrate] ⚠ ${filename} was already recorded by a concurrent process (no-transaction) — treating as applied${note}.`
    );
  } else {
    console.log(`[migrate] ✓ ${filename} applied (no-transaction)${note}`);
  }
}

/**
 * Apply a single migration file inside a transaction.
 *
 * Each SQL statement runs inside its own SAVEPOINT. If a statement fails
 * with an "already exists" error (42P07, 42701, 42710, 42P16) the savepoint
 * is rolled back and the statement is skipped — this is safe when
 * bootstrapping on a database where prior migrations were applied manually
 * without the tracking table. Any other error aborts the entire migration.
 *
 * This handles all three real-world scenarios correctly:
 *  1. Fresh DB       → all statements succeed        → migration applied
 *  2. Fully-applied  → all statements skip            → migration marked applied
 *  3. Partially-applied (e.g. missing new columns)   → old objects skip,
 *                                                       new objects created
 */
export async function applyMigration(
  client: import("pg").PoolClient,
  filename: string,
  statements: string[]
): Promise<void> {
  await client.query("BEGIN");
  try {
    let skipped = 0;
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const sp = `sp_migration_${i}`;
      await client.query(`SAVEPOINT ${sp}`);
      try {
        await client.query(stmt);
        await client.query(`RELEASE SAVEPOINT ${sp}`);
      } catch (err) {
        if (isSkippableError(err)) {
          const code = (err as { code?: string }).code;
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[migrate]   skip stmt #${i + 1} in ${filename} (code ${code}): ${msg}`);
          await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          await client.query(`RELEASE SAVEPOINT ${sp}`);
          skipped++;
        } else if (isPostgisOwnerError(err)) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[migrate]   skip stmt #${i + 1} in ${filename} (42501 on PostGIS system table — not owner, safe to ignore): ${msg}`
          );
          await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          await client.query(`RELEASE SAVEPOINT ${sp}`);
          skipped++;
        } else {
          await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          await client.query(`RELEASE SAVEPOINT ${sp}`);
          throw err;
        }
      }
    }

    // Task #5314 — Defense in depth alongside the advisory lock in
    // runMigrations(): ON CONFLICT DO NOTHING makes this insert race-safe
    // even if two processes somehow reach here concurrently (e.g. lock
    // unavailable). A rowCount of 0 means another process already recorded
    // this exact filename — treat that as "already applied concurrently",
    // not a crash. The DDL we just ran inside this transaction is still
    // committed (each statement was already guarded by its own SAVEPOINT
    // against "already exists" errors), so committing here is safe either way.
    const insertResult = await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
      [filename]
    );
    await client.query("COMMIT");

    const note = skipped > 0 ? ` (${skipped}/${statements.length} stmt already existed, skipped)` : "";
    if ((insertResult.rowCount ?? 0) === 0) {
      console.warn(
        `[migrate] ⚠ ${filename} was already recorded by a concurrent process — treating as applied${note}.`
      );
    } else {
      console.log(`[migrate] ✓ ${filename} applied${note}`);
    }
  } catch (err) {
    await client.query("ROLLBACK");
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[migrate] Migration "${filename}" failed: ${message}`);
  }
}

export async function runMigrations(): Promise<void> {
  const all = allMigrationFiles();

  // Blocca prefissi numerici duplicati NUOVI prima di toccare il DB.
  // I duplicati storici noti (0067, 0072) emettono solo un warning.
  assertNoDuplicateMigrationPrefixes(all);

  const currentHash = computeMigrationsHash(all);
  const cachedHash = readCachedHash();

  if (cachedHash === currentHash) {
    console.log("[migrate] Migration file cache matches; verifying the target database branch.");
  }

  const client = await pool.connect();
  try {
    // Raise statement_timeout for this connection only (session-scoped).
    // Migration 0062 deletes ~5 000 fake users with CASCADE across 84+ child
    // tables; without indexes that can take minutes. The FK indexes in 0062
    // make it index-driven, but we still give 5 minutes of headroom for any
    // future DML-intensive migration.
    // IMPORTANT: we RESET this before client.release() (see finally block)
    // so that the physical connection is returned to the pool with its default
    // timeout, preventing 5-minute timeouts on subsequent app requests.
    await client.query("SET statement_timeout = '300000'");

    await ensureMigrationsTable(client);

    const preLockApplied = await appliedMigrations(client);
    const preLockPending = pendingFiles(all, preLockApplied);

    if (preLockPending.length === 0) {
      console.log("[migrate] All migrations already applied — nothing to do.");
      writeCachedHash(currentHash);
      return;
    }

    // Task #5314 — Serialize the apply phase across concurrent boot processes.
    // This BLOCKS (does not busy-crash) if another instance already holds the
    // lock, e.g. because it is mid-way through applying the same pending
    // file(s). Once acquired, re-check schema_migrations: the previous holder
    // may have just finished applying everything we saw as pending.
    console.log(`[migrate] Acquiring migration advisory lock (key ${MIGRATION_ADVISORY_LOCK_KEY})...`);
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_ADVISORY_LOCK_KEY]);
    let lockHeld = true;
    try {
      const applied = await appliedMigrations(client);
      const pending = pendingFiles(all, applied);

      if (pending.length === 0) {
        console.log(
          "[migrate] All migrations already applied by a concurrent process while waiting for the lock — nothing to do."
        );
        writeCachedHash(currentHash);
        return;
      }

      console.log(
        `[migrate] Applying ${pending.length} pending migration(s): ${pending.join(", ")}`
      );

      for (const filename of pending) {
        const filePath = path.join(MIGRATIONS_DIR, filename);
        const sql = fs.readFileSync(filePath, "utf-8");
        const statements = splitStatements(sql);
        const noTxn = isNoTransactionMigration(sql);

        console.log(`[migrate] → ${filename} (${statements.length} statement(s))${noTxn ? " [no-transaction]" : ""}`);

        // Scrivi il file di migration corrente prima di applicarla: se il
        // server crasha durante questa migration, il crash log includerà il
        // nome del file, consentendo la diagnosi post-crash.
        try {
          fs.writeFileSync("/tmp/current-migration.txt", filename, "utf8");
        } catch {
          // Non fatale.
        }

        try {
          if (noTxn) {
            await applyMigrationNoTransaction(client, filename, statements);
          } else {
            await applyMigration(client, filename, statements);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[migrate] ✗ ${filename} FAILED: ${message}`);
          throw err;
        }
      }

      // Pulizia: nessuna migration in esecuzione.
      try {
        fs.unlinkSync("/tmp/current-migration.txt");
      } catch {
        // File già assente — ok.
      }

      console.log(`[migrate] Done — ${pending.length} migration(s) applied successfully.`);
      writeCachedHash(currentHash);
    } finally {
      if (lockHeld) {
        try {
          await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_ADVISORY_LOCK_KEY]);
        } catch (err) {
          console.warn(
            `[migrate] failed to release advisory lock (non-fatal, session will release it on disconnect): ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
        lockHeld = false;
      }
    }
  } finally {
    // Reset statement_timeout to the server default before returning the
    // connection to the pool, so subsequent app queries are not affected.
    try { await client.query("RESET statement_timeout"); } catch { /* ignore */ }
    client.release();
  }
}
