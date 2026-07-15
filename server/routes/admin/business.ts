import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { sendError } from "../../lib/api-response";
import { storage } from "../../storage";
import { businessSchema, businessUpdateSchema, type InsertBusiness } from "@shared/db";
import { isUniqueViolation } from "../../lib/db-errors";

const router = Router();

const DEFAULT_RADIUS_M = 150;
const DEFAULT_MAX_SPEED_KMH = 60;

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function getReachConfig(): Promise<{ radiusM: number; maxSpeedKmh: number }> {
  const radiusSetting = await storage.getAppSetting("business_reach_radius_m");
  const speedSetting = await storage.getAppSetting("business_reach_max_speed_kmh");
  const radiusM = Number(radiusSetting?.value) || DEFAULT_RADIUS_M;
  const maxSpeedKmh = Number(speedSetting?.value) || DEFAULT_MAX_SPEED_KMH;
  return { radiusM, maxSpeedKmh };
}

// ── Config (raggio passaggi qualificati) ──────────────────────────────────────
router.get("/business/config", async (_req: Request, res: Response) => {
  try {
    const config = await getReachConfig();
    return res.json(config);
  } catch (_error) {
    return sendError(res, 500, "Errore lettura configurazione reach");
  }
});

router.put("/business/config", async (req: Request, res: Response) => {
  try {
    const radiusM = Number(req.body?.radiusM);
    const maxSpeedKmh = Number(req.body?.maxSpeedKmh);
    if (Number.isFinite(radiusM) && radiusM > 0) {
      await storage.upsertAppSetting("business_reach_radius_m", String(Math.round(radiusM)));
    }
    if (Number.isFinite(maxSpeedKmh) && maxSpeedKmh > 0) {
      await storage.upsertAppSetting("business_reach_max_speed_kmh", String(Math.round(maxSpeedKmh)));
    }
    return res.json(await getReachConfig());
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio configurazione reach");
  }
});

// ── Report reach mensile (aggregato) ──────────────────────────────────────────
router.get("/business/report", async (req: Request, res: Response) => {
  try {
    const month = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month
      : currentMonth();
    const report = await storage.getBusinessReport(month);
    return res.json({ month, report });
  } catch (_error) {
    return sendError(res, 500, "Errore generazione report reach");
  }
});

// Ricalcola i passaggi qualificati per tutti i business per un mese.
router.post("/business/recompute-passages", async (req: Request, res: Response) => {
  try {
    const month = typeof req.body?.month === "string" && /^\d{4}-\d{2}$/.test(req.body.month)
      ? req.body.month
      : currentMonth();
    const { radiusM, maxSpeedKmh } = await getReachConfig();
    const all = await storage.getBusinesses();
    let computed = 0;
    for (const b of all) {
      if (b.latitude == null || b.longitude == null) continue;
      await storage.computeQualifiedPassages(b.id, month, radiusM, maxSpeedKmh);
      computed += 1;
    }
    return res.json({ month, computed });
  } catch (_error) {
    return sendError(res, 500, "Errore ricalcolo passaggi");
  }
});

// ── Bulk toggle visibilità ────────────────────────────────────────────────────
router.post("/business/bulk-toggle", async (req: Request, res: Response) => {
  try {
    const isActive = req.body?.isActive === true;
    const affected = await storage.setAllBusinessesActive(isActive);
    return res.json({ isActive, affected });
  } catch (_error) {
    return sendError(res, 500, "Errore toggle massivo");
  }
});

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.get("/business", async (_req: Request, res: Response) => {
  try {
    return res.json(await storage.getBusinesses());
  } catch (_error) {
    return sendError(res, 500, "Errore lettura business");
  }
});

router.get("/business/:id", async (req: Request, res: Response) => {
  try {
    const biz = await storage.getBusiness(String(req.params.id));
    if (!biz) return sendError(res, 404, "Business non trovato");
    return res.json(biz);
  } catch (_error) {
    return sendError(res, 500, "Errore lettura business");
  }
});

router.post("/business", async (req: Request, res: Response) => {
  try {
    const parsed = businessSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const biz = await storage.createBusiness(parsed.data as InsertBusiness);
    return res.status(201).json(biz);
  } catch (error) {
    // Task #13 — vincolo UNIQUE su LOWER(email) (migrations/0142_*.sql).
    if (isUniqueViolation(error, "businesses_email_lower_uq")) {
      return sendError(res, 409, "Email già in uso da un altro business");
    }
    return sendError(res, 500, "Errore creazione business");
  }
});

router.put("/business/:id", async (req: Request, res: Response) => {
  try {
    const parsed = businessUpdateSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const biz = await storage.updateBusiness(String(req.params.id), parsed.data as Partial<InsertBusiness>);
    if (!biz) return sendError(res, 404, "Business non trovato");
    return res.json(biz);
  } catch (error) {
    if (isUniqueViolation(error, "businesses_email_lower_uq")) {
      return sendError(res, 409, "Email già in uso da un altro business");
    }
    return sendError(res, 500, "Errore aggiornamento business");
  }
});

router.put("/business/:id/approve", async (req: Request, res: Response) => {
  try {
    const biz = await storage.updateBusiness(String(req.params.id), { isApproved: true });
    if (!biz) return sendError(res, 404, "Business non trovato");
    return res.json(biz);
  } catch (_error) {
    return sendError(res, 500, "Errore approvazione business");
  }
});

// Genera (o rigenera) il token di accesso self-service del business (Task #4917).
// Con questo token il titolare consulta i PROPRI numeri aggregati senza account.
router.post("/business/:id/access-token", async (req: Request, res: Response) => {
  try {
    const token = randomBytes(24).toString("base64url");
    const biz = await storage.setBusinessAccessToken(String(req.params.id), token);
    if (!biz) return sendError(res, 404, "Business non trovato");
    return res.json({ id: biz.id, accessToken: biz.accessToken });
  } catch (_error) {
    return sendError(res, 500, "Errore generazione token accesso");
  }
});

// Revoca il token di accesso self-service (disattiva la vista titolare).
router.delete("/business/:id/access-token", async (req: Request, res: Response) => {
  try {
    const biz = await storage.setBusinessAccessToken(String(req.params.id), null);
    if (!biz) return sendError(res, 404, "Business non trovato");
    return res.json({ id: biz.id, accessToken: null });
  } catch (_error) {
    return sendError(res, 500, "Errore revoca token accesso");
  }
});

// Toggle visibilità singolo business (on/off marketing).
router.put("/business/:id/toggle", async (req: Request, res: Response) => {
  try {
    const isActive = req.body?.isActive === true;
    const biz = await storage.updateBusiness(String(req.params.id), { isActive });
    if (!biz) return sendError(res, 404, "Business non trovato");
    return res.json(biz);
  } catch (_error) {
    return sendError(res, 500, "Errore toggle business");
  }
});

router.delete("/business/:id", async (req: Request, res: Response) => {
  try {
    await storage.deleteBusiness(String(req.params.id));
    return res.json({ ok: true });
  } catch (_error) {
    return sendError(res, 500, "Errore eliminazione business");
  }
});

export default router;
