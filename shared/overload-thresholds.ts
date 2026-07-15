// Task #83 — Soglie di sovraccarico regolabili dall'admin.
//
// Le allerte proattive di sovraccarico DB/backend (Task #72) usavano soglie
// hardcoded: pool ≥90%, ping ≥500ms, event-loop lag ≥100ms, p99 ≥500ms, CPU ≥85%
// e una finestra sostenuta fissa di 3 tick. Qui le raccogliamo in un'unica
// struttura persistita come AppSetting (valueJson) così un admin può alzarle o
// abbassarle dal Database Monitor senza toccare il codice.
//
// I DEFAULT restano identici alle vecchie costanti: se il setting manca o è
// invalido si ricade sempre su questi (nessuna regressione).

export interface OverloadThresholds {
  /** Saturazione pool (%) oltre la quale il DB è sovraccarico. */
  poolActivePct: number;
  /** Latenza ping (ms) oltre la quale il DB è sovraccarico. */
  pingMs: number;
  /** Event-loop lag medio (ms) oltre il quale il backend è sovraccarico. */
  eventLoopLagMs: number;
  /** Event-loop p99 (ms) oltre il quale il backend è sovraccarico. */
  eventLoopP99Ms: number;
  /** CPU del processo (%) oltre la quale il backend è sovraccarico. */
  cpuPct: number;
  /** Tick aggregator consecutivi sovraccarichi prima di classificare "sostenuto". */
  consecutiveTicks: number;
}

/** Chiave AppSetting (valueJson) che persiste la config delle soglie. */
export const OVERLOAD_THRESHOLDS_KEY = "overload_alert_thresholds";

/** Default = le vecchie costanti hardcoded (Task #72). Safe fallback. */
export const DEFAULT_OVERLOAD_THRESHOLDS: OverloadThresholds = {
  poolActivePct: 90,
  pingMs: 500,
  eventLoopLagMs: 100,
  eventLoopP99Ms: 500,
  cpuPct: 85,
  consecutiveTicks: 3,
};

/** Limiti di validazione per campo: valori fuori range ricadono sul default. */
export const OVERLOAD_THRESHOLD_BOUNDS: Record<
  keyof OverloadThresholds,
  { min: number; max: number; label: string; unit: string }
> = {
  poolActivePct: { min: 10, max: 100, label: "Pool DB", unit: "%" },
  pingMs: { min: 50, max: 60_000, label: "Ping DB", unit: "ms" },
  eventLoopLagMs: { min: 10, max: 60_000, label: "Event-loop lag", unit: "ms" },
  eventLoopP99Ms: { min: 10, max: 60_000, label: "Event-loop p99", unit: "ms" },
  cpuPct: { min: 10, max: 100, label: "CPU backend", unit: "%" },
  consecutiveTicks: { min: 1, max: 60, label: "Tick sostenuti", unit: "tick" },
};

const KEYS = Object.keys(DEFAULT_OVERLOAD_THRESHOLDS) as (keyof OverloadThresholds)[];

/**
 * Normalizza una config parziale/non affidabile in una struttura completa:
 * - parte dai default;
 * - applica solo i valori numerici finiti e dentro i limiti (arrotondati);
 * - scarta silenziosamente chiavi mancanti, non numeriche o fuori range.
 * Così un setting corrotto non può mai disabilitare le allerte.
 */
export function normalizeOverloadThresholds(raw: unknown): OverloadThresholds {
  const out: OverloadThresholds = { ...DEFAULT_OVERLOAD_THRESHOLDS };
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of KEYS) {
      const v = obj[key];
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      const { min, max } = OVERLOAD_THRESHOLD_BOUNDS[key];
      if (Number.isFinite(n) && n >= min && n <= max) {
        out[key] = Math.round(n);
      }
    }
  }
  return out;
}
