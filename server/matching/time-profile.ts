/**
 * User Time Profile — Task #2521
 *
 * Costruisce un istogramma 7 giorni × 24 ore (168 bucket) delle ore di guida
 * di ogni biker (timezone Europe/Rome), basato sui timestamp dei route_points
 * degli ultimi 90 giorni con decay esponenziale (half-life 90 giorni).
 *
 * Il profilo orario viene usato come fattore moltiplicativo nello score di
 * matching: due biker con grandi sovrapposizioni → bonus, profili opposti →
 * malus moderato. Cold start: utenti con < MIN_RIDES_FOR_PROFILE tracce hanno
 * profilo neutro (multiplier = 1.0).
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { userTimeProfile } from "@shared/db";
import { storage } from "../storage";
import { toZonedTime } from "date-fns-tz";

const TZ = "Europe/Rome";
const WINDOW_DAYS = 90;
const HALF_LIFE_DAYS = 90;
const MIN_RIDES_FOR_PROFILE = 5;

const SETTING_OVERLAP_MIN_MULT = "time_overlap_min_multiplier";
const SETTING_OVERLAP_MAX_MULT = "time_overlap_max_multiplier";
const SETTING_LAST_RUN = "user_time_profile_last_run";
const SETTING_LAST_STATS = "user_time_profile_last_stats";

export type Histogram = number[]; // 168 valori normalizzati 0..1

export type TimeProfileLabel =
  | "weekend-warrior"
  | "early-morning"
  | "after-work"
  | "sunday-rider"
  | "all-rounder"
  | "night-owl"
  | "lunch-break";

export function emptyHistogram(): Histogram {
  return new Array(168).fill(0);
}

export function histogramIndex(day: number, hour: number): number {
  return ((day % 7) + 7) % 7 * 24 + ((hour % 24) + 24) % 24;
}

/** Normalizza un istogramma assoluto in valori 0..1 (max → 1). */
export function normalizeHistogram(hist: Histogram): Histogram {
  let max = 0;
  for (const v of hist) if (v > max) max = v;
  if (max <= 0) return emptyHistogram();
  return hist.map((v) => Math.round((v / max) * 1000) / 1000);
}

/** Etichetta sintetica derivata dall'istogramma normalizzato. */
export function classifyLabel(hist: Histogram): TimeProfileLabel {
  // Somma pesata per fasce
  let weekendMass = 0;
  let weekdayMass = 0;
  let earlyMorning = 0; // 6-9
  let lunch = 0;        // 12-14
  let afterWork = 0;    // 17-20
  let night = 0;        // 22-5
  let sundayMass = 0;
  let _saturdayMass = 0;

  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const v = hist[d * 24 + h] || 0;
      if (d === 0 || d === 6) weekendMass += v; else weekdayMass += v;
      if (d === 0) sundayMass += v;
      if (d === 6) _saturdayMass += v;
      if (h >= 6 && h < 9) earlyMorning += v;
      if (h >= 12 && h < 14) lunch += v;
      if (h >= 17 && h < 20) afterWork += v;
      if (h >= 22 || h < 5) night += v;
    }
  }

  const total = weekendMass + weekdayMass || 1;
  const weekendRatio = weekendMass / total;
  const sundayRatio = sundayMass / total;
  const earlyRatio = earlyMorning / total;
  const lunchRatio = lunch / total;
  const afterWorkRatio = afterWork / total;
  const nightRatio = night / total;

  if (sundayRatio > 0.45) return "sunday-rider";
  if (weekendRatio > 0.65) return "weekend-warrior";
  if (nightRatio > 0.30) return "night-owl";
  if (earlyRatio > 0.30) return "early-morning";
  if (afterWorkRatio > 0.30) return "after-work";
  if (lunchRatio > 0.25) return "lunch-break";
  return "all-rounder";
}

/** Prodotto scalare normalizzato di due istogrammi → valore 0..1 */
export function timeOverlap(a: Histogram | null | undefined, b: Histogram | null | undefined): number {
  if (!a || !b || a.length !== 168 || b.length !== 168) return 0.5;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < 168; i++) {
    const va = a[i] || 0, vb = b[i] || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return 0.5;
  const cos = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, Math.min(1, cos));
}

