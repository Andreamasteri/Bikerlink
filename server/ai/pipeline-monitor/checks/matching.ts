import { getMatchLogs } from "../../../matching/match-log-buffer";
import { getMatchingLockStatus } from "../../../matching/scheduler";
import { getLastCycleOutcome, getLastMatchingCycleMeta } from "../../../matching/scheduler";
import type { PipelineCheckResult, PipelineCheckStep } from "../types";

async function runStep(name: string, fn: () => Promise<string | void>): Promise<PipelineCheckStep> {
  const start = Date.now();
  try {
    const msg = await fn();
    return { name, status: "ok", durationMs: Date.now() - start, message: msg ?? undefined };
  } catch (err) {
    return { name, status: "error", durationMs: Date.now() - start, message: (err as Error).message?.slice(0, 300) };
  }
}

export async function checkMatching(): Promise<PipelineCheckResult> {
  const t0 = Date.now();
  const steps: PipelineCheckStep[] = [];

  // Step 1: verifica ultimo ciclo
  steps.push(await runStep("ultimo ciclo matching", async () => {
    const meta = getLastMatchingCycleMeta();
    const outcome = getLastCycleOutcome();
    if (!meta) return "nessun ciclo eseguito ancora (server appena avviato)";
    if (outcome === "error") throw new Error("ultimo ciclo terminato in errore");
    const ageMin = Math.round((Date.now() - new Date(meta.completedAt).getTime()) / 60_000);
    return `completato ${ageMin}min fa — ${meta.zavorrinaMatchesNew} zav + ${meta.bikerBikerMatchesNew} bb (${meta.durationMs}ms)`;
  }));

  // Step 2: verifica lock non bloccato
  steps.push(await runStep("lock matching", async () => {
    const lockStatus = getMatchingLockStatus();
    if (lockStatus && typeof lockStatus === "object" && "isLocked" in lockStatus) {
      const ls = lockStatus as { isLocked: boolean; acquiredAt?: string };
      if (ls.isLocked && ls.acquiredAt) {
        const ageMin = Math.round((Date.now() - new Date(ls.acquiredAt).getTime()) / 60_000);
        if (ageMin > 30) {
          throw new Error(`lock acquisito ${ageMin}min fa — possibile zombie`);
        }
        return `lock attivo da ${ageMin}min (in corso)`;
      }
    }
    return "nessun lock attivo";
  }));

  // Step 3: ultimi log per errori bloccanti
  steps.push(await runStep("log errori recenti", async () => {
    const logs = getMatchLogs({ level: "error", limit: 10 });
    const recent = logs.filter(l => new Date(l.timestamp).getTime() > Date.now() - 30 * 60_000);
    if (recent.length > 0) {
      const step: PipelineCheckStep = {
        name: "log errori recenti",
        status: "warn",
        durationMs: 0,
        message: `${recent.length} errori negli ultimi 30min: ${recent[0].message.slice(0, 100)}`,
      };
      return step.message;
    }
    return "nessun errore recente";
  }));

  const overall = steps.some(s => s.status === "error") ? "broken"
    : steps.some(s => s.status === "warn") ? "degraded" : "ok";

  return {
    pipeline: "matching",
    label: "Matching Cycle",
    overall,
    steps,
    suggestedFix: overall !== "ok"
      ? "Verifica matching/scheduler.ts, controlla il lock DragonflyDB e riavvia il backend se il lock è zombie."
      : null,
    durationMs: Date.now() - t0,
  };
}
