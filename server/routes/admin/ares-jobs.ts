/**
 * Ares Jobs — endpoint admin (Task #87).
 *
 * Montato sotto /api/admin/ares (vedi admin.ts). Trigger dal pannello admin per
 * i due job long-running di Ares (analisi codice+DB e generazione manuale), più
 * lettura dello stato/risultati e recupero del manuale precedente.
 *
 *   POST /jobs/:mode/start   → avvia il job (mode = analysis | manual)
 *   POST /jobs/:mode/stop    → interrompe il job in corso
 *   GET  /jobs               → stato di entrambi i job
 *   GET  /jobs/:mode         → stato di un job (incluso il risultato se completo)
 *   GET  /manual/previous    → versione precedente del manuale (backup)
 *
 * Nessuna esecuzione automatica: i job partono SOLO da qui o da Bowie in chat.
 */
import { Router, type Request, type Response } from "express";
import { sendError, sendSuccess } from "../../lib/api-response";
import {
  startAresJob,
  stopAresJob,
  getAresJobStatus,
  getAllAresJobStatuses,
  type AresJobMode,
} from "../../ai/ares-jobs";
import { getNadirManualPrevious } from "../../ai/nadir";

const router = Router();

function parseMode(raw: unknown): AresJobMode | null {
  const s = String(raw ?? "");
  return s === "analysis" || s === "manual" ? s : null;
}

router.get("/jobs", async (_req: Request, res: Response) => {
  try {
    const statuses = await getAllAresJobStatuses();
    return sendSuccess(res, statuses as unknown as Record<string, unknown>);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore stato job Ares");
  }
});

router.get("/jobs/:mode", async (req: Request, res: Response) => {
  const mode = parseMode(req.params.mode);
  if (!mode) return sendError(res, 400, "mode non valido (analysis | manual)");
  try {
    const status = await getAresJobStatus(mode);
    return sendSuccess(res, status as unknown as Record<string, unknown>);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore stato job Ares");
  }
});

router.post("/jobs/:mode/start", async (req: Request, res: Response) => {
  const mode = parseMode(req.params.mode);
  if (!mode) return sendError(res, 400, "mode non valido (analysis | manual)");
  try {
    const adminId = req.session?.userId ?? null;
    const result = await startAresJob(mode, { trigger: "admin-panel", startedBy: adminId });
    if (!result.started) {
      return sendError(res, 409, result.reason ?? "Job non avviato");
    }
    return sendSuccess(res, result as unknown as Record<string, unknown>);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore avvio job Ares");
  }
});

router.post("/jobs/:mode/stop", async (req: Request, res: Response) => {
  const mode = parseMode(req.params.mode);
  if (!mode) return sendError(res, 400, "mode non valido (analysis | manual)");
  try {
    const stopped = await stopAresJob(mode);
    return sendSuccess(res, { stopped });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore stop job Ares");
  }
});

router.get("/manual/previous", async (_req: Request, res: Response) => {
  try {
    const previous = await getNadirManualPrevious();
    return sendSuccess(res, {
      hasPrevious: Boolean(previous),
      savedAt: previous?.savedAt ?? null,
      length: previous?.text.length ?? 0,
      text: previous?.text ?? "",
    });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore lettura manuale precedente");
  }
});

export default router;
