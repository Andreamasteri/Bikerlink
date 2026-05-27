// Task #2536 — Check pack: coerenza cross-table.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import type { IntegrityCheck } from "../types";

async function tableExists(name: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass(${name}) IS NOT NULL AS ok`);
  return Boolean((r.rows?.[0] as { ok?: boolean } | undefined)?.ok);
}

const checks: IntegrityCheck[] = [
  {
    id: "cross-table/match-prefs-weights-sum",
    name: "Match preferences: somma pesi ≈ 1.0",
    category: "cross-table", severity: "high", cost: "medium",
    description: "La somma dei pesi in match_preferences.weights deve essere vicina a 1.0 (±0.05).",
    async query() {
      if (!(await tableExists("match_preferences"))) return { ok: true, count: 0, sample: [] };
      try {
        const r = await db.execute(sql`
          SELECT user_id, weights FROM match_preferences
          WHERE weights IS NOT NULL AND jsonb_typeof(weights) = 'object'
          LIMIT 5000
        `);
        const rows = (r.rows ?? []) as Array<{ user_id: string; weights: Record<string, unknown> }>;
        const bad: Array<{ pk: string; data: Record<string, unknown> }> = [];
        for (const row of rows) {
          const vals = Object.values(row.weights ?? {});
          if (!vals.length) continue;
          const sum = vals.reduce<number>((a, v) => a + (typeof v === "number" ? v : 0), 0);
          if (Math.abs(sum - 1) > 0.05) {
            bad.push({ pk: String(row.user_id), data: { weights: row.weights, sum } });
            if (bad.length >= 10) break;
          }
        }
        if (!bad.length) return { ok: true, count: 0, sample: [], details: { sampled: rows.length } };
        return { ok: false, count: bad.length, sample: bad, details: { sampled: rows.length, note: bad.length >= 10 ? "campione saturo" : undefined } };
      } catch (err) {
        return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
      }
    },
  },
  {
    id: "cross-table/moderation-thresholds-order",
    name: "Soglie moderation_thresholds ordinate (notify < shadow_ban)",
    category: "cross-table", severity: "high", cost: "cheap",
    description: "La soglia notify deve essere strettamente minore della soglia shadow_ban.",
    async query() {
      if (!(await tableExists("moderation_thresholds"))) return { ok: true, count: 0, sample: [] };
      try {
        const cnt = await db.execute(sql`SELECT COUNT(*)::int AS c FROM moderation_thresholds WHERE notify_threshold >= shadow_ban_threshold`);
        const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
        if (!count) return { ok: true, count: 0, sample: [] };
        const smp = await db.execute(sql`SELECT * FROM moderation_thresholds WHERE notify_threshold >= shadow_ban_threshold LIMIT 10`);
        const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
        return { ok: false, count, sample: rows.map((r) => ({ pk: String(r.id ?? r.user_type ?? "?"), data: r })) };
      } catch (err) {
        return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
      }
    },
  },
];
export default checks;
