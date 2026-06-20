/**
 * Curvy Score Job — BikerLink Fase 3
 *
 * Job settimanale (domenica 03:00 Europe/Rome) che:
 * 1. Calcola il curvy_score per ogni segmento in segment_telemetry
 * 2. Aggiorna il campo curvy_score in segment_telemetry
 * 3. Logga in admin: data ultimo aggiornamento, segmenti aggiornati, variazione media score
 *
 * Formula:
 *   curvy_score = CLAMP(0, 100,
 *     (avg_lean_angle * peso_lean + avg_gforce_normalized * peso_gforce) *
 *     sample_count_factor
 *   )
 *
 * Dove:
 *   avg_lean_angle  in gradi (0–90) → normalizzato su 100 → /90*100
 *   avg_gforce      in g (0–3+) → normalizzato su 100 → /3*100
 *   sample_count_factor = MIN(1, sample_count / MIN_SAMPLES)  (peso affidabilità)
 *
 * Configurazione:
 *   CURVY_SCORE_WEIGHT_LEAN    — Peso lean angle (default: 0.65)
 *   CURVY_SCORE_WEIGHT_GFORCE  — Peso G-force (default: 0.35)
 *   CURVY_SCORE_MIN_SAMPLES    — Campioni minimi per score pieno (default: 10)
 *   DISABLE_CURVY_SCORE_JOB    — Se "1", disabilita il job
 */

import { db, withDbRetry } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import { withBgDbSlot } from "./lib/bg-db-limiter";

const LAST_RUN_KEY = "curvy_score_last_run";
const LAST_RUN_STATS_KEY = "curvy_score_last_stats";

let isRunning = false;

export function isCurvyScoreJobRunning(): boolean {
  return isRunning;
}

export function getCurvyScoreWeights(): {
  weightLean: number;
  weightGforce: number;
  minSamples: number;
} {
  const weightLean = (() => {
    const v = parseFloat(process.env.CURVY_SCORE_WEIGHT_LEAN ?? "0.65");
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.65;
  })();
  const weightGforce = (() => {
    const v = parseFloat(process.env.CURVY_SCORE_WEIGHT_GFORCE ?? "0.35");
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.35;
  })();
  const minSamples = (() => {
    const v = parseInt(process.env.CURVY_SCORE_MIN_SAMPLES ?? "10", 10);
    return Number.isFinite(v) && v > 0 ? v : 10;
  })();
  return { weightLean, weightGforce, minSamples };
}

export interface CurvyScoreJobResult {
  updated: number;
  avgScoreBefore: number | null;
  avgScoreAfter: number | null;
  avgScoreDelta: number | null;
  errors: string[];
  durationMs: number;
}

