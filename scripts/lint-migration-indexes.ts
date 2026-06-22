#!/usr/bin/env tsx
/**
 * lint-migration-indexes.ts
 */

import { readFileSync } from "fs";
import { join, resolve } from "path";
import * as schema from "../shared/db/index";
import { SQL } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { 
  formatIssue, 
  formatMissingDropIssue, 
  lintSingleFile, 
  lintSpecialCreateRequiresDrop,
  SchemaSpecialIndex
} from "./lint-migration-indexes.part2";

// ─── Schema Drizzle TS — source of truth ─────────────────────────────────────

function getSchemaSpecialIndexes(): Map<string, SchemaSpecialIndex> {
  const result = new Map<string, SchemaSpecialIndex>();

  for (const value of Object.values(schema)) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      value instanceof SQL ||
      value instanceof Function
    ) {
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

      const descColumns: string[] = [];
      for (const col of cfg.columns ?? []) {
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const allMode = rawArgs.includes("--all");
  const args = rawArgs.filter((a) => !a.startsWith("--"));

  if (!allMode && args.length === 0) {
    console.error(
      "Usage: npx tsx scripts/lint-migration-indexes.ts <file1.sql> [file2.sql ...]",
    );
    console.error(
      "       npx tsx scripts/lint-migration-indexes.ts --all   (scansiona tutte le migration)",
    );
    process.exit(2);
  }

  if (allMode) {
    const { readdirSync } = await import("fs");
    const migrationsDir = join(process.cwd(), "migrations");
    let sqlFiles: string[];
    try {
      sqlFiles = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql") && !f.startsWith("."))
        .sort()
        .map((f) => join(migrationsDir, f));
    } catch (err) {
      console.error(
        `[lint-migration-indexes] Impossibile leggere migrations/: ${(err as Error).message}`,
      );
      process.exit(2);
    }
    if (sqlFiles.length === 0) {
      console.log("[lint-migration-indexes] Nessun file .sql in migrations/ — nulla da verificare.");
      process.exit(0);
    }
    args.push(...sqlFiles);
  }

  let schemaSpecial: Map<string, SchemaSpecialIndex>;
  try {
    schemaSpecial = getSchemaSpecialIndexes();
  } catch (err) {
    console.error(
      `[lint-migration-indexes] Errore caricamento schema Drizzle: ${(err as Error).message}`,
    );
    process.exit(2);
  }

  if (schemaSpecial.size === 0) {
    console.log(
      "[lint-migration-indexes] Nessun indice speciale (DESC/WHERE) nello schema — nulla da verificare.",
    );
    process.exit(0);
  }

  let totalIssues = 0;
  const errorLines: string[] = [];

  for (const filePath of args) {
    const absPath = resolve(process.cwd(), filePath);
    let content: string;
    try {
      content = readFileSync(absPath, "utf-8");
    } catch (err) {
      console.error(
        `[lint-migration-indexes] Impossibile leggere ${filePath}: ${(err as Error).message}`,
      );
      process.exit(2);
    }

    const shortName = filePath.replace(/^.*migrations\//, "migrations/");
    const baseName = shortName.replace(/^migrations\//, "");

    const issues = lintSingleFile(content, schemaSpecial, baseName);
    for (const issue of issues) {
      errorLines.push(...formatIssue(issue, shortName));
      errorLines.push("");
      totalIssues++;
    }

    const missingDrops = lintSpecialCreateRequiresDrop(content, baseName);
    for (const issue of missingDrops) {
      errorLines.push(...formatMissingDropIssue(issue, shortName));
      errorLines.push("");
      totalIssues++;
    }
  }

  if (totalIssues === 0) {
    console.log(
      `[lint-migration-indexes] ✔  OK — ${args.length} file analizzati, nessun pattern indice speciale a rischio (DROP senza ricreazione, CREATE IF NOT EXISTS senza DROP).`,
    );
    process.exit(0);
  }

  console.error("──────────────────────────────────────────────────────────────────────");
  console.error("[lint-migration-indexes] PATTERN INDICE SPECIALE A RISCHIO");
  console.error("──────────────────────────────────────────────────────────────────────");
  console.error(`\nTrovati ${totalIssues} pattern a rischio su indici DESC/WHERE.\n`);
  console.error("Gli indici \"speciali\" (con ordinamento DESC o clausola WHERE) sono definiti nello schema Drizzle TS (shared/db/) come source of truth.\n");

  for (const line of errorLines) {
    console.error(line);
  }

  console.error("──────────────────────────────────────────────────────────────────────");
  console.error("Perché questi sono problemi:");
  console.error("  • DROP INDEX + CREATE senza DESC/WHERE → indice ordinario che non corrisponde allo schema TS → regressione bloccante al drift-check.");
  console.error("  • CREATE INDEX IF NOT EXISTS speciale senza DROP precedente → se l'indice già esiste, IF NOT EXISTS salta la CREATE e DESC/WHERE non si applicano mai → drift silenzioso permanente (\"🔴 Index Drift rilevato\" al boot).");
  console.error("    Pattern corretto: DROP INDEX IF EXISTS + CREATE INDEX.\n");
  console.error("Bypass una-tantum (solo se sicuro): git commit --no-verify");
  console.error("──────────────────────────────────────────────────────────────────────");

  process.exit(1);
}

main().catch((err) => {
  console.error(`[lint-migration-indexes] Errore imprevisto: ${(err as Error).message}`);
  process.exit(2);
});
