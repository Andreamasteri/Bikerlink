/**
 * Bulk-enriches biker_biker_matches and biker_zavorrina_matches
 * score_breakdown JSONB with `musica` and `stile_guida` keys sourced
 * from the separate affinity tables.
 *
 * Called by the scheduler after music_affinity and telemetry_affinity
 * matchers complete so that the match-summary endpoint can read both
 * scores from a single bb/bz row instead of querying 2 extra tables.
 *
 * JSONB merge operator `||` adds/overwrites only the new keys without
 * touching the existing breakdown fields (musicScore, styleScore, etc.).
 *
 * Status semantics: only affinity rows with status IN ('new','accepted')
 * are considered active (same rule as the old direct endpoint queries).
 * When an affinity match is rejected/archived the corresponding key is
 * removed from score_breakdown so stale chips cannot persist.
 *
 * Ordering guarantee: music_affinity_matches always has user_a_id <
 * user_b_id (same ordering used in biker_biker_matches biker1_id /
 * biker2_id). For biker_zavorrina_matches the biker/zavorrina columns
 * are role-ordered, not ID-ordered, so LEAST/GREATEST is used.
 *
 * Query strategy (Task #4942 — Parte C): instead of 8 separate
 * statements (4 set + 4 clear, one per key per table), each table now
 * runs exactly 2 statements:
 *   1. one multi-key UPDATE that sets BOTH 'musica' and 'stile_guida'
 *      from the active affinity rows in a single pass, and
 *   2. one multi-key CLEAR that drops BOTH stale keys in a single pass.
 * Both statements compute the target breakdown once (via a derived
 * subquery) and only write rows where it actually differs
 * (`IS DISTINCT FROM`), so no-op JSONB writes never touch the heap —
 * this is the main pool-pressure win.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

const ACTIVE = sql`('new', 'accepted')`;

export interface EnrichBreakdownsResult {
  bbUpdated: number;
  bzUpdated: number;
  bbCleared: number;
  bzCleared: number;
}

export async function enrichBikerMatchBreakdowns(): Promise<EnrichBreakdownsResult> {
  const zero: EnrichBreakdownsResult = {
    bbUpdated: 0,
    bzUpdated: 0,
    bbCleared: 0,
    bzCleared: 0,
  };

  try {
    const [bbSet, bzSet, bbClear, bzClear] = await Promise.all([
      // ── biker_biker_matches — multi-key SET ('musica' + 'stile_guida') ───────
      // ma is ID-ordered (user_a_id < user_b_id) → matches biker1/biker2 directly.
      // ta is unordered → LEAST/GREATEST. Only rows with at least one active
      // affinity are candidates; IS DISTINCT FROM skips no-op writes.
      db.execute(sql`
        UPDATE biker_biker_matches bb
        SET score_breakdown = src.new_bd
        FROM (
          SELECT t.id,
            COALESCE(t.score_breakdown, '{}'::jsonb)
            || COALESCE(m.obj, '{}'::jsonb)
            || COALESCE(s.obj, '{}'::jsonb) AS new_bd
          FROM biker_biker_matches t
          LEFT JOIN LATERAL (
            SELECT jsonb_build_object('musica', ma.combined_score) AS obj
            FROM music_affinity_matches ma
            WHERE t.biker1_id = ma.user_a_id
              AND t.biker2_id = ma.user_b_id
              AND ma.archived_at IS NULL
              AND ma.status IN ${ACTIVE}
            LIMIT 1
          ) m ON true
          LEFT JOIN LATERAL (
            SELECT jsonb_build_object('stile_guida', ta.combined_score) AS obj
            FROM telemetry_affinity_matches ta
            WHERE t.biker1_id = LEAST(ta.user_a_id, ta.user_b_id)
              AND t.biker2_id = GREATEST(ta.user_a_id, ta.user_b_id)
              AND ta.archived_at IS NULL
              AND ta.status IN ${ACTIVE}
            LIMIT 1
          ) s ON true
          WHERE t.archived_at IS NULL
            AND (m.obj IS NOT NULL OR s.obj IS NOT NULL)
        ) src
        WHERE bb.id = src.id
          AND src.new_bd IS DISTINCT FROM bb.score_breakdown
      `),

      // ── biker_zavorrina_matches — multi-key SET ('musica' + 'stile_guida') ───
      // biker/zavorrina columns are role-ordered, so both joins use LEAST/GREATEST.
      db.execute(sql`
        UPDATE biker_zavorrina_matches bz
        SET score_breakdown = src.new_bd
        FROM (
          SELECT t.id,
            COALESCE(t.score_breakdown, '{}'::jsonb)
            || COALESCE(m.obj, '{}'::jsonb)
            || COALESCE(s.obj, '{}'::jsonb) AS new_bd
          FROM biker_zavorrina_matches t
          LEFT JOIN LATERAL (
            SELECT jsonb_build_object('musica', ma.combined_score) AS obj
            FROM music_affinity_matches ma
            WHERE LEAST(t.biker_id, t.zavorrina_id) = ma.user_a_id
              AND GREATEST(t.biker_id, t.zavorrina_id) = ma.user_b_id
              AND ma.archived_at IS NULL
              AND ma.status IN ${ACTIVE}
            LIMIT 1
          ) m ON true
          LEFT JOIN LATERAL (
            SELECT jsonb_build_object('stile_guida', ta.combined_score) AS obj
            FROM telemetry_affinity_matches ta
            WHERE LEAST(t.biker_id, t.zavorrina_id) = LEAST(ta.user_a_id, ta.user_b_id)
              AND GREATEST(t.biker_id, t.zavorrina_id) = GREATEST(ta.user_a_id, ta.user_b_id)
              AND ta.archived_at IS NULL
              AND ta.status IN ${ACTIVE}
            LIMIT 1
          ) s ON true
          WHERE t.archived_at IS NULL
            AND (m.obj IS NOT NULL OR s.obj IS NOT NULL)
        ) src
        WHERE bz.id = src.id
          AND src.new_bd IS DISTINCT FROM bz.score_breakdown
      `),

      // ── biker_biker_matches — multi-key CLEAR (drop stale 'musica'/'stile_guida') ─
      // array_remove(...,NULL) yields the set of keys with no active affinity;
      // `jsonb - text[]` drops them in one pass. IS DISTINCT FROM skips no-ops.
      db.execute(sql`
        UPDATE biker_biker_matches bb
        SET score_breakdown = src.new_bd
        FROM (
          SELECT t.id,
            t.score_breakdown - array_remove(ARRAY[
              CASE WHEN t.score_breakdown ? 'musica'
                AND NOT EXISTS (
                  SELECT 1 FROM music_affinity_matches ma
                  WHERE t.biker1_id = ma.user_a_id
                    AND t.biker2_id = ma.user_b_id
                    AND ma.archived_at IS NULL
                    AND ma.status IN ${ACTIVE}
                ) THEN 'musica' END,
              CASE WHEN t.score_breakdown ? 'stile_guida'
                AND NOT EXISTS (
                  SELECT 1 FROM telemetry_affinity_matches ta
                  WHERE t.biker1_id = LEAST(ta.user_a_id, ta.user_b_id)
                    AND t.biker2_id = GREATEST(ta.user_a_id, ta.user_b_id)
                    AND ta.archived_at IS NULL
                    AND ta.status IN ${ACTIVE}
                ) THEN 'stile_guida' END
            ], NULL)::text[] AS new_bd
          FROM biker_biker_matches t
          WHERE t.archived_at IS NULL
            AND (t.score_breakdown ? 'musica' OR t.score_breakdown ? 'stile_guida')
        ) src
        WHERE bb.id = src.id
          AND src.new_bd IS DISTINCT FROM bb.score_breakdown
      `),

      // ── biker_zavorrina_matches — multi-key CLEAR ────────────────────────────
      db.execute(sql`
        UPDATE biker_zavorrina_matches bz
        SET score_breakdown = src.new_bd
        FROM (
          SELECT t.id,
            t.score_breakdown - array_remove(ARRAY[
              CASE WHEN t.score_breakdown ? 'musica'
                AND NOT EXISTS (
                  SELECT 1 FROM music_affinity_matches ma
                  WHERE LEAST(t.biker_id, t.zavorrina_id) = ma.user_a_id
                    AND GREATEST(t.biker_id, t.zavorrina_id) = ma.user_b_id
                    AND ma.archived_at IS NULL
                    AND ma.status IN ${ACTIVE}
                ) THEN 'musica' END,
              CASE WHEN t.score_breakdown ? 'stile_guida'
                AND NOT EXISTS (
                  SELECT 1 FROM telemetry_affinity_matches ta
                  WHERE LEAST(t.biker_id, t.zavorrina_id) = LEAST(ta.user_a_id, ta.user_b_id)
                    AND GREATEST(t.biker_id, t.zavorrina_id) = GREATEST(ta.user_a_id, ta.user_b_id)
                    AND ta.archived_at IS NULL
                    AND ta.status IN ${ACTIVE}
                ) THEN 'stile_guida' END
            ], NULL)::text[] AS new_bd
          FROM biker_zavorrina_matches t
          WHERE t.archived_at IS NULL
            AND (t.score_breakdown ? 'musica' OR t.score_breakdown ? 'stile_guida')
        ) src
        WHERE bz.id = src.id
          AND src.new_bd IS DISTINCT FROM bz.score_breakdown
      `),
    ]);

    const row = (r: { rowCount?: number | null; rows?: unknown[] }) =>
      r.rowCount ?? (r.rows as unknown[])?.length ?? 0;

    return {
      bbUpdated: row(bbSet),
      bzUpdated: row(bzSet),
      bbCleared: row(bbClear),
      bzCleared: row(bzClear),
    };
  } catch (err) {
    console.error("[EnrichBreakdowns] error:", err);
    return zero;
  }
}
