// Task #2533 — Registry auto-fix rule-based. Solo azioni SICURE e IDEMPOTENTI.
// Per ogni rule.run(snapshot): decide se applicabile, esegue, ritorna risultato.
// Tutti i risultati vengono loggati su ai_watchdog_log (kind=auto_fix).
import type { AutoFixRule, HealthSnapshot } from "../types";
import { writeWatchdogLog } from "../log";
import { releaseLockZombie } from "./release-lock-zombie";
import { clearCacheDegraded } from "./clear-cache-degraded";
import { resetErrorWindow } from "./reset-error-window";

const RULES: AutoFixRule[] = [
  releaseLockZombie,
  clearCacheDegraded,
  resetErrorWindow,
];

export interface AutoFixOutcome {
  ruleId: string;
  applied: boolean;
  summary: string;
  details?: Record<string, unknown>;
  logId: string | null;
}

// Task #2554 — sottoinsieme di stato system catturato prima e dopo un auto-fix
// per audit trail (capisci cosa è cambiato senza guardare la timeline dei
// snapshot). Tutti opzionali — se la metrica non esiste, resta null.
interface AutoFixState {
  queueMatchingWaiting: number | null;
  queueMatchingFailed: number | null;
  schedulerLockAgeMin: number | null;
  latencyP99Ms: number | null;
  errorHttp5xxPerMin: number | null;
  lruRegistrySize: number | null;
  dragonflyUnreachable: boolean;
}

function snapshotState(snap: HealthSnapshot): AutoFixState {
  const m = snap.metrics ?? {};
  const reg = (globalThis as unknown as { __bikerlinkLruCaches?: Map<string, unknown> }).__bikerlinkLruCaches;
  return {
    queueMatchingWaiting: Number.isFinite(m["bullmq.queue.matching.waiting"]) ? m["bullmq.queue.matching.waiting"] : null,
    queueMatchingFailed: Number.isFinite(m["bullmq.queue.matching.failed"]) ? m["bullmq.queue.matching.failed"] : null,
    schedulerLockAgeMin: Number.isFinite(m["scheduler.scheduler.lock_age_min"]) ? m["scheduler.scheduler.lock_age_min"] : null,
    latencyP99Ms: Number.isFinite(m["latency.latency.p99_ms"]) ? m["latency.latency.p99_ms"] : null,
    errorHttp5xxPerMin: Number.isFinite(m["error.http.5xx_per_min"]) ? m["error.http.5xx_per_min"] : null,
    lruRegistrySize: reg ? reg.size : null,
    dragonflyUnreachable: (snap.problems ?? []).some((p) => p.id === "dragonfly.dragonfly.unreachable"),
  };
}

export async function runAutoFix(snapshot: HealthSnapshot): Promise<AutoFixOutcome[]> {
  const out: AutoFixOutcome[] = [];
  for (const rule of RULES) {
    const beforeState = snapshotState(snapshot);
    const startedAt = Date.now();
    try {
      const res = await rule.run(snapshot);
      const durationMs = Date.now() - startedAt;
      if (res.applied) {
        // afterState: rivaluta solo i campi che NON dipendono dal prossimo
        // aggregator cycle (LRU size, dragonfly flag dal prev snapshot). Per i
        // contatori coda/latency/lock il delta sarà visibile al prossimo
        // tick — registriamo comunque beforeState come riferimento.
        const afterReg = (globalThis as unknown as { __bikerlinkLruCaches?: Map<string, unknown> }).__bikerlinkLruCaches;
        const afterState: AutoFixState = {
          ...beforeState,
          lruRegistrySize: afterReg ? afterReg.size : null,
        };
        const logId = await writeWatchdogLog({
          kind: "auto_fix", scope: rule.id, status: "ok",
          summary: res.summary,
          details: { ...(res.details ?? {}), beforeState, afterState, durationMs },
        });
        out.push({ ruleId: rule.id, applied: true, summary: res.summary, details: res.details, logId });
      }
      // skip silenzi: non logghiamo i no-op per non spammare il log
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const logId = await writeWatchdogLog({
        kind: "auto_fix", scope: rule.id, status: "error",
        summary: `Errore esecuzione rule ${rule.id}`,
        details: { error: (err as Error).message, beforeState, durationMs },
      });
      out.push({
        ruleId: rule.id, applied: false,
        summary: (err as Error).message?.slice(0, 200) ?? "errore",
        logId,
      });
    }
  }
  return out;
}

export { RULES as AUTO_FIX_RULES };
