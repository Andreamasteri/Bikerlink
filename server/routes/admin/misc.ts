import { sendError, sendSuccess } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { moderatorLogs, motoClubs, motoClubRequests } from "@shared/db";
import { workshopSchema, easterEggSchema, reportResolveSchema } from "@shared/validators";
import { eq } from "drizzle-orm";
import { massSeedFakeUsers, getMassSeedStatus } from "../../mass-seed";
import { setMotionEnabled, getMotionStatus } from "../../motion-simulator";

const router = Router();

// Workshops
router.get("/workshops", async (_req: Request, res: Response) => {
  try {
    const workshops = await storage.getWorkshops();
    return res.json(workshops);
  } catch (_error) {
    return sendError(res, 500, "Errore lettura officine");
  }
});

router.post("/workshops", async (req: Request, res: Response) => {
  try {
    const parsed = workshopSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const workshop = await storage.createWorkshop(parsed.data as import("@shared/db").InsertWorkshop);
    return res.status(201).json(workshop);
  } catch (_error) {
    return sendError(res, 500, "Errore creazione officina");
  }
});

// Easter Eggs
router.get("/easter-eggs", async (_req: Request, res: Response) => {
  try {
    const eggs = await storage.getEasterEggs();
    return res.json(eggs);
  } catch (_error) {
    return sendError(res, 500, "Errore lettura easter eggs");
  }
});

router.post("/easter-eggs", async (req: Request, res: Response) => {
  try {
    const parsed = easterEggSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const egg = await storage.createEasterEgg(parsed.data as import("@shared/db").InsertEasterEgg);
    return res.status(201).json(egg);
  } catch (_error) {
    return sendError(res, 500, "Errore creazione easter egg");
  }
});

// Campaigns
router.get("/campaigns", async (_req: Request, res: Response) => {
  try {
    const campaigns = await storage.getAllCampaigns();
    return res.json(campaigns);
  } catch (_error) {
    return sendError(res, 500, "Errore lettura campagne");
  }
});

// Reports
router.get("/reports", async (req: Request, res: Response) => {
  try {
    const reports = await storage.getReports();
    return res.json(reports);
  } catch (_error) {
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
  } catch (_error) {
    return sendError(res, 500, "Errore risoluzione segnalazione");
  }
});

// MotoClubs
router.get("/motoclubs", async (_req: Request, res: Response) => {
  try {
    const clubs = await db.select().from(motoClubs);
    return res.json(clubs);
  } catch (_error) {
    return sendError(res, 500, "Errore lettura motoclub");
  }
});

router.get("/motoclubs/requests", async (_req: Request, res: Response) => {
  try {
    const requests = await db.select().from(motoClubRequests).where(eq(motoClubRequests.status, "pending"));
    return res.json(requests);
  } catch (_error) {
    return sendError(res, 500, "Errore lettura richieste motoclub");
  }
});

// Logs
router.get("/logs", async (_req: Request, res: Response) => {
  try {
    const logs = await storage.getModeratorLogs();
    return res.json(logs);
  } catch (_error) {
    return sendError(res, 500, "Errore lettura log");
  }
});

router.get("/moderator-logs", async (req: Request, res: Response) => {
  try {
    const logs = await storage.getModeratorLogs();
    return res.json({ logs, total: logs.length });
  } catch (_error) {
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
  } catch (_error) {
    return sendError(res, 500, "Errore avvio mass seed");
  }
});

router.get("/mass-seed-status", async (_req: Request, res: Response) => {
  try {
    const status = await getMassSeedStatus();
    return sendSuccess(res, status as unknown as Record<string, unknown>);
  } catch (_error) {
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

// ── Road hazards admin endpoints ──────────────────────────────────────────────

router.get("/settings/road-hazards-enabled", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("road_hazards_enabled");
    const enabled = setting?.value !== "false";
    return sendSuccess(res, { enabled });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura impostazione");
  }
});

router.post("/settings/road-hazards-enabled", async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") return sendError(res, 400, "Campo 'enabled' booleano richiesto");
    await storage.upsertAppSetting("road_hazards_enabled", String(enabled));
    return sendSuccess(res, { enabled });
  } catch (_error) {
    return sendError(res, 500, "Errore aggiornamento impostazione");
  }
});

router.get("/road-hazards", async (req: Request, res: Response) => {
  try {
    const { roadHazards } = await import("@shared/db");
    const { isNull, desc } = await import("drizzle-orm");
    const limit = Math.min(parseInt(String(req.query.limit ?? "30"), 10) || 30, 100);
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const rows = await db.select().from(roadHazards)
      .where(isNull(roadHazards.deletedAt))
      .orderBy(desc(roadHazards.createdAt))
      .limit(limit).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(roadHazards).where(isNull(roadHazards.deletedAt));
    return sendSuccess(res, { hazards: rows, total: Number(count) });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura segnalazioni");
  }
});

router.post("/road-hazards/:id/approve", async (req: Request, res: Response) => {
  try {
    const { roadHazards } = await import("@shared/db");
    const { eq } = await import("drizzle-orm");
    const hazardId = String(req.params.id);
    const [updated] = await db.update(roadHazards)
      .set({ isApproved: true })
      .where(eq(roadHazards.id, hazardId))
      .returning();
    if (!updated) return sendError(res, 404, "Segnalazione non trovata");
    return sendSuccess(res, { hazard: updated });
  } catch (_error) {
    return sendError(res, 500, "Errore approvazione segnalazione");
  }
});

router.delete("/road-hazards/:id", async (req: Request, res: Response) => {
  try {
    const { roadHazards } = await import("@shared/db");
    const { eq } = await import("drizzle-orm");
    const hazardId = String(req.params.id);
    const [updated] = await db.update(roadHazards)
      .set({ deletedAt: new Date() })
      .where(eq(roadHazards.id, hazardId))
      .returning();
    if (!updated) return sendError(res, 404, "Segnalazione non trovata");
    return sendSuccess(res, { deleted: true });
  } catch (_error) {
    return sendError(res, 500, "Errore eliminazione segnalazione");
  }
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
