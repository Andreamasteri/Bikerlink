#!/usr/bin/env tsx
/**
 * lint-migration-indexes.ts
 *
 * Controllo PROATTIVO per i file migration .sql: rileva DROP INDEX su indici
 * "speciali" (DESC o WHERE) senza una corrispondente ricreazione che mantenga
 * quelle caratteristiche nello stesso file.
 *
 * A differenza di check-index-drift.ts (che rileva regressioni sull'intera
 * storia delle migration), questo script analizza uno o più file specifici
 * e blocca il problema PRIMA che venga committato.
 *
 * Usage:
 *   npx tsx scripts/lint-migration-indexes.ts <file1.sql> [file2.sql ...]
 *   npx tsx scripts/lint-migration-indexes.ts migrations/0085_foo.sql
 *
 * Integrazione hook pre-commit:
 *   Il pre-commit hook lo chiama automaticamente per ogni file .sql in staging
 *   che si trova dentro migrations/.
 *
 * Exit code:
 *   0 → OK: nessuna DROP senza ricreazione corretta
 *   1 → PROBLEMA: almeno un indice speciale viene droppato senza ricreazione
 *   2 → Errore lettura file / schema non caricabile
 */

import { readFileSync } from "fs";
import { join, resolve } from "path";
import * as schema from "../shared/db/index";
import { SQL } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";

// ─── Tipi ────────────────────────────────────────────────────────────────────

interface SchemaSpecialIndex {
  indexName: string;
  tableName: string;
  hasDesc: boolean;
  hasWhere: boolean;
  descColumns: string[];
}

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

// ─── Parser SQL ───────────────────────────────────────────────────────────────

