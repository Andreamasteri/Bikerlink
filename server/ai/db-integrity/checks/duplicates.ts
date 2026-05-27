// Task #2536 — Check pack: duplicati indesiderati.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import type { IntegrityCheck } from "../types";

async function tableExists(name: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass(${name}) IS NOT NULL AS ok`);
  return Boolean((r.rows?.[0] as { ok?: boolean } | undefined)?.ok);
}

const checks: IntegrityCheck[] = [
  {
    id: "duplicates/reports-active-pair",
    name: "Report attivi multipli stessa coppia (reporter, reported)",
    category: "duplicates", severity: "medium", cost: "cheap",
    description: "Uno stesso reporter ha più report aperti contro lo stesso utente.",
    async query() {
      if (!(await tableExists("reports"))) return { ok: true, count: 0, sample: [] };
      try {
        const cnt = await db.execute(sql`
          SELECT COUNT(*)::int AS c FROM (
            SELECT reporter_id, reported_user_id FROM reports
            WHERE status IN ('open','pending')
            GROUP BY reporter_id, reported_user_id HAVING COUNT(*) > 1
          ) x`);
        const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
        if (!count) return { ok: true, count: 0, sample: [] };
        const smp = await db.execute(sql`
          SELECT reporter_id, reported_user_id, COUNT(*)::int AS n FROM reports
          WHERE status IN ('open','pending')
          GROUP BY reporter_id, reported_user_id HAVING COUNT(*) > 1
          ORDER BY n DESC LIMIT 10`);
        const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
        return { ok: false, count, sample: rows.map((r) => ({ pk: `${r.reporter_id}->${r.reported_user_id}`, data: r })) };
      } catch (err) {
        return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
      }
    },
  },
  {
    id: "duplicates/tags-same-slug",
    name: "Tag con stesso slug e label diverse",
    category: "duplicates", severity: "low", cost: "cheap",
    description: "Lo slug dovrebbe essere univoco per consistenza.",
    async query() {
      if (!(await tableExists("tags"))) return { ok: true, count: 0, sample: [] };
      try {
        const cnt = await db.execute(sql`SELECT COUNT(*)::int AS c FROM (SELECT slug FROM tags GROUP BY slug HAVING COUNT(*) > 1) x`);
        const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
        if (!count) return { ok: true, count: 0, sample: [] };
        const smp = await db.execute(sql`SELECT slug, COUNT(*)::int AS n, array_agg(id) AS ids FROM tags GROUP BY slug HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 10`);
        const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
        return { ok: false, count, sample: rows.map((r) => ({ pk: String(r.slug), data: r })) };
      } catch (err) {
        return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
      }
    },
  },
  {
    id: "duplicates/embeddings-same-entity-field",
    name: "Embeddings duplicati per (entity, field)",
    category: "duplicates", severity: "low", cost: "medium",
    description: "Più righe embedding per stesso (entity_type, entity_id, field).",
    async query() {
      if (!(await tableExists("embeddings"))) return { ok: true, count: 0, sample: [] };
      try {
        const cnt = await db.execute(sql`SELECT COUNT(*)::int AS c FROM (SELECT entity_type, entity_id, field FROM embeddings GROUP BY 1,2,3 HAVING COUNT(*) > 1) x`);
        const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
        if (!count) return { ok: true, count: 0, sample: [] };
        const smp = await db.execute(sql`SELECT entity_type, entity_id, field, COUNT(*)::int AS n FROM embeddings GROUP BY 1,2,3 HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 10`);
        const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
        return { ok: false, count, sample: rows.map((r) => ({ pk: `${r.entity_type}/${r.entity_id}/${r.field}`, data: r })) };
      } catch (err) {
        return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
      }
    },
  },
];
export default checks;
