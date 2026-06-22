// LARGE-FILE-LOCKED — limite: 567
// Aggiungi nuove funzionalità in: server/routes/client-settings-extra.ts

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { db, withDbRetry } from "../db";
import { users } from "@shared/db";
import { sql } from "drizzle-orm";
import { sendSuccess, sendError } from "../lib/api-response";

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
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting (false default):", err);
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/ads-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ads_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting:", err);
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/syneco-branding", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("syneco_branding_visible");
      res.json({ visible: setting?.value === "true" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch syneco_branding_visible:", err);
      res.json({ visible: false });
    }
  });

  app.get("/api/settings/chatbot-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("chatbot_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting:", err);
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/fake-users-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("fake_users_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting:", err);
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/sos-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("sos_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting:", err);
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/road-hazards-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("road_hazards_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch road-hazards-enabled:", err);
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/phone-sensors-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("phone_sensors_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting:", err);
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/custom-routes", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("custom_routes_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting:", err);
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/auto-matching", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("auto_matching_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting:", err);
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/music-match", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("music_match_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting:", err);
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/music-export-playlist", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("music_export_playlist_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting:", err);
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/music-import-playlist", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("music_import_playlist_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting:", err);
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/primal-user", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("primal_user_enabled");
      res.json({ enabled: setting?.value === "true" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting (false default):", err);
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/paypal", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("paypal_email");
      res.json({ email: setting?.value || "" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch paypal email:", err);
      res.json({ email: "" });
    }
  });

  app.get("/api/settings/ghost-mode-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ghost_mode_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting:", err);
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/marketplace-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("marketplace_enabled");
      res.json({ enabled: setting === null || setting === undefined ? true : setting.value === "true" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting (true default):", err);
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/gps-required", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("gps_required");
      const enabled = setting?.value !== "false";
      res.json({ enabled, required: enabled });
    } catch {
      res.json({ enabled: true, required: true });
    }
  });

  app.get("/api/settings/motoclub-include-zav", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("motoclub_include_zav");
      res.json({ enabled: setting?.value === "true" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting (false default):", err);
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/motoclub-user-creation", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("motoclub_user_creation_enabled");
      res.json({ enabled: setting?.value === "true" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting (false default):", err);
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/show-search-preference", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("show_search_preference");
      res.json({ enabled: setting?.value === "true" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting (false default):", err);
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
    } catch (err) {
      console.warn("[client-settings] Failed to fetch coordinates_max_age_seconds:", err);
      res.json({ seconds: 300 });
    }
  });

  app.get("/api/settings/profile-refetch-interval", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("profile_refetch_interval");
      const seconds = setting?.value ? parseInt(setting.value, 10) : 30;
      res.json({ seconds: isNaN(seconds) || seconds < 5 ? 30 : seconds });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch profile_refetch_interval:", err);
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
    } catch (err) {
      console.warn("[client-settings] Failed to fetch theme settings:", err);
      res.json({ userSwitchingEnabled: false, defaultTheme: "attuale" });
    }
  });

  app.get("/api/users/search", async (req: Request, res: Response) => {
    if (!req.session?.userId) return sendError(res, 401, "Non autenticato");
    try {
      const { q } = req.query as { q?: string };
      const query = (q ?? "").trim();
      if (!query || query.length < 2) return res.json([]);
      // Task #2518: fuzzy nickname search via pg_trgm (tolera typo + accenti)
      // Fallback ilike per match parziali su substring.
      const normalized = query
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
      const results = await withDbRetry(() => db
        .select({
          id: users.id,
          nickname: users.nickname,
          userType: users.userType,
          score: sql<number>`similarity(normalize_text(${users.nickname}), ${normalized})`,
        })
        .from(users)
        .where(
          sql`(normalize_text(${users.nickname}) % ${normalized}
               OR ${users.nickname} ILIKE ${"%" + query + "%"})`,
        )
        .orderBy(sql`similarity(normalize_text(${users.nickname}), ${normalized}) DESC`)
        .limit(30));
      return res.json(results);
    } catch (err) {
      console.error("[client-settings] User search failed:", err);
      return sendError(res, 500, "Errore interno");
    }
  });

  app.get("/api/settings/phone-field-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("phone_field_enabled");
      const enabled = setting?.value === "true";
      res.json({ enabled });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch phone_field_enabled:", err);
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/user-available-on-login", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("user_available_on_login");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting:", err);
      res.json({ enabled: true });
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
    } catch (err) {
      console.warn("[client-settings] Failed to fetch home-message settings:", err);
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
    } catch (err) {
      console.warn("[client-settings] Failed to fetch donation settings:", err);
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
    } catch (err) {
      console.warn("[client-settings] Failed to fetch native-version settings:", err);
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
      } catch { /* no-op: invalid JSON in splash list */ }
      res.json({ mode, message, list });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch splash settings:", err);
      res.json({ mode: "single", message: "", list: [] });
    }
  });

  const { registerPart2Routes } = require("./client-settings.part2");
  registerPart2Routes(app);
}
