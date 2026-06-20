import { sendError, sendSuccess } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { motoClubs, motoClubRequests } from "@shared/db";
import { workshopSchema, easterEggSchema, reportResolveSchema } from "@shared/validators";
import { eq } from "drizzle-orm";
import { massSeedFakeUsers, getMassSeedStatus } from "../../mass-seed";
import { getMotionStatus } from "../../motion-simulator";
import { getServerInfo, isSelfHosted, ACTIVE_PROFILE, GH_BASE_URL, isRoutingEnabled } from "../../graphhopper-client";

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

router.put("/workshops/:id/approve", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const workshop = await storage.updateWorkshop(id, { isApproved: true });
    if (!workshop) return sendError(res, 404, "Officina non trovata");
    return res.json(workshop);
  } catch (_error) {
    return sendError(res, 500, "Errore approvazione officina");
  }
});

router.delete("/workshops/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const existing = await storage.getWorkshop(id);
    if (!existing) return sendError(res, 404, "Officina non trovata");
    await storage.deleteWorkshop(id);
    return res.json({ deleted: true });
  } catch (_error) {
    return sendError(res, 500, "Errore eliminazione officina");
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

// Task #2530 — Reports: filtri estesi + masking reporter + fix resolve bug
router.get("/reports", async (req: Request, res: Response) => {
  try {
    const { maskReporterId } = await import("../../services/reportingService");
    const viewerId = req.session?.userId as string | undefined;
    const viewer = viewerId ? await storage.getUser(viewerId) : null;
    const viewerRole = viewer?.role;

    const filtered = await storage.getReportsFiltered({
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      category: typeof req.query.category === "string" ? req.query.category : undefined,
      severity: typeof req.query.severity === "string" ? req.query.severity : undefined,
      context: typeof req.query.context === "string" ? req.query.context : undefined,
      reportedUserId: typeof req.query.reportedUserId === "string" ? req.query.reportedUserId : undefined,
      limit: req.query.limit ? Math.min(500, parseInt(String(req.query.limit), 10) || 200) : 200,
    });

    const masked = filtered.map((r) => ({
      ...r,
      reporterId: maskReporterId(r.reporterId, viewerRole),
      _reporterMasked: viewerRole !== "admin",
    }));
    return res.json(masked);
  } catch (err) {
    console.error("[Admin] getReports error:", err);
    return sendError(res, 500, "Errore lettura segnalazioni");
  }
});

router.put("/reports/:id/resolve", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? "");
    const parsed = reportResolveSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const modId = (req.session?.userId as string | undefined) ?? "system";
    const report = await storage.resolveReport(id, { status: parsed.data.status, resolvedBy: modId });
    if (!report) return sendError(res, 404, "Segnalazione non trovata");
    // Audit log (non-fatal)
    storage.createModeratorLog({
      moderatorId: modId,
      action: parsed.data.status === "resolved" ? "report_resolved" : "report_dismissed",
      targetType: "report",
      targetId: id,
      details: `report->${parsed.data.status}; reportedUserId=${report.reportedUserId}`,
    }).catch(() => {});
    return res.json(report);
  } catch (err) {
    console.error("[Admin] resolveReport error:", err);
    return sendError(res, 500, "Errore risoluzione segnalazione");
  }
});

// Task #2530 — Reporter "abusivi" (>=2 dismissed): pannello dedicato
router.get("/false-reports", async (req: Request, res: Response) => {
  try {
    const { getFalseReporters } = await import("../../services/reportingService");
    const limit = req.query.limit ? Math.min(200, parseInt(String(req.query.limit), 10) || 100) : 100;
    const rows = await getFalseReporters({ limit });
    return res.json({ reporters: rows, total: rows.length });
  } catch (err) {
    console.error("[Admin] false-reports error:", err);
    return sendError(res, 500, "Errore lettura false segnalazioni");
  }
});

// Task #2530 — soglie configurabili (read/write) per ruolo
router.get("/moderation-thresholds", async (_req: Request, res: Response) => {
  try {
    const { moderationThresholds } = await import("@shared/db");
    const rows = await db.select().from(moderationThresholds);
    return res.json({ thresholds: rows });
  } catch (err) {
    console.error("[Admin] thresholds get error:", err);
    return sendError(res, 500, "Errore lettura soglie");
  }
});

router.put("/moderation-thresholds", async (req: Request, res: Response) => {
  try {
    const { moderationThresholds } = await import("@shared/db");
    const { targetRole, action, threshold } = req.body ?? {};
    if (!["biker", "zavorrina"].includes(String(targetRole))) return sendError(res, 400, "targetRole non valido");
    if (!["notify", "shadow_ban"].includes(String(action))) return sendError(res, 400, "action non valida");
    const t = parseInt(String(threshold), 10);
    if (!Number.isFinite(t) || t < 1 || t > 100) return sendError(res, 400, "threshold deve essere 1..100");
    const [row] = await db.insert(moderationThresholds)
      .values({ targetRole, action, threshold: t, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [moderationThresholds.targetRole, moderationThresholds.action],
        set: { threshold: t, updatedAt: new Date() },
      })
      .returning();
    return res.json({ threshold: row });
  } catch (err) {
    console.error("[Admin] thresholds put error:", err);
    return sendError(res, 500, "Errore aggiornamento soglie");
  }
});

// Task #2530 — lift shadow-ban manuale
router.post("/users/:id/unshadowban", async (req: Request, res: Response) => {
  try {
    const { users } = await import("@shared/db");
    const targetId = String(req.params.id);
    const modId = (req.session?.userId as string | undefined) ?? "system";
    const [updated] = await db.update(users)
      .set({ shadowBannedAt: null, shadowBanReason: null, shadowBannedUntil: null })
      .where(eq(users.id, targetId))
      .returning();
    if (!updated) return sendError(res, 404, "Utente non trovato");
    storage.createModeratorLog({
      moderatorId: modId,
      action: "shadow_ban_lifted",
      targetType: "user",
      targetId,
      details: "moderatore ha rimosso lo shadow-ban",
    }).catch(() => {});
    return sendSuccess(res, { id: targetId });
  } catch (err) {
    console.error("[Admin] unshadowban error:", err);
    return sendError(res, 500, "Errore rimozione shadow-ban");
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

// GraphHopper status — stato reale del motore di routing.
// mode: disabled (kill-switch off) | self-hosted | cloud. healthy riflette un
// probe robusto (/health, con fallback a una vera /route) così il routing
// funzionante non viene segnalato come "Errore".
function maskGhHost(u: string): string {
  try {
    const p = new URL(u);
    return `${p.protocol}//${p.hostname}`;
  } catch {
    return "—";
  }
}

router.get("/graphhopper-status", async (_req: Request, res: Response) => {
  try {
    const routingEnabled = await isRoutingEnabled();
    if (!routingEnabled) {
      return sendSuccess(res, {
        mode: "disabled",
        profile: ACTIVE_PROFILE,
        healthy: false,
        url: maskGhHost(GH_BASE_URL),
        reason: "Routing disabilitato via kill-switch",
      });
    }
    const info = await getServerInfo();
    const healthy = info.status !== "error" && info.status !== "disabled";
    return sendSuccess(res, {
      mode: isSelfHosted ? "self-hosted" : "cloud",
      profile: ACTIVE_PROFILE,
      healthy,
      url: maskGhHost(GH_BASE_URL),
    });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura stato GraphHopper");
  }
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

// NOTE: The "/motion/toggle" endpoint was a duplicate of the one in
// routes/admin/stregatti.ts. It has been removed and consolidated there
// (now the unified "attività stregatti" toggle: motion + availability rotation).

export default router;
