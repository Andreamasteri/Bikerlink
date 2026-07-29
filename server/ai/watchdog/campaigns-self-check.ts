// Read-only health check for the advertising campaign subsystem.
//
// IMPORTANT: scheduled/startup checks must never create, update, delete or clean
// campaign records or object-storage files. End-to-end mutation tests belong in
// an explicit maintenance command running against an isolated database branch.
import { withJobGate } from "../coordinator/gated-job";
import { writeWatchdogLog } from "./log";
import { httpProbe } from "./campaigns-self-check.part2";

export type CheckStatus = "ok" | "warn" | "error";
export type OverallStatus = "ok" | "degraded" | "broken";

export interface SelfCheckEntry {
  name: string;
  status: CheckStatus;
  durationMs: number;
  message?: string;
}

export interface CampaignsSelfCheckResult {
  overall: OverallStatus;
  checks: SelfCheckEntry[];
  summary: string;
  suggestedFix: string | null;
  generatedAt: string;
  durationMs: number;
  triggeredBy: "manual" | "scheduler" | "startup";
  aiBrief?: string;
  aiMeta?: { provider: string; model: string };
}

export interface RunSelfCheckOpts {
  triggeredBy: "manual" | "scheduler" | "startup";
  withAi?: boolean;
}

let lastResult: CampaignsSelfCheckResult | null = null;

export function getLastSelfCheck(): CampaignsSelfCheckResult | null {
  return lastResult;
}

async function runStep(
  name: string,
  fn: () => Promise<{ message?: string } | void>,
): Promise<SelfCheckEntry> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    return {
      name,
      status: "ok",
      durationMs: Date.now() - startedAt,
      message: result?.message,
    };
  } catch (error) {
    return {
      name,
      status: "error",
      durationMs: Date.now() - startedAt,
      message: (error as Error)?.message?.slice(0, 400) ?? "errore sconosciuto",
    };
  }
}

function deriveOverall(checks: SelfCheckEntry[]): OverallStatus {
  if (checks.some((check) => check.status === "error")) return "broken";
  if (checks.some((check) => check.status === "warn")) return "degraded";
  return "ok";
}

function deriveSuggestedFix(checks: SelfCheckEntry[]): string | null {
  const firstFailure = checks.find((check) => check.status === "error");
  if (!firstFailure) return null;
  return `Controlla il passo "${firstFailure.name}": ${firstFailure.message ?? "errore sconosciuto"}`;
}

export async function runCampaignsSelfCheck(
  opts: RunSelfCheckOpts,
): Promise<CampaignsSelfCheckResult> {
  const startedAt = Date.now();
  const checks: SelfCheckEntry[] = [];

  checks.push(await runStep("GET /api/admin/advertisements", async () => {
    const response = await httpProbe("GET", "/api/admin/advertisements");
    if (response.status !== 200) {
      throw new Error(`status ${response.status} body=${response.body.slice(0, 200)}`);
    }
    if (!Array.isArray(response.json)) {
      throw new Error("risposta admin non è un array");
    }
    return { message: `${response.json.length} campagne leggibili` };
  }));

  checks.push(await runStep("GET /api/ads/placement/all", async () => {
    const response = await httpProbe("GET", "/api/ads/placement/all");
    if (response.status !== 200) {
      throw new Error(`status ${response.status} body=${response.body.slice(0, 200)}`);
    }
    if (!Array.isArray(response.json)) {
      throw new Error("risposta pubblica non è un array");
    }
    return { message: `${response.json.length} campagne pubblicabili` };
  }));

  const overall = deriveOverall(checks);
  const durationMs = Date.now() - startedAt;
  const failedCount = checks.filter((check) => check.status === "error").length;
  const summary = overall === "ok"
    ? `Controllo campagne read-only completato (${checks.length} passi, ${durationMs}ms).`
    : `Controllo campagne read-only fallito: ${failedCount}/${checks.length} passi in errore.`;

  const result: CampaignsSelfCheckResult = {
    overall,
    checks,
    summary,
    suggestedFix: deriveSuggestedFix(checks),
    generatedAt: new Date().toISOString(),
    durationMs,
    triggeredBy: opts.triggeredBy,
  };

  lastResult = result;

  await writeWatchdogLog({
    kind: "report",
    scope: "campaigns",
    status: overall === "ok" ? "ok" : overall === "degraded" ? "warn" : "error",
    summary: `Self-check campagne read-only: ${overall} (${checks.length} passi, ${durationMs}ms, trigger=${opts.triggeredBy})`,
    details: result,
  });

  return result;
}

let timer: NodeJS.Timeout | null = null;
const SIX_HOURS = 6 * 60 * 60_000;

export function startCampaignsSelfCheckScheduler(): void {
  if (timer) return;

  setTimeout(() => {
    runCampaignsSelfCheck({ triggeredBy: "startup", withAi: false }).catch((error) =>
      console.warn("[campaigns-self-check] startup read-only run failed:", error));
  }, 30_000);

  timer = setInterval(withJobGate("campaigns-self-check", () => {
    runCampaignsSelfCheck({ triggeredBy: "scheduler", withAi: false }).catch((error) =>
      console.warn("[campaigns-self-check] scheduled read-only run failed:", error));
  }), SIX_HOURS);

  timer.unref?.();
  console.log("[campaigns-self-check] scheduler read-only avviato (ogni 6h)");
}

export function stopCampaignsSelfCheckScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
