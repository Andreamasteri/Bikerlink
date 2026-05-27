// Task #2533 — Collector errori app. Combina crash logs (app_crash_logs) ultima ora
// + counter in-memory degli errori 5xx ritornati da Express.
import { db } from "../../../db";
import { appCrashLogs } from "@shared/db";
import { gte, count } from "drizzle-orm";
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

  // Reset window ogni 10 min per evitare drift.
  if (now - lastResetAt > 10 * 60_000) {
    httpErrors5xx = 0;
    httpErrors4xx = 0;
    lastResetAt = now;
  }

  try {
    const since = new Date(now - 60 * 60 * 1000);
    const [row] = await db.select({ c: count() }).from(appCrashLogs).where(gte(appCrashLogs.reportedAt, since));
    const crashes = Number(row?.c ?? 0);
    signals.push({
      source: "error", metric: "client.crashes_1h", value: crashes, unit: "crashes",
      severity: crashes > 50 ? "high" : crashes > 10 ? "warn" : "info",
    });
  } catch (err) {
    signals.push({
      source: "error", metric: "collector.error", severity: "warn",
      details: { error: (err as Error).message },
    });
  }
  return signals;
}
