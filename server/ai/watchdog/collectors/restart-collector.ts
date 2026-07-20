// Surfaces recent unexpected_restart signals to the watchdog aggregator.
// Queries system_signals for restarts written in the last RESTART_VISIBLE_WINDOW_MIN
// minutes so the problem stays visible in the admin panel for several ticks.
//
// === OBSERVABILITY PLANE — restart (ENRICHMENT only) ===
// De-dup (Task #5124): l'emitter PRIMARIO degli alert di riavvio inatteso è
// restart-monitor.ts (recordBootSignal), che invia UNA push immediata e mirata
// agli admin al boot. Questo collector è SOLO arricchimento per il pannello: il
// segnale server.restart_alert resta VISIBILE in dashboard ma è severità "high"
// (mai "critical"), così il loop critical-only di alerts.ts NON manda una seconda
// push per lo stesso evento. Il crash_reason_alert, invece, NON è duplicato dal
// monitor (che lo persiste ma non lo notifica) e resta l'unica via di alert →
// mantiene severità "critical".
//
// Task #934 — aggiunto segnale backend.crash_rate_1h: legge direttamente
// logs/uptime-resets.log e conta i riavvii inattesi nell'ultima ora.
// HIGH se >2, CRITICAL se >4. Permette al pannello admin di vedere un crash
// loop in corso prima del bounce successivo, senza aspettare che il DB venga
// saturato (il segnale è filesystem-only, nessuna dipendenza dal pool).
import fs from "fs";
import path from "path";
import { getRecentUnexpectedRestarts, getRecentCrashReasons, RESTART_VISIBLE_WINDOW_MIN } from "../restart-monitor";
import type { Signal } from "../types";

// Legge logs/uptime-resets.log e conta le righe "CRASH/RIAVVIO INATTESO"
// con timestamp nell'ultimo windowMs. Non lancia mai: fallisce silenziosamente
// restituendo 0 (il segnale viene omesso se il file non esiste o è illeggibile).
function countCrashesInWindow(windowMs: number): { count: number; timestamps: string[] } {
  try {
    const logPath = path.resolve(process.cwd(), "logs", "uptime-resets.log");
    if (!fs.existsSync(logPath)) return { count: 0, timestamps: [] };
    const content = fs.readFileSync(logPath, "utf8");
    const cutoff = Date.now() - windowMs;
    const timestamps: string[] = [];
    for (const line of content.split("\n")) {
      if (!line.includes("CRASH/RIAVVIO INATTESO")) continue;
      // Format: 2026-07-20T18:30:36.345Z BACKEND CRASH/RIAVVIO INATTESO …
      const isoMatch = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)/.exec(line);
      if (!isoMatch) continue;
      const ts = new Date(isoMatch[1]!).getTime();
      if (!isNaN(ts) && ts >= cutoff) {
        timestamps.push(isoMatch[1]!);
      }
    }
    return { count: timestamps.length, timestamps };
  } catch {
    return { count: 0, timestamps: [] };
  }
}

export async function collectRestarts(): Promise<Signal[]> {
  const signals: Signal[] = [];

  // ── Phase 1: filesystem-only (NO DB dependency) ───────────────────────────
  // Task #934 — crash_rate_1h è deliberatamente separato dal blocco DB: deve
  // sopravvivere a pool saturo / circuit-breaker aperto, che è esattamente lo
  // scenario in cui il segnale è più utile. countCrashesInWindow() è sincrona
  // e legge solo logs/uptime-resets.log; non può bloccare né fallire con DB.
  const CRASH_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 ora
  const crashRate = countCrashesInWindow(CRASH_RATE_WINDOW_MS);
  if (crashRate.count > 0) {
    const severity =
      crashRate.count > 4 ? "critical" :
      crashRate.count > 2 ? "high" :
      "warn";
    signals.push({
      source: "app",
      metric: "backend.crash_rate_1h",
      severity,
      value: crashRate.count,
      unit: "crashes/1h",
      details: {
        count: crashRate.count,
        windowH: 1,
        // max 5 timestamp per non gonfiare il payload
        timestamps: crashRate.timestamps.slice(-5),
        thresholdHigh: 2,
        thresholdCritical: 4,
      },
    });
  }

  // ── Phase 2: DB-backed enrichment (best-effort, fallisce silenziosamente) ──
  // restart_alert e crash_reason_alert dipendono dal DB. Un fallimento qui NON
  // deve sopprimere crash_rate_1h (già pushato sopra): usiamo un try/catch
  // separato che aggiunge solo un collector.error se il DB è irraggiungibile.
  try {
    const [restarts, crashReasons] = await Promise.all([
      getRecentUnexpectedRestarts(),
      getRecentCrashReasons(),
    ]);

    if (restarts.length > 0) {
      const latest = restarts[0];
      const count = restarts.length;
      const minutesSinceLast = latest.minutesSinceLast ?? 0;

      // NOTE: metric name intentionally differs from the raw boot-event metric
      // ("server.unexpected_restart") so that recordSignals() persisting this
      // collector output does NOT create rows that getRecentUnexpectedRestarts()
      // would pick up on the next tick — which would fabricate a feedback loop.
      signals.push({
        source: "app",
        // Enrichment-only: severità fissa "high" (mai "critical") per non
        // innescare la push del loop critical-only di alerts.ts — la push di
        // riavvio è già inviata, una sola volta, da restart-monitor. Il count
        // resta nei details per la visibilità del trend in dashboard.
        metric: "server.restart_alert",
        severity: "high",
        value: count,
        unit: "restarts",
        details: {
          count,
          latestAt: latest.createdAt.toISOString(),
          minutesSinceLast,
          visibleWindowMin: RESTART_VISIBLE_WINDOW_MIN,
        },
      });
    }

    if (crashReasons.length > 0) {
      const latest = crashReasons[0];
      signals.push({
        source: "app",
        metric: "server.crash_reason_alert",
        severity: "critical",
        value: crashReasons.length,
        unit: "crashes",
        details: {
          count: crashReasons.length,
          latestCrashedAt: latest.crashedAt,
          type: latest.type,
          message: latest.message,
          visibleWindowMin: RESTART_VISIBLE_WINDOW_MIN,
        },
      });
    }
  } catch (err) {
    signals.push({
      source: "app",
      metric: "collector.error",
      severity: "warn",
      details: { collector: "restart", error: (err as Error).message?.slice(0, 200) },
    });
  }

  return signals;
}
