/**
 * Task #86 — Endpoint admin per le due scansioni complete on-demand di Horus.
 *
 * Montato sotto /api/admin/horus-scan (vedi admin.ts). È il secondo punto di
 * trigger (oltre alla chat): un comando/azione dal pannello admin. Espone:
 *   GET  /status  → stato di avanzamento delle due scansioni + ultimo esito
 *                   analisi + info manuale (per il controllo avanzamento/risultati)
 *   POST /start   → { mode: "analysis" | "manual" } avvia la scansione richiesta
 *
 * NESSUN avvio automatico: le scansioni partono solo da questi trigger espliciti.
 * Horus resta in sola lettura.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { sendError, sendSuccess } from "../../lib/api-response";
import { db } from "../../db";
import { aiAnalysisRuns, aiAnalysisArtifacts } from "@shared/db";
import { startHorusScan, getAllHorusScanStatus } from "../../ai/assistant/horus-scanner";
import { getNadirManual, getNadirManualPrevious } from "../../ai/nadir/manual";

const router = Router();

const startSchema = z.object({
  mode: z.enum(["analysis", "manual"]),
});

router.get("/status", async (_req: Request, res: Response) => {
  try {
    const scans = getAllHorusScanStatus();

    // Ultimo esito dell'analisi codice+DB (trigger repo-study, persona horus).
    const [lastRun] = await db
      .select({
        id: aiAnalysisRuns.id,
        createdAt: aiAnalysisRuns.createdAt,
        status: aiAnalysisRuns.status,
        summary: aiAnalysisRuns.summary,
        modelId: aiAnalysisRuns.modelId,
      })
      .from(aiAnalysisRuns)
      .where(eq(aiAnalysisRuns.trigger, "repo-study"))
      .orderBy(desc(aiAnalysisRuns.createdAt))
      .limit(1);

    let lastAnalysis: {
      id: string;
      createdAt: Date;
      status: string;
      summary: string | null;
      modelId: string | null;
      proposals: string | null;
    } | null = null;
    if (lastRun) {
      const [proposalArtifact] = await db
        .select({ content: aiAnalysisArtifacts.content })
        .from(aiAnalysisArtifacts)
        .where(eq(aiAnalysisArtifacts.runId, lastRun.id))
        .orderBy(desc(aiAnalysisArtifacts.createdAt))
        .limit(1);
      lastAnalysis = { ...lastRun, proposals: proposalArtifact?.content ?? null };
    }

    const [manual, manualPrev] = await Promise.all([getNadirManual(), getNadirManualPrevious()]);

    return sendSuccess(res, {
      scans,
      lastAnalysis,
      manual: {
        length: manual.length,
        hasPrevious: !!manualPrev,
        previousSavedAt: manualPrev?.savedAt ?? null,
        // Il testo completo del manuale è leggibile da GET /api/admin/nadir/manual.
      },
    });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore lettura stato scansioni Horus");
  }
});

router.post("/start", async (req: Request, res: Response) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Parametro 'mode' non valido (analysis|manual)");
  }
  try {
    const result = await startHorusScan(parsed.data.mode);
    console.info(
      `[admin/horus-scan] start mode=${parsed.data.mode} started=${result.started} reason=${result.reason ?? "-"}`,
    );
    return sendSuccess(res, {
      started: result.started,
      reason: result.reason ?? null,
      status: result.status,
    });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore avvio scansione Horus");
  }
});

export default router;
