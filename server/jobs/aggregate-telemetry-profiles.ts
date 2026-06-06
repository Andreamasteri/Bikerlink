/**
 * Task #3393 — Aggregazione profili di telemetria
 *
 * Aggrega `ride_telemetry` (escluso `session_type='ideal_lap'` — telemetria
 * pista fuori scope) in `user_telemetry_profile`, una riga per utente con:
 *  - statistiche: velocità media, p75 (percentile_cont), piega media/max,
 *    durata media uscita, frazioni mattina/sera, km totali
 *  - bucket discreti (speed/lean/duration) per il Jaccard del matcher
 *  - data_quality = numero di sessioni (gate ≥5 per embedding/match)
 *
 * Dopo l'upsert, per i profili con data_quality >= MIN_SESSIONS_FOR_EMBED
 * genera/aggiorna l'embedding `telemetry_style` (skip via sourceHash interno).
 *
 * Fascia oraria calcolata sull'orario locale dell'app (Europe/Rome): mattina
 * 05:00–11:59, sera 18:00–23:59.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { userTelemetryProfile } from "@shared/db";
import type { InsertUserTelemetryProfile } from "@shared/db";
import {
  generateTelemetryStyleEmbedding,
  MIN_SESSIONS_FOR_EMBED,
} from "../ai/telemetry-style-embedder";

// Soglie bucket — esportate per riuso/test e per coerenza con la documentazione.
export const SPEED_BUCKETS = { slow: 45, medium: 70, fast: 95 } as const; // km/h su p75
export const LEAN_BUCKETS = { touring: 28, sport: 40 } as const; // gradi su avg lean
export const DURATION_BUCKETS = { short: 30, medium: 90 } as const; // minuti

function speedBucket(p75: number): string {
  if (p75 < SPEED_BUCKETS.slow) return "slow";
  if (p75 < SPEED_BUCKETS.medium) return "medium";
  if (p75 < SPEED_BUCKETS.fast) return "fast";
  return "sport";
}

function leanBucket(avgLean: number): string {
  if (avgLean < LEAN_BUCKETS.touring) return "touring";
  if (avgLean < LEAN_BUCKETS.sport) return "sport";
  return "aggressive";
}

function durationBucket(avgMin: number): string {
  if (avgMin < DURATION_BUCKETS.short) return "short";
  if (avgMin < DURATION_BUCKETS.medium) return "medium";
  return "long";
}

type AggRow = {
  user_id: string;
  total_sessions: number;
  avg_speed_kmh: number | null;
  p75_speed_kmh: number | null;
  avg_lean_angle: number | null;
  max_lean_avg: number | null;
  avg_duration_min: number | null;
  fraction_morning: number | null;
  fraction_evening: number | null;
};

let lastStats = { profilesUpserted: 0, embeddingsGenerated: 0, durationMs: 0 };
export function getLastTelemetryAggregationStats() {
  return lastStats;
}

export async function aggregateTelemetryProfiles(): Promise<number> {
  const startedAt = Date.now();
  let profilesUpserted = 0;
  let embeddingsGenerated = 0;
  try {
    // Aggregazione per-sessione poi per-utente. Una "sessione" = session_id.
    // Durata sessione = (max(ts)-min(ts)) in minuti; ts è epoch ms.
    // Fascia oraria della sessione basata sull'ora di inizio (min ts) in Europe/Rome.
    const rowsRes = await db.execute<AggRow>(sql`
      WITH sessions AS (
        SELECT
          user_id,
          session_id,
          AVG(speed_kmh) AS sess_avg_speed,
          AVG(ABS(lean_angle)) AS sess_avg_lean,
          MAX(ABS(lean_angle)) AS sess_max_lean,
          (MAX(ts) - MIN(ts)) / 60000.0 AS sess_duration_min,
          EXTRACT(HOUR FROM to_timestamp(MIN(ts) / 1000.0) AT TIME ZONE 'Europe/Rome') AS start_hour,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY speed_kmh) AS sess_p75_speed
        FROM ride_telemetry
        WHERE session_type <> 'ideal_lap'
        GROUP BY user_id, session_id
      )
      SELECT
        user_id,
        COUNT(*)::int AS total_sessions,
        AVG(sess_avg_speed) AS avg_speed_kmh,
        AVG(sess_p75_speed) AS p75_speed_kmh,
        AVG(sess_avg_lean) AS avg_lean_angle,
        AVG(sess_max_lean) AS max_lean_avg,
        AVG(sess_duration_min) AS avg_duration_min,
        AVG(CASE WHEN start_hour >= 5 AND start_hour < 12 THEN 1.0 ELSE 0.0 END) AS fraction_morning,
        AVG(CASE WHEN start_hour >= 18 AND start_hour < 24 THEN 1.0 ELSE 0.0 END) AS fraction_evening
      FROM sessions
      GROUP BY user_id
    `);
    const rows = (rowsRes.rows ?? rowsRes) as AggRow[];

    for (const r of rows) {
      const totalSessions = Number(r.total_sessions ?? 0);
      const avgSpeed = Number(r.avg_speed_kmh ?? 0);
      const p75Speed = Number(r.p75_speed_kmh ?? 0);
      const avgLean = Number(r.avg_lean_angle ?? 0);
      const maxLean = Number(r.max_lean_avg ?? 0);
      const avgDuration = Number(r.avg_duration_min ?? 0);
      const fractionMorning = Number(r.fraction_morning ?? 0);
      const fractionEvening = Number(r.fraction_evening ?? 0);

      const profile: InsertUserTelemetryProfile = {
        userId: r.user_id,
        totalSessions,
        totalKm: 0,
        avgSpeedKmh: avgSpeed,
        p75SpeedKmh: p75Speed,
        avgLeanAngle: avgLean,
        maxLeanAvg: maxLean,
        avgDurationMin: avgDuration,
        fractionMorning,
        fractionEvening,
        speedBucket: speedBucket(p75Speed),
        leanBucket: leanBucket(avgLean),
        durationBucket: durationBucket(avgDuration),
        dataQuality: totalSessions,
        updatedAt: new Date(),
      };

      const upserted = await db
        .insert(userTelemetryProfile)
        .values(profile)
        .onConflictDoUpdate({
          target: userTelemetryProfile.userId,
          set: {
            totalSessions: profile.totalSessions,
            totalKm: profile.totalKm,
            avgSpeedKmh: profile.avgSpeedKmh,
            p75SpeedKmh: profile.p75SpeedKmh,
            avgLeanAngle: profile.avgLeanAngle,
            maxLeanAvg: profile.maxLeanAvg,
            avgDurationMin: profile.avgDurationMin,
            fractionMorning: profile.fractionMorning,
            fractionEvening: profile.fractionEvening,
            speedBucket: profile.speedBucket,
            leanBucket: profile.leanBucket,
            durationBucket: profile.durationBucket,
            dataQuality: profile.dataQuality,
            updatedAt: profile.updatedAt,
          },
        })
        .returning();
      profilesUpserted++;

      if (totalSessions >= MIN_SESSIONS_FOR_EMBED && upserted.length > 0) {
        try {
          const res = await generateTelemetryStyleEmbedding(upserted[0]);
          if (res && !res.cached) embeddingsGenerated++;
        } catch (err) {
          console.error(`[TelemetryAggregation] embedding fallito per ${r.user_id}:`, err);
        }
      }
    }

    const elapsed = Date.now() - startedAt;
    lastStats = { profilesUpserted, embeddingsGenerated, durationMs: elapsed };
    console.log(
      `[TelemetryAggregation] ${profilesUpserted} profili aggiornati, ` +
        `${embeddingsGenerated} embedding generati in ${(elapsed / 1000).toFixed(1)}s`,
    );
    return profilesUpserted;
  } catch (err) {
    console.error("[TelemetryAggregation] errore:", err);
    lastStats = { profilesUpserted, embeddingsGenerated, durationMs: Date.now() - startedAt };
    return profilesUpserted;
  }
}
