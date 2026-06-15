import { Router, type Request, type Response } from "express";
import { sendError } from "../../lib/api-response";
import { runPipelineChecks, getLastPipelineRunResult, isPipelineRunInProgress } from "../../ai/pipeline-monitor/runner";
import { detectPipelineHoles, getLastHoles } from "../../ai/pipeline-monitor/hole-detector";
import type { PipelineName } from "../../ai/pipeline-monitor/types";

const VALID_PIPELINES: PipelineName[] = [
  "telemetry_ride", "telemetry_maps", "matching", "campaigns",
  "notifications", "ota", "gps", "embedding_bio", "embedding_music",
  "chat", "road_hazards", "ai_assistant", "session_crash",
];

const router = Router();

// POST /api/admin/pipeline-check/run
// Avvia un run radiografia (tutte le pipeline o una singola).
router.post("/pipeline-check/run", async (req: Request, res: Response) => {
  const scopeRaw = (req.body as { scope?: string } | undefined)?.scope ?? "all";
  const scope = scopeRaw === "all" || VALID_PIPELINES.includes(scopeRaw as PipelineName)
    ? (scopeRaw as PipelineName | "all")
    : "all";

  if (isPipelineRunInProgress()) {
    return sendError(res, 409, "Un run è già in corso — riprova tra qualche secondo");
  }

  try {
    const result = await runPipelineChecks({ scope, triggeredBy: "manual" });
    return res.json(result);
  } catch (err) {
    console.error("[pipeline-check] run error:", err);
    return sendError(res, 500, (err as Error).message ?? "Errore interno");
  }
});

// GET /api/admin/pipeline-check/last
// Restituisce l'ultimo risultato del run radiografia.
router.get("/pipeline-check/last", (_req: Request, res: Response) => {
  const result = getLastPipelineRunResult();
  return res.json({ result, inProgress: isPipelineRunInProgress() });
});

// GET /api/admin/pipeline-check/holes
// Restituisce i buchi attivi e lo storico recente.
router.get("/pipeline-check/holes", async (_req: Request, res: Response) => {
  try {
    const holes = await detectPipelineHoles();
    return res.json(holes);
  } catch (err) {
    console.error("[pipeline-check] holes error:", err);
    return res.json(getLastHoles());
  }
});

export default router;
