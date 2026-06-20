#!/usr/bin/env tsx
/**
 * lint-migration-indexes.ts
 *
 * Controllo PROATTIVO per i file migration .sql. Rileva DUE pattern di rischio
 * sugli indici "speciali" (con ordinamento DESC o clausola WHERE):
 *
 *   A) DROP INDEX su un indice speciale senza una corrispondente ricreazione
 *      che mantenga quelle caratteristiche nello stesso file (regressione).
 *
 *   B) CREATE INDEX IF NOT EXISTS con DESC/WHERE SENZA un DROP INDEX IF EXISTS
 *      dello stesso nome che lo precede nello stesso file (drift silenzioso).
 *      `IF NOT EXISTS` NON applica mai l'ordinamento DESC / la clausola WHERE
 *      sopra un indice già esistente creato in passato senza quelle proprietà:
 *      Postgres vede che l'indice esiste e salta la CREATE. In questo ambiente
 *      Replit l'indice può pre-esistere anche per tabelle "nuove" (auto-push
 *      del diff schema in prod), quindi `CREATE TABLE IF NOT EXISTS` +
 *      `CREATE INDEX IF NOT EXISTS ... DESC` non è sufficiente. Il pattern
 *      corretto e idempotente è SEMPRE:
 *          DROP INDEX IF EXISTS "name";
 *          CREATE INDEX IF NOT EXISTS "name" ON ... (col DESC) [WHERE ...];
 *
 * A differenza di check-index-drift.ts (che rileva regressioni e inverse drift
 * sull'intera storia delle migration, ma NON il drift silenzioso di tipo B
 * perché l'SQL "sembra" corretto), questo script analizza uno o più file
 * specifici e blocca il problema PRIMA che venga committato.
 *
 * Usage:
 *   npx tsx scripts/lint-migration-indexes.ts <file1.sql> [file2.sql ...]
 *   npx tsx scripts/lint-migration-indexes.ts migrations/0085_foo.sql
 *   npx tsx scripts/lint-migration-indexes.ts --all   (scansiona tutte le migration)
 *
 * Integrazione hook pre-commit:
 *   Il pre-commit hook lo chiama automaticamente per ogni file .sql in staging
 *   che si trova dentro migrations/.
 *
 * Integrazione CI:
 *   Il workflow db-migration-checks lo lancia in modalità --all come gate: le
 *   violazioni storiche già in prod sono grandfathered in KNOWN_SPECIAL_CREATE_
 *   WITHOUT_DROP, ogni NUOVA violazione blocca il check.
 *
 * Exit code:
 *   0 → OK: nessuna DROP senza ricreazione e nessun CREATE IF NOT EXISTS rischioso
 *   1 → PROBLEMA: regressione DROP, oppure CREATE IF NOT EXISTS speciale senza DROP
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
  tableName: string;
  hasDesc: boolean;
  hasWhere: boolean;
  ifNotExists: boolean;
  /** Offset del match nel file (post-rimozione commenti) per l'ordine DROP→CREATE */
  position: number;
  fullDef: string;
}

function extractCreatedIndexes(sql: string): ParsedCreate[] {
  const results: ParsedCreate[] = [];
  const cleaned = sql.replace(/--[^\n]*/g, " ");

  const re =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?\s+ON\s+["']?(\w+)["']?\s*(?:USING\s+\w+\s*)?\((?:[^()]*|\([^()]*\))*\)(?:\s+WHERE\s+[^;]+)?/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const fullDef = normalizeSql(m[0]);
    results.push({
      indexName: m[2].toLowerCase(),
      tableName: m[3].toLowerCase(),
      hasDesc: /\bdesc\b/.test(fullDef),
      hasWhere: /\bwhere\b/.test(fullDef),
      ifNotExists: m[1] != null,
      position: m.index,
      fullDef,
    });
  }
  return results;
}

interface DroppedIndexPos {
  name: string;
  position: number;
}

