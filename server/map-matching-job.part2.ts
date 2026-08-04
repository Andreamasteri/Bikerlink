import { db, withDbRetry } from "./db";
import { withBgDbSlot } from "./lib/bg-db-limiter";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import { readJobAttempt, type JobAttempt } from "./lib/scheduler-retry";

const LAST_RUN_KEY = "map_matching_last_run";

import { getMaxAttempts, isRunningState, MAP_MATCHING_LAST_ATTEMPT_KEY } from "./map-matching-job";

export async function requeueUnmatchable(): Promise<{ requeuedSamples: number; requeuedSessions: number; skipped?: boolean; reason?: string }> {
  const { isThinkCentrePoweredOff } = await import("./lib/thinkcentre-powered-off");
  if (await isThinkCentrePoweredOff()) {
    console.log("[MAP-MATCH] Requeue saltato: ThinkCentre in modalità spento (engine offline).");
    return { requeuedSamples: 0, requeuedSessions: 0, skipped: true, reason: "engine_offline" };
  }
  const maxAttempts = getMaxAttempts();
  return withBgDbSlot(() => withDbRetry(async () => {
    let requeuedSamples = 0;
    let requeuedSessions = 0;
    while (true) {
      const result = await db.execute<{ samples: string; sessions: string }>(sql`
        WITH target_sessions AS (
          SELECT session_id
          FROM ride_telemetry
          WHERE match_status = 'unmatchable'
             OR match_status = 'exhausted'
             OR (match_status = 'retry' AND match_attempts >= ${maxAttempts})
          GROUP BY session_id
          LIMIT 100
        ), updated AS (
          UPDATE ride_telemetry rt
          SET match_status = 'pending', match_attempts = 0, matched = false,
              last_match_attempt_at = NULL
          FROM target_sessions ts
          WHERE rt.session_id = ts.session_id
            AND (rt.match_status = 'unmatchable'
              OR rt.match_status = 'exhausted'
              OR (rt.match_status = 'retry' AND rt.match_attempts >= ${maxAttempts}))
          RETURNING rt.session_id
        )
        SELECT COUNT(*)::text AS samples, COUNT(DISTINCT session_id)::text AS sessions
        FROM updated
      `);
      const rows = result.rows as Array<{ samples?: string; sessions?: string; session_id?: string }>;
      const row = rows[0];
      // Production returns SQL aggregates; legacy unit mocks may still return
      // RETURNING session_id rows. Supporting both keeps the contract stable
      // while the SQL remains bounded by target sessions.
      const samples = row?.samples != null ? Number(row.samples) : rows.length;
      const sessions = row?.sessions != null
        ? Number(row.sessions)
        : new Set(rows.map((item) => item.session_id).filter(Boolean)).size;
      requeuedSamples += samples;
      requeuedSessions += sessions;
      if (sessions === 0) break;
    }
    console.log(`[MAP-MATCH] Requeue — ${requeuedSamples} campioni / ${requeuedSessions} sessioni riportati a 'pending'`);
    return { requeuedSamples, requeuedSessions };
  }));
}

export function getStaleRetryDays(): number {
  const value = Number.parseInt(process.env.MAP_MATCHING_STALE_RETRY_DAYS ?? "7", 10);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 90) : 7;
}

