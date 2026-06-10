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
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

const ACTIVE = sql`('new', 'accepted')`;

export interface EnrichBreakdownsResult {
  bbMusicUpdated: number;
  bbTelemetryUpdated: number;
  bzMusicUpdated: number;
  bzTelemetryUpdated: number;
  bbMusicCleared: number;
  bbTelemetryCleared: number;
  bzMusicCleared: number;
  bzTelemetryCleared: number;
}

export async function enrichBikerMatchBreakdowns(): Promise<EnrichBreakdownsResult> {
  const zero: EnrichBreakdownsResult = {
    bbMusicUpdated: 0,
    bbTelemetryUpdated: 0,
    bzMusicUpdated: 0,
    bzTelemetryUpdated: 0,
    bbMusicCleared: 0,
    bbTelemetryCleared: 0,
    bzMusicCleared: 0,
    bzTelemetryCleared: 0,
  };

  try {
    const [
      bbMusic, bbTelemetry, bzMusic, bzTelemetry,
      bbMusicClear, bbTelemetryClear, bzMusicClear, bzTelemetryClear,
    ] = await Promise.all([
      // ── WRITE: active affinity score → score_breakdown ─────────────────────

      db.execute(sql`
        UPDATE biker_biker_matches bb
        SET score_breakdown =
          COALESCE(bb.score_breakdown, '{}'::jsonb)
          || jsonb_build_object('musica', ma.combined_score)
        FROM music_affinity_matches ma
        WHERE bb.biker1_id = ma.user_a_id
          AND bb.biker2_id = ma.user_b_id
          AND bb.archived_at IS NULL
          AND ma.archived_at IS NULL
          AND ma.status IN ${ACTIVE}
      `),

      db.execute(sql`
        UPDATE biker_biker_matches bb
        SET score_breakdown =
          COALESCE(bb.score_breakdown, '{}'::jsonb)
          || jsonb_build_object('stile_guida', ta.combined_score)
        FROM telemetry_affinity_matches ta
        WHERE bb.biker1_id = LEAST(ta.user_a_id, ta.user_b_id)
          AND bb.biker2_id = GREATEST(ta.user_a_id, ta.user_b_id)
          AND bb.archived_at IS NULL
          AND ta.archived_at IS NULL
          AND ta.status IN ${ACTIVE}
      `),

      db.execute(sql`
        UPDATE biker_zavorrina_matches bz
        SET score_breakdown =
          COALESCE(bz.score_breakdown, '{}'::jsonb)
          || jsonb_build_object('musica', ma.combined_score)
        FROM music_affinity_matches ma
        WHERE LEAST(bz.biker_id, bz.zavorrina_id) = ma.user_a_id
          AND GREATEST(bz.biker_id, bz.zavorrina_id) = ma.user_b_id
          AND bz.archived_at IS NULL
          AND ma.archived_at IS NULL
          AND ma.status IN ${ACTIVE}
      `),

      db.execute(sql`
        UPDATE biker_zavorrina_matches bz
        SET score_breakdown =
          COALESCE(bz.score_breakdown, '{}'::jsonb)
          || jsonb_build_object('stile_guida', ta.combined_score)
        FROM telemetry_affinity_matches ta
        WHERE LEAST(bz.biker_id, bz.zavorrina_id) = LEAST(ta.user_a_id, ta.user_b_id)
          AND GREATEST(bz.biker_id, bz.zavorrina_id) = GREATEST(ta.user_a_id, ta.user_b_id)
          AND bz.archived_at IS NULL
          AND ta.archived_at IS NULL
          AND ta.status IN ${ACTIVE}
      `),

      // ── CLEAR: remove stale keys when no active affinity exists ─────────────
      // Uses `score_breakdown - 'key'` (JSONB minus) to drop the key in-place.
      // Only runs on rows that currently carry the key AND lack an active match,
      // so the WHERE clause keeps the update set small.

      db.execute(sql`
        UPDATE biker_biker_matches bb
        SET score_breakdown = score_breakdown - 'musica'
        WHERE bb.archived_at IS NULL
          AND bb.score_breakdown ? 'musica'
          AND NOT EXISTS (
            SELECT 1 FROM music_affinity_matches ma
            WHERE bb.biker1_id = ma.user_a_id
              AND bb.biker2_id = ma.user_b_id
              AND ma.archived_at IS NULL
              AND ma.status IN ${ACTIVE}
          )
      `),

      db.execute(sql`
        UPDATE biker_biker_matches bb
        SET score_breakdown = score_breakdown - 'stile_guida'
        WHERE bb.archived_at IS NULL
          AND bb.score_breakdown ? 'stile_guida'
          AND NOT EXISTS (
            SELECT 1 FROM telemetry_affinity_matches ta
            WHERE bb.biker1_id = LEAST(ta.user_a_id, ta.user_b_id)
              AND bb.biker2_id = GREATEST(ta.user_a_id, ta.user_b_id)
              AND ta.archived_at IS NULL
              AND ta.status IN ${ACTIVE}
          )
      `),

      db.execute(sql`
        UPDATE biker_zavorrina_matches bz
        SET score_breakdown = score_breakdown - 'musica'
        WHERE bz.archived_at IS NULL
          AND bz.score_breakdown ? 'musica'
          AND NOT EXISTS (
            SELECT 1 FROM music_affinity_matches ma
            WHERE LEAST(bz.biker_id, bz.zavorrina_id) = ma.user_a_id
              AND GREATEST(bz.biker_id, bz.zavorrina_id) = ma.user_b_id
              AND ma.archived_at IS NULL
              AND ma.status IN ${ACTIVE}
          )
      `),

      db.execute(sql`
        UPDATE biker_zavorrina_matches bz
        SET score_breakdown = score_breakdown - 'stile_guida'
        WHERE bz.archived_at IS NULL
          AND bz.score_breakdown ? 'stile_guida'
          AND NOT EXISTS (
            SELECT 1 FROM telemetry_affinity_matches ta
            WHERE LEAST(bz.biker_id, bz.zavorrina_id) = LEAST(ta.user_a_id, ta.user_b_id)
              AND GREATEST(bz.biker_id, bz.zavorrina_id) = GREATEST(ta.user_a_id, ta.user_b_id)
              AND ta.archived_at IS NULL
              AND ta.status IN ${ACTIVE}
          )
      `),
    ]);

    const row = (r: { rowCount?: number | null; rows?: unknown[] }) =>
      r.rowCount ?? (r.rows as unknown[])?.length ?? 0;

    return {
      bbMusicUpdated: row(bbMusic),
      bbTelemetryUpdated: row(bbTelemetry),
      bzMusicUpdated: row(bzMusic),
      bzTelemetryUpdated: row(bzTelemetry),
      bbMusicCleared: row(bbMusicClear),
      bbTelemetryCleared: row(bbTelemetryClear),
      bzMusicCleared: row(bzMusicClear),
      bzTelemetryCleared: row(bzTelemetryClear),
    };
  } catch (err) {
    console.error("[EnrichBreakdowns] error:", err);
    return zero;
  }
}
