import type { Express, Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Locals {
    }
  }
}
import { createServer, type Server } from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { pool } from "./db";
import { storage } from "./storage";
import { enforceOrigin } from "./middleware";
import internalRouter from "./routes/_internal";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import motorcycleRoutes from "./routes/motorcycles";
import proposalRoutes from "./routes/proposals";
import trackingRoutes from "./routes/tracking";
import routingAreasRouter from "./routes/routing-areas";
import valhallaFunctionsRouter from "./routes/routing/valhalla-functions";
import wishlistRoutes from "./routes/wishlist";
import feedbackRoutes from "./routes/feedback";
import invitationRoutes from "./routes/invitations";
import contestRoutes from "./routes/contest";
import adsRoutes from "./routes/ads";
import chatRoutes from "./routes/chat";
import notificationRoutes from "./routes/notifications";
import reportRoutes from "./routes/reports";
import workshopRoutes from "./routes/workshops";
import easterEggRoutes from "./routes/easter-eggs";
import adminRoutes from "./routes/admin";
import moderatorRoutes from "./routes/moderator";
import customRoutesRouter from "./routes/custom-routes";
import customRoutes2Router from "./routes/custom-routes2";
import sosRoutes from "./routes/sos";
import telemetryRoutes from "./routes/telemetry";
import telemetryMapsRoutes from "./routes/telemetry-maps";
import motoclubsRoutes from "./routes/motoclubs";
import friendsRoutes from "./routes/friends";
import { handleMusicMatch, handleMusicMatchReject } from "./routes/music-match";
import matchPreferencesRoutes from "./routes/match-preferences";
import recapRoutes from "./routes/recap";
import matchNegativePreferencesRoutes from "./routes/match-negative-preferences";
import lastfmRoutes from "./routes/lastfm";
import radioRoutes from "./routes/radio";
import eventsRoutes from "./routes/events";
import arcadeRoutes from "./routes/arcade";
import errorsRoutes from "./routes/errors";
import analyticsEventsRoutes from "./routes/analytics-events";
import sprintsRoutes from "./routes/sprints";
import roadHazardsRoutes from "./routes/road-hazards";
import wipStubsRouter from "./routes/wip-stubs";
import routeCompletionRouter from "./routes/route-completion";
import { publicMediaRouter, adminMediaRouter } from "./routes/media-library";
import gdprRoutes from "./routes/gdpr";
import { db } from "./db";
import { userFavorites } from "@shared/db";
import { eq, and } from "drizzle-orm";
import { onlineTracker } from "./online-tracker";
import { registerClientSettingsRoutes } from "./routes/client-settings";
import { registerClientSettingsExtraRoutes } from "./routes/client-settings-extra";
import { registerMoreRoutes } from "./routes/more-routes";
import { registerMoreRoutes2 } from "./routes/more-routes-2";
import { registerMediaPromoRoutes } from "./routes/media-promo";
import { recordSessionError, recordSessionSuccess } from "./session-health";

