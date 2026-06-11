import { sql } from "drizzle-orm";
import { db } from "../../db";
import type { MatchTable } from "./dispatcher-types";

/**
 * Per-recipient delivery tracking for match notifications.
 * One row per (matchTable, matchId, userId) — guards against re-sending the
 * same notification to the same user even if their counterpart wasn't
 * eligible for the immediate push.
 */

export async function recordDelivery(
  table: MatchTable,
  matchId: string,
  userId: string,
  channel: "push" | "digest" | "ws" = "push",
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO match_notification_deliveries (match_table, match_id, user_id, channel, delivered_at)
      VALUES (${table}, ${matchId}, ${userId}, ${channel}, NOW())
      ON CONFLICT (match_table, match_id, user_id) DO NOTHING
    `);
    // Mark notified_at on the match row (first delivery wins; ON CONFLICT DO NOTHING on insert
    // above means subsequent deliveries to the same match won't run this if already set).
    // Covers all match tables that carry the notified_at column.
    const tablesSupportingNotifiedAt = new Set([
      "biker_zavorrina_matches",
      "biker_biker_matches",
      "proposal_matches",
      "bio_affinity_matches",
      "route_affinity_matches",
      "music_affinity_matches",
      "telemetry_affinity_matches",
    ]);
    if (tablesSupportingNotifiedAt.has(table)) {
      await db.execute(
        sql`UPDATE ${sql.raw(table)} SET notified_at = NOW() WHERE id = ${matchId} AND notified_at IS NULL`,
      );
    }
  } catch (err) {
    console.warn("[NotifDeliveries] recordDelivery error:", err);
  }
}

export async function recordDeliveries(
  table: MatchTable,
  matchId: string,
  userIds: string[],
  channel: "push" | "digest" | "ws" = "push",
): Promise<void> {
  for (const uid of userIds) {
    await recordDelivery(table, matchId, uid, channel);
  }
}

/**
 * For a given priority, returns the set of `(user_id, match_table, match_id)`
 * tuples that still need a notification — i.e. match rows at that priority
 * for which the participant user has no delivery record.
 *
 * `priorities` accepts a single priority or a list (for the digest job).
 */
export interface PendingDelivery {
  user_id: string;
  match_table: MatchTable;
  match_id: string;
}

export async function listPendingDeliveries(
  priorities: string[],
): Promise<PendingDelivery[]> {
  if (priorities.length === 0) return [];
  const prioLit = sql.join(
    priorities.map((p) => sql`${p}`),
    sql`, `,
  );
  const result = await db.execute<{
    user_id: string;
    match_table: string;
    match_id: string;
    [key: string]: unknown;
  }>(sql`
    WITH participants AS (
      SELECT 'biker_zavorrina_matches'::text AS match_table, id::text AS match_id, biker_id AS user_id
        FROM biker_zavorrina_matches
       WHERE notification_priority IN (${prioLit})
      UNION ALL
      SELECT 'biker_zavorrina_matches', id::text, zavorrina_id
        FROM biker_zavorrina_matches
       WHERE notification_priority IN (${prioLit})
      UNION ALL
      SELECT 'biker_biker_matches', id::text, biker1_id
        FROM biker_biker_matches
       WHERE notification_priority IN (${prioLit})
      UNION ALL
      SELECT 'biker_biker_matches', id::text, biker2_id
        FROM biker_biker_matches
       WHERE notification_priority IN (${prioLit})
      UNION ALL
      SELECT 'proposal_matches', id::text, user_id_1
        FROM proposal_matches
       WHERE notification_priority IN (${prioLit})
      UNION ALL
      SELECT 'proposal_matches', id::text, user_id_2
        FROM proposal_matches
       WHERE notification_priority IN (${prioLit})
      UNION ALL
      SELECT 'proposal_profile_matches', id::text, biker_id
        FROM proposal_profile_matches
       WHERE notification_priority IN (${prioLit})
      UNION ALL
      SELECT 'proposal_profile_matches', id::text, zavorrina_id
        FROM proposal_profile_matches
       WHERE notification_priority IN (${prioLit})
      UNION ALL
      SELECT 'bio_affinity_matches', id::text, user_a_id
        FROM bio_affinity_matches
       WHERE notification_priority IN (${prioLit})
      UNION ALL
      SELECT 'bio_affinity_matches', id::text, user_b_id
        FROM bio_affinity_matches
       WHERE notification_priority IN (${prioLit})
      UNION ALL
      SELECT 'route_affinity_matches', id::text, user_a_id
        FROM route_affinity_matches
       WHERE notification_priority IN (${prioLit})
      UNION ALL
      SELECT 'route_affinity_matches', id::text, user_b_id
        FROM route_affinity_matches
       WHERE notification_priority IN (${prioLit})
    )
    SELECT p.user_id, p.match_table, p.match_id
      FROM participants p
     WHERE p.user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM match_notification_deliveries d
          WHERE d.match_table = p.match_table
            AND d.match_id = p.match_id
            AND d.user_id = p.user_id
       )
  `);
  return result.rows.map((r) => ({
    user_id: r.user_id,
    match_table: r.match_table as MatchTable,
    match_id: r.match_id,
  }));
}
