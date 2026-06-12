import { db } from "../../../db";
import { appCrashLogs } from "@shared/db";
import { count, sql } from "drizzle-orm";
import type { Signal } from "../types";

let httpErrors5xx = 0;
let httpErrors4xx = 0;
let lastResetAt = Date.now();

export function recordHttpError(status: number): void {
  if (status >= 500) httpErrors5xx++;
  else if (status >= 400) httpErrors4xx++;
}

export async function collectErrors(): Promise<Signal[]> {
  const signals: Signal[] = [];
  const now = Date.now();
  const windowMin = Math.max(1, Math.round((now - lastResetAt) / 60_000));
  const rate5xx = httpErrors5xx / windowMin;
  signals.push({
    source: "error", metric: "http.5xx_per_min", value: rate5xx, unit: "errors/min",
    severity: rate5xx > 10 ? "critical" : rate5xx > 2 ? "high" : rate5xx > 0.5 ? "warn" : "info",
    details: { totalInWindow: httpErrors5xx, windowMin },
  });
  signals.push({
    source: "error", metric: "http.4xx_per_min", value: httpErrors4xx / windowMin, unit: "errors/min",
    severity: "info",
  });

  if (now - lastResetAt > 10 * 60_000) {
    httpErrors5xx = 0;
    httpErrors4xx = 0;
    lastResetAt = now;
  }

  try {
    const since1h = new Date(now - 60 * 60 * 1000);
    const [row] = await db
      .select({ c: count() })
      .from(appCrashLogs)
      .where(
        sql`${appCrashLogs.reportedAt} >= ${since1h} AND ${appCrashLogs.crashType} IN ('crash_system','crash_js')`
      );
    const crashes = Number(row?.c ?? 0);
    signals.push({
      source: "error", metric: "client.crashes_1h", value: crashes, unit: "crashes",
      severity: crashes > 20 ? "high" : crashes > 5 ? "warn" : "info",
    });
  } catch (err) {
    signals.push({
      source: "error", metric: "collector.error", severity: "warn",
      details: { error: (err as Error).message },
    });
    return signals;
  }

  try {
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const rateResult = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE crash_type IN ('crash_system','crash_js')) AS crash_count,
        COUNT(*) AS total_sessions
      FROM app_crash_logs
      WHERE reported_at >= ${since24h}
    `);
    const rateRow = rateResult.rows[0] as Record<string, unknown> | undefined;
    const crashCount = Number(rateRow?.crash_count ?? 0);
    const totalSessions = Number(rateRow?.total_sessions ?? 0);
    const crashFreeRate = totalSessions > 0
      ? Math.round(((totalSessions - crashCount) / totalSessions) * 100 * 10) / 10
      : 100;
    signals.push({
      source: "error", metric: "client.crash_free_rate_24h", value: crashFreeRate, unit: "%",
      severity: crashFreeRate < 90 ? "critical" : crashFreeRate < 95 ? "warn" : "info",
      details: { crashCount, totalSessions },
    });
  } catch (err) {
    signals.push({
      source: "error", metric: "collector.error", severity: "warn",
      details: { error: `crash_free_rate: ${(err as Error).message}` },
    });
  }

  try {
    const deltaResult = await db.execute(sql`
      WITH versions AS (
        SELECT DISTINCT app_version
        FROM app_crash_logs
        WHERE app_version IS NOT NULL
          AND crash_type IN ('crash_system','crash_js')
        ORDER BY
          CAST(COALESCE(NULLIF(REGEXP_REPLACE(SPLIT_PART(app_version, '.', 1), '[^0-9]', '', 'g'), ''), '0') AS INTEGER) DESC,
          CAST(COALESCE(NULLIF(REGEXP_REPLACE(SPLIT_PART(app_version, '.', 2), '[^0-9]', '', 'g'), ''), '0') AS INTEGER) DESC,
          CAST(COALESCE(NULLIF(REGEXP_REPLACE(SPLIT_PART(app_version, '.', 3), '[^0-9]', '', 'g'), ''), '0') AS INTEGER) DESC
        LIMIT 2
      ),
      stats AS (
        SELECT
          acl.app_version,
          COUNT(*) FILTER (WHERE acl.crash_type IN ('crash_system','crash_js')) AS crashes,
          COUNT(DISTINCT acl.session_id) AS sessions
        FROM app_crash_logs acl
        WHERE acl.app_version IN (SELECT app_version FROM versions)
        GROUP BY acl.app_version
      ),
      ordered AS (
        SELECT
          s.app_version,
          s.crashes::float / NULLIF(s.sessions, 0) AS crash_rate,
          ROW_NUMBER() OVER (
            ORDER BY
              CAST(COALESCE(NULLIF(REGEXP_REPLACE(SPLIT_PART(s.app_version, '.', 1), '[^0-9]', '', 'g'), ''), '0') AS INTEGER) DESC,
              CAST(COALESCE(NULLIF(REGEXP_REPLACE(SPLIT_PART(s.app_version, '.', 2), '[^0-9]', '', 'g'), ''), '0') AS INTEGER) DESC,
              CAST(COALESCE(NULLIF(REGEXP_REPLACE(SPLIT_PART(s.app_version, '.', 3), '[^0-9]', '', 'g'), ''), '0') AS INTEGER) DESC
          ) AS rn
        FROM stats s
      )
      SELECT
        MAX(CASE WHEN rn = 1 THEN app_version END) AS current_version,
        MAX(CASE WHEN rn = 2 THEN app_version END) AS prev_version,
        MAX(CASE WHEN rn = 1 THEN crash_rate END) AS current_rate,
        MAX(CASE WHEN rn = 2 THEN crash_rate END) AS prev_rate
      FROM ordered
    `);
    const dRow = deltaResult.rows[0] as Record<string, unknown> | undefined;
    const currentVersion = dRow?.current_version as string | null ?? null;
    const prevVersion = dRow?.prev_version as string | null ?? null;
    const currentRate = dRow?.current_rate != null ? Number(dRow.current_rate) : null;
    const prevRate = dRow?.prev_rate != null ? Number(dRow.prev_rate) : null;

    if (currentVersion && prevVersion && currentRate !== null && prevRate !== null && prevRate > 0) {
      const deltaPct = Math.round(((currentRate - prevRate) / prevRate) * 100);
      signals.push({
        source: "error", metric: "client.crash_rate_version_delta", value: deltaPct, unit: "%",
        severity: deltaPct > 100 ? "high" : deltaPct > 50 ? "warn" : "info",
        details: { currentVersion, prevVersion, currentRate, prevRate, deltaPct },
      });
    } else if (currentVersion) {
      signals.push({
        source: "error", metric: "client.crash_rate_version_delta", value: 0, unit: "%",
        severity: "info",
        details: { currentVersion, prevVersion: null, note: "insufficient_versions_for_delta" },
      });
    }
  } catch (err) {
    signals.push({
      source: "error", metric: "collector.error", severity: "warn",
      details: { error: `version_delta: ${(err as Error).message}` },
    });
  }

  return signals;
}