export async function runCurvyScoreJob(): Promise<CurvyScoreJobResult> {
  if (isRunning) {
    console.warn("[CURVY-SCORE] Job già in esecuzione, skip.");
    return {
      updated: 0,
      avgScoreBefore: null,
      avgScoreAfter: null,
      avgScoreDelta: null,
      errors: ["Job already running"],
      durationMs: 0,
    };
  }

  isRunning = true;
  const errors: string[] = [];
  const startedAt = Date.now();

  console.log("[CURVY-SCORE] Avvio job calcolo curvy score");

  try {
    const { weightLean, weightGforce, minSamples } = getCurvyScoreWeights();

    // Job periodico con aggregate pesanti su segment_telemetry: ogni query passa
    // dal budget connessioni dei job in background così non compete col traffico
    // utente, con retry sui blip transitori di connessione.
    const beforeResult = await withBgDbSlot(() => withDbRetry(() => db.execute<{ avg_score: string }>(
      sql`SELECT AVG(curvy_score)::text AS avg_score FROM segment_telemetry WHERE curvy_score IS NOT NULL`
    )));
    const avgScoreBefore = beforeResult.rows[0]?.avg_score
      ? Math.round(parseFloat(beforeResult.rows[0].avg_score) * 100) / 100
      : null;

    // Calcola e aggiorna curvy_score per ogni segmento
    // Formula: LEAST(100, GREATEST(0,
    //   (COALESCE(avg_lean_angle, 0) / 90.0 * 100 * peso_lean
    //    + COALESCE(avg_gforce, 0) / 3.0 * 100 * peso_gforce)
    //   * LEAST(1.0, sample_count::float / min_samples)
    // ))
    const updateResult = await withBgDbSlot(() => withDbRetry(() => db.execute<{ updated_count: string }>(
      sql`
        WITH updated AS (
          UPDATE segment_telemetry
          SET curvy_score = LEAST(100.0, GREATEST(0.0,
            (
              COALESCE(avg_lean_angle, 0.0) / 90.0 * 100.0 * ${weightLean}
              + COALESCE(avg_gforce, 0.0) / 3.0 * 100.0 * ${weightGforce}
            ) * LEAST(1.0, sample_count::float / ${minSamples})
          ))
          WHERE avg_lean_angle IS NOT NULL OR avg_gforce IS NOT NULL
          RETURNING 1
        )
        SELECT COUNT(*)::text AS updated_count FROM updated
      `
    )));

    const updated = parseInt(updateResult.rows[0]?.updated_count ?? "0", 10);

    // Leggi avg score dopo l'aggiornamento
    const afterResult = await withBgDbSlot(() => withDbRetry(() => db.execute<{ avg_score: string }>(
      sql`SELECT AVG(curvy_score)::text AS avg_score FROM segment_telemetry WHERE curvy_score IS NOT NULL`
    )));
    const avgScoreAfter = afterResult.rows[0]?.avg_score
      ? Math.round(parseFloat(afterResult.rows[0].avg_score) * 100) / 100
      : null;

    const avgScoreDelta =
      avgScoreBefore !== null && avgScoreAfter !== null
        ? Math.round((avgScoreAfter - avgScoreBefore) * 100) / 100
        : null;

    const durationMs = Date.now() - startedAt;

    console.log(
      `[CURVY-SCORE] Job completato in ${durationMs}ms — aggiornati: ${updated}, ` +
      `avg score prima: ${avgScoreBefore}, dopo: ${avgScoreAfter}, delta: ${avgScoreDelta}`
    );

    // Salva timestamp e stats dell'ultima esecuzione
    const statsPayload = JSON.stringify({
      updated,
      avgScoreBefore,
      avgScoreAfter,
      avgScoreDelta,
      durationMs,
      weights: { weightLean, weightGforce, minSamples },
      runAt: new Date().toISOString(),
    });
    await Promise.all([
      storage.upsertAppSetting(LAST_RUN_KEY, new Date().toISOString()),
      storage.upsertAppSetting(LAST_RUN_STATS_KEY, statsPayload),
    ]);

    return { updated, avgScoreBefore, avgScoreAfter, avgScoreDelta, errors, durationMs };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CURVY-SCORE] Errore fatale nel job:", msg);
    errors.push(`Fatal: ${msg.slice(0, 200)}`);
    return {
      updated: 0,
      avgScoreBefore: null,
      avgScoreAfter: null,
      avgScoreDelta: null,
      errors,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    isRunning = false;
  }
}

// ─── Stats helpers ─────────────────────────────────────────────────────────────

