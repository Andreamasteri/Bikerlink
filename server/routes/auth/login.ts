import { Router, type Request, type Response } from "express";
import { sendSuccess } from "../../lib/api-response";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
// @ts-ignore
import signature from "cookie-signature";
import { loginSchema } from "@shared/schema";
import { storage } from "../../storage";
import { onlineTracker } from "../../online-tracker";
import { revokeSessionsByType } from "../../session-utils";
import { notifySessionDisplaced } from "../../session-sse";
import { sendSuccess, sendError } from "../../lib/api-response";
import { parseVisitorCookie, recordVisit } from "../../lib/visitor-tracking";
import { createRegionalClubInvite } from "../motoclubs";
import { addSessionSseClient, removeSessionSseClient } from "../../session-sse";

function buildSessionToken(sessionID: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return "";
  return "s:" + signature.sign(sessionID, secret);
}

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Troppi tentativi. Riprova più tardi." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }

    const { identifier: rawIdentifier, password, latitude: loginLat, longitude: loginLng, platform: loginPlatform } = parsed.data;
    const identifier = rawIdentifier.trim();

    let user = await storage.getUserByEmail(identifier);
    if (!user) {
      user = await storage.getUserByNickname(identifier);
    }

    if (!user) {
      return sendError(res, 401, "Credenziali non valide");
    }

    if (user.isFake) {
      return sendError(res, 401, "Credenziali non valide");
    }

    if (user.status === "blocked" || user.status === "suspended") {
      return sendError(res, 403, "Account sospeso o bloccato");
    }

    const emailVerifSetting = await storage.getAppSetting("email_verification_enabled");
    if (emailVerifSetting?.value === "true" && !user.emailVerified && !user.isPrimal && user.role !== "admin") {
      return sendError(res, 403, "Verifica la tua email prima di accedere. Controlla la tua casella di posta.");
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return sendError(res, 401, "Credenziali non valide");
    }

    const updateData: Record<string, unknown> = { lastLoginAt: new Date() };
    if (!user.firstLoginAt) {
      updateData.firstLoginAt = new Date();
    }
    await storage.updateUser(user.id, updateData as any);

    const effectiveRegion = user.region;
    const effectiveCountry = user.country;
    if (effectiveRegion && (!effectiveCountry || effectiveCountry === "IT")) {
      createRegionalClubInvite(user.id, effectiveRegion).catch(() => {});
    }

    const userRecord = await storage.getUser(user.id);
    if (!userRecord?.ghostMode) {
      await storage.upsertUserProfile(user.id, { isAvailable: true }).catch((e: Error) => {
        console.warn("[login] upsertUserProfile failed:", e?.message);
      });
    }
    if (typeof loginLat === "number" && typeof loginLng === "number") {
      storage.upsertUserProfile(user.id, { latitude: loginLat, longitude: loginLng, coordinatesUpdatedAt: new Date() } as any).catch(() => {});
    }

    const sessionType: "mobile" | "web" =
      loginPlatform === "android" || loginPlatform === "ios" ? "mobile" : "web";

    if (sessionType === "web") {
      notifySessionDisplaced(user.id);
    }

    await revokeSessionsByType(user.id, sessionType).catch((e) => {
      console.warn(`[login] revokeSessionsByType failed (non-blocking): ${e?.message}`);
    });

    req.session.userId = user.id;
    req.session.sessionType = sessionType;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => { if (err) reject(err); else resolve(); });
    });

    try {
      const vid = parseVisitorCookie(req);
      if (vid) recordVisit({ req, visitorId: vid, event: "login", userId: user.id, path: "/api/auth/login" });
    } catch {}

    const userProfile = await storage.getUserProfile(user.id).catch(() => null);
    const isGhost = userRecord?.ghostMode ?? false;
    const isAvail = !isGhost && (userProfile?.isAvailable ?? false);
    onlineTracker.setOnline(user.id, {
      role: userRecord?.role ?? user.role ?? "user",
      nickname: userRecord?.nickname ?? user.nickname ?? "",
      status: userRecord?.status ?? user.status ?? "active",
      userType: userRecord?.userType ?? user.userType ?? "biker",
      isAvailable: isAvail,
      ghostMode: isGhost,
      country: userRecord?.country ?? user.country ?? null,
      isFake: userRecord?.isFake ?? user.isFake ?? false,
    });

    const { password: _, ...safeUser } = userRecord ?? user;
    return res.json({
      ...safeUser,
      profileLatitude: userProfile?.latitude ?? null,
      profileLongitude: userProfile?.longitude ?? null,
      mapFilters: userProfile?.mapFilters ?? null,
      sessionToken: buildSessionToken(req.sessionID),
      sessionType,
    });
  } catch (error) {
    console.error("Login error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/clear-session-cookie", (_req: Request, res: Response) => {
  res.clearCookie("connect.sid", { path: "/" });
  return sendSuccess(res);
});

router.post("/logout", (req: Request, res: Response) => {
  const userId = req.session?.userId;
  req.session.destroy(async (err) => {
    if (err) {
      return sendError(res, 500, "Errore durante il logout");
    }
    if (userId) {
      onlineTracker.setOffline(userId);
      storage.updateUser(userId, { lastLogoutAt: new Date() } as any).catch(() => {});
    }
    res.clearCookie("connect.sid");
    return sendSuccess(res, undefined, "Logout effettuato");
  });
});

router.get("/session-events", (req: Request, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, 401, "Non autenticato");
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write("event: connected\ndata: {}\n\n");

  const connId = addSessionSseClient(userId, res);

  const heartbeat = setInterval(() => {
    try { res.write(":heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSessionSseClient(userId, connId);
  });
});

export default router;