function extractDroppedIndexesWithPos(sql: string): DroppedIndexPos[] {
  const cleaned = sql.replace(/--[^\n]*/g, " ");
  const results: DroppedIndexPos[] = [];
  const re =
    /DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(?:CONCURRENTLY\s+)?["']?(\w+)["']?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    results.push({ name: m[1].toLowerCase(), position: m.index });
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

// Baseline delle regressioni DROP+ricreazione storiche già riconciliate in prod
// (Check A). Es.: 0060 ricreò ota_assistant_runs_started_at_idx senza DESC, poi
// riconciliato da 0103/0104/0112. NON aggiungere nuove voci.
// Chiave: "<nome_file_migration>:<nome_indice>" (tutto minuscolo).
const KNOWN_DROP_RECREATE_REGRESSION = new Set<string>([
  "0060_bent_the_renegades.sql:ota_assistant_runs_started_at_idx",
]);

function lintSingleFile(
  sqlContent: string,
  schemaSpecial: Map<string, SchemaSpecialIndex>,
  migrationBaseName: string,
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
    if (KNOWN_DROP_RECREATE_REGRESSION.has(`${migrationBaseName}:${droppedName}`)) {
      continue;
    }

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

// ─── Check B: CREATE INDEX IF NOT EXISTS speciale senza DROP precedente ───────
//
// Baseline delle violazioni storiche già applicate in prod (CREATE INDEX IF NOT
// EXISTS con DESC/WHERE senza un DROP precedente nello stesso file). Sono
// grandfathered: o già riconciliate da migration successive (0103/0104/0112/0120)
// o create quando l'indice non poteva pre-esistere. NON aggiungere nuove voci:
// il pattern corretto per ogni nuovo indice speciale è DROP IF EXISTS + CREATE.
// Chiave: "<nome_file_migration>:<nome_indice>" (tutto minuscolo).
const KNOWN_SPECIAL_CREATE_WITHOUT_DROP = new Set<string>([
  "0033_ota_assistant_runs.sql:ota_assistant_runs_started_at_idx",
  "0047_reports_extension.sql:users_shadow_banned_idx",
  "0048_reports_admin_hub.sql:reports_assigned_moderator_idx",
  "0049_ai_moderation.sql:users_suspended_until_idx",
  "0067_ai_call_logs_and_memory.sql:ai_call_logs_created_at_idx",
  "0067_ai_call_logs_and_memory.sql:ai_call_logs_provider_idx",
  "0067_ai_call_logs_and_memory.sql:ai_call_logs_degraded_idx",
  "0067_ai_call_logs_and_memory.sql:ai_conversation_turns_user_id_idx",
  "0067_ai_call_logs_and_memory.sql:ai_conversation_turns_summary_of_idx",
  "0089_user_sessions.sql:user_sessions_ended_at_idx",
  "0109_pipeline_probe_history.sql:pipeline_probe_history_pipeline_run_at_idx",
  "0113_user_privacy_log.sql:user_privacy_log_user_id_changed_at_idx",
]);

interface MissingDropIssue {
  indexName: string;
  tableName: string;
  hasDesc: boolean;
  hasWhere: boolean;
}

/**
 * Rileva i CREATE INDEX IF NOT EXISTS che dichiarano un indice speciale
 * (DESC o WHERE) senza un DROP INDEX IF EXISTS dello stesso nome che li precede
 * nello stesso file. È la causa del drift silenzioso: `IF NOT EXISTS` salta la
 * CREATE se l'indice già esiste, lasciando intatta una versione senza DESC/WHERE.
 *
 * Solo `CREATE INDEX IF NOT EXISTS` è a rischio: un `CREATE INDEX` senza
 * IF NOT EXISTS fallirebbe rumorosamente (errore deploy) se l'indice esiste,
 * quindi non genera drift silenzioso e non viene segnalato qui.
 *
 * `migrationBaseName` (es. "0121_foo.sql") serve per filtrare la baseline storica.
 */
function lintSpecialCreateRequiresDrop(
  sqlContent: string,
  migrationBaseName: string,
): MissingDropIssue[] {
  const creates = extractCreatedIndexes(sqlContent);
  if (creates.length === 0) return [];

  const drops = extractDroppedIndexesWithPos(sqlContent);
  const issues: MissingDropIssue[] = [];

  for (const c of creates) {
    if (!c.ifNotExists) continue;               // solo IF NOT EXISTS è silente
    if (!c.hasDesc && !c.hasWhere) continue;    // solo indici speciali

    const hasPrecedingDrop = drops.some(
      (d) => d.name === c.indexName && d.position < c.position,
    );
    if (hasPrecedingDrop) continue;

    // Grandfathering delle violazioni storiche già in prod
    if (KNOWN_SPECIAL_CREATE_WITHOUT_DROP.has(`${migrationBaseName}:${c.indexName}`)) {
      continue;
    }

    issues.push({
      indexName: c.indexName,
      tableName: c.tableName,
      hasDesc: c.hasDesc,
      hasWhere: c.hasWhere,
    });
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

function formatMissingDropIssue(
  issue: MissingDropIssue,
  migrationFile: string,
): string[] {
  const lines: string[] = [];
  const traits: string[] = [];
  if (issue.hasDesc) traits.push("ordinamento DESC");
  if (issue.hasWhere) traits.push("clausola WHERE");

  lines.push(
    `  ✖  "${issue.indexName}" (tabella: ${issue.tableName}) in ${migrationFile}`,
  );
  lines.push(
    `     Problema : CREATE INDEX IF NOT EXISTS con ${traits.join(" + ")} senza DROP precedente`,
  );
  lines.push(
    `     Rischio  : drift silenzioso — se l'indice già esiste (anche da auto-push`,
  );
  lines.push(
    `                del diff schema in prod), IF NOT EXISTS salta la CREATE e le`,
  );
  lines.push(
    `                proprietà speciali NON vengono mai applicate.`,
  );
  lines.push(`     Fix      : usa SEMPRE il pattern idempotente DROP+CREATE:`);
  lines.push(`                  DROP INDEX IF EXISTS "${issue.indexName}";`);
  lines.push(
    `                  CREATE INDEX IF NOT EXISTS "${issue.indexName}" ON "${issue.tableName}" (...);`,
  );
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

    const shortName = filePath.replace(/^.*migrations\//, "migrations/");
    const baseName = shortName.replace(/^migrations\//, "");

    // Check A: DROP INDEX speciale senza ricreazione corretta
    const issues = lintSingleFile(content, schemaSpecial, baseName);
    for (const issue of issues) {
      errorLines.push(...formatIssue(issue, shortName));
      errorLines.push("");
      totalIssues++;
    }

    // Check B: CREATE INDEX IF NOT EXISTS speciale senza DROP precedente (drift silenzioso)
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

  console.error(
    "──────────────────────────────────────────────────────────────────────",
  );
  console.error("[lint-migration-indexes] PATTERN INDICE SPECIALE A RISCHIO");
  console.error(
    "──────────────────────────────────────────────────────────────────────",
  );
  console.error(
    `\nTrovati ${totalIssues} pattern a rischio su indici DESC/WHERE.\n`,
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
  console.error("Perché questi sono problemi:");
  console.error(
    "  • DROP INDEX + CREATE senza DESC/WHERE → indice ordinario che non",
  );
  console.error(
    "    corrisponde allo schema TS → regressione bloccante al drift-check.",
  );
  console.error(
    "  • CREATE INDEX IF NOT EXISTS speciale senza DROP precedente → se l'indice",
  );
  console.error(
    "    già esiste, IF NOT EXISTS salta la CREATE e DESC/WHERE non si applicano",
  );
  console.error(
    "    mai → drift silenzioso permanente (\"🔴 Index Drift rilevato\" al boot).",
  );
  console.error("    Pattern corretto: DROP INDEX IF EXISTS + CREATE INDEX.\n");
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