export async function getCurvyScoreStats(): Promise<{
  totalSegments: number;
  segmentsWithScore: number;
  coveragePct: number;
  avgScore: number | null;
  lastRun: string | null;
  lastRunStats: CurvyScoreJobResult | null;
  isRunning: boolean;
}> {
  const [totalResult, withScoreResult, avgResult, lastRunSetting, lastRunStatsSetting] =
    await Promise.all([
      db.execute<{ count: string }>(sql`SELECT COUNT(*)::text AS count FROM segment_telemetry`),
      db.execute<{ count: string }>(sql`SELECT COUNT(*)::text AS count FROM segment_telemetry WHERE curvy_score IS NOT NULL`),
      db.execute<{ avg_score: string }>(sql`SELECT AVG(curvy_score)::text AS avg_score FROM segment_telemetry WHERE curvy_score IS NOT NULL`),
      storage.getAppSetting(LAST_RUN_KEY),
      storage.getAppSetting(LAST_RUN_STATS_KEY),
    ]);

  const totalSegments = parseInt(totalResult.rows[0]?.count ?? "0", 10);
  const segmentsWithScore = parseInt(withScoreResult.rows[0]?.count ?? "0", 10);
  const coveragePct =
    totalSegments > 0
      ? Math.round((segmentsWithScore / totalSegments) * 1000) / 10
      : 0;
  const avgScore = withScoreResult.rows[0]?.count !== "0" && avgResult.rows[0]?.avg_score
    ? Math.round(parseFloat(avgResult.rows[0].avg_score) * 10) / 10
    : null;
  const lastRun = lastRunSetting?.value ?? null;
  let lastRunStats: CurvyScoreJobResult | null = null;
  try {
    if (lastRunStatsSetting?.value) {
      lastRunStats = JSON.parse(lastRunStatsSetting.value);
    }
  } catch { /* no-op: invalid JSON in settings */ }

  return {
    totalSegments,
    segmentsWithScore,
    coveragePct,
    avgScore,
    lastRun,
    lastRunStats,
    isRunning,
  };
}

// ─── Profilo personalizzato utente ─────────────────────────────────────────────

export interface UserStyleProfile {
  avgLeanAngle: number | null;
  avgGforce: number | null;
  totalKm: number;
  sampleCount: number;
  weightLean: number;
  weightGforce: number;
  generatedAt: string;
}

const _userProfileCache = new Map<string, { profile: UserStyleProfile; expiresAt: number }>();

export async function getUserStyleProfile(userId: string): Promise<UserStyleProfile | null> {
  // Cache 24h
  const cached = _userProfileCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  try {
    const result = await db.execute<{
      avg_lean: string | null;
      avg_gforce: string | null;
      total_samples: string;
      total_km: string;
    }>(
      sql`
        WITH ordered AS (
          SELECT
            lean_angle,
            gforce_x, gforce_y, gforce_z,
            lat, lon, ts, session_id, speed_kmh,
            LAG(lat) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lat,
            LAG(lon) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lon
          FROM ride_telemetry
          WHERE user_id = ${userId}
        ),
        distances AS (
          SELECT
            ABS(lean_angle) AS abs_lean,
            SQRT(COALESCE(gforce_x,0)^2 + COALESCE(gforce_y,0)^2 + COALESCE(gforce_z,0)^2) AS gforce_mag,
            CASE
              WHEN prev_lat IS NOT NULL AND prev_lon IS NOT NULL
                AND ABS(lat - prev_lat) < 0.5 AND ABS(lon - prev_lon) < 0.5
                AND (speed_kmh IS NULL OR speed_kmh >= 20)
              THEN 2 * 6371 * ASIN(
                SQRT(
                  POWER(SIN(RADIANS(lat - prev_lat) / 2), 2)
                  + COS(RADIANS(prev_lat)) * COS(RADIANS(lat))
                  * POWER(SIN(RADIANS(lon - prev_lon) / 2), 2)
                )
              )
              ELSE 0
            END AS dist_km
          FROM ordered
        )
        SELECT
          AVG(NULLIF(abs_lean, 0))::text AS avg_lean,
          AVG(NULLIF(gforce_mag, 0))::text AS avg_gforce,
          COUNT(*)::text AS total_samples,
          COALESCE(SUM(dist_km), 0)::text AS total_km
        FROM distances
      `
    );

    const row = result.rows[0];
    if (!row) return null;

    const avgLeanAngle = row.avg_lean ? Math.round(parseFloat(row.avg_lean) * 10) / 10 : null;
    const avgGforce = row.avg_gforce ? Math.round(parseFloat(row.avg_gforce) * 1000) / 1000 : null;
    const totalKm = Math.round(parseFloat(row.total_km ?? "0") * 10) / 10;
    const sampleCount = parseInt(row.total_samples ?? "0", 10);

    // Calcola pesi personalizzati basati sullo stile del biker:
    // Se lean angle medio alto (>20°) → biker aggressivo → più peso al lean angle
    // Se lean angle basso (<10°) → biker comfort → più peso al gforce (stabilità)
    let weightLean = 0.65;
    let weightGforce = 0.35;
    if (avgLeanAngle !== null) {
      if (avgLeanAngle > 25) {
        weightLean = 0.8;
        weightGforce = 0.2;
      } else if (avgLeanAngle > 15) {
        weightLean = 0.7;
        weightGforce = 0.3;
      } else if (avgLeanAngle < 8) {
        weightLean = 0.5;
        weightGforce = 0.5;
      }
    }

    const profile: UserStyleProfile = {
      avgLeanAngle,
      avgGforce,
      totalKm,
      sampleCount,
      weightLean,
      weightGforce,
      generatedAt: new Date().toISOString(),
    };

    _userProfileCache.set(userId, {
      profile,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h
    });

    return profile;
  } catch (err) {
    console.error("[CURVY-SCORE] getUserStyleProfile error:", err);
    return null;
  }
}

