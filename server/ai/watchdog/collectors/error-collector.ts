import { db, withDbRetry } from "../../../db";
import { appCrashLogs } from "@shared/db";
import { count, sql } from "drizzle-orm";
import { storage } from "../../../storage";
import { dedupWarn } from "../../../lib/dedup-logger";
import type { Signal } from "../types";

// Task #155 — Soglia minima di sessioni (ultime 24h) per calcolare il
// crash-free-rate. Sotto soglia il campione è troppo piccolo: un singolo crash
// farebbe crollare la percentuale a "critical" (falso positivo). In quel caso
// emettiamo un segnale "info" con insufficientData:true (nessun Problem).
// Configurabile via AppSetting 'watchdog_min_crash_sessions' (value numerico).
const DEFAULT_MIN_CRASH_SESSIONS = 20;

async function resolveMinCrashSessions(): Promise<number> {
  try {
    const setting = await storage.getAppSetting("watchdog_min_crash_sessions");
    const n = Number(setting?.value);
    if (Number.isFinite(n) && n >= 0) return n;
  } catch { /* fallback al default */ }
  return DEFAULT_MIN_CRASH_SESSIONS;
}

let httpErrors5xx = 0;
let httpErrors4xx = 0;
let lastResetAt = Date.now();

export function recordHttpError(status: number): void {
  if (status >= 500) httpErrors5xx++;
  else if (status >= 400) httpErrors4xx++;
}

