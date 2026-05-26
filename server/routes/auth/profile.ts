import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { onlineTracker } from "../../online-tracker";
import { sendSuccess, sendError } from "../../lib/api-response";

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
    const body = (req.body ?? {}) as { appVersion?: unknown; platform?: unknown; deviceModel?: unknown };
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
    const updatePayload: {
      lastLoginAt: Date;
      lastAppVersion: string;
      lastPlatform: string;
      lastDeviceModel?: string;
    } = { lastLoginAt: new Date(), lastAppVersion, lastPlatform };
    if (typeof body.deviceModel === "string" && body.deviceModel.trim().length > 0) {
      updatePayload.lastDeviceModel = body.deviceModel.trim().slice(0, 100);
    }
    await storage.updateUser(userId, updatePayload);
    onlineTracker.touch(userId);
    return sendSuccess(res);
  } catch {
    return sendError(res, 500, "Errore interno");
  }
});

export default router;