// ─── Scheduler settimanale ──────────────────────────────────────────────────────

function msUntilNextRomeWeekday(targetDay: number, targetHour: number): number {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const weekdays: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const currentDay = weekdays[parts.weekday ?? "Sun"] ?? 0;
  const currentH = parseInt(parts.hour ?? "0", 10);
  const currentM = parseInt(parts.minute ?? "0", 10);
  const currentS = parseInt(parts.second ?? "0", 10);

  const currentSecondsInWeek = currentDay * 86400 + currentH * 3600 + currentM * 60 + currentS;
  const targetSecondsInWeek = targetDay * 86400 + targetHour * 3600;

  let delta = targetSecondsInWeek - currentSecondsInWeek;
  if (delta <= 0) delta += 7 * 86400;
  return delta * 1000;
}

function formatRomeTime(date: Date): string {
  return date.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    weekday: "long",
  });
}

export function scheduleWeeklyCurvyScoreUpdate(): void {
  if (process.env.DISABLE_CURVY_SCORE_JOB === "1") {
    console.log("[CURVY-SCORE] Scheduler settimanale disabilitato (DISABLE_CURVY_SCORE_JOB=1).");
    return;
  }

  const TARGET_DAY = 0; // Domenica
  const TARGET_HOUR = 3; // 03:00 Europe/Rome

  const fireAndReschedule = async () => {
    try {
      await runCurvyScoreJob();
    } catch (err) {
      console.error("[CURVY-SCORE] Errore nel job settimanale:", err);
    }
    const delayMs = msUntilNextRomeWeekday(TARGET_DAY, TARGET_HOUR);
    const nextAt = new Date(Date.now() + delayMs);
    console.log(
      `[CURVY-SCORE] Prossima esecuzione: ${formatRomeTime(nextAt)} — tra ${Math.round(delayMs / 3600_000)}h`
    );
    setTimeout(fireAndReschedule, delayMs);
  };

  const initialDelayMs = msUntilNextRomeWeekday(TARGET_DAY, TARGET_HOUR);
  const firstAt = new Date(Date.now() + initialDelayMs);
  console.log(
    `[CURVY-SCORE] Scheduler settimanale avviato — prima esecuzione: ${formatRomeTime(firstAt)} — tra ${Math.round(initialDelayMs / 3600_000)}h`
  );
  setTimeout(fireAndReschedule, initialDelayMs);
}
