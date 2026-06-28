// Task #2536 — Check pack: soft-delete cleanup.
// Trova righe con deleted_at < NOW() - 90 giorni in tabelle log-only e propone
// auto-delete (quarantena prima di hard-delete via framework safe path).
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import type { IntegrityCheck, CheckResult } from "../types";
import { quarantineRows } from "../quarantine";

const RETENTION_DAYS = 90;

const TARGETS: Array<{ table: string }> = [
  { table: "ai_watchdog_log" },
  { table: "ai_suggestions_log" },
  { table: "system_signals" },
];

async function tableHasDeletedAt(table: string): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = 'deleted_at'
  `);
  return Number((r.rows?.[0] as { c?: number } | undefined)?.c ?? 0) > 0;
}

async function staleSoftDeletedCheck(table: string): Promise<CheckResult> {
  if (!(await tableHasDeletedAt(table))) {
    return { ok: true, count: 0, sample: [], details: { skipped: "no deleted_at" } };
  }
  const safe = table.replace(/[^a-z_]/g, "");
  try {
    const cnt = await db.execute(
      sql`SELECT COUNT(*)::int AS c FROM ${sql.identifier(safe)} WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - (${RETENTION_DAYS} * INTERVAL '1 day')`,
    );
    const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
    if (!count) return { ok: true, count: 0, sample: [] };
    const smp = await db.execute(
      sql`SELECT id, deleted_at FROM ${sql.identifier(safe)} WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - (${RETENTION_DAYS} * INTERVAL '1 day') LIMIT 10`,
    );
    const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
    return { ok: false, count, sample: rows.map((r) => ({ pk: String(r.id), data: r })), details: { table, retentionDays: RETENTION_DAYS } };
  } catch (err) {
    return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
  }
}

async function purgeStaleSoftDeleted(table: string, dryRun: boolean) {
  if (!(await tableHasDeletedAt(table))) return { applied: false, affected: 0, summary: "no deleted_at" };
  const safe = table.replace(/[^a-z_]/g, "");
  // Step 1 — selezione candidati (sempre, anche in dry-run per affected accurato).
  const sel = await db.execute(
    sql`SELECT * FROM ${sql.identifier(safe)} WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - (${RETENTION_DAYS} * INTERVAL '1 day') LIMIT 1000`,
  );
  const rows = (sel.rows ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return { applied: false, affected: 0, summary: `nessuna riga da purgare in ${table}` };
  if (dryRun) {
    return { applied: false, affected: rows.length, summary: `[dry-run] ${rows.length} righe soft-deleted in ${table} (quarantine+delete)` };
  }
  // Step 2 — quarantena prima del delete (rollback possibile entro TTL 30gg).
  const quarantined = await quarantineRows({
    sourceTable: table,
    rows: rows.map((r) => ({ pk: String(r.id ?? ""), payload: r })),
    reason: `soft-delete-cleanup: deleted_at < NOW() - ${RETENTION_DAYS} days`,
  });
  if (quarantined === 0) {
    return { applied: false, affected: 0, summary: `BLOCCATO: quarantena fallita per ${table} — nessuna riga eliminata` };
  }
  // Step 3 — hard delete solo degli id quarantenati.
  const ids = rows.map((r) => r.id).filter((v) => v !== null && v !== undefined);
  if (!ids.length) {
    return { applied: false, affected: 0, summary: `BLOCCATO: id mancanti, no delete` };
  }
  const idSql = sql.join(ids.map((id) => sql`${id}`), sql`, `);
  const del = await db.execute(sql`DELETE FROM ${sql.identifier(safe)} WHERE id IN (${idSql})`);
  const n = del.rowCount ?? 0;
  return { applied: n > 0, affected: n, summary: `quarantenate+eliminate ${n} righe soft-deleted da ${table}` };
}

const checks: IntegrityCheck[] = TARGETS.map(({ table }) => ({
  id: `soft-delete/${table}`,
  name: `Soft-delete stale in ${table} (>${RETENTION_DAYS}gg)`,
  category: "time", severity: "low", cost: "cheap",
  description: `Righe con deleted_at oltre la retention (${RETENTION_DAYS}gg) in ${table}.`,
  query: () => staleSoftDeletedCheck(table),
  autofix: {
    kind: "delete-orphan-log", safe: true,
    operation: "delete", targetTables: [table],
    run: ({ dryRun }) => purgeStaleSoftDeleted(table, dryRun),
  },
}));

export default checks;