async function _requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = req.session as { userId?: string };
  if (!session?.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  const user = await storage.getUser(session.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Accesso non autorizzato" });
  }
  (req as Request & { adminUser?: unknown }).adminUser = user;
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.set("trust proxy", true);

  // Internal tool routes — token auth only, no session, mounted before the Bearer bridge.
  app.use("/api/_internal", internalRouter);

  const PgStore = connectPgSimple(session);
  const SESSION_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 anno

  // Pool dedicato per il session store — separato dal pool principale per evitare
  // contesa sotto carico e per poter configurare keepAlive indipendente.
  const sessionPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    keepAlive: true,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    max: 3,
  });
  sessionPool.on("error", (err) => {
    recordSessionError("session-pool", err.message);
  });

  const sessionStore = new PgStore({
    pool: sessionPool,
    tableName: "session",
    createTableIfMissing: true,
    ttl: 365 * 24 * 60 * 60,
    disableTouch: true,
    errorLog: (err: Error) => {
      recordSessionError("session-store", err.message);
    },
  });

  // Patch store methods: success recorded only on actual DB-backed I/O.
  // This ensures the consecutive-error counter is reset only when the session
  // store successfully completes a real operation, not on every HTTP request.
  const _storeGet = sessionStore.get.bind(sessionStore);
  sessionStore.get = (sid, cb) => {
    _storeGet(sid, (err, session) => {
      if (!err) recordSessionSuccess();
      cb(err, session);
    });
  };
  const _storeSet = sessionStore.set.bind(sessionStore);
  sessionStore.set = (sid, sess, cb) => {
    _storeSet(sid, sess, (err?: Error | null) => {
      if (!err) recordSessionSuccess();
      if (cb) cb(err);
    });
  };
  const _storeDestroy = sessionStore.destroy.bind(sessionStore);
  sessionStore.destroy = (sid, cb) => {
    _storeDestroy(sid, (err?: Error | null) => {
      if (!err) recordSessionSuccess();
      if (cb) cb(err);
    });
  };

  const sessionMiddleware = session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: SESSION_MAX_AGE_MS,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "lax" : (false as const),
    },
  });

  // Bridge Bearer token → cookie connect.sid (per client mobile React Native).
  app.use((req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token) {
        const cookieValue = `connect.sid=${encodeURIComponent(token)}`;
        if (req.headers.cookie) {
          const cleaned = req.headers.cookie
            .split(";")
            .map((c) => c.trim())
            .filter((c) => !c.startsWith("connect.sid="))
            .join("; ");
          req.headers.cookie = cleaned ? `${cleaned}; ${cookieValue}` : cookieValue;
        } else {
          req.headers.cookie = cookieValue;
        }
      }
    }
    next();
  });

  // Wrapper error-safe: un errore del session store viene loggato ma non
  // interrompe la request chain — la request procede senza sessione.
  app.use((req, res, next) => {
    sessionMiddleware(req, res, (err) => {
      if (err) {
        recordSessionError("session-middleware", err.message);
        return next();
      }
      next();
    });
  });

  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.session?.userId) {
      const userId: string = req.session.userId;
      const foundInTracker = onlineTracker.touch(userId);
      try {
        const user = await storage.getUser(userId);
        if (!user || user.status !== "active") {
          if (user) onlineTracker.setOffline(userId);
          return req.session.destroy(() => {
            try { res.clearCookie("connect.sid", { path: "/" }); } catch { /* no-op: cookie clear failure */ }
            const reason = !user ? "user-not-found" : `status-${user.status}`;
            return res.status(401).json({ message: "Sessione non più valida", reason });
          });
        }
        if (user.status === "active") {
          if (user.role === "admin") {
            onlineTracker.setOffline(userId);
          } else if (!foundInTracker) {
            const profile = await storage.getUserProfile(userId).catch(() => null);
            onlineTracker.setOnline(userId, {
              role: user.role ?? "user",
              nickname: user.nickname ?? "",
              status: user.status ?? "active",
              userType: user.userType ?? "biker",
              isAvailable: (profile?.isAvailable ?? false) && !(user.ghostMode ?? false),
              ghostMode: user.ghostMode ?? false,
              country: user.country ?? null,
              isFake: user.isFake ?? false,
              isSystem: user.isSystem ?? false,
            });
          }
          if (user.lastLoginAt) {
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (new Date(user.lastLoginAt) < fiveMinAgo) {
              await storage.updateUser(userId, { lastLoginAt: new Date() });
            }
          }
        }
      } catch (err) {
        console.warn("[routes] Auth middleware user check failed:", err);
      }
    }
    next();
  });

  app.get("/api/assets/onboarding/:filename", async (req: Request, res: Response) => {
    const filename = req.params.filename as string;
    if (!/^\d{2}-[a-z0-9-]+\.png$/.test(filename)) {
      return res.status(400).send("Invalid filename");
    }
    try {
      const { downloadBuffer } = await import("./objectStorage");
      const buffer = await downloadBuffer(`public/onboarding/${filename}`);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.send(buffer);
    } catch {
      return res.status(404).send("Not found");
    }
  });

  const CURRENT_APP_VERSION = "3.3.0";
  app.get("/api/version/latest", (_req: Request, res: Response) => {
    return res.json({ latestVersion: CURRENT_APP_VERSION });
  });

  app.use("/api/match-preferences", matchPreferencesRoutes);
  app.use("/api/match-negative-preferences", matchNegativePreferencesRoutes);
  app.use("/api/recap", recapRoutes);
  app.use("/api/auth", enforceOrigin, authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/sessions", (await import("./routes/sessions")).default);
  app.use("/api/tags", (await import("./routes/tags")).default);
  // Task #2503 — endpoint pubblici OTA (gating manifest + telemetria boot)
  const { default: otaPublicRouter } = await import("./routes/ota-public");
  app.use("/api/ota", otaPublicRouter);

  app.get("/api/user/position", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    try {
      const profile = await storage.getUserProfile(req.session.userId);
      if (!profile || profile.latitude == null || profile.longitude == null) {
        return res.json({ latitude: null, longitude: null, source: null });
      }
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const isLive = profile.coordinatesUpdatedAt != null && new Date(profile.coordinatesUpdatedAt) > fiveMinAgo;
      return res.json({
        latitude: profile.latitude,
        longitude: profile.longitude,
        source: isLive ? "live" : "last_known",
        updatedAt: profile.coordinatesUpdatedAt,
      });
    } catch (error) {
      console.error("Get user position error:", error);
      return res.status(500).json({ message: "Errore interno del server" });
    }
  });

  app.get("/api/users/my-last-position", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    try {
      const profile = await storage.getUserProfile(req.session.userId);
      if (!profile || profile.latitude == null || profile.longitude == null) {
        return res.json({ available: false });
      }
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      if (!profile.coordinatesUpdatedAt || new Date(profile.coordinatesUpdatedAt) < tenMinAgo) {
        return res.json({ available: false });
      }
      return res.json({
        available: true,
        latitude: profile.latitude,
        longitude: profile.longitude,
        updatedAt: profile.coordinatesUpdatedAt,
      });
    } catch (error) {
      console.error("Get my-last-position error:", error);
      return res.status(500).json({ message: "Errore interno del server" });
    }
  });

  app.use("/api/motorcycles", motorcycleRoutes);
  app.use("/api/proposals", proposalRoutes);
  app.get("/api/matches/fresh", (req, res, next) => {
    req.url = "/matches/fresh";
    return (proposalRoutes as unknown as (req: Request, res: Response, next: NextFunction) => void)(req, res, next);
  });
  // Task #2528 — shared planned routes per due utenti matchati
  const { default: matchesSharedRoutes } = await import("./routes/matches-shared-routes");
  app.use("/api/matches", matchesSharedRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/workshops", workshopRoutes);
  app.use("/api/easter-eggs", easterEggRoutes);
  app.use("/api/ads", adsRoutes);
  app.use("/api/contest", contestRoutes);
  app.use("/api/wishlist", wishlistRoutes);
  app.use("/api/feedback", feedbackRoutes);
  app.use("/api/invitations", invitationRoutes);
  app.use("/api/routes", trackingRoutes);
  app.use("/api/routing", routingAreasRouter);
  app.use("/api/routing", valhallaFunctionsRouter);

  const { default: whisperRoutes } = await import("./routes/whisper");
  app.use("/api/whisper", whisperRoutes);
  app.use(customRoutesRouter);
  app.use(customRoutes2Router);
  // Task #2517 — Bull Board UI for inspecting BullMQ queues. Mounted BEFORE
  // the JSON-only admin router so its HTML/static assets are served correctly.
  try {
    const { buildBullBoardRouter } = await import("./cache/bull-board");
    const bullBoardRouter = await buildBullBoardRouter();
    app.use("/api/admin/queues", _requireAdmin, bullBoardRouter);
  } catch (err) {
    console.warn("[routes] Bull Board mount failed:", err instanceof Error ? err.message : err);
  }

  const { default: textInterpreterRoutes } = await import("./routes/text-interpreter");
  app.use("/api/text-interpreter", textInterpreterRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/moderator", moderatorRoutes);
  app.use("/api/sos", sosRoutes);
  app.use("/api/gdpr", gdprRoutes);
  app.use("/api/telemetry", telemetryRoutes);
  app.use("/api/telemetry", telemetryMapsRoutes);
  app.use("/api/motoclubs", motoclubsRoutes);
  app.use("/api/friends", friendsRoutes);
  app.use("/api/lastfm", lastfmRoutes);
  app.use("/api/music/radio", radioRoutes);
  app.use("/api/events", eventsRoutes);
  app.use("/api/arcade", arcadeRoutes);
  app.use("/api/errors", errorsRoutes);
  app.use("/api/analytics", analyticsEventsRoutes);
  app.use("/api/sprints", sprintsRoutes);
  app.use("/api/road-hazards", roadHazardsRoutes);
  app.use("/api/media", publicMediaRouter);
  app.use("/api/admin/media", adminMediaRouter);

  const { default: plannedRoutesRoutes } = await import("./routes/planned-routes");
  app.use("/api/planned-routes", plannedRoutesRoutes);

  const { default: plannedRouteInvitesRoutes } = await import("./routes/planned-route-invites");
  app.use("/api/planned-route-invites", plannedRouteInvitesRoutes);

  const { geocodeRouter } = await import("./routes/planned-routes/waypoints.next");
  app.use("/api/geocode", geocodeRouter);

  // Task #2698 — AI Assistant utente (sessione richiesta, no admin role).
  const { default: aiAssistantRoutes } = await import("./routes/ai-assistant");
  app.use("/api", aiAssistantRoutes);

  // Route-completion: PATCH /routes/:id (con telemetria), voice-notes,
  // planned-routes/weather. Estratto da wip-stubs per rispettare limite 600 righe.
  app.use("/api", routeCompletionRouter);

  // Task #2632 — Stub endpoints per chiamate client senza handler reale.
  // Mounted ULTIMO sotto /api/ così non sovrascrive route esistenti più
  // specifiche già registrate sopra. Vedi docs/sweep-404-2621.md sezione B.
  app.use("/api", wipStubsRouter);

  registerMediaPromoRoutes(app);

  app.get("/api/favorites", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    try {
      const rows = await db
        .select({ favoriteUserId: userFavorites.favoriteUserId })
        .from(userFavorites)
        .where(eq(userFavorites.userId, req.session.userId));
      return res.json(rows.map((r) => r.favoriteUserId));
    } catch (error) {
      console.error("Get favorites error:", error);
      return res.status(500).json({ message: "Errore interno del server" });
    }
  });

  app.post("/api/favorites/:userId", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    try {
      const currentUserId = req.session.userId;
      const targetUserId = req.params.userId as string;
      if (currentUserId === targetUserId) {
        return res.status(400).json({ message: "Non puoi aggiungere te stesso ai preferiti" });
      }
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "Utente non trovato" });
      }
      const existing = await db
        .select({ id: userFavorites.id })
        .from(userFavorites)
        .where(and(eq(userFavorites.userId, currentUserId), eq(userFavorites.favoriteUserId, targetUserId)));
      if (existing.length > 0) {
        await db.delete(userFavorites).where(and(eq(userFavorites.userId, currentUserId), eq(userFavorites.favoriteUserId, targetUserId)));
        return res.json({ favorited: false });
      } else {
        await db.insert(userFavorites).values({ userId: currentUserId, favoriteUserId: targetUserId });
        return res.json({ favorited: true });
      }
    } catch (error) {
      console.error("Toggle favorite error:", error);
      return res.status(500).json({ message: "Errore interno del server" });
    }
  });

  app.get("/api/settings/music-provider", (_req: Request, res: Response) => {
    return res.json({ provider: "lastfm" });
  });

  app.get("/api/match/music", (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Non autenticato" });
    return handleMusicMatch(req, res);
  });

  app.post("/api/match/music/:targetUserId/reject", (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Non autenticato" });
    return handleMusicMatchReject(req, res);
  });


  app.get("/admin/visitatori", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as { userId?: string })?.userId;
      if (!userId) {
        res.status(401).setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send('<html><body style="background:#000;color:#888;font-family:sans-serif;padding:40px;text-align:center"><h1>401</h1><p>Sessione admin richiesta.</p></body></html>');
      }
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        res.status(403).setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send('<html><body style="background:#000;color:#888;font-family:sans-serif;padding:40px;text-align:center"><h1>403</h1><p>Accesso riservato agli admin.</p></body></html>');
      }
      const templatePath = path.resolve(process.cwd(), "server", "templates", "admin-visitatori.html");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.sendFile(templatePath);
    } catch (err) {
      console.error("[admin/visitatori] error:", err);
      return res.status(500).send("Errore interno");
    }
  });

  app.get(["/privacy-policy", "/privacy"], (_req, res) => {
    const templatePath = path.resolve(
      process.cwd(),
      "server",
      "templates",
      "privacy-policy.html",
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });

  app.get(["/terms", "/tos"], (_req, res) => {
    const templatePath = path.resolve(
      process.cwd(),
      "server",
      "templates",
      "terms.html",
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });

  app.get("/delete-account", (_req, res) => {
    const templatePath = path.resolve(
      process.cwd(),
      "server",
      "templates",
      "delete-account.html",
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });

  app.get("/apple-review", (req, res) => {
    const pageToken = process.env.APPLE_REVIEW_PAGE_TOKEN;
    const provided = typeof req.query.token === "string" ? req.query.token : "";
    const MIN_TOKEN_LEN = 24;
    let valid = false;
    if (pageToken && pageToken.length >= MIN_TOKEN_LEN && provided.length > 0) {
      try {
        const a = Buffer.from(pageToken);
        const b = Buffer.from(provided.padEnd(pageToken.length, "\0").substring(0, pageToken.length));
        valid = a.length === b.length && crypto.timingSafeEqual(a, b) && provided === pageToken;
      } catch (err) {
        console.warn("[routes] Apple review token timing safe equal failed:", err);
        valid = false;
      }
    }
    if (!valid) {
      return res.status(404).send("Not found");
    }
    const templatePath = path.resolve(
      process.cwd(),
      "server",
      "templates",
      "apple-review.html",
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });

  const { registerExportsRoutes } = await import("./routes/exports");
  registerExportsRoutes(app);

  registerClientSettingsRoutes(app);
  registerClientSettingsExtraRoutes(app);

  registerMoreRoutes(app);
  registerMoreRoutes2(app);

  const httpServer = createServer(app);

  import("./backup-service").then(({ startScheduler }) => {
    startScheduler().catch((err) => {
      console.error("[backup-service] Failed to start scheduler:", err);
    });
  }).catch(() => {});

  import("./export-service").then(({ startExportScheduler }) => {
    startExportScheduler().catch((err: unknown) => {
      console.error("[export-service] Failed to start scheduler:", err);
    });
  }).catch(() => {});

  import("./sync-service").then(({ startSyncScheduler }) => {
    startSyncScheduler();
  }).catch(() => {});

  const { publicRouter: crashLogsPublic, adminRouter: crashLogsAdmin } = await import("./routes/crash-logs");
  app.use("/api/crash-logs", crashLogsPublic);
  app.use("/api/admin/crash-logs", crashLogsAdmin);

  return httpServer;
}
