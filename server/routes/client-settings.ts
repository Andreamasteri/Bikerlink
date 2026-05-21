import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/schema";
import { ilike } from "drizzle-orm";

export function registerClientSettingsRoutes(app: Express) {
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
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/ads-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ads_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/syneco-branding", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("syneco_branding_visible");
      res.json({ visible: setting?.value === "true" });
    } catch {
      res.json({ visible: false });
    }
  });

  app.get("/api/settings/chatbot-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("chatbot_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/fake-users-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("fake_users_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/sos-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("sos_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/phone-sensors-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("phone_sensors_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/custom-routes", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("custom_routes_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/auto-matching", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("auto_matching_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/music-match", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("music_match_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/music-export-playlist", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("music_export_playlist_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/music-import-playlist", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("music_import_playlist_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/primal-user", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("primal_user_enabled");
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/paypal", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("paypal_email");
      res.json({ email: setting?.value || "" });
    } catch {
      res.json({ email: "" });
    }
  });

  app.get("/api/settings/ghost-mode-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ghost_mode_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/marketplace-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("marketplace_enabled");
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
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
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
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

  app.get("/api/settings/search-preference-locked", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("search_preference_locked");
      res.json({ locked: setting?.value === "true" });
    } catch {
      res.json({ locked: false });
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

  app.get("/api/users/search", async (req: Request, res: Response) => {
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

  app.get("/api/settings/native-version", async (_req, res) => {
    try {
      const [androidLatest, androidMin, androidUrl, iosLatest, iosMin, iosUrl] = await Promise.all([
        storage.getAppSetting("native_android_latest"),
        storage.getAppSetting("native_android_min"),
        storage.getAppSetting("native_android_store_url"),
        storage.getAppSetting("native_ios_latest"),
        storage.getAppSetting("native_ios_min"),
        storage.getAppSetting("native_ios_store_url"),
      ]);
      return res.json({
        android: {
          latestVersion: androidLatest?.value || "1.0.0",
          minVersion: androidMin?.value || "1.0.0",
          storeUrl: androidUrl?.value || "https://play.google.com/store/apps/details?id=com.bikerlink.app",
        },
        ios: {
          latestVersion: iosLatest?.value || "1.0.0",
          minVersion: iosMin?.value || "1.0.0",
          storeUrl: iosUrl?.value || "https://apps.apple.com/app/bikerlink",
        },
      });
    } catch {
      return res.json({
        android: { latestVersion: "1.0.0", minVersion: "1.0.0", storeUrl: "https://play.google.com/store/apps/details?id=com.bikerlink.app" },
        ios: { latestVersion: "1.0.0", minVersion: "1.0.0", storeUrl: "https://apps.apple.com/app/bikerlink" },
      });
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
      const [enabledSetting, providerSetting] = await Promise.all([
        storage.getAppSetting("maps_enabled"),
        storage.getAppSetting("maps_provider"),
      ]);
      res.json({
        enabled: enabledSetting?.value !== "false",
        provider: providerSetting?.value || "carto_light",
      });
    } catch {
      res.json({ enabled: true, provider: "carto_light" });
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
      const [syneco, emailVerification, chatbot, autoMatching, customRoutes, paypal, sosEnabled, mapsEnabled, mapsProvider, unitsPref] = await Promise.all([
        storage.getAppSetting("syneco_branding_visible"),
        storage.getAppSetting("email_verification_enabled"),
        storage.getAppSetting("chatbot_enabled"),
        storage.getAppSetting("auto_matching_enabled"),
        storage.getAppSetting("custom_routes_enabled"),
        storage.getAppSetting("paypal_email"),
        storage.getAppSetting("sos_enabled"),
        storage.getAppSetting("maps_enabled"),
        storage.getAppSetting("maps_provider"),
        storage.getAppSetting("units_preference_enabled"),
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
        unitsPrefEnabled: unitsPref?.value === "true",
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
        unitsPrefEnabled: false,
      });
    }
  });
}
