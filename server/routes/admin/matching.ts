import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { gpsRejectionStats } from "@shared/db";
import { sendSuccess, sendError } from "../../lib/api-response";
import { sql, desc } from "drizzle-orm";

const router = Router();

router.get("/gps-errors", async (req: Request, res: Response) => {
  try {
    return res.json({ errors: [] });
  } catch (error) {
    return sendError(res, 500, "Errore lettura errori GPS");
  }
});

router.get("/gps-rejections", async (req: Request, res: Response) => {
  try {
    const stats = await db.select().from(gpsRejectionStats).orderBy(desc(gpsRejectionStats.lastRejectedAt)).limit(100);
    return res.json(stats);
  } catch (error) {
    return sendError(res, 500, "Errore lettura rifiuti GPS");
  }
});

router.get("/matching-stats", async (_req: Request, res: Response) => {
  try {
    return res.json({ stats: {} });
  } catch (error) {
    return sendError(res, 500, "Errore lettura statistiche matching");
  }
});

router.get("/match-settings", async (_req: Request, res: Response) => {
  try {
    return res.json({ settings: {} });
  } catch (error) {
    return sendError(res, 500, "Errore lettura settings matching");
  }
});

router.get("/match-health", async (req: Request, res: Response) => {
  try {
    return res.json({ health: "ok" });
  } catch (error) {
    return sendError(res, 500, "Errore lettura salute matching");
  }
});

router.post("/match-settings/reset-all", async (_req: Request, res: Response) => {
  try {
    return sendSuccess(res);
  } catch (error) {
    return sendError(res, 500, "Errore reset settings matching");
  }
});

router.post("/matches/recalculate-all", async (_req: Request, res: Response) => {
  try {
    return sendSuccess(res);
  } catch (error) {
    return sendError(res, 500, "Errore ricalcolo matching");
  }
});

export default router;
