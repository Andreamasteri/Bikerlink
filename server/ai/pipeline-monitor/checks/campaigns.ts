import { runCampaignsSelfCheck, getLastSelfCheck } from "../../../ai/watchdog/campaigns-self-check";
import type { PipelineCheckResult, PipelineCheckStep } from "../types";

export async function checkCampaigns(): Promise<PipelineCheckResult> {
  const t0 = Date.now();
  const steps: PipelineCheckStep[] = [];

  // Reuse existing campaigns self-check (without AI brief for speed)
  let overall: PipelineCheckResult["overall"] = "ok";
  let suggestedFix: string | null = null;

  try {
    // Try to reuse last result if fresh (< 10 min)
    const last = getLastSelfCheck();
    const useCached = last && (Date.now() - new Date(last.generatedAt).getTime() < 10 * 60_000);

    const result = useCached ? last! : await runCampaignsSelfCheck({ triggeredBy: "manual", withAi: false });

    for (const check of result.checks) {
      steps.push({
        name: check.name,
        status: check.status === "error" ? "error" : check.status === "warn" ? "warn" : "ok",
        durationMs: check.durationMs,
        message: check.message,
      });
    }

    overall = result.overall === "broken" ? "broken"
      : result.overall === "degraded" ? "degraded" : "ok";
    suggestedFix = result.suggestedFix ?? null;
  } catch (err) {
    steps.push({
      name: "campaigns self-check",
      status: "error",
      durationMs: Date.now() - t0,
      message: (err as Error).message?.slice(0, 300),
    });
    overall = "broken";
    suggestedFix = "Errore nel self-check campagne. Controlla i log del backend.";
  }

  return {
    pipeline: "campaigns",
    label: "Campagne",
    overall,
    steps,
    suggestedFix,
    durationMs: Date.now() - t0,
  };
}
