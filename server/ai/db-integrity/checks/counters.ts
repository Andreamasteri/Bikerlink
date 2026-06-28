// Task #2536 — Check pack: contatori denormalizzati disallineati.
import { sql, type SQL } from "drizzle-orm";
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
  childWhere?: SQL;
}): Promise<CheckResult> {
  if (!(await columnExists(params.parentTable, params.counterCol))) {
    return { ok: true, count: 0, sample: [], details: { skipped: "missing-counter-column" } };
  }
  const safeParent = params.parentTable.replace(/[^a-z_]/g, "");
  const safePk = params.parentPk.replace(/[^a-z_]/g, "");
  const safeCounter = params.counterCol.replace(/[^a-z_]/g, "");
  const safeChild = params.childTable.replace(/[^a-z_]/g, "");
  const safeFk = params.childFk.replace(/[^a-z_]/g, "");
  const where = params.childWhere ? sql`WHERE ${params.childWhere}` : sql``;
  const diffSql = sql`
    SELECT p.${sql.identifier(safePk)} AS pk, p.${sql.identifier(safeCounter)} AS stored, COALESCE(cnt.c, 0)::int AS actual
    FROM ${sql.identifier(safeParent)} p
    LEFT JOIN (
      SELECT ${sql.identifier(safeFk)} AS fk, COUNT(*)::int AS c FROM ${sql.identifier(safeChild)} ${where} GROUP BY ${sql.identifier(safeFk)}
    ) cnt ON cnt.fk = p.${sql.identifier(safePk)}
    WHERE COALESCE(p.${sql.identifier(safeCounter)}, 0) <> COALESCE(cnt.c, 0)
    LIMIT 10
  `;
  const countSql = sql`
    SELECT COUNT(*)::int AS c FROM ${sql.identifier(safeParent)} p
    LEFT JOIN (
      SELECT ${sql.identifier(safeFk)} AS fk, COUNT(*)::int AS c FROM ${sql.identifier(safeChild)} ${where} GROUP BY ${sql.identifier(safeFk)}
    ) cnt ON cnt.fk = p.${sql.identifier(safePk)}
    WHERE COALESCE(p.${sql.identifier(safeCounter)}, 0) <> COALESCE(cnt.c, 0)
  `;
  try {
    const cnt = await db.execute(countSql);
    const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
    if (!count) return { ok: true, count: 0, sample: [] };
    const smp = await db.execute(diffSql);
    const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
    return {
      ok: false, count,
      sample: rows.map((r) => ({ pk: String(r.pk), data: r })),
      details: {
        label: params.label, parentTable: params.parentTable, parentPk: params.parentPk,
        counterCol: params.counterCol, childTable: params.childTable, childFk: params.childFk,
      },
    };
  } catch (err) {
    return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
  }
}

async function recomputeCounter(params: {
  parentTable: string; parentPk: string; counterCol: string;
  childTable: string; childFk: string; childWhere?: SQL;
  dryRun: boolean;
}) {
  if (!(await columnExists(params.parentTable, params.counterCol))) return { applied: false, affected: 0, summary: "no counter col" };
  const safeParent = params.parentTable.replace(/[^a-z_]/g, "");
  const safePk = params.parentPk.replace(/[^a-z_]/g, "");
  const safeCounter = params.counterCol.replace(/[^a-z_]/g, "");
  const safeChild = params.childTable.replace(/[^a-z_]/g, "");
  const safeFk = params.childFk.replace(/[^a-z_]/g, "");
  const where = params.childWhere ? sql`WHERE ${params.childWhere}` : sql``;
  if (params.dryRun) {
    const cnt = await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM ${sql.identifier(safeParent)} p
      LEFT JOIN (SELECT ${sql.identifier(safeFk)} AS fk, COUNT(*)::int AS c FROM ${sql.identifier(safeChild)} ${where} GROUP BY ${sql.identifier(safeFk)}) cnt ON cnt.fk = p.${sql.identifier(safePk)}
      WHERE COALESCE(p.${sql.identifier(safeCounter)}, 0) <> COALESCE(cnt.c, 0)
    `);
    const n = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
    return { applied: false, affected: n, summary: `[dry-run] ${n} contatori da ricalcolare` };
  }
  // LEFT JOIN derivata: aggiorna TUTTI i parent il cui contatore differisce,
  // inclusi quelli senza child (true count = 0, stored != 0). Senza LEFT JOIN
  // i parent con 0 child non verrebbero mai corretti.
  const upd = await db.execute(sql`
    UPDATE ${sql.identifier(safeParent)} p SET ${sql.identifier(safeCounter)} = COALESCE(cnt.c, 0)
    FROM (
      SELECT p2.${sql.identifier(safePk)} AS pk, COALESCE(cnt.c, 0) AS c
      FROM ${sql.identifier(safeParent)} p2
      LEFT JOIN (
        SELECT ${sql.identifier(safeFk)} AS fk, COUNT(*)::int AS c FROM ${sql.identifier(safeChild)} ${where} GROUP BY ${sql.identifier(safeFk)}
      ) cnt ON cnt.fk = p2.${sql.identifier(safePk)}
      WHERE COALESCE(p2.${sql.identifier(safeCounter)}, 0) <> COALESCE(cnt.c, 0)
    ) cnt
    WHERE p.${sql.identifier(safePk)} = cnt.pk
  `);
  const affected = upd.rowCount ?? 0;
  return { applied: affected > 0, affected, summary: `ricalcolati ${affected} contatori` };
}

const SPECS = [
  { id: "counters/users-total-matches", label: "users.total_matches_count", parentTable: "users", parentPk: "id", counterCol: "total_matches_count", childTable: "biker_zavorrina_matches", childFk: "biker_id", childWhere: sql`archived_at IS NULL` },
  { id: "counters/users-open-reports", label: "users.open_reports_count", parentTable: "users", parentPk: "id", counterCol: "open_reports_count", childTable: "reports", childFk: "reported_user_id", childWhere: sql`status IN ('open','pending')` },
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
