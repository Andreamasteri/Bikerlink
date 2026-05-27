// Task #2536 — Check pack: schema vs registry Drizzle.
//
// Implementa direttamente — usando information_schema — i confronti che
// fungerebbero da single source of truth fra @shared/db e PostgreSQL.
// Quando il task #2534 (DB Schema Verify Tool) verrà introdotto, questo
// pack potrà essere semplificato delegando a quel modulo per evitare
// duplicazione di logica; finché #2534 non esiste, qui copriamo:
//   - presenza di ogni tabella dichiarata
//   - presenza di ogni colonna dichiarata su tabella esistente
//   - colonne notNull dichiarate ma NULLABLE sul DB
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import * as schema from "@shared/db";
import type { IntegrityCheck, CheckResult } from "../types";

interface DrizzleColumn {
  name: string;
  notNull?: boolean;
}
interface DrizzleTableMeta {
  name?: string;
  columns?: Record<string, DrizzleColumn>;
}
interface DrizzleTableLike { _: DrizzleTableMeta; [k: string]: unknown }

function listDeclaredTables(): Array<{ name: string; cols: DrizzleColumn[] }> {
  const out: Array<{ name: string; cols: DrizzleColumn[] }> = [];
  for (const v of Object.values(schema)) {
    if (!v || typeof v !== "object") continue;
    const t = v as unknown as DrizzleTableLike;
    const meta = t._;
    if (!meta?.name || typeof meta.name !== "string") continue;
    const cols: DrizzleColumn[] = [];
    // Drizzle espone le colonne come property top-level dell'oggetto tabella.
    for (const [k, col] of Object.entries(v)) {
      if (k === "_" || !col || typeof col !== "object") continue;
      const c = col as { name?: string; notNull?: boolean };
      if (typeof c.name === "string") cols.push({ name: c.name, notNull: !!c.notNull });
    }
    out.push({ name: meta.name, cols });
  }
  return out;
}

async function checkTablesExist(): Promise<CheckResult> {
  const declared = listDeclaredTables();
  if (!declared.length) return { ok: true, count: 0, sample: [], details: { note: "registry empty" } };
  const missing: Array<{ pk: string; data: Record<string, unknown> }> = [];
  for (const t of declared) {
    const r = await db.execute(sql`SELECT to_regclass(${t.name}) IS NOT NULL AS ok`);
    const exists = Boolean((r.rows?.[0] as { ok?: boolean } | undefined)?.ok);
    if (!exists) missing.push({ pk: t.name, data: { table: t.name } });
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
    const exists = await db.execute(sql`SELECT to_regclass(${t.name}) IS NOT NULL AS ok`);
    if (!Boolean((exists.rows?.[0] as { ok?: boolean } | undefined)?.ok)) continue; // skip
    const r = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${t.name}`);
    const present = new Set<string>(((r.rows ?? []) as Array<{ column_name: string }>).map((x) => x.column_name));
    for (const c of t.cols) {
      if (!present.has(c.name)) {
        missing.push({ pk: `${t.name}.${c.name}`, data: { table: t.name, column: c.name } });
        if (missing.length >= 50) break;
      }
    }
    if (missing.length >= 50) break;
  }
  if (!missing.length) return { ok: true, count: 0, sample: [] };
  return { ok: false, count: missing.length, sample: missing };
}

async function checkNullableMismatch(): Promise<CheckResult> {
  const declared = listDeclaredTables();
  if (!declared.length) return { ok: true, count: 0, sample: [] };
  const issues: Array<{ pk: string; data: Record<string, unknown> }> = [];
  for (const t of declared) {
    const exists = await db.execute(sql`SELECT to_regclass(${t.name}) IS NOT NULL AS ok`);
    if (!Boolean((exists.rows?.[0] as { ok?: boolean } | undefined)?.ok)) continue;
    const r = await db.execute(sql`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = ${t.name}`);
    const dbNullable = new Map<string, boolean>(
      ((r.rows ?? []) as Array<{ column_name: string; is_nullable: string }>)
        .map((x) => [x.column_name, x.is_nullable === "YES"]),
    );
    for (const c of t.cols) {
      if (!c.notNull) continue;
      const isNullable = dbNullable.get(c.name);
      if (isNullable === true) {
        issues.push({ pk: `${t.name}.${c.name}`, data: { table: t.name, column: c.name, declared: "NOT NULL", db: "NULLABLE" } });
        if (issues.length >= 30) break;
      }
    }
    if (issues.length >= 30) break;
  }
  if (!issues.length) return { ok: true, count: 0, sample: [] };
  return { ok: false, count: issues.length, sample: issues };
}

const checks: IntegrityCheck[] = [
  {
    id: "schema-registry/declared-tables-exist",
    name: "Tabelle dichiarate in @shared/db esistono nel DB",
    category: "schema-registry", severity: "critical", cost: "cheap",
    description: "Diff registry Drizzle ⇄ PostgreSQL.",
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
];
export default checks;
