// Task #2536 / #3395 — Check pack: drift di schema registry Drizzle ⇄ PostgreSQL.
//
// Confronto BIDIREZIONALE (information_schema):
//   registry → DB:
//     - presenza di ogni tabella dichiarata
//     - presenza di ogni colonna dichiarata su tabella esistente
//     - colonne notNull dichiarate ma NULLABLE sul DB
//   DB → registry (drift inverso, es. tabella legacy solo in prod):
//     - tabelle presenti nel DB ma non dichiarate nel registry
//     - colonne presenti nel DB ma non dichiarate nel registry
//   tabelle critiche (telemetria + matching):
//     - qualsiasi drift (in entrambe le direzioni) → severità critical
//
// Gli oggetti di sistema (PostGIS, session, schema_migrations, integrity_*)
// sono esclusi via EXCLUDED_TABLES (registry-introspect.ts).
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import {
  listDeclaredTables,
  declaredTableNames,
  EXCLUDED_TABLES,
  isCriticalTable,
} from "../registry-introspect";
import type { IntegrityCheck, CheckResult } from "../types";

const MAX_SAMPLE = 50;

async function tableExists(name: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass(${"public." + name}) IS NOT NULL AS ok`);
  return Boolean((r.rows?.[0] as { ok?: boolean } | undefined)?.ok);
}

async function columnsOf(table: string): Promise<Map<string, { nullable: boolean }>> {
  const r = await db.execute(
    sql`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table}`,
  );
  return new Map(
    ((r.rows ?? []) as Array<{ column_name: string; is_nullable: string }>).map((x) => [
      x.column_name,
      { nullable: x.is_nullable === "YES" },
    ]),
  );
}

/** Tutte le tabelle del public schema (escludendo gli oggetti di sistema). */
async function dbPublicTables(): Promise<string[]> {
  const r = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return ((r.rows ?? []) as Array<{ table_name: string }>)
    .map((x) => x.table_name)
    .filter((n) => !EXCLUDED_TABLES.has(n));
}

// ── registry → DB ───────────────────────────────────────────────────────────

async function checkTablesExist(): Promise<CheckResult> {
  const declared = listDeclaredTables();
  if (!declared.length) return { ok: true, count: 0, sample: [], details: { note: "registry empty" } };
  const missing: Array<{ pk: string; data: Record<string, unknown> }> = [];
  for (const t of declared) {
    if (!(await tableExists(t.name))) {
      missing.push({ pk: t.name, data: { table: t.name, critical: isCriticalTable(t.name) } });
    }
    if (missing.length >= 20) break;
  }
  if (!missing.length) return { ok: true, count: 0, sample: [], details: { declared: declared.length } };
  return { ok: false, count: missing.length, sample: missing, details: { declared: declared.length } };
}

async function checkColumnsExist(): Promise<CheckResult> {
  const declared = listDeclaredTables();
  if (!declared.length) return { ok: true, count: 0, sample: [] };
  const missing: Array<{ pk: string; data: Record<string, unknown> }> = [];
  for (const t of declared) {
    if (!(await tableExists(t.name))) continue;
    const present = await columnsOf(t.name);
    for (const c of t.columns) {
      if (!present.has(c.name)) {
        missing.push({ pk: `${t.name}.${c.name}`, data: { table: t.name, column: c.name } });
        if (missing.length >= MAX_SAMPLE) break;
      }
    }
    if (missing.length >= MAX_SAMPLE) break;
  }
  if (!missing.length) return { ok: true, count: 0, sample: [] };
  return { ok: false, count: missing.length, sample: missing };
}

async function checkNullableMismatch(): Promise<CheckResult> {
  const declared = listDeclaredTables();
  if (!declared.length) return { ok: true, count: 0, sample: [] };
  const issues: Array<{ pk: string; data: Record<string, unknown> }> = [];
  for (const t of declared) {
    if (!(await tableExists(t.name))) continue;
    const present = await columnsOf(t.name);
    for (const c of t.columns) {
      if (!c.notNull) continue;
      const info = present.get(c.name);
      if (info?.nullable === true) {
        issues.push({
          pk: `${t.name}.${c.name}`,
          data: { table: t.name, column: c.name, declared: "NOT NULL", db: "NULLABLE" },
        });
        if (issues.length >= 30) break;
      }
    }
    if (issues.length >= 30) break;
  }
  if (!issues.length) return { ok: true, count: 0, sample: [] };
  return { ok: false, count: issues.length, sample: issues };
}

// ── DB → registry (drift inverso) ────────────────────────────────────────────

async function checkUndeclaredTables(): Promise<CheckResult> {
  const declared = declaredTableNames();
  const dbTables = await dbPublicTables();
  const extra: Array<{ pk: string; data: Record<string, unknown> }> = [];
  for (const name of dbTables) {
    if (declared.has(name)) continue;
    if (isCriticalTable(name)) continue; // gestita dal check critical-tables-drift
    extra.push({ pk: name, data: { table: name, presentIn: "db", declaredInRegistry: false } });
    if (extra.length >= 20) break;
  }
  if (!extra.length) return { ok: true, count: 0, sample: [], details: { dbTables: dbTables.length } };
  return { ok: false, count: extra.length, sample: extra, details: { dbTables: dbTables.length } };
}

async function checkUndeclaredColumns(): Promise<CheckResult> {
  const declared = listDeclaredTables();
  const extra: Array<{ pk: string; data: Record<string, unknown> }> = [];
  for (const t of declared) {
    if (isCriticalTable(t.name)) continue; // gestita dal check critical-tables-drift
    if (!(await tableExists(t.name))) continue;
    const declaredCols = new Set(t.columns.map((c) => c.name));
    const present = await columnsOf(t.name);
    for (const colName of present.keys()) {
      if (!declaredCols.has(colName)) {
        extra.push({ pk: `${t.name}.${colName}`, data: { table: t.name, column: colName, declaredInRegistry: false } });
        if (extra.length >= MAX_SAMPLE) break;
      }
    }
    if (extra.length >= MAX_SAMPLE) break;
  }
  if (!extra.length) return { ok: true, count: 0, sample: [] };
  return { ok: false, count: extra.length, sample: extra };
}

// ── tabelle critiche (telemetria + matching), entrambe le direzioni ──────────

async function checkCriticalTablesDrift(): Promise<CheckResult> {
  const declared = listDeclaredTables();
  const declaredNames = declaredTableNames();
  const dbTables = await dbPublicTables();
  const issues: Array<{ pk: string; data: Record<string, unknown> }> = [];

  // 1) Tabelle critiche dichiarate: verifica esistenza + drift colonne bidirezionale.
  for (const t of declared) {
    if (!isCriticalTable(t.name)) continue;
    if (!(await tableExists(t.name))) {
      issues.push({ pk: t.name, data: { table: t.name, kind: "missing_table", direction: "registry->db" } });
      continue;
    }
    const present = await columnsOf(t.name);
    const declaredCols = new Set(t.columns.map((c) => c.name));
    for (const c of t.columns) {
      const info = present.get(c.name);
      if (!info) {
        issues.push({ pk: `${t.name}.${c.name}`, data: { table: t.name, column: c.name, kind: "missing_column", direction: "registry->db" } });
      } else if (c.notNull && info.nullable) {
        issues.push({ pk: `${t.name}.${c.name}`, data: { table: t.name, column: c.name, kind: "nullable_mismatch", declared: "NOT NULL", db: "NULLABLE" } });
      }
    }
    for (const colName of present.keys()) {
      if (!declaredCols.has(colName)) {
        issues.push({ pk: `${t.name}.${colName}`, data: { table: t.name, column: colName, kind: "undeclared_column", direction: "db->registry" } });
      }
    }
    if (issues.length >= MAX_SAMPLE) break;
  }

  // 2) Tabelle critiche presenti nel DB ma NON dichiarate (legacy solo in prod).
  if (issues.length < MAX_SAMPLE) {
    for (const name of dbTables) {
      if (!isCriticalTable(name)) continue;
      if (declaredNames.has(name)) continue;
      issues.push({ pk: name, data: { table: name, kind: "undeclared_table", direction: "db->registry" } });
      if (issues.length >= MAX_SAMPLE) break;
    }
  }

  if (!issues.length) return { ok: true, count: 0, sample: [] };
  return { ok: false, count: issues.length, sample: issues.slice(0, MAX_SAMPLE) };
}

const checks: IntegrityCheck[] = [
  {
    id: "schema-registry/declared-tables-exist",
    name: "Tabelle dichiarate in @shared/db esistono nel DB",
    category: "schema-registry", severity: "critical", cost: "cheap",
    description: "Diff registry Drizzle → PostgreSQL (presenza tabelle).",
    explainHint: "Tabella mancante = migrazione non applicata o nome divergente.",
    query: checkTablesExist,
  },
  {
    id: "schema-registry/declared-columns-exist",
    name: "Colonne dichiarate esistono",
    category: "schema-registry", severity: "high", cost: "medium",
    description: "Ogni colonna nello schema Drizzle deve esistere nel DB.",
    query: checkColumnsExist,
  },
  {
    id: "schema-registry/notnull-mismatch",
    name: "Colonne notNull declared ma NULLABLE in DB",
    category: "schema-registry", severity: "high", cost: "medium",
    description: "Mismatch di constraint NOT NULL fra registry e DB.",
    query: checkNullableMismatch,
  },
  {
    id: "schema-registry/undeclared-tables",
    name: "Tabelle nel DB ma non nel registry (drift inverso)",
    category: "schema-registry", severity: "medium", cost: "cheap",
    description: "Diff PostgreSQL → registry Drizzle (tabelle legacy non dichiarate).",
    explainHint: "Tabella presente solo nel DB = drift inverso (es. legacy solo in prod) o registry non aggiornato.",
    query: checkUndeclaredTables,
  },
  {
    id: "schema-registry/undeclared-columns",
    name: "Colonne nel DB ma non nel registry (drift inverso)",
    category: "schema-registry", severity: "medium", cost: "medium",
    description: "Colonne presenti nel DB su tabelle dichiarate ma non descritte nel registry.",
    query: checkUndeclaredColumns,
  },
  {
    id: "schema-registry/critical-tables-drift",
    name: "Drift schema su tabelle critiche (telemetria + matching)",
    category: "schema-registry", severity: "critical", cost: "medium",
    description: "Qualsiasi discrepanza di schema (bidirezionale) su tabelle telemetria/matching.",
    explainHint: "Drift su telemetria/matching è critico: rompe collettori e motore di matching.",
    query: checkCriticalTablesDrift,
  },
];
export default checks;
