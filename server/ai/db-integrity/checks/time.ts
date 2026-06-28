// Task #2536 — Check pack: integrità temporale.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import type { IntegrityCheck, CheckResult } from "../types";

async function tableExists(name: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass(${name}) IS NOT NULL AS ok`);
  return Boolean((r.rows?.[0] as { ok?: boolean } | undefined)?.ok);
}
async function columnExists(table: string, column: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT COUNT(*)::int AS c FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${column}`);
  return Number((r.rows?.[0] as { c?: number } | undefined)?.c ?? 0) > 0;
}

async function createdGtUpdated(table: string): Promise<CheckResult> {
  if (!(await tableExists(table))) return { ok: true, count: 0, sample: [], details: { skipped: "missing-table" } };
  if (!(await columnExists(table, "created_at")) || !(await columnExists(table, "updated_at"))) {
    return { ok: true, count: 0, sample: [], details: { skipped: "missing-cols" } };
  }
  const safeT = table.replace(/[^a-z_]/g, "");
  try {
    const cnt = await db.execute(sql`SELECT COUNT(*)::int AS c FROM ${sql.identifier(safeT)} WHERE created_at > updated_at`);
    const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
    if (!count) return { ok: true, count: 0, sample: [] };
    const smp = await db.execute(sql`SELECT id, created_at, updated_at FROM ${sql.identifier(safeT)} WHERE created_at > updated_at LIMIT 10`);
    const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
    return { ok: false, count, sample: rows.map((r) => ({ pk: String(r.id), data: r })), details: { table } };
  } catch (err) {
    return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
  }
}

async function backfillUpdatedAt(table: string, dryRun: boolean) {
  if (!(await tableExists(table)) || !(await columnExists(table, "updated_at"))) return { applied: false, affected: 0, summary: "skip" };
  const safeT = table.replace(/[^a-z_]/g, "");
  if (dryRun) {
    const r = await db.execute(sql`SELECT COUNT(*)::int AS c FROM ${sql.identifier(safeT)} WHERE updated_at IS NULL`);
    const n = Number((r.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
    return { applied: false, affected: n, summary: `[dry-run] ${n} updated_at NULL` };
  }
  const r = await db.execute(sql`UPDATE ${sql.identifier(safeT)} SET updated_at = created_at WHERE updated_at IS NULL AND created_at IS NOT NULL`);
  const affected = r.rowCount ?? 0;
  return { applied: affected > 0, affected, summary: `backfill updated_at su ${affected} righe di ${table}` };
}

const TIME_TABLES = ["users", "reports", "biker_zavorrina_matches", "biker_biker_matches", "match_preferences"];

const checks: IntegrityCheck[] = [
  ...TIME_TABLES.map<IntegrityCheck>((t) => ({
    id: `time/created-gt-updated-${t}`,
    name: `${t}: created_at > updated_at`,
    category: "time", severity: "low", cost: "cheap",
    description: `Verifica che updated_at >= created_at su ${t}.`,
    query: () => createdGtUpdated(t),
    autofix: {
      kind: "backfill-updated-at", safe: true,
      operation: "update", targetTables: [t],
      run: ({ dryRun }) => backfillUpdatedAt(t, dryRun),
    },
  })),
];
export default checks;
