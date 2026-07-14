// Task #2532 — Anomaly detection sul flusso report. Ogni 10 min calcola la
// media mobile per categoria (ultime 24h escluse l'ora corrente) e, se nella
// finestra 1h il conteggio supera media + 3σ (min 5 osservazioni), genera
// AnomalyEvent + push admin.
import { db } from "../../db";
import { reports, anomalyEvents } from "@shared/db";
import { gte, and, eq, isNotNull } from "drizzle-orm";
import { mean, standardDeviation } from "simple-statistics";
import { sendAiAnomalyAlertPush } from "./push";
import { storage } from "../../storage";
import { withDbRetry } from "../../lib/db-retry";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { withJobGate } from "../coordinator/gated-job";

const WINDOW_MIN = 60;
const HISTORY_HOURS = 24;
const DEFAULT_SIGMA_MULT = 3;
const MIN_OBSERVED = 5;
const TICK_MS = 10 * 60 * 1000;

async function readSigma(): Promise<number> {
  try {
    const row = await storage.getAppSetting("ai_moderation_anomaly_sigma");
    const n = row?.value ? parseFloat(row.value) : NaN;
    if (Number.isFinite(n) && n >= 1 && n <= 6) return n;
  } catch {/* ignore */}
  return DEFAULT_SIGMA_MULT;
}

let timer: NodeJS.Timeout | null = null;

async function bucketCounts(since: Date, until: Date): Promise<Map<string, Map<number, number>>> {
  // Recupera tutti i report nel range e li raggruppa per categoria + slot orario.
  const rows = await withBgDbSlot(() => withDbRetry("[ai-anomaly]", () =>
    db.select({
      category: reports.category, createdAt: reports.createdAt,
    }).from(reports).where(
      and(gte(reports.createdAt, since), isNotNull(reports.category)),
    ),
  ));
  const result = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const ts = r.createdAt instanceof Date ? r.createdAt.getTime() : new Date(r.createdAt).getTime();
    if (ts >= until.getTime()) continue;
    const slot = Math.floor(ts / (60 * 60 * 1000));
    const cat = r.category ?? "other";
    if (!result.has(cat)) result.set(cat, new Map());
    const m = result.get(cat)!;
    m.set(slot, (m.get(slot) ?? 0) + 1);
  }
  return result;
}

async function currentWindowCounts(since: Date): Promise<Map<string, number>> {
  const rows = await withBgDbSlot(() => withDbRetry("[ai-anomaly]", () =>
    db.select({ category: reports.category })
      .from(reports)
      .where(and(gte(reports.createdAt, since), isNotNull(reports.category))),
  ));
  const m = new Map<string, number>();
  for (const r of rows) {
    const cat = r.category ?? "other";
    m.set(cat, (m.get(cat) ?? 0) + 1);
  }
  return m;
}

async function alreadyNotified(type: string, category: string, since: Date): Promise<boolean> {
  const [row] = await withBgDbSlot(() => withDbRetry("[ai-anomaly]", () =>
    db.select({ id: anomalyEvents.id })
      .from(anomalyEvents)
      .where(and(
        eq(anomalyEvents.type, type),
        eq(anomalyEvents.category, category),
        gte(anomalyEvents.createdAt, since),
      )).limit(1),
  ));
  return !!row;
}

export async function runAnomalyScan(): Promise<{ created: number; scannedCategories: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MIN * 60 * 1000);
  const historyStart = new Date(now.getTime() - HISTORY_HOURS * 60 * 60 * 1000);
  // Storico = ultime 24h ESCLUSA l'ora corrente.
  const historyEnd = windowStart;

  const [historical, current, sigmaMult] = await Promise.all([
    bucketCounts(historyStart, historyEnd),
    currentWindowCounts(windowStart),
    readSigma(),
  ]);

  let created = 0;
  for (const [cat, observed] of current.entries()) {
    if (observed < MIN_OBSERVED) continue;
    const histBuckets = historical.get(cat);
    const series: number[] = [];
    // Riempiamo gli slot delle ultime 23h con 0 se assenti, per non sottostimare la media.
    const startSlot = Math.floor(historyStart.getTime() / (60 * 60 * 1000));
    const endSlot = Math.floor(historyEnd.getTime() / (60 * 60 * 1000));
    for (let s = startSlot; s < endSlot; s++) series.push(histBuckets?.get(s) ?? 0);
    if (series.length < 6) continue;
    const m = mean(series);
    const s = series.length >= 2 ? standardDeviation(series) : 0;
    const threshold = Math.max(MIN_OBSERVED, m + sigmaMult * s);
    if (observed >= threshold) {
      // Dedupe: non rinotificare la stessa categoria entro 2h.
      const since = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      if (await alreadyNotified("report_spike", cat, since)) continue;
      await withBgDbSlot(() => withDbRetry("[ai-anomaly]", () =>
        db.insert(anomalyEvents).values({
          type: "report_spike", category: cat,
          windowMinutes: WINDOW_MIN, observed,
          threshold,
          details: { mean: m, stddev: s, sigmaMult } as object,
          notifiedAdmins: true,
        }),
      ));
      sendAiAnomalyAlertPush({ type: "report_spike", category: cat, observed, threshold }).catch(() => {});
      created++;
    }
  }
  return { created, scannedCategories: current.size };
}

function scheduleNextTick(gatedScan: () => Promise<unknown>): void {
  const jitter = TICK_MS * 0.1 * (Math.random() * 2 - 1);
  const delay = TICK_MS + jitter;
  timer = setTimeout(async () => {
    await gatedScan().catch((err) => console.warn("[ai-anomaly] scan error:", err));
    if (timer !== null) scheduleNextTick(gatedScan);
  }, delay);
  timer.unref?.();
}

export function startAnomalyScheduler(): void {
  if (timer) return;
  // Task #9 — Quebracho può pausare/riprendere anche questo loop (subsystem
  // moderation, già integrato via coordinator/integrations/moderation.ts).
  const gatedScan = withJobGate("moderation-anomalies", runAnomalyScan);
  // Primo run dopo 1 min, poi ogni 10 min ±10% jitter (anti-thundering-herd).
  timer = setTimeout(() => {
    gatedScan()
      .catch((err) => console.warn("[ai-anomaly] first scan error:", err))
      .finally(() => { if (timer !== null) scheduleNextTick(gatedScan); });
  }, 60_000);
  timer.unref?.();
  console.log("[ai-anomaly] scheduler started, initial-delay=1min, tick=10min±10%");
}

export function stopAnomalyScheduler(): void {
  if (timer) { clearTimeout(timer); timer = null; }
}
