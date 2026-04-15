import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import path from "node:path";
import fs from "node:fs";
import { initState } from "./init-state";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import multer from "multer";
import { pool } from "./db";
import { storage } from "./storage";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import motorcycleRoutes from "./routes/motorcycles";
import proposalRoutes from "./routes/proposals";
import trackingRoutes from "./routes/tracking";
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
import sosRoutes from "./routes/sos";
import motoclubsRoutes from "./routes/motoclubs";
import friendsRoutes from "./routes/friends";
import spotifyRoutes, { handleMusicMatch } from "./routes/spotify";
import lastfmRoutes from "./routes/lastfm";
import radioRoutes from "./routes/radio";
import eventsRoutes from "./routes/events";
import { triggerMatchingRun, triggerMatchingForUser } from "./matching-engine";
import { db } from "./db";
import { users, userFavorites } from "@shared/schema";
import { ilike, eq, and } from "drizzle-orm";
import { onlineTracker } from "./online-tracker";

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = (req as any).session as { userId?: string };
  if (!session?.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  const user = await storage.getUser(session.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Accesso non autorizzato" });
  }
  (req as any).adminUser = user;
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.set("trust proxy", 1);
  const PgStore = connectPgSimple(session);

  app.use(
    session({
      store: new PgStore({
        pool,
        tableName: "session",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        // Dev: no SameSite attribute (false) → compatible with HTTP localhost, curl, and React Native native client
        // Prod: SameSite=Lax → CSRF protection for browser, React Native ignores SameSite anyway
        sameSite: process.env.NODE_ENV === "production" ? "lax" : (false as const),
      },
    })
  );

  app.use(async (req: any, _res: any, next: any) => {
    if (req.session?.userId) {
      const userId: string = req.session.userId;
      const foundInTracker = onlineTracker.touch(userId);
      try {
        const user = await storage.getUser(userId);
        if (user && user.status !== "active") {
          onlineTracker.setOffline(userId);
        } else if (user && user.status === "active") {
          if (!foundInTracker) {
            const profile = await storage.getUserProfile(userId).catch(() => null);
            onlineTracker.setOnline(userId, {
              userType: user.userType ?? "biker",
              isAvailable: (profile?.isAvailable ?? false) && !(user.ghostMode ?? false),
              ghostMode: user.ghostMode ?? false,
              country: user.country ?? null,
            });
          }
          if (user.lastLoginAt) {
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (new Date(user.lastLoginAt) < fiveMinAgo) {
              await storage.updateUser(userId, { lastLoginAt: new Date() } as any);
            }
          }
        }
      } catch {}
    }
    next();
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/motorcycles", motorcycleRoutes);
  app.use("/api/proposals", proposalRoutes);
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
  app.use(customRoutesRouter);
  app.use("/api/admin", adminRoutes);
  app.use("/api/moderator", moderatorRoutes);
  app.use("/api/sos", sosRoutes);
  app.use("/api/motoclubs", motoclubsRoutes);
  app.use("/api/friends", friendsRoutes);
  app.use("/api/spotify", spotifyRoutes);
  app.use("/api/lastfm", lastfmRoutes);
  app.use("/api/music/radio", radioRoutes);
  app.use("/api/events", eventsRoutes);

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

  app.get("/api/settings/music-provider", async (_req: Request, res: Response) => {
    try {
      const setting = await storage.getAppSetting("music_provider");
      const provider = (setting?.value as "lastfm" | "spotify") ?? "lastfm";
      return res.json({ provider });
    } catch {
      return res.json({ provider: "lastfm" });
    }
  });

  app.get("/api/match/music", (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Non autenticato" });
    return handleMusicMatch(req, res);
  });

  app.get("/api/updates/check", async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(
        "SELECT * FROM ota_releases WHERE status = 'active' ORDER BY published_at DESC LIMIT 1"
      );
      if (!result.rows.length) {
        return res.json({ hasUpdate: false, version: null, releaseNotes: null, bundlePath: null, publishedAt: null });
      }
      const release = result.rows[0];
      return res.json({
        hasUpdate: true,
        version: release.version,
        releaseNotes: release.release_notes,
        bundlePath: release.bundle_path,
        manifestUrl: release.bundle_path,
        publishedAt: release.published_at,
      });
    } catch {
      return res.json({ hasUpdate: false, version: null, releaseNotes: null, bundlePath: null, publishedAt: null });
    }
  });

  app.get("/privacy-policy", (_req, res) => {
    const templatePath = path.resolve(
      process.cwd(),
      "server",
      "templates",
      "privacy-policy.html",
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });

  app.get("/apple-review", (_req, res) => {
    const templatePath = path.resolve(
      process.cwd(),
      "server",
      "templates",
      "apple-review.html",
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });

  app.get("/api/settings/privacy-policy", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("privacy_policy_text");
      const text = setting?.value || "";
      res.json({ text });
    } catch {
      res.json({ text: "" });
    }
  });

  app.get("/api/settings/email-verification", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("email_verification_enabled");
      const enabled = setting?.value === "true";
      res.json({ enabled });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/ads-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ads_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/syneco-branding", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("syneco_branding_visible");
      const visible = setting?.value === "true";
      res.json({ visible });
    } catch {
      res.json({ visible: false });
    }
  });

  app.get("/api/settings/chatbot-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("chatbot_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/fake-users-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("fake_users_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/sos-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("sos_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/spotify-coming-soon", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("spotify_coming_soon");
      const enabled = setting?.value === "true";
      res.json({ enabled });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/custom-routes", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("custom_routes_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/auto-matching", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("auto_matching_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/music-match", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("music_match_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/music-export-playlist", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("music_export_playlist_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/music-import-playlist", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("music_import_playlist_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/primal-user", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("primal_user_enabled");
      const enabled = setting?.value === "true";
      res.json({ enabled });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/paypal", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("paypal_email");
      const email = setting?.value || "";
      res.json({ email });
    } catch {
      res.json({ email: "" });
    }
  });

  app.get("/api/settings/ghost-mode-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ghost_mode_enabled");
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/marketplace-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("marketplace_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/gps-required", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("gps_required");
      res.json({ required: setting?.value !== "false" });
    } catch {
      res.json({ required: true });
    }
  });

  app.get("/api/settings/motoclub-include-zav", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("motoclub_include_zav");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/motoclub-user-creation", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("motoclub_user_creation_enabled");
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/show-search-preference", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("show_search_preference");
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/coordinate-history", async (_req, res) => {
    try {
      const [enabled, interval, maxRecords, mode, selectedUsers] = await Promise.all([
        storage.getAppSetting("coordinate_history_enabled"),
        storage.getAppSetting("coordinate_history_interval"),
        storage.getAppSetting("coordinate_history_max_records"),
        storage.getAppSetting("coordinate_history_mode"),
        storage.getAppSetting("coordinate_history_users"),
      ]);
      res.json({
        enabled: enabled?.value === "true",
        interval: interval?.value ? parseInt(interval.value, 10) : 30,
        maxRecords: maxRecords?.value ? parseInt(maxRecords.value, 10) : 60,
        mode: mode?.value || "all",
        selectedUsers: selectedUsers?.value ? JSON.parse(selectedUsers.value) : [],
      });
    } catch {
      res.json({ enabled: false, interval: 30, maxRecords: 60, mode: "all", selectedUsers: [] });
    }
  });

  app.get("/api/settings/coordinates-max-age", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("coordinates_max_age_seconds");
      const seconds = setting?.value ? parseInt(setting.value, 10) : 300;
      res.json({ seconds: isNaN(seconds) || seconds < 10 ? 300 : seconds });
    } catch {
      res.json({ seconds: 300 });
    }
  });

  app.get("/api/settings/profile-refetch-interval", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("profile_refetch_interval");
      const seconds = setting?.value ? parseInt(setting.value, 10) : 30;
      res.json({ seconds: isNaN(seconds) || seconds < 5 ? 30 : seconds });
    } catch {
      res.json({ seconds: 30 });
    }
  });

  app.get("/api/settings/theme", async (_req, res) => {
    try {
      const [switchingSetting, defaultSetting] = await Promise.all([
        storage.getAppSetting("theme_user_switching_enabled"),
        storage.getAppSetting("theme_default"),
      ]);
      const userSwitchingEnabled = switchingSetting?.value === "true";
      const defaultTheme = defaultSetting?.value || "attuale";
      res.json({ userSwitchingEnabled, defaultTheme });
    } catch {
      res.json({ userSwitchingEnabled: false, defaultTheme: "attuale" });
    }
  });

  app.get("/api/users/search", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Non autenticato" });
    try {
      const { q } = req.query as { q?: string };
      if (!q || q.trim().length < 2) return res.json([]);
      const results = await db
        .select({ id: users.id, nickname: users.nickname, userType: users.userType })
        .from(users)
        .where(ilike(users.nickname, `%${q.trim()}%`))
        .limit(30);
      return res.json(results);
    } catch {
      return res.status(500).json({ message: "Errore interno" });
    }
  });

  app.get("/api/settings/phone-field-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("phone_field_enabled");
      const enabled = setting?.value === "true";
      res.json({ enabled });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/user-available-on-login", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("user_available_on_login");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/ota-gate-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ota_gate_enabled");
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/ota-wait-seconds", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ota_wait_seconds");
      const seconds = parseInt(setting?.value || "10", 10);
      res.json({ seconds: isNaN(seconds) ? 10 : Math.max(0, seconds) });
    } catch {
      res.json({ seconds: 10 });
    }
  });

  app.get("/api/settings/home-message", async (_req, res) => {
    try {
      const [enabledSetting, textSetting] = await Promise.all([
        storage.getAppSetting("home_message_enabled"),
        storage.getAppSetting("home_message_text"),
      ]);
      res.json({
        enabled: enabledSetting?.value === "true",
        text: textSetting?.value || "",
      });
    } catch {
      res.json({ enabled: false, text: "" });
    }
  });

  app.get("/api/settings/donation", async (_req, res) => {
    try {
      const [enabledSetting, textSetting, paypalSetting] = await Promise.all([
        storage.getAppSetting("donation_enabled"),
        storage.getAppSetting("donation_text"),
        storage.getAppSetting("paypal_email"),
      ]);
      res.json({
        enabled: enabledSetting?.value === "true",
        text: textSetting?.value || "",
        paypalEmail: paypalSetting?.value || "",
      });
    } catch {
      res.json({ enabled: false, text: "", paypalEmail: "" });
    }
  });

  app.get("/api/settings/splash", async (_req, res) => {
    try {
      const [modeSetting, messageSetting, listSetting] = await Promise.all([
        storage.getAppSetting("splash_message_mode"),
        storage.getAppSetting("splash_message"),
        storage.getAppSetting("splash_messages_list"),
      ]);
      const mode = modeSetting?.value || "single";
      const message = messageSetting?.value || "";
      let list: string[] = [];
      try {
        list = JSON.parse(listSetting?.value || "[]");
      } catch {}
      res.json({ mode, message, list });
    } catch {
      res.json({ mode: "single", message: "", list: [] });
    }
  });

  app.get("/api/settings/maps", async (_req, res) => {
    try {
      const [enabledSetting, providerSetting, userChoiceSetting] = await Promise.all([
        storage.getAppSetting("maps_enabled"),
        storage.getAppSetting("maps_provider"),
        storage.getAppSetting("maps_user_choice_enabled"),
      ]);
      res.json({
        enabled: enabledSetting?.value !== "false",
        provider: providerSetting?.value || "carto_light",
        userChoiceEnabled: userChoiceSetting?.value !== "false",
      });
    } catch {
      res.json({ enabled: true, provider: "carto_light", userChoiceEnabled: true });
    }
  });

  app.get("/api/settings/maps-user-choice", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("maps_user_choice_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/maps-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("maps_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/maps-provider", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("maps_provider");
      res.json({ provider: setting?.value || "carto_light" });
    } catch {
      res.json({ provider: "carto_light" });
    }
  });

  app.get("/api/settings/bg-location", async (_req, res) => {
    try {
      const [enabled, trigger, interval, notificationText, ghostModeContinue] = await Promise.all([
        storage.getAppSetting("bg_location_enabled"),
        storage.getAppSetting("bg_location_trigger"),
        storage.getAppSetting("bg_location_interval_seconds"),
        storage.getAppSetting("bg_location_notification_text"),
        storage.getAppSetting("bg_location_ghost_mode_continue"),
      ]);
      res.json({
        enabled: enabled?.value !== "false",
        trigger: trigger?.value || "always",
        intervalSeconds: interval?.value ? parseInt(interval.value, 10) : 30,
        notificationText: notificationText?.value || "BikerLink: {motivo} — posizione attiva in background",
        ghostModeContinue: ghostModeContinue?.value === "true",
      });
    } catch {
      res.json({
        enabled: true,
        trigger: "always",
        intervalSeconds: 30,
        notificationText: "BikerLink: {motivo} — posizione attiva in background",
        ghostModeContinue: false,
      });
    }
  });

  app.post("/api/location/bg-update", async (req: any, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ message: "Non autenticato" });
      }
      const userId: string = req.session.userId;
      const { latitude, longitude, altitude, accuracy, timestamp, activeRouteId, isSosActive, isGhostMode } = req.body;
      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return res.status(400).json({ message: "Coordinate non valide" });
      }
      try {
        const profileUpdate: any = { latitude, longitude, coordinatesUpdatedAt: new Date() };
        const existing = await storage.getUserProfile(userId);
        if (existing) {
          await storage.updateUserProfile(userId, profileUpdate);
        }
        storage.saveCoordinateHistory(userId, latitude, longitude).catch(() => {});
      } catch {}

      if (activeRouteId && typeof activeRouteId === "string") {
        try {
          const route = await storage.getRoute(activeRouteId);
          if (route && route.userId === userId && route.status === "active") {
            const point: any = {
              routeId: activeRouteId,
              latitude,
              longitude,
              altitude: typeof altitude === "number" ? altitude : null,
              speedKmh: null,
              timestamp: timestamp ? new Date(timestamp) : new Date(),
            };
            await storage.createRoutePoints([point]);
          }
        } catch {}
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error("BG location update error:", error);
      return res.status(500).json({ message: "Errore interno del server" });
    }
  });

  app.get("/api/settings/floating-widget", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("floating_widget_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/all", async (_req, res) => {
    try {
      const [syneco, emailVerification, chatbot, autoMatching, customRoutes, paypal, sosEnabled, mapsEnabled, mapsProvider] = await Promise.all([
        storage.getAppSetting("syneco_branding_visible"),
        storage.getAppSetting("email_verification_enabled"),
        storage.getAppSetting("chatbot_enabled"),
        storage.getAppSetting("auto_matching_enabled"),
        storage.getAppSetting("custom_routes_enabled"),
        storage.getAppSetting("paypal_email"),
        storage.getAppSetting("sos_enabled"),
        storage.getAppSetting("maps_enabled"),
        storage.getAppSetting("maps_provider"),
      ]);
      res.json({
        synecoBranding: syneco?.value === "true",
        emailVerification: emailVerification?.value === "true",
        chatbotEnabled: chatbot?.value !== "false",
        autoMatching: autoMatching?.value !== "false",
        customRoutes: customRoutes?.value !== "false",
        paypalEmail: paypal?.value || "",
        sosEnabled: sosEnabled?.value !== "false",
        mapsEnabled: mapsEnabled?.value !== "false",
        mapsProvider: mapsProvider?.value || "carto_light",
      });
    } catch {
      res.json({
        synecoBranding: false,
        emailVerification: false,
        chatbotEnabled: true,
        autoMatching: true,
        customRoutes: true,
        paypalEmail: "",
        sosEnabled: true,
        mapsEnabled: true,
        mapsProvider: "carto_light",
      });
    }
  });

  const MANUAL_PATH = path.resolve(process.cwd(), "server/public/bikerlink-manual.pdf");
  const MANUAL_DIR = path.dirname(MANUAL_PATH);
  const EULA_PDF_PATH = path.resolve(process.cwd(), "server/public/bikerlink-eula.pdf");
  const PRIVACY_PDF_PATH = path.resolve(process.cwd(), "server/public/bikerlink-privacy-policy.pdf");

  app.get("/api/manual/download", (_req, res) => {
    if (!fs.existsSync(MANUAL_PATH)) {
      return res.status(404).json({ message: "Manuale non disponibile" });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-Manual.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(MANUAL_PATH);
    stream.on("error", (err) => {
      console.error("Manual stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Errore lettura file" });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  });

  app.get("/api/manual/info", (_req, res) => {
    if (!fs.existsSync(MANUAL_PATH)) {
      return res.json({ available: false });
    }
    const stats = fs.statSync(MANUAL_PATH);
    res.json({
      available: true,
      fileName: "BikerLink-Manual.pdf",
      fileSize: stats.size,
      lastModified: stats.mtime.toISOString(),
    });
  });

  const manualUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(MANUAL_DIR)) fs.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-manual.pdf"),
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  app.post("/api/admin/manual/upload", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Accesso non autorizzato" });

    manualUpload.single("file")(req, res, (err: any) => {
      if (err) return res.status(400).json({ message: err.message || "Errore upload" });
      if (!req.file) return res.status(400).json({ message: "Nessun file caricato" });
      const stats = fs.statSync(MANUAL_PATH);
      res.json({
        message: "Manuale aggiornato con successo",
        fileName: "BikerLink-Manual.pdf",
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString(),
      });
    });
  });

  const eulaUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(MANUAL_DIR)) fs.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-eula.pdf"),
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  const privacyUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(MANUAL_DIR)) fs.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-privacy-policy.pdf"),
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  app.get("/api/eula/download", (_req, res) => {
    if (!fs.existsSync(EULA_PDF_PATH)) {
      return res.status(404).json({ message: "EULA non disponibile" });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-EULA.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(EULA_PDF_PATH);
    stream.on("error", (err) => {
      console.error("EULA stream error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Errore lettura file" });
      else res.end();
    });
    stream.pipe(res);
  });

  app.get("/api/eula/info", (_req, res) => {
    if (!fs.existsSync(EULA_PDF_PATH)) return res.json({ available: false });
    const stats = fs.statSync(EULA_PDF_PATH);
    res.json({ available: true, fileName: "BikerLink-EULA.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
  });

  app.post("/api/admin/eula/upload", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Accesso non autorizzato" });

    eulaUpload.single("file")(req, res, (err: any) => {
      if (err) return res.status(400).json({ message: err.message || "Errore upload" });
      if (!req.file) return res.status(400).json({ message: "Nessun file caricato" });
      const stats = fs.statSync(EULA_PDF_PATH);
      res.json({ message: "EULA aggiornato con successo", fileName: "BikerLink-EULA.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
    });
  });

  app.get("/api/privacy-policy/download", (_req, res) => {
    if (!fs.existsSync(PRIVACY_PDF_PATH)) {
      return res.status(404).json({ message: "Privacy Policy non disponibile" });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-PrivacyPolicy.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(PRIVACY_PDF_PATH);
    stream.on("error", (err) => {
      console.error("Privacy Policy stream error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Errore lettura file" });
      else res.end();
    });
    stream.pipe(res);
  });

  app.get("/api/privacy-policy/info", (_req, res) => {
    if (!fs.existsSync(PRIVACY_PDF_PATH)) return res.json({ available: false });
    const stats = fs.statSync(PRIVACY_PDF_PATH);
    res.json({ available: true, fileName: "BikerLink-PrivacyPolicy.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
  });

  app.post("/api/admin/privacy-policy/upload", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Accesso non autorizzato" });

    privacyUpload.single("file")(req, res, (err: any) => {
      if (err) return res.status(400).json({ message: err.message || "Errore upload" });
      if (!req.file) return res.status(400).json({ message: "Nessun file caricato" });
      const stats = fs.statSync(PRIVACY_PDF_PATH);
      res.json({ message: "Privacy Policy aggiornata con successo", fileName: "BikerLink-PrivacyPolicy.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
    });
  });

  app.get("/api/user/export-data", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(404).json({ message: "Utente non trovato" });

    const userId = user.id;

    const [photos, gpsRoutes, sentMessagesResult, contestResult] = await Promise.all([
      storage.getUserPhotos(userId),
      storage.getRoutes(userId),
      pool.query<{
        message_id: string;
        conversation_id: string;
        message_type: string;
        content: string | null;
        image_url: string | null;
        latitude: number | null;
        longitude: number | null;
        created_at: Date;
      }>(
        `SELECT m.id AS message_id, m.conversation_id, m.message_type, m.content,
                m.image_url, m.latitude, m.longitude, m.created_at
         FROM messages m
         WHERE m.sender_id = $1
         ORDER BY m.created_at DESC`,
        [userId]
      ),
      pool.query<{
        id: string;
        photo_url: string | null;
        caption: string | null;
        week_number: number;
        year: number;
        votes_count: number;
        is_approved: boolean;
        created_at: Date;
      }>(
        `SELECT id, photo_url, caption, week_number, year, votes_count, is_approved, created_at
         FROM photo_contest_entries
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      ),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        phone: user.phone ?? null,
        userType: user.userType,
        sex: user.sex ?? null,
        birthYear: user.birthYear ?? null,
        country: user.country ?? null,
        region: user.region ?? null,
        role: user.role,
        status: user.status,
        eulaAccepted: user.eulaAccepted,
        privacyAccepted: user.privacyAccepted,
        consentAcceptedAt: user.consentAcceptedAt ?? null,
        createdAt: user.createdAt ?? null,
      },
      photos: photos.map((p) => ({
        id: p.id,
        photoUrl: p.photoUrl,
        sortOrder: p.sortOrder,
        isApproved: p.isApproved,
        uploadedAt: p.createdAt,
      })),
      gpsRoutes: gpsRoutes.map((r) => ({
        id: r.id,
        title: r.title ?? null,
        status: r.status,
        totalDistanceKm: r.totalDistanceKm ?? 0,
        durationSeconds: r.durationSeconds ?? 0,
        startedAt: r.startedAt,
        stoppedAt: r.stoppedAt ?? null,
        createdAt: r.createdAt,
      })),
      sentMessages: sentMessagesResult.rows.map((m) => ({
        id: m.message_id,
        conversationId: m.conversation_id,
        messageType: m.message_type,
        content: m.content ?? null,
        imageUrl: m.image_url ?? null,
        latitude: m.latitude ?? null,
        longitude: m.longitude ?? null,
        sentAt: m.created_at,
      })),
      contestEntries: contestResult.rows.map((e) => ({
        id: e.id,
        photoUrl: e.photo_url ?? null,
        caption: e.caption ?? null,
        weekNumber: e.week_number,
        year: e.year,
        votesReceived: e.votes_count,
        isApproved: e.is_approved,
        submittedAt: e.created_at,
      })),
    };

    const json = JSON.stringify(exportData, null, 2);
    const filename = `BikerLink-UserData-${user.nickname}-${new Date().toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.send(json);
  });

  app.post("/api/matching/trigger", (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const userId = req.session.userId;
    triggerMatchingForUser(userId);
    const result = triggerMatchingRun();
    res.json({ ok: true, ...result });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", initializing: initState.initializing });
  });

  app.get("/api/admin/uptime", requireAdmin, async (_req, res) => {
    const { SERVER_START_TIME, uptimeState } = await import("./uptime");
    res.json({
      backendStartedAt: SERVER_START_TIME,
      metroStartedAt: uptimeState.metroStartTime,
      metroLastSeenAt: uptimeState.metroLastSeenAt,
      metroOnline: uptimeState.metroOnline,
      frontendStartTime: uptimeState.frontendStartTime,
      serverNow: Date.now(),
    });
  });

  app.get("/api/admin/system-health", requireAdmin, async (_req, res) => {
    const { SERVER_START_TIME, uptimeState } = await import("./uptime");
    const now = Date.now();
    const backendUptimeSec = Math.floor((now - SERVER_START_TIME) / 1000);
    const metroUptimeSec = uptimeState.metroOnline && uptimeState.metroStartTime > 0
      ? Math.floor((now - uptimeState.metroStartTime) / 1000)
      : 0;

    const events: { timestamp: string; message: string; type: string }[] = [];
    try {
      const fs = await import("fs");
      const path = await import("path");
      const logPath = path.join(process.cwd(), "logs", "uptime-resets.log");
      if (fs.existsSync(logPath)) {
        const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
        for (const line of lines) {
          const spaceIdx = line.indexOf(" ");
          if (spaceIdx === -1) continue;
          const timestamp = line.slice(0, spaceIdx);
          const message = line.slice(spaceIdx + 1);
          let type = "INFO";
          if (message.startsWith("BACKEND UP (cold start)")) type = "COLD_START";
          else if (message.startsWith("BACKEND RESTART")) type = "BACKEND_RESTART";
          else if (message.startsWith("METRO UP")) type = "METRO_UP";
          else if (message.startsWith("METRO DOWN")) type = "METRO_DOWN";
          events.push({ timestamp, message, type });
        }
        events.reverse();
      }
    } catch {}

    res.json({
      backendStartedAt: SERVER_START_TIME,
      backendUptimeSec,
      metroOnline: uptimeState.metroOnline,
      metroStartedAt: uptimeState.metroStartTime,
      metroUptimeSec,
      events,
    });
  });

  app.get("/api/admin/restart-history", requireAdmin, async (_req, res) => {
    const { db } = await import("./db");
    const { serverRestarts } = await import("@shared/schema");
    const { desc, count } = await import("drizzle-orm");
    const [countResult, rows] = await Promise.all([
      db.select({ count: count() }).from(serverRestarts),
      db.select().from(serverRestarts).orderBy(desc(serverRestarts.startedAt)).limit(50),
    ]);
    res.json({
      total: countResult[0]?.count ?? 0,
      restarts: rows.map((r) => ({
        id: r.id,
        startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt,
        reason: r.reason,
      })),
    });
  });

  setInterval(async () => {
    try {
      const deleted = await storage.cleanupOldCoordinateHistory();
      if (deleted > 0) {
        console.log(`[CoordinateHistory] Pulizia: rimossi ${deleted} record`);
      }
    } catch (err) {
      console.error("[CoordinateHistory] Cleanup error:", err);
    }
  }, 5 * 60 * 1000);

  app.post("/api/admin/client-error", async (req, res) => {
    try {
      const { message, stack, componentStack, platform, appVersion } = req.body || {};
      console.error("[CLIENT-ERROR]", JSON.stringify({
        message: message || "unknown",
        stack: (stack || "").substring(0, 2000),
        componentStack: (componentStack || "").substring(0, 1000),
        platform: platform || "unknown",
        appVersion: appVersion || "unknown",
        timestamp: new Date().toISOString(),
        ip: req.ip,
      }));
      res.json({ received: true });
    } catch {
      res.status(200).json({ received: true });
    }
  });

  const httpServer = createServer(app);

  import("./backup-service").then(({ startScheduler }) => {
    startScheduler().catch((err) => {
      console.error("[backup-service] Failed to start scheduler:", err);
    });
  }).catch(() => {});

  return httpServer;
}
