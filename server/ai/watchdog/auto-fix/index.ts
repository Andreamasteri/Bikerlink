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

export async function runAutoFix(snapshot: HealthSnapshot): Promise<AutoFixOutcome[]> {
  const out: AutoFixOutcome[] = [];
  for (const rule of RULES) {
    try {
      const res = await rule.run(snapshot);
      if (res.applied) {
        const logId = await writeWatchdogLog({
          kind: "auto_fix", scope: rule.id, status: "ok",
          summary: res.summary, details: res.details,
        });
        out.push({ ruleId: rule.id, applied: true, summary: res.summary, details: res.details, logId });
      }
      // skip silenzi: non logghiamo i no-op per non spammare il log
    } catch (err) {
      const logId = await writeWatchdogLog({
        kind: "auto_fix", scope: rule.id, status: "error",
        summary: `Errore esecuzione rule ${rule.id}`,
        details: { error: (err as Error).message },
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
