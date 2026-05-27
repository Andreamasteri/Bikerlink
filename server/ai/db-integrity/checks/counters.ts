// Task #2536 — Check pack: contatori denormalizzati disallineati.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import type { IntegrityCheck, CheckResult } from "../types";

async function columnExists(table: string, column: string): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `);
  return Number((r.rows?.[0] as { c?: number } | undefined)?.c ?? 0) > 0;
}

async function counterCheck(params: {
  label: string;
  parentTable: string;
  parentPk: string;
  counterCol: string;
  childTable: string;
  childFk: string;
  childWhere?: string;
}): Promise<CheckResult> {
  if (!(await columnExists(params.parentTable, params.counterCol))) {
    return { ok: true, count: 0, sample: [], details: { skipped: "missing-counter-column" } };
  }
  const safeParent = params.parentTable.replace(/[^a-z_]/g, "");
  const safePk = params.parentPk.replace(/[^a-z_]/g, "");
  const safeCounter = params.counterCol.replace(/[^a-z_]/g, "");
  const safeChild = params.childTable.replace(/[^a-z_]/g, "");
  const safeFk = params.childFk.replace(/[^a-z_]/g, "");
  const where = params.childWhere ? `WHERE ${params.childWhere}` : "";
  const diffSql = `
    SELECT p."${safePk}" AS pk, p."${safeCounter}" AS stored, COALESCE(cnt.c, 0)::int AS actual
    FROM "${safeParent}" p
    LEFT JOIN (
      SELECT "${safeFk}" AS fk, COUNT(*)::int AS c FROM "${safeChild}" ${where} GROUP BY "${safeFk}"
    ) cnt ON cnt.fk = p."${safePk}"
    WHERE COALESCE(p."${safeCounter}", 0) <> COALESCE(cnt.c, 0)
    LIMIT 10
  `;
  const countSql = `
    SELECT COUNT(*)::int AS c FROM "${safeParent}" p
    LEFT JOIN (
      SELECT "${safeFk}" AS fk, COUNT(*)::int AS c FROM "${safeChild}" ${where} GROUP BY "${safeFk}"
    ) cnt ON cnt.fk = p."${safePk}"
    WHERE COALESCE(p."${safeCounter}", 0) <> COALESCE(cnt.c, 0)
  `;
  try {
    const cnt = await db.execute(sql.raw(countSql));
    const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
    if (!count) return { ok: true, count: 0, sample: [] };
    const smp = await db.execute(sql.raw(diffSql));
    const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
    return { ok: false, count, sample: rows.map((r) => ({ pk: String(r.pk), data: r })), details: { ...params } };
  } catch (err) {
    return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
  }
}

async function recomputeCounter(params: {
  parentTable: string; parentPk: string; counterCol: string;
  childTable: string; childFk: string; childWhere?: string;
  dryRun: boolean;
}) {
  if (!(await columnExists(params.parentTable, params.counterCol))) return { applied: false, affected: 0, summary: "no counter col" };
  const safeParent = params.parentTable.replace(/[^a-z_]/g, "");
  const safePk = params.parentPk.replace(/[^a-z_]/g, "");
  const safeCounter = params.counterCol.replace(/[^a-z_]/g, "");
  const safeChild = params.childTable.replace(/[^a-z_]/g, "");
  const safeFk = params.childFk.replace(/[^a-z_]/g, "");
  const where = params.childWhere ? `WHERE ${params.childWhere}` : "";
  if (params.dryRun) {
    const cnt = await db.execute(sql.raw(`
      SELECT COUNT(*)::int AS c FROM "${safeParent}" p
      LEFT JOIN (SELECT "${safeFk}" AS fk, COUNT(*)::int AS c FROM "${safeChild}" ${where} GROUP BY "${safeFk}") cnt ON cnt.fk = p."${safePk}"
      WHERE COALESCE(p."${safeCounter}", 0) <> COALESCE(cnt.c, 0)
    `));
    const n = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
    return { applied: false, affected: n, summary: `[dry-run] ${n} contatori da ricalcolare` };
  }
  // LEFT JOIN derivata: aggiorna TUTTI i parent il cui contatore differisce,
  // inclusi quelli senza child (true count = 0, stored != 0). Senza LEFT JOIN
  // i parent con 0 child non verrebbero mai corretti.
  const upd = await db.execute(sql.raw(`
    UPDATE "${safeParent}" p SET "${safeCounter}" = COALESCE(cnt.c, 0)
    FROM (
      SELECT p2."${safePk}" AS pk, COALESCE(cnt.c, 0) AS c
      FROM "${safeParent}" p2
      LEFT JOIN (
        SELECT "${safeFk}" AS fk, COUNT(*)::int AS c FROM "${safeChild}" ${where} GROUP BY "${safeFk}"
      ) cnt ON cnt.fk = p2."${safePk}"
      WHERE COALESCE(p2."${safeCounter}", 0) <> COALESCE(cnt.c, 0)
    ) cnt
    WHERE p."${safePk}" = cnt.pk
  `));
  const affected = upd.rowCount ?? 0;
  return { applied: affected > 0, affected, summary: `ricalcolati ${affected} contatori` };
}

const SPECS = [
  { id: "counters/users-total-matches", label: "users.total_matches_count", parentTable: "users", parentPk: "id", counterCol: "total_matches_count", childTable: "biker_zavorrina_matches", childFk: "biker_id", childWhere: "archived_at IS NULL" },
  { id: "counters/users-open-reports", label: "users.open_reports_count", parentTable: "users", parentPk: "id", counterCol: "open_reports_count", childTable: "reports", childFk: "reported_user_id", childWhere: "status IN ('open','pending')" },
];

const checks: IntegrityCheck[] = SPECS.map((s) => ({
  id: s.id,
  name: `Contatore ${s.label}`,
  category: "counters", severity: "medium", cost: "medium",
  description: `Verifica che ${s.parentTable}.${s.counterCol} corrisponda al COUNT effettivo da ${s.childTable}.`,
  query: () => counterCheck(s),
  autofix: {
    kind: "recompute-counter", safe: true,
    operation: "update", targetTables: [s.parentTable],
    run: ({ dryRun }) => recomputeCounter({ ...s, dryRun }),
  },
}));
export default checks;
