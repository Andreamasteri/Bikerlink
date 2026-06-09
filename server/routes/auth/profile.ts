import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { onlineTracker } from "../../online-tracker";
import { sendSuccess, sendError } from "../../lib/api-response";
import { db } from "../../db";
import { userDevices } from "@shared/db";
import { sql } from "drizzle-orm";

const router = Router();

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
    const semverRe = /^\d+\.\d+\.\d+$/;
    const platformAllowed = new Set(["android", "ios", "web"]);
    const lastAppVersion =
      typeof body.appVersion === "string" && semverRe.test(body.appVersion)
        ? body.appVersion
        : "unknown";
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
    onlineTracker.touch(userId);

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
