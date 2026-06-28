// Task #2536 — Check pack: stati invalidi extra.
// Coordinato con invalid-states.ts: NON ripete users.role / reports.* /
// matches.* / shadow-ban / score-range. Qui solo enum non coperti altrove.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import type { IntegrityCheck, CheckResult } from "../types";

async function tableExists(name: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass(${name}) IS NOT NULL AS ok`);
  return Boolean((r.rows?.[0] as { ok?: boolean } | undefined)?.ok);
}
async function colExists(table: string, column: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT COUNT(*)::int AS c FROM information_schema.columns WHERE table_name=${table} AND column_name=${column}`);
  return Number((r.rows?.[0] as { c?: number } | undefined)?.c ?? 0) > 0;
}

async function invalidEnum(table: string, column: string, allowed: string[]): Promise<CheckResult> {
  if (!(await tableExists(table)) || !(await colExists(table, column))) return { ok: true, count: 0, sample: [], details: { skipped: "missing" } };
  const safeT = table.replace(/[^a-z_]/g, "");
  const safeC = column.replace(/[^a-z_]/g, "");
  const inSql = sql.join(allowed.map((v) => sql`${v}`), sql`, `);
  try {
    const cnt = await db.execute(sql`SELECT COUNT(*)::int AS c FROM ${sql.identifier(safeT)} WHERE ${sql.identifier(safeC)} IS NOT NULL AND ${sql.identifier(safeC)} NOT IN (${inSql})`);
    const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
    if (!count) return { ok: true, count: 0, sample: [] };
    const smp = await db.execute(sql`SELECT id, ${sql.identifier(safeC)} AS v FROM ${sql.identifier(safeT)} WHERE ${sql.identifier(safeC)} IS NOT NULL AND ${sql.identifier(safeC)} NOT IN (${inSql}) LIMIT 10`);
    const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
    return { ok: false, count, sample: rows.map((r) => ({ pk: String(r.id), data: r })), details: { table, column, allowed } };
  } catch (err) {
    return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
  }
}

const checks: IntegrityCheck[] = [
  {
    id: "state-x/sos-alerts-status",
    name: "sos_alerts.status fuori enum",
    category: "invalid-states", severity: "high", cost: "cheap",
    description: "Stati SOS validi: open, dispatched, resolved, cancelled.",
    query: () => invalidEnum("sos_alerts", "status", ["open", "dispatched", "resolved", "cancelled"]),
  },
  {
    id: "state-x/rides-status",
    name: "rides.status fuori enum",
    category: "invalid-states", severity: "medium", cost: "cheap",
    description: "Stati ride: planned, active, completed, cancelled.",
    query: () => invalidEnum("rides", "status", ["planned", "active", "completed", "cancelled"]),
  },
  {
    id: "state-x/events-status",
    name: "events.status fuori enum",
    category: "invalid-states", severity: "medium", cost: "cheap",
    description: "Stati evento: draft, published, cancelled, completed.",
    query: () => invalidEnum("events", "status", ["draft", "published", "cancelled", "completed"]),
  },
  {
    id: "state-x/planned-routes-visibility",
    name: "planned_routes.visibility fuori enum",
    category: "invalid-states", severity: "low", cost: "cheap",
    description: "Visibility validi: private, friends, public.",
    query: () => invalidEnum("planned_routes", "visibility", ["private", "friends", "public"]),
  },
];

export default checks;
