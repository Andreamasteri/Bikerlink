/**
 * Daily embedding usage report.
 *
 * Scheduled at 08:15 Europe/Rome via croner.
 * Reads embedding_call_log for the last 24h, computes:
 *   - total API calls (cached=false, non-local model)
 *   - total cache hits (cached=true)
 *   - total local fallback calls
 *   - breakdown per field
 *   - comparison vs the previous 7 days
 *   - anomaly flag: today's API calls > 2× weekly average
 *
 * Persists the result as JSON in AppSetting `embedding_daily_report`.
 */
import { Cron } from "croner";
import { sql } from "drizzle-orm";
import { db, withDbRetry } from "../db";
import { storage } from "../storage";
import { dedupWarn } from "../lib/dedup-logger";

export interface EmbeddingDailyReport {
  generatedAt: string;
  period: { from: string; to: string };
  today: {
    apiCalls: number;
    cacheHits: number;
    localFallback: number;
    total: number;
    capReached: boolean;
  };
  byField: Array<{ field: string; apiCalls: number; cacheHits: number; localFallback: number }>;
  weeklyAvgApiCalls: number;
  anomaly: boolean;
  anomalyReason: string | null;
  last7Days: Array<{ date: string; apiCalls: number; cacheHits: number; localFallback: number }>;
}

const TIMEZONE = "Europe/Rome";

async function generateReport(): Promise<EmbeddingDailyReport> {
  const now = new Date();
  const to = now;
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Last 8 days (today + 7 previous) for trend
  const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

  // Aggregate by model and field for last 24h
  const rows24h = await withDbRetry(() => db.execute<{
    field: string;
    model: string;
    cached: boolean;
    cnt: string;
  }>(sql`
    SELECT field, model, cached, COUNT(*) AS cnt
    FROM embedding_call_log
    WHERE created_at >= ${from.toISOString()}::timestamptz
      AND created_at < ${to.toISOString()}::timestamptz
    GROUP BY field, model, cached
  `));

  // Daily breakdown for last 8 days
  const rows8d = await withDbRetry(() => db.execute<{
    day: string;
    model: string;
    cached: boolean;
    cnt: string;
  }>(sql`
    SELECT
      DATE(created_at AT TIME ZONE 'UTC') AS day,
      model,
      cached,
      COUNT(*) AS cnt
    FROM embedding_call_log
    WHERE created_at >= ${eightDaysAgo.toISOString()}::timestamptz
      AND created_at < ${to.toISOString()}::timestamptz
    GROUP BY day, model, cached
    ORDER BY day
  `));

  const todayStr = now.toISOString().slice(0, 10);

  // Helper to classify a row
  function rowType(model: string, cached: boolean): "apiCall" | "cacheHit" | "localFallback" {
    if (cached) return "cacheHit";
    if (model.startsWith("local:")) return "localFallback";
    return "apiCall";
  }

  // Build today's totals and field breakdown
  const fieldMap = new Map<string, { apiCalls: number; cacheHits: number; localFallback: number }>();
  let todayApiCalls = 0;
  let todayCacheHits = 0;
  let todayLocalFallback = 0;

  for (const r of (rows24h.rows ?? []) as { field: string; model: string; cached: boolean; cnt: string }[]) {
    const cnt = parseInt(r.cnt, 10);
    const type = rowType(r.model, r.cached);
    if (!fieldMap.has(r.field)) fieldMap.set(r.field, { apiCalls: 0, cacheHits: 0, localFallback: 0 });
    const fEntry = fieldMap.get(r.field)!;
    if (type === "apiCall") { todayApiCalls += cnt; fEntry.apiCalls += cnt; }
    else if (type === "cacheHit") { todayCacheHits += cnt; fEntry.cacheHits += cnt; }
    else { todayLocalFallback += cnt; fEntry.localFallback += cnt; }
  }

  const byField = Array.from(fieldMap.entries()).map(([field, v]) => ({ field, ...v }));

  // Build per-day stats for last 8 days
  const dayMap = new Map<string, { apiCalls: number; cacheHits: number; localFallback: number }>();
  for (const r of (rows8d.rows ?? []) as { day: string; model: string; cached: boolean; cnt: string }[]) {
    const day = typeof r.day === "string" ? r.day.slice(0, 10) : new Date(r.day).toISOString().slice(0, 10);
    const cnt = parseInt(r.cnt, 10);
    const type = rowType(r.model, r.cached);
    if (!dayMap.has(day)) dayMap.set(day, { apiCalls: 0, cacheHits: 0, localFallback: 0 });
    const d = dayMap.get(day)!;
    if (type === "apiCall") d.apiCalls += cnt;
    else if (type === "cacheHit") d.cacheHits += cnt;
    else d.localFallback += cnt;
  }

  // Sort days, exclude today to compute weekly average of the 7 previous days
  const sortedDays = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b));
  const previous7 = sortedDays.filter(([d]) => d < todayStr).slice(-7);
  const weeklyAvgApiCalls = previous7.length > 0
    ? Math.round(previous7.reduce((sum, [, v]) => sum + v.apiCalls, 0) / previous7.length)
    : 0;

  const anomaly = weeklyAvgApiCalls > 0 && todayApiCalls > 2 * weeklyAvgApiCalls;
  const anomalyReason = anomaly
    ? `Oggi ${todayApiCalls} API call vs media settimanale ${weeklyAvgApiCalls} (>${2}×)`
    : null;

  // last7Days: return the 7 days from sortedDays (today included or not, all we have)
  const last7Days = sortedDays.slice(-7).map(([date, v]) => ({ date, ...v }));

  // Cap check from AppSetting
  let capReached = false;
  try {
    const capSetting = await withDbRetry(() => storage.getAppSetting("embedding_daily_cap"));
    const cap = capSetting?.value ? parseInt(capSetting.value, 10) : 500;
    capReached = Number.isFinite(cap) && todayApiCalls >= cap;
  } catch (err) {
    dedupWarn("embed-report/cap-read", "lettura cap embedding fallita (non-fatal)", err);
  }

  return {
    generatedAt: now.toISOString(),
    period: { from: from.toISOString(), to: to.toISOString() },
    today: {
      apiCalls: todayApiCalls,
      cacheHits: todayCacheHits,
      localFallback: todayLocalFallback,
      total: todayApiCalls + todayCacheHits + todayLocalFallback,
      capReached,
    },
    byField,
    weeklyAvgApiCalls,
    anomaly,
    anomalyReason,
    last7Days,
  };
}

