import { Router, type Request, type Response } from "express";
import { db, pool } from "../db";
import {
  roadHazards,
  roadHazardConfirms,
  RECURRING_TYPES,
  createHazardSchema,
} from "@shared/db";
import { eq, and, isNull, or, gt, desc } from "drizzle-orm";
import { requireUserId } from "../lib/auth-middleware";
import { sendError, sendSuccess } from "../lib/api-response";
import { storage } from "../storage";

const router = Router();

const HAZARD_EXPIRY_HOURS = 4;
const RECURRING_CONFIRM_THRESHOLD = 3;
const NEARBY_RADIUS_KM = 50;

function isRecurringType(type: string): boolean {
  return RECURRING_TYPES.includes(type as (typeof RECURRING_TYPES)[number]);
}

async function getRoadHazardsEnabled(): Promise<boolean> {
  const setting = await storage.getAppSetting("road_hazards_enabled");
  return setting?.value !== "false";
}

// ── GET / — active hazards in radius ─────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const enabled = await getRoadHazardsEnabled();
    if (!enabled) {
      return sendSuccess(res, { hazards: [] });
    }

    const userLat = req.query.lat ? parseFloat(req.query.lat as string) : null;
    const userLng = req.query.lng ? parseFloat(req.query.lng as string) : null;
    const radiusKm = req.query.radius ? parseFloat(req.query.radius as string) : NEARBY_RADIUS_KM;

    const now = new Date();
    const rows = await db
      .select()
      .from(roadHazards)
      .where(
        and(
          isNull(roadHazards.deletedAt),
          or(
            isNull(roadHazards.expiresAt),
            gt(roadHazards.expiresAt, now)
          ),
          eq(roadHazards.isApproved, true)
        )
      )
      .orderBy(desc(roadHazards.createdAt))
      .limit(500);

    let hazards = rows;
    if (userLat !== null && userLng !== null) {
      hazards = rows.filter((h) => {
        const dlat = (h.lat - userLat) * 111.32;
        const dlng = (h.lng - userLng) * 111.32 * Math.cos((userLat * Math.PI) / 180);
        return Math.sqrt(dlat * dlat + dlng * dlng) <= radiusKm;
      });
    }

    return sendSuccess(res, { hazards });
  } catch (error) {
    console.error("[road-hazards] GET / error:", error);
    return sendError(res, 500, "Errore lettura segnalazioni");
  }
});

// ── POST / — create hazard ────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const enabled = await getRoadHazardsEnabled();
    if (!enabled) {
      return sendError(res, 403, "Segnalazioni stradali disabilitate");
    }

    const parsed = createHazardSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }

    const { type, lat, lng, description } = parsed.data;
    const recurring = isRecurringType(type);

    const expiresAt = recurring
      ? null
      : new Date(Date.now() + HAZARD_EXPIRY_HOURS * 60 * 60 * 1000);

    const [hazard] = await db.insert(roadHazards).values({
      userId,
      type,
      lat,
      lng,
      description,
      isApproved: !recurring,
      expiresAt,
    }).returning();

    return res.status(201).json({ success: true, hazard });
  } catch (error) {
    console.error("[road-hazards] POST / error:", error);
    return sendError(res, 500, "Errore creazione segnalazione");
  }
});

// ── POST /:id/confirm — confirm hazard ────────────────────────────────────────
router.post("/:id/confirm", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const hazardId = String(req.params.id);

    const [hazard] = await db
      .select()
      .from(roadHazards)
      .where(
        and(
          eq(roadHazards.id, hazardId),
          isNull(roadHazards.deletedAt)
        )
      )
      .limit(1);

    if (!hazard) return sendError(res, 404, "Segnalazione non trovata");

    const existing = await pool.query(
      "SELECT id FROM road_hazard_confirms WHERE hazard_id=$1 AND user_id=$2 LIMIT 1",
      [hazardId, userId]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return sendSuccess(res, { confirmCount: hazard.confirmCount, alreadyConfirmed: true });
    }

    await pool.query(
      "INSERT INTO road_hazard_confirms(hazard_id, user_id) VALUES($1, $2) ON CONFLICT DO NOTHING",
      [hazardId, userId]
    );

    const newCount = hazard.confirmCount + 1;
    const shouldApprove =
      isRecurringType(hazard.type) &&
      !hazard.isApproved &&
      newCount >= RECURRING_CONFIRM_THRESHOLD;

    await db
      .update(roadHazards)
      .set({
        confirmCount: newCount,
        ...(shouldApprove ? { isApproved: true } : {}),
      })
      .where(eq(roadHazards.id, hazardId));

    return sendSuccess(res, { confirmCount: newCount, approved: shouldApprove });
  } catch (error) {
    console.error("[road-hazards] POST /:id/confirm error:", error);
    return sendError(res, 500, "Errore conferma segnalazione");
  }
});

// ── DELETE /:id — delete hazard (author or admin) ─────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const hazardId = String(req.params.id);

    const [hazard] = await db
      .select()
      .from(roadHazards)
      .where(eq(roadHazards.id, hazardId))
      .limit(1);

    if (!hazard) return sendError(res, 404, "Segnalazione non trovata");

    const user = await storage.getUser(userId);
    const isAdmin = user?.role === "admin" || user?.role === "moderator";

    if (hazard.userId !== userId && !isAdmin) {
      return sendError(res, 403, "Non autorizzato");
    }

    await db
      .update(roadHazards)
      .set({ deletedAt: new Date() })
      .where(eq(roadHazards.id, hazardId));

    return sendSuccess(res, { deleted: true });
  } catch (error) {
    console.error("[road-hazards] DELETE /:id error:", error);
    return sendError(res, 500, "Errore eliminazione segnalazione");
  }
});

export default router;
