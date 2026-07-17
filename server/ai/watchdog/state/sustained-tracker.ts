// Fase 5 (Task #545) — SustainedTracker: macchina a stati pura e testabile.
//
// Estratta da db-monitor-history.ts per separare la logica di stato dalla
// persistenza (scrittura DB) e renderla unit-testabile senza I/O.
//
// Il tracker conta i tick consecutivi in cui il DB o il backend Node è
// sovraccarico e, superata la finestra configurabile, marca lo stato come
// "sostenuto". Gestisce anche l'edge di rientro (recovered) con la stessa
// finestra simmetrica.
//
// INTERFACCIA PUBBLICA:
//   - tick(input)    → aggiorna lo stato in base all'input del tick corrente
//   - getState()     → lettura sincrona zero-I/O dello stato corrente
//   - reset()        → azzera tutti i contatori/latch (usato dall'admin reset)
//
// INVARIANTE: il tracker è puro — non chiama mai DB, AppSetting, getPoolStats,
// getBackendLoad ecc. Riceve TUTTO come parametro in tick(). Questo lo rende
// deterministico e testabile con soli parametri di input.

import type { OverloadThresholds } from "@shared/overload-thresholds";

/** Subset di BackendLoad passato al tracker (evita dipendenza circolare). */
export interface BackendLoadInput {
  overloaded: boolean;
  cpuPct: number;
  eventLoopLagMs: number;
  eventLoopP99Ms: number;
  rssMb: number;
}

/** Stato di sovraccarico sostenuto per DB e backend, letto dall'overload-collector. */
export interface SustainedOverloadState {
  db: {
    sustained: boolean;
    /** Edge di rientro: true per UN solo tick quando un overload sostenuto rientra. */
    recovered: boolean;
    consecutiveTicks: number;
    /** Tick consecutivi in cui il DB è risultato sano. */
    healthyTicks: number;
    poolActivePct: number;
    poolWaiting: number;
    pingMs: number | null;
    dbErrorCount: number;
    /** Motivi leggibili del sovraccarico corrente (pool/ping/errori). */
    reasons: string[];
  };
  backend: {
    sustained: boolean;
    /** Edge di rientro: true per UN solo tick quando un overload sostenuto rientra. */
    recovered: boolean;
    consecutiveTicks: number;
    /** Tick consecutivi in cui il backend è risultato sano. */
    healthyTicks: number;
    cpuPct: number;
    eventLoopLagMs: number;
    eventLoopP99Ms: number;
    rssMb: number;
    /** Motivi leggibili del sovraccarico corrente (event-loop/CPU). */
    reasons: string[];
  };
}

/** Input per un singolo tick del tracker. */
export interface SustainedTickInput {
  dbOverload: boolean;
  poolActivePct: number;
  poolWaiting: number;
  pingMs: number | null;
  /** Solo per display diagnostico — NON influenza dbOverload (anti-feedback-loop). */
  dbErrorCount: number;
  backend: BackendLoadInput;
  /** Soglie regolabili dall'admin (iniettate da recordDbMonitorSample). */
  thresholds: OverloadThresholds;
}

function emptyState(): SustainedOverloadState {
  return {
    db: {
      sustained: false, recovered: false, consecutiveTicks: 0, healthyTicks: 0,
      poolActivePct: 0, poolWaiting: 0, pingMs: null, dbErrorCount: 0, reasons: [],
    },
    backend: {
      sustained: false, recovered: false, consecutiveTicks: 0, healthyTicks: 0,
      cpuPct: 0, eventLoopLagMs: 0, eventLoopP99Ms: 0, rssMb: 0, reasons: [],
    },
  };
}

/**
 * Macchina a stati pura per il rilevamento di sovraccarico sostenuto.
 * Estratta da db-monitor-history per essere testabile in isolamento (no I/O).
 */
export class SustainedTracker {
  private dbOverloadConsecutive = 0;
  private backendOverloadConsecutive = 0;
  private dbHealthyConsecutive = 0;
  private backendHealthyConsecutive = 0;
  private dbWasSustained = false;
  private backendWasSustained = false;
  private state: SustainedOverloadState = emptyState();

