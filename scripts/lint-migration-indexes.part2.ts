/**
 * lint-migration-indexes.part2.ts
 * Implementazioni helper spostate da lint-migration-indexes.ts per rispettare il gate ≤600 righe.
 */

// ─── Tipi ────────────────────────────────────────────────────────────────────

export interface SchemaSpecialIndex {
  indexName: string;
  tableName: string;
  hasDesc: boolean;
  hasWhere: boolean;
  descColumns: string[];
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

// ─── Check A: DROP senza ricreazione speciale ─────────────────────────────────

interface LintIssue {
  indexName: string;
  tableName: string;
  lostDesc: boolean;
  lostWhere: boolean;
  descColumns: string[];
  notRecreated: boolean;
}

const KNOWN_DROP_RECREATE_REGRESSION = new Set<string>([
  "0060_bent_the_renegades.sql:ota_assistant_runs_started_at_idx",
]);

export function lintSingleFile(
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

// ─── Check B: CREATE IF NOT EXISTS speciale senza DROP precedente ─────────────

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

export function lintSpecialCreateRequiresDrop(
  sqlContent: string,
  migrationBaseName: string,
): MissingDropIssue[] {
  const creates = extractCreatedIndexes(sqlContent);
  if (creates.length === 0) return [];

  const drops = extractDroppedIndexesWithPos(sqlContent);
  const issues: MissingDropIssue[] = [];

  for (const c of creates) {
    if (!c.ifNotExists) continue;
    if (!c.hasDesc && !c.hasWhere) continue;

    const hasPrecedingDrop = drops.some(
      (d) => d.name === c.indexName && d.position < c.position,
    );
    if (hasPrecedingDrop) continue;

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

export function formatIssue(issue: LintIssue, migrationFile: string): string[] {
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

export function formatMissingDropIssue(
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
