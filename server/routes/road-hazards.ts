import { Router, type Request, type Response } from "express";
import { db, pool, withDbRetry } from "../db";
import {
  roadHazards,
  RECURRING_TYPES,
  HAZARD_LABELS,
  HAZARD_ICONS,
  createHazardSchema
} from "@shared/db";
import { eq, and, isNull, or, gt, gte, lte, desc } from "drizzle-orm";
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
    // Accetta sia `lng` che l'alias `lon` (alcuni client/probe usano lon) —
    // senza questo la longitudine restava null e il bounding-box veniva saltato.
    const lngRaw = (req.query.lng ?? req.query.lon) as string | undefined;
    const userLng = lngRaw ? parseFloat(lngRaw) : null;
    const radiusKm = req.query.radius ? parseFloat(req.query.radius as string) : NEARBY_RADIUS_KM;

    const now = new Date();

    // Task #4436: quando ho lat/lng filtro con un bounding-box in SQL PRIMA del
    // LIMIT, così il DB scansiona solo i hazard nell'area invece di restituirne
    // 500 a caso (su tutto il mondo) per poi filtrarli in JS — la query era >2s.
    const conditions = [
      isNull(roadHazards.deletedAt),
      or(
        isNull(roadHazards.expiresAt),
        gt(roadHazards.expiresAt, now)
      ),
      eq(roadHazards.isApproved, true),
    ];

    if (userLat !== null && userLng !== null) {
      const latDelta = radiusKm / 111.32;
      const cosLat = Math.cos((userLat * Math.PI) / 180);
      const lngDelta = radiusKm / (111.32 * (Math.abs(cosLat) < 1e-6 ? 1e-6 : cosLat));
      conditions.push(
        gte(roadHazards.lat, userLat - latDelta),
        lte(roadHazards.lat, userLat + latDelta),
        gte(roadHazards.lng, userLng - Math.abs(lngDelta)),
        lte(roadHazards.lng, userLng + Math.abs(lngDelta)),
      );
    }

    const rows = await withDbRetry(() => db
      .select()
      .from(roadHazards)
      .where(and(...conditions))
      .orderBy(desc(roadHazards.createdAt))
      .limit(500));

    let hazards = rows;
    if (userLat !== null && userLng !== null) {
      // Raffinamento circolare sul set già ridotto dal bounding-box.
      hazards = rows.filter((h) => {
        const dlat = (h.lat - userLat) * 111.32;
        const dlng = (h.lng - userLng) * 111.32 * Math.cos((userLat * Math.PI) / 180);
        return Math.sqrt(dlat * dlat + dlng * dlng) <= radiusKm;
      });
    }

    return sendSuccess(res, { hazards });
  } catch (error) {
    const pgCause = (error as any)?.cause?.message ?? "";
    console.error("[road-hazards] GET / error:", error, pgCause ? `| PG: ${pgCause}` : "");
    return sendError(res, 500, "Errore lettura segnalazioni");
  }
});

// ── GET /:id — hazard detail + comments ──────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const hazardId = String(req.params.id);

    const [hazard] = await withDbRetry(() => db
      .select()
      .from(roadHazards)
      .where(
        and(
          eq(roadHazards.id, hazardId),
          isNull(roadHazards.deletedAt)
        )
      )
      .limit(1));

    if (!hazard) return sendError(res, 404, "Segnalazione non trovata");

    const commentsRaw = await withDbRetry(() => pool.query<{
      id: string;
      user_id: string;
      text: string;
      created_at: string;
      updated_at: string;
      nickname: string | null;
    }>(
      `SELECT c.id, c.user_id, c.text, c.created_at, c.updated_at,
              u.nickname AS nickname
         FROM road_hazard_comments c
         JOIN users u ON u.id = c.user_id
        WHERE c.hazard_id = $1
        ORDER BY c.created_at ASC`,
      [hazardId]
    ));

    const comments = commentsRaw.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      text: r.text,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      nickname: r.nickname ?? "Utente"
    }));

    return sendSuccess(res, {
      hazard: {
        ...hazard,
        label: HAZARD_LABELS[hazard.type as keyof typeof HAZARD_LABELS] ?? hazard.type,
        icon: HAZARD_ICONS[hazard.type as keyof typeof HAZARD_ICONS] ?? "⚠️"
      },
      comments
    });
  } catch (error) {
    const pgCause = (error as any)?.cause?.message ?? "";
    console.error("[road-hazards] GET /:id error:", error, pgCause ? `| PG: ${pgCause}` : "");
    return sendError(res, 500, "Errore lettura segnalazione");
  }
});

// ── POST /:id/comments — upsert user comment ─────────────────────────────────
router.post("/:id/comments", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const hazardId = String(req.params.id);
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > 140) {
      return sendError(res, 400, "Testo commento non valido (max 140 caratteri)");
    }

    const [hazard] = await db
      .select({ id: roadHazards.id })
      .from(roadHazards)
      .where(and(eq(roadHazards.id, hazardId), isNull(roadHazards.deletedAt)))
      .limit(1);

    if (!hazard) return sendError(res, 404, "Segnalazione non trovata");

    await pool.query(
      `INSERT INTO road_hazard_comments(hazard_id, user_id, text)
       VALUES($1, $2, $3)
       ON CONFLICT (hazard_id, user_id)
       DO UPDATE SET text = EXCLUDED.text, updated_at = NOW()`,
      [hazardId, userId, text]
    );

    return sendSuccess(res, { saved: true });
  } catch (error) {
    const pgCause = (error as any)?.cause?.message ?? "";
    console.error("[road-hazards] POST /:id/comments error:", error, pgCause ? `| PG: ${pgCause}` : "");
    return sendError(res, 500, "Errore salvataggio commento");
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
      expiresAt
    }).returning();

    return res.status(201).json({ success: true, hazard });
  } catch (error) {
    const pgCause = (error as any)?.cause?.message ?? "";
    console.error("[road-hazards] POST / error:", error, pgCause ? `| PG: ${pgCause}` : "");
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
        ...(shouldApprove ? { isApproved: true } : {})
      })
      .where(eq(roadHazards.id, hazardId));

    return sendSuccess(res, { confirmCount: newCount, approved: shouldApprove });
  } catch (error) {
    const pgCause = (error as any)?.cause?.message ?? "";
    console.error("[road-hazards] POST /:id/confirm error:", error, pgCause ? `| PG: ${pgCause}` : "");
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
    const pgCause = (error as any)?.cause?.message ?? "";
    console.error("[road-hazards] DELETE /:id error:", error, pgCause ? `| PG: ${pgCause}` : "");
    return sendError(res, 500, "Errore eliminazione segnalazione");
  }
});

export default router;
