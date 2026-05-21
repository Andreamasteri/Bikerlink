import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { workshopSchema, easterEggSchema, easterEggBatchSchema, reportResolveSchema, adCampaigns as adCampaignsTable, moderatorLogs, motoClubs, motoClubRequests } from "@shared/schema";
import { eq, sql, desc, inArray } from "drizzle-orm";

const router = Router();

// Workshops
router.get("/workshops", async (_req: Request, res: Response) => {
  try {
    const workshops = await storage.getWorkshops();
    return res.json(workshops);
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura officine" });
  }
});

router.post("/workshops", async (req: Request, res: Response) => {
  try {
    const parsed = workshopSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const workshop = await storage.createWorkshop(parsed.data as any);
    return res.status(201).json(workshop);
  } catch (error) {
    return res.status(500).json({ message: "Errore creazione officina" });
  }
});

// Easter Eggs
router.get("/easter-eggs", async (_req: Request, res: Response) => {
  try {
    const eggs = await storage.getEasterEggs();
    return res.json(eggs);
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura easter eggs" });
  }
});

router.post("/easter-eggs", async (req: Request, res: Response) => {
  try {
    const parsed = easterEggSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const egg = await storage.createEasterEgg(parsed.data as any);
    return res.status(201).json(egg);
  } catch (error) {
    return res.status(500).json({ message: "Errore creazione easter egg" });
  }
});

// Campaigns
router.get("/campaigns", async (_req: Request, res: Response) => {
  try {
    const campaigns = await storage.getAllCampaigns();
    return res.json(campaigns);
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura campagne" });
  }
});

// Reports
router.get("/reports", async (req: Request, res: Response) => {
  try {
    const reports = await storage.getReports();
    return res.json(reports);
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura segnalazioni" });
  }
});

router.put("/reports/:id/resolve", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const parsed = reportResolveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    // Assuming resolveReport exists or using a generic update
    const [report] = await db.update(moderatorLogs)
        .set({ resolvedAt: new Date() })
        .where(eq(moderatorLogs.id, parseInt(id)))
        .returning();
    return res.json(report);
  } catch (error) {
    return res.status(500).json({ message: "Errore risoluzione segnalazione" });
  }
});

// MotoClubs
router.get("/motoclubs", async (_req: Request, res: Response) => {
  try {
    const clubs = await db.select().from(motoClubs);
    return res.json(clubs);
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura motoclub" });
  }
});

router.get("/motoclubs/requests", async (_req: Request, res: Response) => {
  try {
    const requests = await db.select().from(motoClubRequests).where(eq(motoClubRequests.status, "pending"));
    return res.json(requests);
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura richieste motoclub" });
  }
});

// Logs
router.get("/logs", async (_req: Request, res: Response) => {
  try {
    const logs = await storage.getModeratorLogs();
    return res.json(logs);
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura log" });
  }
});

router.get("/moderator-logs", async (req: Request, res: Response) => {
  try {
    const logs = await storage.getModeratorLogs();
    return res.json({ logs, total: logs.length });
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura log moderatori" });
  }
});

export default router;
