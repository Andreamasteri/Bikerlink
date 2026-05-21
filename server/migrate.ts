import * as fs from "fs";
import * as path from "path";
import { pool } from "./db";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

/**
 * PostgreSQL error codes that mean "this object already exists".
 * These are safe to skip when bootstrapping on an existing database.
 *
 *   42P07 — duplicate_table     (CREATE TABLE)
 *   42701 — duplicate_column    (ALTER TABLE ADD COLUMN)
 *   42710 — duplicate_object    (CREATE TYPE, CREATE INDEX, CREATE SEQUENCE)
 *   42P16 — invalid_table_definition (CREATE TABLE LIKE / partition-related duplicates)
 */
const ALREADY_EXISTS_CODES = new Set(["42P07", "42701", "42710", "42P16"]);

function isAlreadyExistsError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return typeof code === "string" && ALREADY_EXISTS_CODES.has(code);
}

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

function splitStatements(sql: string): string[] {
  return sql
    .split(/--> statement-breakpoint/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
async function applyMigration(
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
        if (isAlreadyExistsError(err)) {
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

    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      [filename]
    );
    await client.query("COMMIT");

    const note = skipped > 0 ? ` (${skipped}/${statements.length} stmt already existed, skipped)` : "";
    console.log(`[migrate] ✓ ${filename} applied${note}`);
  } catch (err) {
    await client.query("ROLLBACK");
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[migrate] Migration "${filename}" failed: ${message}`);
  }
}

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const all = allMigrationFiles();
    const applied = await appliedMigrations(client);
    const pending = pendingFiles(all, applied);

    if (pending.length === 0) {
      console.log("[migrate] All migrations already applied — nothing to do.");
      return;
    }

    console.log(
      `[migrate] Applying ${pending.length} pending migration(s): ${pending.join(", ")}`
    );

    for (const filename of pending) {
      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filePath, "utf-8");
      const statements = splitStatements(sql);

      console.log(`[migrate] → ${filename} (${statements.length} statement(s))`);

      try {
        await applyMigration(client, filename, statements);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[migrate] ✗ ${filename} FAILED: ${message}`);
        throw err;
      }
    }

    console.log(`[migrate] Done — ${pending.length} migration(s) applied successfully.`);
  } finally {
    client.release();
  }
}