export async function runEmbeddingDailyReport(): Promise<EmbeddingDailyReport> {
  console.log("[EmbedReport] Generating daily embedding usage report...");
  try {
    const report = await generateReport();
    await storage.upsertAppSetting(
      "embedding_daily_report",
      undefined,
      report,
    );
    if (report.anomaly) {
      console.warn(
        `[EmbedReport] ANOMALIA RILEVATA: ${report.anomalyReason}` +
        ` (apiCalls=${report.today.apiCalls}, avg7d=${report.weeklyAvgApiCalls})`,
      );
    }
    console.log(
      `[EmbedReport] Done — apiCalls=${report.today.apiCalls}` +
      ` cacheHits=${report.today.cacheHits} localFallback=${report.today.localFallback}` +
      ` anomaly=${report.anomaly}`,
    );
    return report;
  } catch (err) {
    console.error("[EmbedReport] Failed to generate report:", (err as Error)?.message ?? err);
    throw err;
  }
}

let _scheduled = false;

export function scheduleEmbeddingDailyReport(): void {
  if (_scheduled) return;
  _scheduled = true;
  try {
    new Cron("15 8 * * *", { timezone: TIMEZONE, protect: true }, () => {
      runEmbeddingDailyReport().catch((e) =>
        dedupWarn("embed-daily-report", "scheduled run error (non-fatal)", e),
      );
    });
  } catch (cronErr) {
    console.warn("[EmbedReport] croner unavailable, fallback 24h interval:", cronErr);
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const DELAY_TO_MORNING_MS = 8 * 60 * 60 * 1000; // rough initial delay
    setTimeout(() => {
      runEmbeddingDailyReport().catch((e) => console.error("[EmbedReport] First run error:", e));
      setInterval(() => {
        runEmbeddingDailyReport().catch((e) => console.error("[EmbedReport] Interval run error:", e));
      }, TWENTY_FOUR_HOURS_MS);
    }, DELAY_TO_MORNING_MS);
  }
}
