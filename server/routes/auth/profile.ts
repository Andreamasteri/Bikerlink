import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { onlineTracker } from "../../online-tracker";

const router = Router();

router.get("/me", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "Utente non trovato" });
    }

    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(user.id);
    return res.json({
      ...safeUser,
      profileLatitude: profile?.latitude ?? null,
      profileLongitude: profile?.longitude ?? null,
      mapFilters: profile?.mapFilters ?? null,
    });
  } catch (error) {
    console.error("Me error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/heartbeat", async (req: Request, res: Response) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ ok: false });
    const body = (req.body ?? {}) as { appVersion?: unknown; platform?: unknown; otaNumber?: unknown };
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
    const lastOtaNumber =
      typeof body.otaNumber === "number" && Number.isInteger(body.otaNumber) && body.otaNumber > 0
        ? body.otaNumber
        : undefined;
    await storage.updateUser(userId, {
      lastLoginAt: new Date(),
      lastAppVersion,
      lastPlatform,
      ...(lastOtaNumber !== undefined ? { lastOtaNumber } : {}),
    });
    onlineTracker.touch(userId);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

export default router;
