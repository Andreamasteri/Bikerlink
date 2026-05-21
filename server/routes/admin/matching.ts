import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { gpsRejectionStats } from "@shared/schema";
import { sql, desc } from "drizzle-orm";

const router = Router();

router.get("/gps-errors", async (req: Request, res: Response) => {
  try {
    return res.json({ errors: [] });
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura errori GPS" });
  }
});

router.get("/gps-rejections", async (req: Request, res: Response) => {
  try {
    const stats = await db.select().from(gpsRejectionStats).orderBy(desc(gpsRejectionStats.rejectedAt)).limit(100);
    return res.json(stats);
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura rifiuti GPS" });
  }
});

router.get("/matching-stats", async (_req: Request, res: Response) => {
  try {
    return res.json({ stats: {} });
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura statistiche matching" });
  }
});

router.get("/match-settings", async (_req: Request, res: Response) => {
  try {
    return res.json({ settings: {} });
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura settings matching" });
  }
});

router.get("/match-health", async (req: Request, res: Response) => {
  try {
    return res.json({ health: "ok" });
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura salute matching" });
  }
});

router.post("/match-settings/reset-all", async (_req: Request, res: Response) => {
  try {
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: "Errore reset settings matching" });
  }
});

router.post("/matches/recalculate-all", async (_req: Request, res: Response) => {
  try {
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: "Errore ricalcolo matching" });
  }
});

export default router;
