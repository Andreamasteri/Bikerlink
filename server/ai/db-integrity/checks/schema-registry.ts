// Check pack: drift di schema registry Drizzle ⇄ PostgreSQL.
//
// Confronto BIDIREZIONALE (pg_catalog — fast, non information_schema):
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
// PERFORMANCE: tutte le query usano pg_catalog invece di information_schema.
// getAllColumnsMap() carica tutte le colonne di tutte le tabelle in UNA sola
// query e mette in cache il risultato per CACHE_TTL_MS (evita N round-trip).
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
const CACHE_TTL_MS = 10 * 60 * 1000;

// ── cache in-process (per il ciclo di un run completo) ──────────────────────
let _colCache: { data: Map<string, Map<string, { nullable: boolean }>>; ts: number } | null = null;
let _tableCache: { data: Set<string>; ts: number } | null = null;

/**
 * Una singola query pg_catalog carica tutte le colonne di tutte le tabelle
 * public. Molto più veloce di N query information_schema.columns.
 */
async function getAllColumnsMap(): Promise<Map<string, Map<string, { nullable: boolean }>>> {
  const now = Date.now();
  if (_colCache && now - _colCache.ts < CACHE_TTL_MS) return _colCache.data;
  const r = await db.execute(sql`
    SELECT c.relname AS table_name,
           a.attname AS column_name,
           NOT a.attnotnull AS nullable
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
  `);
  const data = new Map<string, Map<string, { nullable: boolean }>>();
  for (const row of (r.rows ?? []) as Array<{
    table_name: string;
    column_name: string;
    nullable: boolean;
  }>) {
    let tMap = data.get(row.table_name);
    if (!tMap) {
      tMap = new Map();
      data.set(row.table_name, tMap);
    }
    tMap.set(row.column_name, { nullable: Boolean(row.nullable) });
  }
  _colCache = { data, ts: now };
  return data;
}

/** Set di tutti i nomi tabella public (pg_catalog, esclude oggetti di sistema). */
async function dbPublicTableSet(): Promise<Set<string>> {
  const now = Date.now();
  if (_tableCache && now - _tableCache.ts < CACHE_TTL_MS) return _tableCache.data;
  const r = await db.execute(sql`
    SELECT c.relname AS table_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `);
  const data = new Set(
    ((r.rows ?? []) as Array<{ table_name: string }>)
      .map((x) => x.table_name)
      .filter((n) => !EXCLUDED_TABLES.has(n)),
  );
  _tableCache = { data, ts: now };
  return data;
}

// ── registry → DB ───────────────────────────────────────────────────────────

async function checkTablesExist(): Promise<CheckResult> {
  const declared = listDeclaredTables();
  if (!declared.length) return { ok: true, count: 0, sample: [], details: { note: "registry empty" } };
  const allCols = await getAllColumnsMap();
  const missing: Array<{ pk: string; data: Record<string, unknown> }> = [];
  for (const t of declared) {
    if (!allCols.has(t.name)) {
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
  const allCols = await getAllColumnsMap();
  const missing: Array<{ pk: string; data: Record<string, unknown> }> = [];
  for (const t of declared) {
    const present = allCols.get(t.name);
    if (!present) continue;
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
  const allCols = await getAllColumnsMap();
  const issues: Array<{ pk: string; data: Record<string, unknown> }> = [];
  for (const t of declared) {
    const present = allCols.get(t.name);
    if (!present) continue;
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
  const dbTables = await dbPublicTableSet();
  const extra: Array<{ pk: string; data: Record<string, unknown> }> = [];
  for (const name of dbTables) {
    if (declared.has(name)) continue;
    if (isCriticalTable(name)) continue;
    extra.push({ pk: name, data: { table: name, presentIn: "db", declaredInRegistry: false } });
    if (extra.length >= 20) break;
  }
  if (!extra.length) return { ok: true, count: 0, sample: [], details: { dbTables: dbTables.size } };
  return { ok: false, count: extra.length, sample: extra, details: { dbTables: dbTables.size } };
}

async function checkUndeclaredColumns(): Promise<CheckResult> {
  const declared = listDeclaredTables();
  const allCols = await getAllColumnsMap();
  const extra: Array<{ pk: string; data: Record<string, unknown> }> = [];
  for (const t of declared) {
    if (isCriticalTable(t.name)) continue;
    const present = allCols.get(t.name);
    if (!present) continue;
    const declaredCols = new Set(t.columns.map((c) => c.name));
    for (const colName of present.keys()) {
      if (!declaredCols.has(colName)) {
        extra.push({
          pk: `${t.name}.${colName}`,
          data: { table: t.name, column: colName, declaredInRegistry: false },
        });
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
  const allCols = await getAllColumnsMap();
  const dbTables = await dbPublicTableSet();
  const issues: Array<{ pk: string; data: Record<string, unknown> }> = [];

  for (const t of declared) {
    if (!isCriticalTable(t.name)) continue;
    const present = allCols.get(t.name);
    if (!present) {
      issues.push({ pk: t.name, data: { table: t.name, kind: "missing_table", direction: "registry->db" } });
      continue;
    }
    const declaredCols = new Set(t.columns.map((c) => c.name));
    for (const c of t.columns) {
      const info = present.get(c.name);
      if (!info) {
        issues.push({
          pk: `${t.name}.${c.name}`,
          data: { table: t.name, column: c.name, kind: "missing_column", direction: "registry->db" },
        });
      } else if (c.notNull && info.nullable) {
        issues.push({
          pk: `${t.name}.${c.name}`,
          data: {
            table: t.name, column: c.name,
            kind: "nullable_mismatch", declared: "NOT NULL", db: "NULLABLE",
          },
        });
      }
    }
    for (const colName of present.keys()) {
      if (!declaredCols.has(colName)) {
        issues.push({
          pk: `${t.name}.${colName}`,
          data: {
            table: t.name, column: colName,
            kind: "undeclared_column", direction: "db->registry",
          },
        });
      }
    }
    if (issues.length >= MAX_SAMPLE) break;
  }

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
