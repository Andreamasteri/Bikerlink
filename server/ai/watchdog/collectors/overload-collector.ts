// Task #72 — Collector di sovraccarico sostenuto (DB e backend Node).
//
// Il Database Monitor calcola già, a ogni tick, se il DB è sovraccarico (pool
// saturo / ping alto / errori DB) e se il backend Node è sovraccarico (event-loop
// lag / CPU). recordDbMonitorSample conta i tick consecutivi e, dopo una finestra
// sostenuta, marca lo stato come `sustained` nel sustainedTracker.
//
// Qui traduciamo quello stato in Signal[] "high" DISTINTI per lato (DB vs
// backend), così deriveProblems crea due Problem con id stabile e alerts.ts può
// pushare l'allerta agli admin sul canale watchdog esistente (con il suo
// throttle). Zero-I/O: legge solo lo snapshot in memoria depositato al tick
// precedente da recordDbMonitorSample (stesso pattern deposit→next-tick del
// pool-collector).
import { sustainedTracker } from "../state/sustained-tracker";
import type { Signal } from "../types";

// Task #154 — Reset dello stato di sovraccarico sostenuto. Questo collector è
// zero-state: legge lo snapshot depositato da recordDbMonitorSample nel
// sustainedTracker, dove vivono i contatori/latch. Delega quindi il reset
// direttamente al tracker. Idempotente, nessun I/O.
export function resetState(): void {
  sustainedTracker.reset();
}

export function collectOverload(): Signal[] {
  const signals: Signal[] = [];
  try {
    const state = sustainedTracker.getState();

    if (state.db.sustained) {
      signals.push({
        source: "db",
        metric: "db.overload_sustained",
        value: state.db.consecutiveTicks,
        unit: "ticks",
        severity: "high",
        // Fase 5 — "derived": calcolato dall'output del ciclo precedente.
        // deriveProblems lo salta; buildDerivedProblems lo aggiunge come Problem
        // separatamente per spezzare il feedback loop (overload_sustained →
        // problema DB → dbErrorCount → dbOverload → overload_sustained).
        origin: "derived",
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
        // Fase 5 — "derived": stesso motivo di db.overload_sustained.
        origin: "derived",
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

    // Task #84 — Rientro dal sovraccarico sostenuto. Quando un lato PRECEDENTEMENTE
    // sovraccarico in modo sostenuto torna sano per una finestra piena, emettiamo
    // un segnale "info" (non "high"): l'evento è una BUONA notizia, non deve creare
    // un Problem né intaccare lo score/status (deriveProblems scarta gli info).
    // Il segnale porta comunque un `value` numerico, quindi finisce nei metrics
    // dello snapshot (source.metric) da cui alerts.ts lo legge per la push "rientrato".
    if (state.db.recovered) {
      signals.push({
        source: "db",
        metric: "db.overload_recovered",
        value: state.db.healthyTicks,
        unit: "ticks",
        severity: "info",
        details: { healthyTicks: state.db.healthyTicks },
      });
    }

    if (state.backend.recovered) {
      signals.push({
        source: "app",
        metric: "backend.overload_recovered",
        value: state.backend.healthyTicks,
        unit: "ticks",
        severity: "info",
        details: { healthyTicks: state.backend.healthyTicks },
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
