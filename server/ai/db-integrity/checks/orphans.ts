// Task #2536 — Check pack: righe orfane.
// Tutti i check usano `to_regclass()` per essere defensive: se una tabella non
// esiste ancora (env nuovo), il check ritorna ok senza errore.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import type { IntegrityCheck, CheckResult } from "../types";
import { quarantineRows } from "../quarantine";

async function tableExists(name: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass(${name}) IS NOT NULL AS ok`);
  return Boolean((r.rows?.[0] as { ok?: boolean } | undefined)?.ok);
}

async function orphanCheck(child: string, fk: string, parent: string, parentPk = "id"): Promise<CheckResult> {
  if (!(await tableExists(child)) || !(await tableExists(parent))) {
    return { ok: true, count: 0, sample: [], details: { skipped: "missing-table" } };
  }
  const safeChild = child.replace(/[^a-z0-9_]/g, "");
  const safeFk = fk.replace(/[^a-z0-9_]/g, "");
  const safeParent = parent.replace(/[^a-z0-9_]/g, "");
  const safePk = parentPk.replace(/[^a-z0-9_]/g, "");
  const cnt = await db.execute(sql`SELECT COUNT(*)::int AS c FROM ${sql.identifier(safeChild)} c LEFT JOIN ${sql.identifier(safeParent)} p ON c.${sql.identifier(safeFk)} = p.${sql.identifier(safePk)} WHERE c.${sql.identifier(safeFk)} IS NOT NULL AND p.${sql.identifier(safePk)} IS NULL`);
  const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
  if (count === 0) return { ok: true, count: 0, sample: [] };
  const smp = await db.execute(sql`SELECT c.* FROM ${sql.identifier(safeChild)} c LEFT JOIN ${sql.identifier(safeParent)} p ON c.${sql.identifier(safeFk)} = p.${sql.identifier(safePk)} WHERE c.${sql.identifier(safeFk)} IS NOT NULL AND p.${sql.identifier(safePk)} IS NULL LIMIT 10`);
  return {
    ok: false,
    count,
    sample: ((smp.rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      pk: String(r.id ?? r.uuid ?? JSON.stringify(r).slice(0, 60)),
      data: r,
    })),
    details: { child, fk, parent },
  };
}

export async function deleteOrphans(child: string, fk: string, parent: string, parentPk = "id", dryRun = false) {
  if (!(await tableExists(child)) || !(await tableExists(parent))) return { applied: false, affected: 0, summary: "tabella mancante" };
  const safeChild = child.replace(/[^a-z0-9_]/g, "");
  const safeFk = fk.replace(/[^a-z0-9_]/g, "");
  const safeParent = parent.replace(/[^a-z0-9_]/g, "");
  const safePk = parentPk.replace(/[^a-z0-9_]/g, "");
  if (dryRun) {
    const cnt = await db.execute(
      sql`SELECT COUNT(*)::int AS c FROM ${sql.identifier(safeChild)} c LEFT JOIN ${sql.identifier(safeParent)} p ON c.${sql.identifier(safeFk)} = p.${sql.identifier(safePk)} WHERE c.${sql.identifier(safeFk)} IS NOT NULL AND p.${sql.identifier(safePk)} IS NULL`,
    );
    const n = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
    return { applied: false, affected: n, summary: `[dry-run] ${n} orfani in ${child}` };
  }
  // Quarantine-before-delete: snapshot di TUTTE le righe orfane prima del DELETE.
  // Limite difensivo: 5000 righe per esecuzione per evitare snapshot massivi.
  const snap = await db.execute(sql`SELECT * FROM ${sql.identifier(safeChild)} WHERE ${sql.identifier(safeFk)} IS NOT NULL AND ${sql.identifier(safeFk)} NOT IN (SELECT ${sql.identifier(safePk)} FROM ${sql.identifier(safeParent)}) LIMIT 5000`);
  const rows = ((snap.rows ?? []) as Array<Record<string, unknown>>);
  if (rows.length) {
    const payload = rows.map((r) => ({
      pk: String(r.id ?? r.uuid ?? r[safeFk] ?? JSON.stringify(r).slice(0, 60)),
      payload: r,
    }));
    await quarantineRows({ sourceTable: safeChild, rows: payload, reason: `orphan-fk:${child}.${fk}→${parent}.${parentPk}` });
  }
  // DELETE limitato agli ID effettivamente quarantinati (no race con nuove righe).
  if (!rows.length) return { applied: false, affected: 0, summary: `nessun orfano in ${child}` };
  const ids = rows.map((r) => r.id).filter((v) => v !== undefined && v !== null);
  if (!ids.length) return { applied: false, affected: 0, summary: `orfani senza id in ${child} — skip` };
  const idSql = sql.join(ids.map((id) => sql`${String(id)}`), sql`, `);
  const res = await db.execute(sql`DELETE FROM ${sql.identifier(safeChild)} WHERE ${sql.identifier("id")} IN (${idSql})`);
  const affected = res.rowCount ?? 0;
  return { applied: affected > 0, affected, summary: `eliminati ${affected} orfani da ${child} (quarantinati ${rows.length})` };
}

const checks: IntegrityCheck[] = [
  {
    id: "orphans/match-feedback",
    name: "matchFeedback senza match",
    category: "orphans", severity: "medium", cost: "cheap",
    description: "Feedback su matches che non esistono più.",
    query: () => orphanCheck("match_feedback", "match_id", "matches"),
    autofix: { kind: "delete-orphan-log", safe: true, operation: "delete", targetTables: ["match_feedback"], run: ({ dryRun }) => deleteOrphans("match_feedback", "match_id", "matches", "id", dryRun) },
  },
  {
    id: "orphans/tag-assignments-tag",
    name: "tagAssignments senza tag",
    category: "orphans", severity: "low", cost: "cheap",
    description: "Assegnazioni tag con tag_id inesistente.",
    query: () => orphanCheck("tag_assignments", "tag_id", "tags"),
    autofix: { kind: "delete-orphan-log", safe: true, operation: "delete", targetTables: ["tag_assignments"], run: ({ dryRun }) => deleteOrphans("tag_assignments", "tag_id", "tags", "id", dryRun) },
  },
  {
    id: "orphans/embeddings-user",
    name: "Embeddings di entityType=user senza utente",
    category: "orphans", severity: "high", cost: "medium",
    description: "Vettori embedding orfani dopo cancellazione utente.",
    async query() {
      if (!(await tableExists("embeddings")) || !(await tableExists("users"))) return { ok: true, count: 0, sample: [] };
      const cnt = await db.execute(sql`SELECT COUNT(*)::int AS c FROM embeddings e LEFT JOIN users u ON e.entity_id = u.id WHERE e.entity_type = 'user' AND u.id IS NULL`);
      const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
      if (!count) return { ok: true, count: 0, sample: [] };
      const smp = await db.execute(sql`SELECT e.id, e.entity_id, e.field, e.model FROM embeddings e LEFT JOIN users u ON e.entity_id = u.id WHERE e.entity_type = 'user' AND u.id IS NULL LIMIT 10`);
      return { ok: false, count, sample: ((smp.rows ?? []) as Array<Record<string, unknown>>).map((r) => ({ pk: String(r.id), data: r })) };
    },
  },
  {
    id: "orphans/ai-suggestions-report",
    name: "aiSuggestionsLog con reportId inesistente",
    category: "orphans", severity: "low", cost: "cheap",
    description: "Log AI suggerimenti collegati a report cancellati.",
    query: () => orphanCheck("ai_suggestions_log", "report_id", "reports"),
  },
  {
    id: "orphans/bz-matches-biker",
    name: "biker_zavorrina_matches con biker inesistente",
    category: "orphans", severity: "high", cost: "cheap",
    description: "Match BZ con biker_id verso utente cancellato.",
    query: () => orphanCheck("biker_zavorrina_matches", "biker_id", "users"),
    autofix: { kind: "delete-orphan-log", safe: true, operation: "delete", targetTables: ["biker_zavorrina_matches"], run: ({ dryRun }) => deleteOrphans("biker_zavorrina_matches", "biker_id", "users", "id", dryRun) },
  },
  {
    id: "orphans/bz-matches-zavorrina",
    name: "biker_zavorrina_matches con zavorrina inesistente",
    category: "orphans", severity: "high", cost: "cheap",
    description: "Match BZ con zavorrina_id verso utente cancellato.",
    query: () => orphanCheck("biker_zavorrina_matches", "zavorrina_id", "users"),
    autofix: { kind: "delete-orphan-log", safe: true, operation: "delete", targetTables: ["biker_zavorrina_matches"], run: ({ dryRun }) => deleteOrphans("biker_zavorrina_matches", "zavorrina_id", "users", "id", dryRun) },
  },
  {
    id: "orphans/bb-matches-b1",
    name: "biker_biker_matches con biker1 inesistente",
    category: "orphans", severity: "high", cost: "cheap",
    description: "Match BB con biker1_id verso utente cancellato.",
    query: () => orphanCheck("biker_biker_matches", "biker1_id", "users"),
    autofix: { kind: "delete-orphan-log", safe: true, operation: "delete", targetTables: ["biker_biker_matches"], run: ({ dryRun }) => deleteOrphans("biker_biker_matches", "biker1_id", "users", "id", dryRun) },
  },
  {
    id: "orphans/bb-matches-b2",
    name: "biker_biker_matches con biker2 inesistente",
    category: "orphans", severity: "high", cost: "cheap",
    description: "Match BB con biker2_id verso utente cancellato.",
    query: () => orphanCheck("biker_biker_matches", "biker2_id", "users"),
    autofix: { kind: "delete-orphan-log", safe: true, operation: "delete", targetTables: ["biker_biker_matches"], run: ({ dryRun }) => deleteOrphans("biker_biker_matches", "biker2_id", "users", "id", dryRun) },
  },
  {
    id: "orphans/reports-reporter",
    name: "reports senza reporter",
    category: "orphans", severity: "medium", cost: "cheap",
    description: "Report con reporter_id orfano.",
    query: () => orphanCheck("reports", "reporter_id", "users"),
  },
  {
    id: "orphans/reports-reported",
    name: "reports senza utente segnalato",
    category: "orphans", severity: "medium", cost: "cheap",
    description: "Report con reported_user_id orfano.",
    query: () => orphanCheck("reports", "reported_user_id", "users"),
  },
  {
    id: "orphans/match-preferences-user",
    name: "match_preferences senza utente",
    category: "orphans", severity: "medium", cost: "cheap",
    description: "Preferenze matching collegate a utenti cancellati.",
    query: () => orphanCheck("match_preferences", "user_id", "users"),
  },
];
export default checks;
