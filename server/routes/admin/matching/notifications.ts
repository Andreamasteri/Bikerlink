// Task #2603 — estratto da server/routes/admin/matching.ts (mechanical split)
import { Router, type Request, type Response } from "express";
import { db, pool } from "../../../db";
import { sendSuccess, sendError } from "../../../lib/api-response";
import { sql } from "drizzle-orm";
import {
  getTimeProfileLabelDistribution,
  runUserTimeProfileJob,
  isTimeProfileJobRunning,
} from "../../../matching/time-profile";

const router = Router();

router.get("/notifications/stats", async (_req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    try {
      const perPriorityRes = await client.query<{ day: string; priority: string; cnt: string }>(`
        SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
               notification_priority AS priority,
               COUNT(*) AS cnt
          FROM (
            SELECT created_at, notification_priority FROM biker_zavorrina_matches
            UNION ALL
            SELECT created_at, notification_priority FROM biker_biker_matches
            UNION ALL
            SELECT created_at, notification_priority FROM proposal_matches
            UNION ALL
            SELECT created_at, notification_priority FROM proposal_profile_matches
          ) s
         WHERE created_at >= NOW() - INTERVAL '7 days'
         GROUP BY day, priority
         ORDER BY day DESC, priority
      `);

      const budgetExhaustedRes = await client.query<{ day: string; users: string }>(`
        SELECT to_char(day, 'YYYY-MM-DD') AS day, COUNT(*) AS users
          FROM daily_push_counts
         WHERE individual_count >= 3
           AND day >= (CURRENT_DATE - INTERVAL '7 days')
         GROUP BY day
         ORDER BY day DESC
      `);

      // Pending = participants of match rows at this priority WITHOUT an
      // entry in match_notification_deliveries. Mirrors the dispatcher logic.
      const pendingRes = await client.query<{ priority: string; cnt: string }>(`
        WITH participants AS (
          SELECT notification_priority AS priority, 'biker_zavorrina_matches' AS t, id::text AS mid, biker_id AS uid FROM biker_zavorrina_matches
          UNION ALL
          SELECT notification_priority, 'biker_zavorrina_matches', id::text, zavorrina_id FROM biker_zavorrina_matches
          UNION ALL
          SELECT notification_priority, 'biker_biker_matches', id::text, biker1_id FROM biker_biker_matches
          UNION ALL
          SELECT notification_priority, 'biker_biker_matches', id::text, biker2_id FROM biker_biker_matches
          UNION ALL
          SELECT notification_priority, 'proposal_matches', id::text, user_id_1 FROM proposal_matches
          UNION ALL
          SELECT notification_priority, 'proposal_matches', id::text, user_id_2 FROM proposal_matches
          UNION ALL
          SELECT notification_priority, 'proposal_profile_matches', id::text, biker_id FROM proposal_profile_matches
          UNION ALL
          SELECT notification_priority, 'proposal_profile_matches', id::text, zavorrina_id FROM proposal_profile_matches
        )
        SELECT priority, COUNT(*)::text AS cnt
          FROM participants p
         WHERE p.uid IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM match_notification_deliveries d
              WHERE d.match_table = p.t AND d.match_id = p.mid AND d.user_id = p.uid
           )
         GROUP BY priority
      `);

      return res.json({
        perPriorityPerDay: perPriorityRes.rows.map(r => ({
          day: r.day,
          priority: r.priority,
          count: parseInt(r.cnt, 10),
        })),
        budgetExhaustedPerDay: budgetExhaustedRes.rows.map(r => ({
          day: r.day,
          users: parseInt(r.users, 10),
        })),
        pendingByPriority: Object.fromEntries(
          pendingRes.rows.map(r => [r.priority, parseInt(r.cnt, 10)])
        ),
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[admin] notifications stats error:", error);
    return sendError(res, 500, "Errore stats notifiche");
  }
});

router.get("/time-profile-distribution", async (_req: Request, res: Response) => {
  try {
    const data = await getTimeProfileLabelDistribution();
    return res.json(data);
  } catch (err) {
    console.error("[admin] time-profile-distribution error:", err);
    return sendError(res, 500, "Errore lettura distribuzione profili orari");
  }
});

router.post("/time-profile/run", async (_req: Request, res: Response) => {
  if (isTimeProfileJobRunning()) {
    return sendError(res, 409, "Job profilo orario già in esecuzione.");
  }
  runUserTimeProfileJob().catch((err) =>
    console.error("[admin/time-profile/run] background error:", err)
  );
  return sendSuccess(res, { started: true });
});

router.get("/weights-distribution", async (_req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    try {
      const fbRes = await client.query<{ feature_key: string; action: string; cnt: string }>(`
        SELECT feature_key, action, COUNT(*) AS cnt
        FROM match_feedback
        GROUP BY feature_key, action
      `);
      const byFeature: Record<string, { accepts: number; rejects: number; ignores: number; total: number; acceptRate: number }> = {};
      for (const row of fbRes.rows) {
        const fk = row.feature_key;
        if (!byFeature[fk]) byFeature[fk] = { accepts: 0, rejects: 0, ignores: 0, total: 0, acceptRate: 0 };
        const n = parseInt(row.cnt, 10);
        byFeature[fk].total += n;
        if (row.action === "accept") byFeature[fk].accepts += n;
        else if (row.action === "reject" || row.action === "block") byFeature[fk].rejects += n;
        else if (row.action === "ignore") byFeature[fk].ignores += n;
      }
      for (const k of Object.keys(byFeature)) {
        const v = byFeature[k];
        const decisive = v.accepts + v.rejects;
        v.acceptRate = decisive > 0 ? Math.round((v.accepts / decisive) * 1000) / 1000 : 0;
      }

      const profilesRes = await client.query<{
        feedback_count: string;
        weights: Record<string, number>;
      }>(`
        SELECT feedback_count, feature_weights AS weights FROM user_match_profile
      `);
      const totalProfiles = profilesRes.rows.length;
      const profilesWithPersonalization = profilesRes.rows.filter(p => parseInt(p.feedback_count, 10) >= 10).length;

      const weightAggregates: Record<string, { values: number[]; mean: number; min: number; max: number }> = {};
      for (const row of profilesRes.rows) {
        const w = row.weights || {};
        for (const [fk, val] of Object.entries(w)) {
          if (typeof val !== "number") continue;
          if (!weightAggregates[fk]) weightAggregates[fk] = { values: [], mean: 0, min: val, max: val };
          weightAggregates[fk].values.push(val);
          if (val < weightAggregates[fk].min) weightAggregates[fk].min = val;
          if (val > weightAggregates[fk].max) weightAggregates[fk].max = val;
        }
      }
      for (const k of Object.keys(weightAggregates)) {
        const vs = weightAggregates[k].values;
        weightAggregates[k].mean = vs.length > 0
          ? Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 1000) / 1000
          : 0;
      }

      return res.json({
        totalProfiles,
        profilesWithPersonalization,
        coldStartThreshold: 10,
        globalAcceptRates: byFeature,
        personalWeightAggregates: Object.fromEntries(
          Object.entries(weightAggregates).map(([k, v]) => [k, { mean: v.mean, min: v.min, max: v.max, sampleSize: v.values.length }]),
        ),
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[admin] weights-distribution error:", error);
    return sendError(res, 500, "Errore lettura distribuzione pesi matching");
  }
});

// Task #2523 — Global view of community negative-preference patterns.
// Helps the team understand which exclusion categories are most used so the
// product can react (e.g. add native filter UI for a popular category).
router.get("/negative-pref-patterns", async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT kind, value, source, COUNT(*)::int AS user_count
      FROM match_negative_preferences
      GROUP BY kind, value, source
      ORDER BY user_count DESC
      LIMIT 200
    `);
    const pending = await db.execute(sql`
      SELECT kind, value, COUNT(*)::int AS user_count, AVG(reject_count)::int AS avg_rejects
      FROM pending_auto_suggestions
      WHERE status = 'pending'
      GROUP BY kind, value
      ORDER BY user_count DESC
      LIMIT 100
    `);
    return res.json({
      active: rows.rows,
      pendingSuggestions: pending.rows,
    });
  } catch (error) {
    console.error("[admin] negative-pref-patterns error:", error);
    return sendError(res, 500, "Errore lettura pattern preferenze negative");
  }
});

export default router;