/**
 * Calcola il moltiplicativo da applicare allo score di matching.
 * Range configurabile via app_settings; default [0.7, 1.3] cioè ±30%.
 */
let _multiplierCache: { min: number; max: number; at: number } | null = null;
async function loadMultiplierBounds(): Promise<{ min: number; max: number }> {
  if (_multiplierCache && Date.now() - _multiplierCache.at < 5 * 60 * 1000) {
    return { min: _multiplierCache.min, max: _multiplierCache.max };
  }
  try {
    const [minS, maxS] = await Promise.all([
      storage.getAppSetting(SETTING_OVERLAP_MIN_MULT),
      storage.getAppSetting(SETTING_OVERLAP_MAX_MULT),
    ]);
    const min = minS?.value ? parseFloat(minS.value) : 0.7;
    const max = maxS?.value ? parseFloat(maxS.value) : 1.3;
    const safeMin = Number.isFinite(min) && min > 0 && min <= 1 ? min : 0.7;
    const safeMax = Number.isFinite(max) && max >= 1 && max <= 2 ? max : 1.3;
    _multiplierCache = { min: safeMin, max: safeMax, at: Date.now() };
    return { min: safeMin, max: safeMax };
  } catch {
    return { min: 0.7, max: 1.3 };
  }
}

export async function timeOverlapMultiplier(
  histA: Histogram | null | undefined,
  histB: Histogram | null | undefined,
): Promise<number> {
  // Cold start neutrale
  if (!histA || !histB) return 1.0;
  const overlap = timeOverlap(histA, histB);
  const { min, max } = await loadMultiplierBounds();
  // overlap = 0  → min, overlap = 1 → max, overlap = 0.5 → ~1.0
  return min + (max - min) * overlap;
}

// ─── Aggregazione ──────────────────────────────────────────────────────────

interface _RidePointRow {
  user_id: string;
  ts: Date;
  ride_age_days: number;
}

/**
 * Job aggregazione: ricostruisce l'istogramma per ogni utente con
 * ≥ MIN_RIDES_FOR_PROFILE tracce negli ultimi WINDOW_DAYS, con decay
 * esponenziale (half-life HALF_LIFE_DAYS).
 */
let _jobRunning = false;

export interface TimeProfileJobResult {
  durationMs: number;
  usersProcessed: number;
  usersUpdated: number;
  usersSkipped: number;
  errors: string[];
}

export function isTimeProfileJobRunning(): boolean {
  return _jobRunning;
}

