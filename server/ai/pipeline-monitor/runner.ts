import crypto from "crypto";
import { EventEmitter } from "events";
import { writeWatchdogLog } from "../watchdog/log";
import { checkTelemetryRide, checkTelemetryMaps } from "./checks/telemetry";
import { checkMatching } from "./checks/matching";
import { checkCampaigns } from "./checks/campaigns";
import {
  checkNotifications, checkOta, checkGps,
  checkEmbeddingBio, checkEmbeddingMusic,
  checkChat, checkRoadHazards, checkAiAssistant, checkSessionCrash,
} from "./checks/misc";
import type { PipelineName, PipelineRunResult, PipelineCheckResult } from "./types";
import { db } from "../../db";
import { pipelineProbeHistory } from "@shared/db";

type CheckFn = () => Promise<PipelineCheckResult>;

const ALL_CHECKS: Array<[PipelineName, CheckFn]> = [
  ["telemetry_ride",   checkTelemetryRide],
  ["telemetry_maps",   checkTelemetryMaps],
  ["matching",         checkMatching],
  ["campaigns",        checkCampaigns],
  ["notifications",    checkNotifications],
  ["ota",              checkOta],
  ["gps",              checkGps],
  ["embedding_bio",    checkEmbeddingBio],
  ["embedding_music",  checkEmbeddingMusic],
  ["chat",             checkChat],
  ["road_hazards",     checkRoadHazards],
  ["ai_assistant",     checkAiAssistant],
  ["session_crash",    checkSessionCrash],
];

let _lastRunResult: PipelineRunResult | null = null;
let _runInProgress = false;

// In-process emitter — fires 'run-complete' with the PipelineRunResult after
// each successful radiografia run so SSE clients get an immediate push.
export const pipelineRunEmitter = new EventEmitter();
pipelineRunEmitter.setMaxListeners(50);

export function getLastPipelineRunResult(): PipelineRunResult | null {
  return _lastRunResult;
}

export function isPipelineRunInProgress(): boolean {
  return _runInProgress;
}

async function savePipelineHistory(results: PipelineCheckResult[]): Promise<void> {
  try {
    const rows = results.map((r) => ({
      pipeline: r.pipeline,
      overall: r.overall,
      steps: r.steps,
      durationMs: r.durationMs,
    }));
    await db.insert(pipelineProbeHistory).values(rows);
  } catch (err) {
    console.error("[pipeline-check] history save error:", err);
  }
}

export async function runPipelineChecks(opts: {
  scope?: PipelineName | "all";
  triggeredBy?: "manual" | "scheduler";
}): Promise<PipelineRunResult> {
  if (_runInProgress) throw new Error("Un run è già in corso — riprova tra qualche secondo");

  _runInProgress = true;
  const t0 = Date.now();
  const runId = crypto.randomBytes(4).toString("hex");
  const scope = opts.scope ?? "all";
  const triggeredBy = opts.triggeredBy ?? "manual";

  try {
    const toRun = scope === "all"
      ? ALL_CHECKS
      : ALL_CHECKS.filter(([name]) => name === scope);

    const results = await Promise.all(
      toRun.map(async ([, fn]) => {
        try {
          return await fn();
        } catch (err) {
          return {
            pipeline: "session_crash" as PipelineName,
            label: "Errore interno",
            overall: "broken" as const,
            steps: [{ name: "check", status: "error" as const, durationMs: 0, message: (err as Error).message }],
            suggestedFix: "Errore imprevisto nel check — controlla i log del backend.",
            durationMs: 0,
          };
        }
      }),
    );

    const overall = results.some(r => r.overall === "broken") ? "broken"
      : results.some(r => r.overall === "degraded") ? "degraded" : "ok";

    const runResult: PipelineRunResult = {
      runId,
      scope,
      overall,
      pipelines: results,
      triggeredBy,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    };

    _lastRunResult = runResult;

    await Promise.all([
      writeWatchdogLog({
        kind: "report",
        scope: "pipeline-check",
        status: overall === "ok" ? "ok" : overall === "degraded" ? "warn" : "error",
        summary: `Pipeline check (${scope}): ${overall} — ${results.length} pipeline in ${runResult.durationMs}ms (trigger=${triggeredBy})`,
        details: runResult,
      }),
      savePipelineHistory(results),
    ]);

    pipelineRunEmitter.emit("run-complete", runResult);

    return runResult;
  } finally {
    _runInProgress = false;
  }
}