  /**
   * Aggiorna lo stato in base all'input del tick corrente. Puro: nessun I/O.
   * Chiamato una volta per tick da recordDbMonitorSample.
   */
  tick(input: SustainedTickInput): void {
    const { dbOverload, poolActivePct, poolWaiting, pingMs, dbErrorCount, backend, thresholds: t } = input;

    this.dbOverloadConsecutive = dbOverload ? this.dbOverloadConsecutive + 1 : 0;
    this.backendOverloadConsecutive = backend.overloaded ? this.backendOverloadConsecutive + 1 : 0;

    // Tick consecutivi di salute (simmetrico ai tick di overload).
    this.dbHealthyConsecutive = dbOverload ? 0 : this.dbHealthyConsecutive + 1;
    this.backendHealthyConsecutive = backend.overloaded ? 0 : this.backendHealthyConsecutive + 1;

    const dbSustained = this.dbOverloadConsecutive >= t.consecutiveTicks;
    const backendSustained = this.backendOverloadConsecutive >= t.consecutiveTicks;

    // Latch: appena un lato diventa sostenuto, ricordiamo che va poi segnalato
    // come RISOLTO quando rientra. Senza latch non sapremmo distinguere
    // "sano da sempre" (nessuna push) da "sano dopo un incidente" (push di rientro).
    if (dbSustained) this.dbWasSustained = true;
    if (backendSustained) this.backendWasSustained = true;

    // Edge di rientro: era sostenuto e ora è sano da una finestra piena.
    // Sparato UNA sola volta (azzera il latch); il throttle di alerts fa da
    // rete anti-flap aggiuntiva.
    const dbRecovered =
      this.dbWasSustained && !dbOverload && this.dbHealthyConsecutive >= t.consecutiveTicks;
    if (dbRecovered) this.dbWasSustained = false;
    const backendRecovered =
      this.backendWasSustained && !backend.overloaded && this.backendHealthyConsecutive >= t.consecutiveTicks;
    if (backendRecovered) this.backendWasSustained = false;

    const dbReasons: string[] = [];
    if (dbErrorCount > 0) dbReasons.push(`${dbErrorCount} errori DB`);
    if (poolActivePct >= t.poolActivePct) dbReasons.push(`pool al ${Math.round(poolActivePct)}%`);
    if (pingMs != null && pingMs >= t.pingMs) dbReasons.push(`ping ${Math.round(pingMs)}ms`);

    const backendReasons: string[] = [];
    if (backend.eventLoopLagMs >= t.eventLoopLagMs) backendReasons.push(`event-loop lag ${backend.eventLoopLagMs}ms`);
    if (backend.eventLoopP99Ms >= t.eventLoopP99Ms) backendReasons.push(`event-loop p99 ${backend.eventLoopP99Ms}ms`);
    if (backend.cpuPct >= t.cpuPct) backendReasons.push(`CPU ${backend.cpuPct}%`);

    this.state = {
      db: {
        sustained: dbSustained,
        recovered: dbRecovered,
        consecutiveTicks: this.dbOverloadConsecutive,
        healthyTicks: this.dbHealthyConsecutive,
        poolActivePct: Math.round(poolActivePct),
        poolWaiting: Math.round(poolWaiting),
        pingMs: pingMs != null ? Math.round(pingMs) : null,
        dbErrorCount,
        reasons: dbReasons,
      },
      backend: {
        sustained: backendSustained,
        recovered: backendRecovered,
        consecutiveTicks: this.backendOverloadConsecutive,
        healthyTicks: this.backendHealthyConsecutive,
        cpuPct: backend.cpuPct,
        eventLoopLagMs: backend.eventLoopLagMs,
        eventLoopP99Ms: backend.eventLoopP99Ms,
        rssMb: backend.rssMb,
        reasons: backendReasons,
      },
    };
  }

  /** Lettura sincrona zero-I/O dello stato corrente. */
  getState(): SustainedOverloadState {
    return this.state;
  }

  /** Azzera tutti i contatori/latch. Idempotente, nessun I/O. */
  reset(): void {
    this.dbOverloadConsecutive = 0;
    this.backendOverloadConsecutive = 0;
    this.dbHealthyConsecutive = 0;
    this.backendHealthyConsecutive = 0;
    this.dbWasSustained = false;
    this.backendWasSustained = false;
    this.state = emptyState();
  }
}

/** Singleton usato da db-monitor-history. Esportato per i test di integrazione. */
export const sustainedTracker = new SustainedTracker();
