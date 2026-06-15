#!/usr/bin/env npx tsx
/**
 * check-migration-unsafe-dedup.ts
 *
 * Scans all migration files and flags those that use the NULL-unsafe
 * self-referential `DELETE FROM <t> WHERE id NOT IN (SELECT id FROM <t>)`
 * deduplication pattern before adding a UNIQUE constraint or index.
 *
 * Why this is dangerous:
 *   - If the subquery returns any NULL, `x NOT IN (…, NULL, …)` is UNKNOWN
 *     (not TRUE), so NO rows are deleted — silently wrong.
 *   - On large tables the NOT IN subquery cannot use an index efficiently
 *     and may cause timeouts.
 *
 * The safe alternative is the ROW_NUMBER() CTE pattern:
 *
 *   WITH dupes AS (
 *     SELECT id,
 *            ROW_NUMBER() OVER (PARTITION BY … ORDER BY …) AS rn
 *     FROM <table>
 *   )
 *   DELETE FROM <table> WHERE id IN (SELECT id FROM dupes WHERE rn > 1);
 *
 * Reference implementation: migrations/0105_crash_logs_unique_session.sql
 *
 * Detection heuristic (self-referential only — avoids false positives on
 * cross-table orphan-cleanup patterns like 0061 that are safe):
 *   DELETE FROM <table>               ← note the table name
 *   WHERE … NOT IN (SELECT … FROM <same table>   ← same table in subquery
 *
 * Exit codes:
 *   0 — no unsafe patterns found
 *   1 — one or more migrations use the unsafe pattern
 *
 * Usage:
 *   npx tsx scripts/check-migration-unsafe-dedup.ts
 */

import * as fs from "fs";
import * as path from "path";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

/**
 * Extracts the table name from a `DELETE FROM <table>` statement.
 * Returns null if the line does not start a DELETE statement.
 */
function extractDeleteTable(line: string): string | null {
  const m = line.trim().match(/^DELETE\s+FROM\s+(\w+)/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Returns true if `window` (a concatenation of several lines) contains
 * a `WHERE … NOT IN (SELECT … FROM <tableName>` reference to the same
 * table being deleted — the self-referential deduplication anti-pattern.
 */
function isSelfReferentialNotIn(window: string, tableName: string): boolean {
  // Match: WHERE <expr> NOT IN ( SELECT <...> FROM <tableName>
  // The table name in the subquery must match the outer DELETE table.
  const re = new RegExp(
    `WHERE\\s+\\S.*\\bNOT\\s+IN\\s*\\(\\s*SELECT\\b[^)]*\\bFROM\\s+${tableName}\\b`,
    "is"
  );
  return re.test(window);
}

function main(): void {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log("[check-migration-unsafe-dedup] migrations/ dir not found — skip.");
    process.exit(0);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("."))
    .sort();

  const violations: string[] = [];

  for (const filename of files) {
    const filePath = path.join(MIGRATIONS_DIR, filename);
    const sql = fs.readFileSync(filePath, "utf-8");
    const lines = sql.replace(/\r\n/g, "\n").split("\n");

    for (let i = 0; i < lines.length; i++) {
      const tableName = extractDeleteTable(lines[i]);
      if (!tableName) continue;

      // Look ahead 15 lines for the WHERE…NOT IN (SELECT … FROM <same table>) pattern
      const window = lines.slice(i, i + 15).join(" ");
      if (isSelfReferentialNotIn(window, tableName)) {
        violations.push(filename);
        break; // one violation per file is enough
      }
    }
  }

  if (violations.length === 0) {
    console.log(
      `[check-migration-unsafe-dedup] ✅ ${files.length} migration(s) scanned — no self-referential DELETE…NOT IN deduplication patterns found.`
    );
    process.exit(0);
  }

  console.error(
    `[check-migration-unsafe-dedup] ❌ Found ${violations.length} migration(s) with NULL-unsafe self-referential DELETE…WHERE…NOT IN deduplication pattern:`
  );
  for (const v of violations) {
    console.error(`   • migrations/${v}`);
  }
  console.error("");
  console.error("  ✏️  Replace with the ROW_NUMBER() CTE pattern:");
  console.error("       WITH dupes AS (");
  console.error("         SELECT id, ROW_NUMBER() OVER (PARTITION BY … ORDER BY …) AS rn");
  console.error("         FROM <table>");
  console.error("       )");
  console.error("       DELETE FROM <table> WHERE id IN (SELECT id FROM dupes WHERE rn > 1);");
  console.error("");
  console.error("  Reference: migrations/0105_crash_logs_unique_session.sql");
  console.error("  Also ensure each statement is separated by '--> statement-breakpoint'");
  console.error("  and ALTER TABLE … ADD CONSTRAINT is wrapped in DO $$ IF NOT EXISTS $$.");
  process.exit(1);
}

main();
