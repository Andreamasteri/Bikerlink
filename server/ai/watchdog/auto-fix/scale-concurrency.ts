// Task #877 — Auto-fix: riduzione temporanea del limite bg-db-limiter (50% per 10 min).
import type { AutoFixRule } from "../types";
import { getBgDbLimiterStats, setConcurrencyOverride } from "../../../lib/bg-db-limiter";

const SCALE_DOWN_FACTOR = 0.5; // riduzione del 50%
const ROLLBACK_TTL_MS = 10 * 60 * 1000; // ripristino automatico dopo 10 minuti
const MIN_CONCURRENCY = 1; // mai scendere sotto 1

export const scaleConcurrencyRule: AutoFixRule = {
  id: "scale_concurrency",
  description: "Riduzione temporanea (50%, 10 min) della concorrenza job DB in background",
  async run(snap) {
    const stats = getBgDbLimiterStats();
    const currentMax = stats.max;

    // Applica solo se ci sono segnali di pressione sul pool.
    const dbLatency = snap.metrics["db.db.ping_ms"] ?? null;
    const p99 = snap.metrics["latency.latency.p99_ms"] ?? null;
    const hasPoolPressure =
      stats.queued > 0 ||
      (Number.isFinite(p99) && (p99 as number) >= 2000) ||
      (Number.isFinite(dbLatency) && (dbLatency as number) >= 2000);

    if (!hasPoolPressure) {
      return { applied: false, reason: `nessuna pressione sul pool rilevata (queued=${stats.queued}, p99=${p99}ms)` };
    }

    const newMax = Math.max(MIN_CONCURRENCY, Math.floor(currentMax * SCALE_DOWN_FACTOR));
    if (newMax >= currentMax) {
      return { applied: false, reason: `concorrenza già al minimo (max=${currentMax})` };
    }

    // Applica l'override e pianifica il rollback automatico.
    setConcurrencyOverride(newMax);
    const timer = setTimeout(() => {
      setConcurrencyOverride(null);
    }, ROLLBACK_TTL_MS);
    // Non bloccare lo shutdown del processo per questo timer.
    timer.unref?.();

    return {
      applied: true,
      summary: `Concorrenza bg-db ridotta da ${currentMax} a ${newMax} (rollback automatico tra 10 min)`,
      details: {
        previousMax: currentMax,
        newMax,
        rollbackInMs: ROLLBACK_TTL_MS,
        queuedAtApply: stats.queued,
      },
    };
  },
};