export async function runUserTimeProfileJob(): Promise<TimeProfileJobResult> {
  if (_jobRunning) {
    return {
      durationMs: 0,
      usersProcessed: 0,
      usersUpdated: 0,
      usersSkipped: 0,
      errors: ["Job already running"],
    };
  }
  _jobRunning = true;
  const startedAt = Date.now();
  const errors: string[] = [];
  let usersProcessed = 0;
  let usersUpdated = 0;
  let usersSkipped = 0;

  console.log("[USER-TIME-PROFILE] Avvio job aggregazione istogrammi");

  try {
    // Per ogni route degli ultimi WINDOW_DAYS prendiamo i timestamp dei
    // route_points (campionati su un punto ogni N minuti per evitare overhead).
    // Usiamo un sample 1 punto/min approssimato via DISTINCT sul minuto.
    const result = await db.execute<{
      user_id: string;
      day_of_week: number;
      hour_of_day: number;
      sample_count: string;
      avg_age_days: string;
    }>(sql`
      WITH ride_window AS (
        SELECT r.id AS route_id, r.user_id, r.started_at
        FROM routes r
        WHERE r.started_at > NOW() - INTERVAL '${sql.raw(String(WINDOW_DAYS))} days'
      ),
      sampled_points AS (
        SELECT DISTINCT
          rw.user_id,
          rw.route_id,
          date_trunc('minute', rp.timestamp AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}) AS minute_local,
          rp.timestamp,
          rw.started_at
        FROM ride_window rw
        JOIN route_points rp ON rp.route_id = rw.route_id
      )
      SELECT
        user_id,
        EXTRACT(DOW FROM minute_local)::int AS day_of_week,
        EXTRACT(HOUR FROM minute_local)::int AS hour_of_day,
        COUNT(*)::text AS sample_count,
        AVG(EXTRACT(EPOCH FROM (NOW() - started_at)) / 86400.0)::text AS avg_age_days
      FROM sampled_points
      GROUP BY user_id, day_of_week, hour_of_day
    `);

    // Conteggio tracce per utente per filtro cold-start
    const ridesResult = await db.execute<{ user_id: string; ride_count: string }>(sql`
      SELECT user_id, COUNT(*)::text AS ride_count
      FROM routes
      WHERE started_at > NOW() - INTERVAL '${sql.raw(String(WINDOW_DAYS))} days'
      GROUP BY user_id
    `);
    const rideCounts = new Map<string, number>();
    for (const row of ridesResult.rows) {
      rideCounts.set(row.user_id, parseInt(row.ride_count, 10));
    }

    // Accumula istogrammi
    const userBuckets = new Map<string, Histogram>();
    const ln2 = Math.log(2);
    for (const row of result.rows) {
      const ageDays = parseFloat(row.avg_age_days ?? "0");
      const samples = parseInt(row.sample_count ?? "0", 10);
      const decay = Math.exp(-ln2 * ageDays / HALF_LIFE_DAYS);
      const weighted = samples * decay;
      if (!userBuckets.has(row.user_id)) userBuckets.set(row.user_id, emptyHistogram());
      const hist = userBuckets.get(row.user_id)!;
      hist[histogramIndex(row.day_of_week, row.hour_of_day)] += weighted;
    }

    // Upsert per ogni utente
    for (const [userId, rawHist] of userBuckets.entries()) {
      usersProcessed++;
      const rides = rideCounts.get(userId) ?? 0;
      if (rides < MIN_RIDES_FOR_PROFILE) {
        usersSkipped++;
        continue;
      }
      const normalized = normalizeHistogram(rawHist);
      const label = classifyLabel(normalized);
      try {
        await db.execute(sql`
          INSERT INTO user_time_profile (user_id, histogram, total_rides, label, updated_at)
          VALUES (${userId}, ${JSON.stringify(normalized)}::jsonb, ${rides}, ${label}, NOW())
          ON CONFLICT (user_id) DO UPDATE
            SET histogram = EXCLUDED.histogram,
                total_rides = EXCLUDED.total_rides,
                label = EXCLUDED.label,
                updated_at = NOW()
        `);
        usersUpdated++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`upsert ${userId}: ${msg.slice(0, 120)}`);
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[USER-TIME-PROFILE] Job completato in ${durationMs}ms — processati ${usersProcessed}, ` +
      `aggiornati ${usersUpdated}, skippati ${usersSkipped}`
    );

    const stats: TimeProfileJobResult = {
      durationMs,
      usersProcessed,
      usersUpdated,
      usersSkipped,
      errors,
    };
    await Promise.all([
      storage.upsertAppSetting(SETTING_LAST_RUN, new Date().toISOString()),
      storage.upsertAppSetting(SETTING_LAST_STATS, JSON.stringify(stats)),
    ]);
    return stats;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[USER-TIME-PROFILE] Errore fatale:", msg);
    errors.push(`fatal: ${msg.slice(0, 200)}`);
    return {
      durationMs: Date.now() - startedAt,
      usersProcessed,
      usersUpdated,
      usersSkipped,
      errors,
    };
  } finally {
    _jobRunning = false;
  }
}

// ─── Cache lookup ──────────────────────────────────────────────────────────

const _profileCache = new Map<string, { hist: Histogram | null; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function getUserHistogram(userId: string): Promise<Histogram | null> {
  const cached = _profileCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.hist;
  try {
    const row = await db
      .select({ histogram: userTimeProfile.histogram })
      .from(userTimeProfile)
      .where(sql`${userTimeProfile.userId} = ${userId}`)
      .limit(1);
    const hist = row.length > 0 && Array.isArray(row[0].histogram) ? (row[0].histogram as Histogram) : null;
    _profileCache.set(userId, { hist, expiresAt: Date.now() + CACHE_TTL_MS });
    return hist;
  } catch {
    return null;
  }
}

export async function getMultiplierForPair(userIdA: string, userIdB: string): Promise<number> {
  const [a, b] = await Promise.all([getUserHistogram(userIdA), getUserHistogram(userIdB)]);
  return timeOverlapMultiplier(a, b);
}

export function invalidateTimeProfileCache(userId?: string): void {
  if (userId) _profileCache.delete(userId);
  else _profileCache.clear();
}

// ─── Scheduler giornaliero ─────────────────────────────────────────────────

function msUntilNextRomeHour(targetHour: number): number {
  const now = new Date();
  const romeNow = toZonedTime(now, TZ);
  const next = new Date(romeNow);
  next.setHours(targetHour, 0, 0, 0);
  if (next.getTime() <= romeNow.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - romeNow.getTime();
}

let _timeProfileTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleDailyUserTimeProfileJob(): void {
  if (process.env.DISABLE_USER_TIME_PROFILE_JOB === "1") {
    console.log("[USER-TIME-PROFILE] Scheduler disabilitato (DISABLE_USER_TIME_PROFILE_JOB=1)");
    return;
  }

  const TARGET_HOUR = 4; // 04:00 Europe/Rome

  const fire = async () => {
    try {
      await runUserTimeProfileJob();
    } catch (err) {
      console.error("[USER-TIME-PROFILE] Errore esecuzione giornaliera:", err);
    }
    const delay = msUntilNextRomeHour(TARGET_HOUR);
    _timeProfileTimer = setTimeout(fire, delay);
    console.log(`[USER-TIME-PROFILE] Prossima esecuzione tra ${Math.round(delay / 3600_000)}h`);
  };

  const firstDelay = msUntilNextRomeHour(TARGET_HOUR);
  console.log(`[USER-TIME-PROFILE] Scheduler giornaliero avviato — prima esecuzione tra ${Math.round(firstDelay / 3600_000)}h`);
  _timeProfileTimer = setTimeout(fire, firstDelay);
}

export function stopDailyUserTimeProfileJob(): void {
  if (_timeProfileTimer) {
    clearTimeout(_timeProfileTimer);
    _timeProfileTimer = null;
  }
}

// ─── Stats / Admin ─────────────────────────────────────────────────────────

export async function getTimeProfileLabelDistribution(): Promise<{
  total: number;
  byLabel: Array<{ label: string; count: number; pct: number }>;
  lastRun: string | null;
  lastStats: TimeProfileJobResult | null;
  isRunning: boolean;
}> {
  // Pool budget (Task #5324): 3 letture di setup in sequenza, non con
  // Promise.all — è un endpoint admin a bassa frequenza ma il gate
  // check-bg-promise-all-burst.sh tratta l'intero modulo come path bg;
  // sequenziale evita di reintrodurre il pattern altrove nel file per copia.
  const counts = await db.execute<{ label: string | null; cnt: string }>(sql`
    SELECT label, COUNT(*)::text AS cnt
    FROM user_time_profile
    GROUP BY label
    ORDER BY cnt DESC
  `);
  const lastRunSetting = await storage.getAppSetting(SETTING_LAST_RUN);
  const lastStatsSetting = await storage.getAppSetting(SETTING_LAST_STATS);

  const rows = counts.rows.map((r) => ({
    label: r.label ?? "unknown",
    count: parseInt(r.cnt, 10),
  }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const byLabel = rows.map((r) => ({
    ...r,
    pct: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
  }));

  let lastStats: TimeProfileJobResult | null = null;
  try {
    if (lastStatsSetting?.value) lastStats = JSON.parse(lastStatsSetting.value);
  } catch { /* ignore */ }

  return {
    total,
    byLabel,
    lastRun: lastRunSetting?.value ?? null,
    lastStats,
    isRunning: _jobRunning,
  };
}
