/**
 * Nadir — endpoint admin (Task #75, step 1 & 5).
 *
 * Montato sotto /api/admin/nadir (vedi admin.ts). Espone:
 *   GET  /manual   → { text }                        (legge il manuale)
 *   PUT  /manual   → { text }                         (salva il manuale)
 *   GET  /status   → stato aggregato per il pannello  (reindex, salute, conteggi)
 *   POST /reindex  → reindicizza ORA + sonda salute   (trigger manuale)
 *   POST /search   → ricerca semantica di prova       (debug/test)
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sendError, sendSuccess } from "../../lib/api-response";
import {
  getNadirManual,
  saveNadirManual,
  getNadirStatus,
  reindexNadir,
  runNadirSearchHealthProbe,
  searchNadir,
  NADIR_LOG_PREFIX,
} from "../../ai/nadir";

const router = Router();

const manualSchema = z.object({
  text: z.string().max(200_000),
});

const searchSchema = z.object({
  query: z.string().min(1).max(2_000),
  limit: z.number().int().min(1).max(10).optional(),
});

router.get("/manual", async (_req: Request, res: Response) => {
  try {
    const text = await getNadirManual();
    return sendSuccess(res, { text });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore lettura manuale Nadir");
  }
});

router.put("/manual", async (req: Request, res: Response) => {
  const parsed = manualSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Body non valido");
  try {
    const saved = await saveNadirManual(parsed.data.text);
    return sendSuccess(res, { text: saved, length: saved.length });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore salvataggio manuale Nadir");
  }
});

router.get("/status", async (_req: Request, res: Response) => {
  try {
    const status = await getNadirStatus();
    return sendSuccess(res, status as unknown as Record<string, unknown>);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore stato Nadir");
  }
});

router.post("/reindex", async (_req: Request, res: Response) => {
  try {
    console.log(`${NADIR_LOG_PREFIX} reindicizzazione manuale richiesta da admin`);
    // Reindicizza (tollerante) e poi esercita la ricerca (allarme reale se rotta).
    const indexStatus = await reindexNadir("manual");
    const searchHealth = await runNadirSearchHealthProbe("manual");
    return sendSuccess(res, { indexStatus, searchHealth });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore reindicizzazione Nadir");
  }
});

router.post("/search", async (req: Request, res: Response) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Body non valido");
  try {
    // Route montata dietro _requireAdmin: contesto admin → può cercare tra le
    // conversazioni di tutti gli utenti (includeAllUsers).
    const result = await searchNadir(parsed.data.query, parsed.data.limit ?? 5, {
      includeAllUsers: true,
    });
    return sendSuccess(res, result as unknown as Record<string, unknown>);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore ricerca Nadir");
  }
});

export default router;