export async function drainStuckRetryBacklog(): Promise<{ drainedSamples: number; drainedSessions: number }> {
  const maxAttempts = getMaxAttempts();
  return withBgDbSlot(() => withDbRetry(async () => {
    let drainedSamples = 0;
    let drainedSessions = 0;
    while (true) {
      const result = await db.execute<{ samples: string; sessions: string }>(sql`
        WITH target_sessions AS (
          SELECT session_id
          FROM ride_telemetry
          WHERE match_status = 'retry'
            AND (match_attempts >= ${maxAttempts}
              OR (match_attempts > 0 AND last_match_attempt_at IS NOT NULL
                  AND last_match_attempt_at < NOW() - (INTERVAL '1 day' * ${getStaleRetryDays()})))
          GROUP BY session_id
          LIMIT 100
        ), updated AS (
          UPDATE ride_telemetry rt
          SET match_status = 'exhausted', matched = false
          FROM target_sessions ts
          WHERE rt.session_id = ts.session_id
            AND rt.match_status = 'retry'
            AND (rt.match_attempts >= ${maxAttempts}
              OR (rt.match_attempts > 0 AND rt.last_match_attempt_at IS NOT NULL
                  AND rt.last_match_attempt_at < NOW() - (INTERVAL '1 day' * ${getStaleRetryDays()})))
          RETURNING rt.session_id
        )
        SELECT COUNT(*)::text AS samples, COUNT(DISTINCT session_id)::text AS sessions
        FROM updated
      `);
      const rows = result.rows as Array<{ samples?: string; sessions?: string; session_id?: string }>;
      const row = rows[0];
      // Production returns SQL aggregates; legacy unit mocks may still return
      // RETURNING session_id rows. Supporting both keeps the contract stable
      // while the SQL remains bounded by target sessions.
      const samples = row?.samples != null ? Number(row.samples) : rows.length;
      const sessions = row?.sessions != null
        ? Number(row.sessions)
        : new Set(rows.map((item) => item.session_id).filter(Boolean)).size;
      drainedSamples += samples;
      drainedSessions += sessions;
      if (sessions === 0) break;
    }
    console.log(`[MAP-MATCH] Drain backlog — ${drainedSamples} campioni / ${drainedSessions} sessioni retry oltre cap o stale → 'exhausted'`);
    return { drainedSamples, drainedSessions };
  }));
}

export async function getMapMatchingStats(): Promise<{
  pending: number;
  retry: number;
  matched: number;
  unmatchable: number;
  exhausted: number;
  segments: number;
  lastRun: string | null;
  lastAttempt: JobAttempt | null;
  isRunning: boolean;
  ghConfigured: boolean;
}> {
  const { isSelfHosted } = await import("./graphhopper-client");
  const [countsResult, segResult, lastRunSetting, lastAttempt] = await Promise.all([
    db.execute<{ match_status: string; total: string }>(
      sql`
        SELECT
          match_status,
          COUNT(*)::text AS total
        FROM ride_telemetry
        GROUP BY match_status
      `,
    ),
    db.execute<{ count: string }>(sql`SELECT COUNT(*)::text AS count FROM segment_telemetry`),
    storage.getAppSetting(LAST_RUN_KEY),
    readJobAttempt(MAP_MATCHING_LAST_ATTEMPT_KEY),
  ]);

  let pending = 0;
  let retry = 0;
  let matched = 0;
  let unmatchable = 0;
  let exhausted = 0;
  for (const row of countsResult.rows) {
    const n = parseInt(row.total, 10);
    switch (row.match_status) {
      case "pending": pending += n; break;
      case "retry": retry += n; break;
      case "matched": matched += n; break;
      case "unmatchable": unmatchable += n; break;
      case "exhausted": exhausted += n; break;
      default: pending += n; break;
    }
  }

  const segments = parseInt(segResult.rows[0]?.count ?? "0", 10);
  const lastRun = lastRunSetting?.value ?? null;
  const ghConfigured = isSelfHosted || Boolean(process.env.GRAPHHOPPER_API_KEY);

  return { pending, retry, matched, unmatchable, exhausted, segments, lastRun, lastAttempt, isRunning: isRunningState(), ghConfigured };
}

export async function getMatchingBacklogEstimate(): Promise<{
  backlog: number;
  pending: number;
  retry: number;
  lastRun: string | null;
  degraded: boolean;
}> {
  const lastRunSetting = await storage.getAppSetting(LAST_RUN_KEY).catch(() => null);
  const lastRun = lastRunSetting?.value ?? null;
  try {
    const result = await withBgDbSlot(() => withDbRetry(() => db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '3000'`);
      return tx.execute<{ match_status: string; total: string }>(
        sql`
          SELECT match_status, COUNT(*)::text AS total
          FROM ride_telemetry
          WHERE match_status IN ('pending', 'retry')
          GROUP BY match_status
        `,
      );
    })));
    let pending = 0;
    let retry = 0;
    for (const row of result.rows) {
      const n = parseInt(row.total, 10);
      if (row.match_status === "pending") pending += n;
      else if (row.match_status === "retry") retry += n;
    }
    return { backlog: pending + retry, pending, retry, lastRun, degraded: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[MAP-MATCH] getMatchingBacklogEstimate degradato (DB lento/timeout): ${msg.slice(0, 120)}`);
    return { backlog: -1, pending: -1, retry: -1, lastRun, degraded: true };
  }
}
