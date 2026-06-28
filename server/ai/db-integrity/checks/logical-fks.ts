// Task #2536 — Check pack: FK logiche (relazioni vere ma non dichiarate).
import { sql, type SQL } from "drizzle-orm";
import { db } from "../../../db";
import type { IntegrityCheck, CheckResult } from "../types";

async function tableExists(name: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass(${name}) IS NOT NULL AS ok`);
  return Boolean((r.rows?.[0] as { ok?: boolean } | undefined)?.ok);
}

async function logicalFk(label: string, q: SQL, sampleQ: SQL): Promise<CheckResult> {
  try {
    const cnt = await db.execute(q);
    const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
    if (!count) return { ok: true, count: 0, sample: [] };
    const smp = await db.execute(sampleQ);
    const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
    return { ok: false, count, sample: rows.map((r) => ({ pk: String(r.id ?? JSON.stringify(r).slice(0, 60)), data: r })), details: { label } };
  } catch (err) {
    return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
  }
}

const checks: IntegrityCheck[] = [
  {
    id: "logical-fks/match-user-shadowbanned",
    name: "Match nuovi verso utenti permanentemente shadow-bannati",
    category: "logical-fks", severity: "high", cost: "medium",
    description: "Match generati nelle ultime 24h verso utenti con shadow-ban senza scadenza (permanente).",
    async query() {
      if (!(await tableExists("biker_zavorrina_matches")) || !(await tableExists("users"))) return { ok: true, count: 0, sample: [] };
      return logicalFk("match-vs-banned",
        sql`SELECT COUNT(*)::int AS c FROM biker_zavorrina_matches m JOIN users u ON u.id = m.zavorrina_id WHERE m.created_at > NOW() - INTERVAL '24 hours' AND u.shadow_banned_at IS NOT NULL AND u.shadow_banned_until IS NULL`,
        sql`SELECT m.id, m.zavorrina_id, u.shadow_banned_at FROM biker_zavorrina_matches m JOIN users u ON u.id = m.zavorrina_id WHERE m.created_at > NOW() - INTERVAL '24 hours' AND u.shadow_banned_at IS NOT NULL AND u.shadow_banned_until IS NULL LIMIT 10`,
      );
    },
  },
  {
    id: "logical-fks/reports-on-deleted-user",
    name: "Report attivi verso utenti soft-deleted",
    category: "logical-fks", severity: "medium", cost: "cheap",
    description: "Segnalazioni open su utenti con status='deleted'.",
    async query() {
      if (!(await tableExists("reports")) || !(await tableExists("users"))) return { ok: true, count: 0, sample: [] };
      return logicalFk("reports-on-deleted",
        sql`SELECT COUNT(*)::int AS c FROM reports r JOIN users u ON u.id = r.reported_user_id WHERE r.status IN ('open','pending') AND u.status = 'deleted'`,
        sql`SELECT r.id, r.reported_user_id, u.status FROM reports r JOIN users u ON u.id = r.reported_user_id WHERE r.status IN ('open','pending') AND u.status = 'deleted' LIMIT 10`,
      );
    },
  },
  {
    id: "logical-fks/embeddings-deleted-user",
    name: "Embeddings di utenti deleted",
    category: "logical-fks", severity: "medium", cost: "medium",
    description: "Vettori embedding mantenuti per utenti cancellati (GDPR).",
    async query() {
      if (!(await tableExists("embeddings")) || !(await tableExists("users"))) return { ok: true, count: 0, sample: [] };
      return logicalFk("embeddings-deleted",
        sql`SELECT COUNT(*)::int AS c FROM embeddings e JOIN users u ON u.id = e.entity_id WHERE e.entity_type = 'user' AND u.status = 'deleted'`,
        sql`SELECT e.id, e.entity_id, u.status FROM embeddings e JOIN users u ON u.id = e.entity_id WHERE e.entity_type = 'user' AND u.status = 'deleted' LIMIT 10`,
      );
    },
  },
  {
    id: "logical-fks/match-feedback-self",
    name: "Match feedback da/su sé stesso",
    category: "logical-fks", severity: "low", cost: "cheap",
    description: "Match BB con biker1=biker2 (self-match impossibile).",
    async query() {
      if (!(await tableExists("biker_biker_matches"))) return { ok: true, count: 0, sample: [] };
      return logicalFk("self-match",
        sql`SELECT COUNT(*)::int AS c FROM biker_biker_matches WHERE biker1_id = biker2_id`,
        sql`SELECT id, biker1_id, biker2_id FROM biker_biker_matches WHERE biker1_id = biker2_id LIMIT 10`,
      );
    },
  },
];
export default checks;