function normalizeSql(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractDroppedIndexNames(sql: string): Set<string> {
  const dropped = new Set<string>();
  // PostgreSQL allows both orderings:
  //   DROP INDEX [CONCURRENTLY] [IF EXISTS] name
  //   DROP INDEX [IF EXISTS] name   (CONCURRENTLY before or after IF EXISTS)
  const re =
    /DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(?:CONCURRENTLY\s+)?["']?(\w+)["']?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    dropped.add(m[1].toLowerCase());
  }
  return dropped;
}

interface ParsedCreate {
  indexName: string;
  hasDesc: boolean;
  hasWhere: boolean;
  fullDef: string;
}

function extractCreatedIndexes(sql: string): ParsedCreate[] {
  const results: ParsedCreate[] = [];
  const cleaned = sql.replace(/--[^\n]*/g, " ");

  const re =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?\s+ON\s+["']?(\w+)["']?\s*(?:USING\s+\w+\s*)?\((?:[^()]*|\([^()]*\))*\)(?:\s+WHERE\s+[^;]+)?/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const fullDef = normalizeSql(m[0]);
    results.push({
      indexName: m[1].toLowerCase(),
      hasDesc: /\bdesc\b/.test(fullDef),
      hasWhere: /\bwhere\b/.test(fullDef),
      fullDef,
    });
  }
  return results;
}

// ─── Verifica singolo file migration ─────────────────────────────────────────

interface LintIssue {
  indexName: string;
  tableName: string;
  lostDesc: boolean;
  lostWhere: boolean;
  descColumns: string[];
  /** true se l'indice viene droppato e non ricreato affatto nel file */
  notRecreated: boolean;
}

function lintSingleFile(
  sqlContent: string,
  schemaSpecial: Map<string, SchemaSpecialIndex>,
): LintIssue[] {
  const issues: LintIssue[] = [];

  const dropped = extractDroppedIndexNames(sqlContent);
  if (dropped.size === 0) return [];

  const creates = extractCreatedIndexes(sqlContent);
  const createMap = new Map<string, ParsedCreate>();
  for (const c of creates) createMap.set(c.indexName, c);

  for (const droppedName of dropped) {
    const expected = schemaSpecial.get(droppedName);
    if (!expected) continue;

    const recreated = createMap.get(droppedName);

    if (!recreated) {
      issues.push({
        indexName: droppedName,
        tableName: expected.tableName,
        lostDesc: expected.hasDesc,
        lostWhere: expected.hasWhere,
        descColumns: expected.descColumns,
        notRecreated: true,
      });
      continue;
    }

    const lostDesc = expected.hasDesc && !recreated.hasDesc;
    const lostWhere = expected.hasWhere && !recreated.hasWhere;

    if (lostDesc || lostWhere) {
      issues.push({
        indexName: droppedName,
        tableName: expected.tableName,
        lostDesc,
        lostWhere,
        descColumns: expected.descColumns,
        notRecreated: false,
      });
    }
  }

  return issues;
}

// ─── Formattazione errori ─────────────────────────────────────────────────────

function formatIssue(issue: LintIssue, migrationFile: string): string[] {
  const lines: string[] = [];

  lines.push(
    `  ✖  "${issue.indexName}" (tabella: ${issue.tableName}) in ${migrationFile}`,
  );

  if (issue.notRecreated) {
    lines.push(
      `     Problema : DROP INDEX senza ricreazione — l'indice sparisce definitivamente`,
    );
    const traits: string[] = [];
    if (issue.lostDesc)
      traits.push(`ordinamento DESC su [${issue.descColumns.join(", ")}]`);
    if (issue.lostWhere) traits.push("clausola WHERE");
    lines.push(`     Perso    : ${traits.join(", ")}`);
    lines.push(`     Fix      : aggiungi dopo il DROP:`);
    if (issue.lostDesc) {
      lines.push(
        `                  CREATE INDEX ${issue.indexName} ON ${issue.tableName} (...${issue.descColumns.map((c) => `${c} DESC`).join(", ")}...);`,
      );
    }
    if (issue.lostWhere) {
      lines.push(
        `                  CREATE INDEX ${issue.indexName} ON ${issue.tableName} (...) WHERE <condizione>;`,
      );
    }
  } else {
    if (issue.lostDesc) {
      lines.push(
        `     Problema : indice ricreato ma senza ordinamento DESC (schema TS richiede DESC su [${issue.descColumns.join(", ")}])`,
      );
      lines.push(
        `     Fix      : aggiungi DESC alle colonne nel CREATE INDEX: ${issue.descColumns.map((c) => `${c} DESC`).join(", ")}`,
      );
    }
    if (issue.lostWhere) {
      lines.push(
        `     Problema : indice ricreato ma senza clausola WHERE (schema TS richiede WHERE)`,
      );
      lines.push(
        `     Fix      : aggiungi la clausola WHERE al CREATE INDEX (verifica shared/db/ per la condizione esatta)`,
      );
    }
  }

  return lines;
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

  // In modalità --all, carica tutti i file .sql dalla cartella migrations/
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

    const issues = lintSingleFile(content, schemaSpecial);
    if (issues.length > 0) {
      const shortName = filePath.replace(/^.*migrations\//, "migrations/");
      for (const issue of issues) {
        errorLines.push(...formatIssue(issue, shortName));
        errorLines.push("");
        totalIssues++;
      }
    }
  }

  if (totalIssues === 0) {
    console.log(
      `[lint-migration-indexes] ✔  OK — ${args.length} file analizzati, nessuna DROP di indice speciale senza ricreazione corretta.`,
    );
    process.exit(0);
  }

  console.error(
    "──────────────────────────────────────────────────────────────────────",
  );
  console.error("[lint-migration-indexes] DROP INDICE SPECIALE SENZA RICREAZIONE CORRETTA");
  console.error(
    "──────────────────────────────────────────────────────────────────────",
  );
  console.error(
    `\nTrovate ${totalIssues} migration che droppano indici DESC/WHERE senza ricrearli correttamente.\n`,
  );
  console.error(
    "Gli indici \"speciali\" (con ordinamento DESC o clausola WHERE) sono definiti",
  );
  console.error("nello schema Drizzle TS (shared/db/) come source of truth.\n");

  for (const line of errorLines) {
    console.error(line);
  }

  console.error(
    "──────────────────────────────────────────────────────────────────────",
  );
  console.error("Perché questo è un problema:");
  console.error(
    "  Un DROP INDEX seguito da CREATE INDEX senza DESC/WHERE genera un indice",
  );
  console.error(
    "  ordinario che non corrisponde allo schema TS → il prossimo drift-check",
  );
  console.error("  segnalerà una regressione e bloccherà il deploy.\n");
  console.error("Bypass una-tantum (solo se sicuro): git commit --no-verify");
  console.error(
    "──────────────────────────────────────────────────────────────────────",
  );

  process.exit(1);
}

main().catch((err) => {
  console.error(
    `[lint-migration-indexes] Errore imprevisto: ${(err as Error).message}`,
  );
  process.exit(2);
});
