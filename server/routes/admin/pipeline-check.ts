import { Router, type Request, type Response } from "express";
import { readFileSync } from "fs";
import { join } from "path";
import { sendError } from "../../lib/api-response";
import { runPipelineChecks, getLastPipelineRunResult, isPipelineRunInProgress } from "../../ai/pipeline-monitor/runner";
import { detectPipelineHoles, getLastHoles } from "../../ai/pipeline-monitor/hole-detector";
import type { PipelineName } from "../../ai/pipeline-monitor/types";
import { db } from "../../db";
import { diagnosticReports } from "@shared/db";
import { desc } from "drizzle-orm";

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

// GET /api/admin/diagnostics/export
// Aggrega tutti i dati diagnostici e li restituisce come file JSON scaricabile.
router.get("/diagnostics/export", async (_req: Request, res: Response) => {
  try {
    let appVersion = "unknown";
    let buildNumberAndroid: number | null = null;
    let buildNumberIos: string | null = null;
    try {
      const appJson = JSON.parse(readFileSync(join(process.cwd(), "app.json"), "utf-8")) as {
        expo?: { version?: string; android?: { versionCode?: number }; ios?: { buildNumber?: string } };
      };
      appVersion = appJson?.expo?.version ?? "unknown";
      buildNumberAndroid = appJson?.expo?.android?.versionCode ?? null;
      buildNumberIos = appJson?.expo?.ios?.buildNumber ?? null;
    } catch { /* non fatale */ }

    const [holesResult, deviceRows] = await Promise.all([
      detectPipelineHoles().catch(() => getLastHoles()),
      db.select().from(diagnosticReports).orderBy(desc(diagnosticReports.runAt)).limit(20),
    ]);

    const lastRun = getLastPipelineRunResult();

    const payload = {
      metadata: {
        generatedAt: new Date().toISOString(),
        appVersion,
        buildNumberAndroid,
        buildNumberIos,
        env: process.env.NODE_ENV ?? "unknown",
      },
      lastRadiografia: lastRun ?? null,
      activeHoles: holesResult,
      deviceReports: deviceRows,
    };

    const isoDate = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const filename = `bikerlink-diagnostics-${isoDate}.json`;

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error("[diagnostics/export] error:", err);
    return sendError(res, 500, (err as Error).message ?? "Errore export diagnostica");
  }
});

export default router;
