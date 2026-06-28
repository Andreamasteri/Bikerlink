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
import { getRecentUnexpectedRestarts, getRecentCrashReasons, RESTART_VISIBLE_WINDOW_MIN } from "../restart-monitor";
import type { Signal } from "../types";

export async function collectRestarts(): Promise<Signal[]> {
  try {
    const [restarts, crashReasons] = await Promise.all([
      getRecentUnexpectedRestarts(),
      getRecentCrashReasons(),
    ]);

    const signals: Signal[] = [];

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

    return signals;
  } catch (err) {
    return [
      {
        source: "app",
        metric: "collector.error",
        severity: "warn",
        details: { collector: "restart", error: (err as Error).message?.slice(0, 200) },
      },
    ];
  }
}
