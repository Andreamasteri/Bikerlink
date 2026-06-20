import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { onlineTracker } from "../../online-tracker";
import { sendSuccess, sendError } from "../../lib/api-response";
import { db } from "../../db";
import { userDevices } from "@shared/db";
import { sql } from "drizzle-orm";

const router = Router();

/**
 * Normalizza/sanitizza il versionName ricevuto dal client.
 * Accetta il formato reale ("72D.10.125") e i formati legacy ("70.10.123", "1.0.0"):
 * segmenti alfanumerici separati da punto, lunghezza massima 32 caratteri.
 * Restituisce "unknown" solo quando il dato è davvero assente o non valido.
 */
function sanitizeAppVersion(raw: unknown): string {
  if (typeof raw !== "string") return "unknown";
  const v = raw.trim();
  if (v.length === 0 || v.length > 32) return "unknown";
  if (!/^[A-Za-z0-9]+(\.[A-Za-z0-9]+)*$/.test(v)) return "unknown";
  return v;
}

router.get("/me", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return sendError(res, 401, "Non autenticato");
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return sendError(res, 401, "Utente non trovato");
    }

    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(user.id);
    return res.json({
      ...safeUser,
      profileLatitude: profile?.latitude ?? null,
      profileLongitude: profile?.longitude ?? null,
      mapFilters: profile?.mapFilters ?? null,
      mapTester: user.mapTester ?? false,
      aisEnabled: user.aisEnabled ?? false,
    });
  } catch (error) {
    console.error("Me error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/heartbeat", async (req: Request, res: Response) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");
    const body = (req.body ?? {}) as { appVersion?: unknown; platform?: unknown; deviceModel?: unknown; osVersion?: unknown; sessionId?: unknown };
    const platformAllowed = new Set(["android", "ios", "web"]);
    // Accetta il versionName reale dell'app (es. "72D.10.125": primo segmento con
    // eventuale suffisso lettera) oltre ai formati semver legacy ("70.10.123").
    // Sanitizzazione robusta: solo segmenti alfanumerici separati da punto, max 32 char,
    // per evitare input malevoli. Solo se davvero assente/non valido salviamo "unknown".
    const lastAppVersion = sanitizeAppVersion(body.appVersion);
    const lastPlatform =
      typeof body.platform === "string" && platformAllowed.has(body.platform)
        ? body.platform
        : "unknown";
    const deviceModel =
      typeof body.deviceModel === "string" && body.deviceModel.trim().length > 0
        ? body.deviceModel.trim().slice(0, 100)
        : null;
    const osVersion =
      typeof body.osVersion === "string" && body.osVersion.trim().length > 0
        ? body.osVersion.trim().slice(0, 50)
        : null;
    const updatePayload: {
      lastLoginAt: Date;
      lastAppVersion: string;
      lastPlatform: string;
      lastDeviceModel?: string;
    } = { lastLoginAt: new Date(), lastAppVersion, lastPlatform };
    if (deviceModel) {
      updatePayload.lastDeviceModel = deviceModel;
    }
    await storage.updateUser(userId, updatePayload);
    if (deviceModel) {
      try {
        await db.insert(userDevices).values({
          userId,
          model: deviceModel,
          platform: lastPlatform !== "unknown" ? lastPlatform : null,
          osVersion,
        }).onConflictDoUpdate({
          target: [userDevices.userId, userDevices.model],
          set: {
            lastSeenAt: new Date(),
            platform: lastPlatform !== "unknown" ? lastPlatform : sql`${userDevices.platform}`,
            osVersion: osVersion ?? sql`${userDevices.osVersion}`,
          },
        });
      } catch (err) {
        console.error("[heartbeat] user_devices upsert error:", err);
      }
    }
    const wasTracked = onlineTracker.touch(userId);
    if (!wasTracked) {
      // Tracker vuoto dopo restart del server: reidrata l'utente dal DB
      // senza bloccare la risposta (fire-and-forget non-critico).
      Promise.all([
        storage.getUser(userId),
        storage.getUserProfile(userId),
      ]).then(([user, profile]) => {
        if (!user || user.status !== "active" || user.isFake) return;
        const isGhost = user.ghostMode ?? false;
        onlineTracker.setOnline(userId, {
          role: user.role,
          nickname: user.nickname,
          status: user.status,
          userType: user.userType,
          isAvailable: !isGhost && (profile?.isAvailable ?? false),
          ghostMode: isGhost,
          country: user.country ?? null,
          isFake: user.isFake ?? false,
          isSystem: user.isSystem ?? false,
        });
      }).catch(() => {});
    }

    // Update per-session heartbeat timestamp if sessionId provided
    if (typeof body.sessionId === "string" && body.sessionId.length > 0) {
      const { db: dbConn } = await import("../../db");
      const { userSessions } = await import("@shared/db");
      const { and, isNull, eq } = await import("drizzle-orm");
      dbConn.update(userSessions)
        .set({ lastHeartbeatAt: new Date() })
        .where(and(eq(userSessions.id, body.sessionId), eq(userSessions.userId, userId), isNull(userSessions.endedAt)))
        .catch(() => {});
    }

    return sendSuccess(res);
  } catch {
    return sendError(res, 500, "Errore interno");
  }
});

export default router;