// Task #154 — Reset della finestra errori HTTP 4xx/5xx. Azzera i contatori in
// memoria e riparte la finestra temporale, così i rate mostrati ripartono puliti
// dopo un reset richiesto dall'admin. Idempotente, nessun I/O.
export function resetState(): void {
  httpErrors5xx = 0;
  httpErrors4xx = 0;
  lastResetAt = Date.now();
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
    // Task #155 — escludi i segnali diagnostici di resume ([resume:%]): sono
    // eventi background→foreground scritti come crash_js ma NON sono crash reali.
    // Restano visibili come metrica separata nel crash-signals-collector.
    const [row] = await withDbRetry(() => db
      .select({ c: count() })
      .from(appCrashLogs)
      .where(
        sql`${appCrashLogs.reportedAt} >= ${since1h} AND ${appCrashLogs.crashType} IN ('crash_system','crash_js') AND COALESCE(${appCrashLogs.errorMessage}, '') NOT LIKE '[resume:%'`
      ));
    const crashes = Number(row?.c ?? 0);
    signals.push({
      source: "error", metric: "client.crashes_1h", value: crashes, unit: "crashes",
      severity: crashes > 20 ? "high" : crashes > 5 ? "warn" : "info",
    });
  } catch (err) {
    // Task #155 — fallimento query = warning deduplicato, NON un segnale: prima
    // il collector.error veniva contato come "errore DB" e latch-ava il problema
    // "Database sovraccarico sostenuto" anche con ping/pool sani.
    dedupWarn("watchdog/error-collector", "query crashes_1h fallita, skip segnale", err);
    return signals;
  }

  try {
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    // Task #155 — esclusi i segnali di resume ([resume:%]) sia dal numeratore
    // (crash) sia dal denominatore (sessioni): non sono crash reali.
    const rateResult = await withDbRetry(() => db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE crash_type IN ('crash_system','crash_js')) AS crash_count,
        COUNT(*) AS total_sessions
      FROM app_crash_logs
      WHERE reported_at >= ${since24h}
        AND COALESCE(error_message, '') NOT LIKE '[resume:%'
    `));
    const rateRow = rateResult.rows[0] as Record<string, unknown> | undefined;
    const crashCount = Number(rateRow?.crash_count ?? 0);
    const totalSessions = Number(rateRow?.total_sessions ?? 0);

    // Task #421 — breakdown per piattaforma (android/ios): stessa finestra 24h,
    // stessi filtri. Restituisce max 2 righe (una per platform nota).
    const platformResult = await withDbRetry(() => db.execute(sql`
      SELECT
        COALESCE(platform, 'unknown') AS platform,
        COUNT(*) FILTER (WHERE crash_type IN ('crash_system','crash_js')) AS crash_count,
        COUNT(*) AS total_sessions
      FROM app_crash_logs
      WHERE reported_at >= ${since24h}
        AND COALESCE(error_message, '') NOT LIKE '[resume:%'
        AND platform IN ('android', 'ios')
      GROUP BY platform
    `));
    // Mappa platform → crashFreeRate (arrotondato a 1 decimale)
    const byPlatform: Record<string, number> = {};
    for (const pRow of platformResult.rows as Array<Record<string, unknown>>) {
      const pTotal = Number(pRow.total_sessions ?? 0);
      const pCrashes = Number(pRow.crash_count ?? 0);
      const platform = String(pRow.platform ?? "unknown");
      if (pTotal > 0) {
        byPlatform[platform] = Math.round(((pTotal - pCrashes) / pTotal) * 100 * 10) / 10;
      }
    }

    // Task #155 — campione minimo: sotto soglia niente percentuale (un solo
    // crash su poche sessioni produrrebbe un falso "critical").
    const minSessions = await resolveMinCrashSessions();
    if (totalSessions < minSessions) {
      signals.push({
        source: "error", metric: "client.crash_free_rate_24h", value: null, unit: "%",
        severity: "info",
        details: { crashCount, totalSessions, insufficientData: true, minSessions, byPlatform },
      });
    } else {
      // Guard esplicito: totalSessions=0 non dovrebbe raggiungere questo ramo
      // (minSessions default=20 lo filtra prima), ma per sicurezza evitiamo NaN.
      if (totalSessions === 0) {
        signals.push({
          source: "error", metric: "client.crash_free_rate_24h", value: null, unit: "%",
          severity: "info",
          details: { crashCount: 0, totalSessions: 0, insufficientData: true, minSessions, byPlatform },
        });
      } else {
        const crashFreeRate = Math.round(((totalSessions - crashCount) / totalSessions) * 100 * 10) / 10;
        signals.push({
          source: "error", metric: "client.crash_free_rate_24h", value: crashFreeRate, unit: "%",
          severity: crashFreeRate < 90 ? "critical" : crashFreeRate < 95 ? "warn" : "info",
          // Task #395 — includi crashFreeRate nei details così alerts.ts può
          // costruire un testo push informativo senza ricalcolare.
          // Task #421 — byPlatform include il crash-free rate per android/ios.
          details: { crashCount, totalSessions, crashFreeRate, byPlatform },
        });
      }
    }
  } catch (err) {
    // Task #155 — vedi sopra: warning deduplicato, nessun segnale di errore.
    dedupWarn("watchdog/error-collector", "query crash_free_rate fallita, skip segnale", err);
  }

  try {
    const deltaResult = await withDbRetry(() => db.execute(sql`
      WITH versions AS (
        SELECT DISTINCT app_version
        FROM app_crash_logs
        WHERE app_version IS NOT NULL
          AND crash_type IN ('crash_system','crash_js')
          AND COALESCE(error_message, '') NOT LIKE '[resume:%'
        ORDER BY
          COALESCE(substring(SPLIT_PART(app_version, '.', 1) FROM '^[0-9]+'), '0')::INTEGER DESC,
          COALESCE(substring(SPLIT_PART(app_version, '.', 2) FROM '^[0-9]+'), '0')::INTEGER DESC,
          COALESCE(substring(SPLIT_PART(app_version, '.', 3) FROM '^[0-9]+'), '0')::INTEGER DESC
        LIMIT 2
      ),
      stats AS (
        SELECT
          acl.app_version,
          COUNT(*) FILTER (WHERE acl.crash_type IN ('crash_system','crash_js')) AS crashes,
          COUNT(DISTINCT acl.session_id) AS sessions
        FROM app_crash_logs acl
        WHERE acl.app_version IN (SELECT app_version FROM versions)
          AND COALESCE(acl.error_message, '') NOT LIKE '[resume:%'
        GROUP BY acl.app_version
      ),
      ordered AS (
        SELECT
          s.app_version,
          s.crashes::float / NULLIF(s.sessions, 0) AS crash_rate,
          ROW_NUMBER() OVER (
            ORDER BY
              COALESCE(substring(SPLIT_PART(s.app_version, '.', 1) FROM '^[0-9]+'), '0')::INTEGER DESC,
              COALESCE(substring(SPLIT_PART(s.app_version, '.', 2) FROM '^[0-9]+'), '0')::INTEGER DESC,
              COALESCE(substring(SPLIT_PART(s.app_version, '.', 3) FROM '^[0-9]+'), '0')::INTEGER DESC
          ) AS rn
        FROM stats s
      )
      SELECT
        MAX(CASE WHEN rn = 1 THEN app_version END) AS current_version,
        MAX(CASE WHEN rn = 2 THEN app_version END) AS prev_version,
        MAX(CASE WHEN rn = 1 THEN crash_rate END) AS current_rate,
        MAX(CASE WHEN rn = 2 THEN crash_rate END) AS prev_rate
      FROM ordered
    `));
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
    // Task #155 — vedi sopra: warning deduplicato, nessun segnale di errore.
    dedupWarn("watchdog/error-collector", "query version_delta fallita, skip segnale", err);
  }

  return signals;
}
