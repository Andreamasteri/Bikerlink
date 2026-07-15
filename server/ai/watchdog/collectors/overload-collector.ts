// Task #72 — Collector di sovraccarico sostenuto (DB e backend Node).
//
// Il Database Monitor calcola già, a ogni tick, se il DB è sovraccarico (pool
// saturo / ping alto / errori DB) e se il backend Node è sovraccarico (event-loop
// lag / CPU). recordDbMonitorSample conta i tick consecutivi e, dopo una finestra
// sostenuta, marca lo stato come `sustained` in getSustainedOverloadState().
//
// Qui traduciamo quello stato in Signal[] "high" DISTINTI per lato (DB vs
// backend), così deriveProblems crea due Problem con id stabile e alerts.ts può
// pushare l'allerta agli admin sul canale watchdog esistente (con il suo
// throttle). Zero-I/O: legge solo lo snapshot in memoria depositato al tick
// precedente da recordDbMonitorSample (stesso pattern deposit→next-tick del
// pool-collector).
import { getSustainedOverloadState } from "../../../db-monitor-history";
import type { Signal } from "../types";

export function collectOverload(): Signal[] {
  const signals: Signal[] = [];
  try {
    const state = getSustainedOverloadState();

    if (state.db.sustained) {
      signals.push({
        source: "db",
        metric: "db.overload_sustained",
        value: state.db.consecutiveTicks,
        unit: "ticks",
        severity: "high",
        details: {
          consecutiveTicks: state.db.consecutiveTicks,
          poolActivePct: state.db.poolActivePct,
          poolWaiting: state.db.poolWaiting,
          pingMs: state.db.pingMs,
          dbErrorCount: state.db.dbErrorCount,
          reasons: state.db.reasons,
        },
      });
    }

    if (state.backend.sustained) {
      signals.push({
        source: "app",
        metric: "backend.overload_sustained",
        value: state.backend.consecutiveTicks,
        unit: "ticks",
        severity: "high",
        details: {
          consecutiveTicks: state.backend.consecutiveTicks,
          cpuPct: state.backend.cpuPct,
          eventLoopLagMs: state.backend.eventLoopLagMs,
          eventLoopP99Ms: state.backend.eventLoopP99Ms,
          rssMb: state.backend.rssMb,
          reasons: state.backend.reasons,
        },
      });
    }
  } catch (err) {
    signals.push({
      source: "app",
      metric: "collector.error",
      severity: "warn",
      details: { collector: "overload", error: (err as Error).message?.slice(0, 200) },
    });
  }
  return signals;
}
