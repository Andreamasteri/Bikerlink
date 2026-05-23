import { sendError, sendSuccess } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { adCampaigns as adCampaignsTable, moderatorLogs, motoClubs, motoClubRequests } from "@shared/db";
import { workshopSchema, easterEggSchema, easterEggBatchSchema, reportResolveSchema } from "@shared/validators";
import { eq, sql, desc, inArray } from "drizzle-orm";
import { massSeedFakeUsers, getMassSeedStatus } from "../../mass-seed";
import { setMotionEnabled, getMotionStatus } from "../../motion-simulator";

const router = Router();

// Workshops
router.get("/workshops", async (_req: Request, res: Response) => {
  try {
    const workshops = await storage.getWorkshops();
    return res.json(workshops);
  } catch (error) {
    return sendError(res, 500, "Errore lettura officine");
  }
});

router.post("/workshops", async (req: Request, res: Response) => {
  try {
    const parsed = workshopSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const workshop = await storage.createWorkshop(parsed.data as any);
    return res.status(201).json(workshop);
  } catch (error) {
    return sendError(res, 500, "Errore creazione officina");
  }
});

// Easter Eggs
router.get("/easter-eggs", async (_req: Request, res: Response) => {
  try {
    const eggs = await storage.getEasterEggs();
    return res.json(eggs);
  } catch (error) {
    return sendError(res, 500, "Errore lettura easter eggs");
  }
});

router.post("/easter-eggs", async (req: Request, res: Response) => {
  try {
    const parsed = easterEggSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const egg = await storage.createEasterEgg(parsed.data as any);
    return res.status(201).json(egg);
  } catch (error) {
    return sendError(res, 500, "Errore creazione easter egg");
  }
});

// Campaigns
router.get("/campaigns", async (_req: Request, res: Response) => {
  try {
    const campaigns = await storage.getAllCampaigns();
    return res.json(campaigns);
  } catch (error) {
    return sendError(res, 500, "Errore lettura campagne");
  }
});

// Reports
router.get("/reports", async (req: Request, res: Response) => {
  try {
    const reports = await storage.getReports();
    return res.json(reports);
  } catch (error) {
    return sendError(res, 500, "Errore lettura segnalazioni");
  }
});

router.put("/reports/:id/resolve", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const parsed = reportResolveSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    // Assuming resolveReport exists or using a generic update
    const [report] = await db.update(moderatorLogs)
        .set({ details: `resolved at ${new Date().toISOString()}` })
        .where(eq(moderatorLogs.id, id as string))
        .returning();
    return res.json(report);
  } catch (error) {
    return sendError(res, 500, "Errore risoluzione segnalazione");
  }
});

// MotoClubs
router.get("/motoclubs", async (_req: Request, res: Response) => {
  try {
    const clubs = await db.select().from(motoClubs);
    return res.json(clubs);
  } catch (error) {
    return sendError(res, 500, "Errore lettura motoclub");
  }
});

router.get("/motoclubs/requests", async (_req: Request, res: Response) => {
  try {
    const requests = await db.select().from(motoClubRequests).where(eq(motoClubRequests.status, "pending"));
    return res.json(requests);
  } catch (error) {
    return sendError(res, 500, "Errore lettura richieste motoclub");
  }
});

// Logs
router.get("/logs", async (_req: Request, res: Response) => {
  try {
    const logs = await storage.getModeratorLogs();
    return res.json(logs);
  } catch (error) {
    return sendError(res, 500, "Errore lettura log");
  }
});

router.get("/moderator-logs", async (req: Request, res: Response) => {
  try {
    const logs = await storage.getModeratorLogs();
    return res.json({ logs, total: logs.length });
  } catch (error) {
    return sendError(res, 500, "Errore lettura log moderatori");
  }
});

// Mass seed
router.post("/mass-seed-fake-users", async (_req: Request, res: Response) => {
  try {
    const status = await getMassSeedStatus();
    if (status.running) return sendError(res, 409, "already_running");
    massSeedFakeUsers().catch((e: unknown) => {
      console.error("[mass-seed] background error:", e);
    });
    return sendSuccess(res, { status: "started" });
  } catch (error) {
    return sendError(res, 500, "Errore avvio mass seed");
  }
});

router.get("/mass-seed-status", async (_req: Request, res: Response) => {
  try {
    const status = await getMassSeedStatus();
    return sendSuccess(res, status as unknown as Record<string, unknown>);
  } catch (error) {
    return sendError(res, 500, "Errore lettura stato mass seed");
  }
});

// GraphHopper status (stub — non configurato)
router.get("/graphhopper-status", (_req: Request, res: Response) => {
  return sendSuccess(res, { mode: "disabled", healthy: false, profile: null, reason: "Server GraphHopper non configurato" });
});

// Cache cleanup (stub — svuota cache in-memory future)
router.post("/cache/cleanup", (_req: Request, res: Response) => {
  return sendSuccess(res, { cleaned: true });
});

// ── Motion simulator — spec-required paths (/api/admin/motion/*) ─────────────
// These are aliases of the stregatti-namespaced routes for API contract compliance.

router.get("/motion/status", (_req: Request, res: Response) => {
  try {
    return res.json(getMotionStatus());
  } catch {
    return sendError(res, 500, "Errore stato motion");
  }
});

router.post("/motion/toggle", async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return sendError(res, 400, "Campo 'enabled' booleano richiesto");
    }
    await setMotionEnabled(enabled);
    return res.json(getMotionStatus());
  } catch (err) {
    console.error("[MOTION] toggle error:", err);
    return sendError(res, 500, "Errore toggle motion");
  }
});

export default router;
