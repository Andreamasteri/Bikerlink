import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { sendSuccess, sendError } from "../lib/api-response";

export function registerPart2Routes(app: Express) {
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

  app.post("/api/location/bg-update", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        return sendError(res, 401, "Non autenticato");
      }
      const userId: string = req.session.userId;
      const { latitude, longitude, altitude, accuracy: _accuracy, timestamp, activeRouteId, isSosActive: _isSosActive, isGhostMode: _isGhostMode } = req.body;
      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return sendError(res, 400, "Coordinate non valide");
      }
      try {
        const profileUpdate = { latitude, longitude, coordinatesUpdatedAt: new Date() };
        const existing = await storage.getUserProfile(userId);
        if (existing) {
          await storage.updateUserProfile(userId, profileUpdate);
        }
        storage.saveCoordinateHistory(userId, latitude, longitude).catch(() => {});
      } catch {
        // best-effort: profile/coordinate update failures are non-fatal here
      }

      if (activeRouteId && typeof activeRouteId === "string") {
        try {
          const route = await storage.getRoute(activeRouteId);
          if (route && route.userId === userId && route.status === "active") {
            const point = {
              routeId: activeRouteId,
              latitude,
              longitude,
              altitude: typeof altitude === "number" ? altitude : null,
              speedKmh: null as number | null,
              timestamp: timestamp ? new Date(timestamp) : new Date(),
            };
            await storage.createRoutePoints([point]);
          }
        } catch {
          // best-effort: route-point tracking failures are non-fatal here
        }
      }

      return sendSuccess(res);
    } catch (error) {
      console.error("BG location update error:", error);
      return sendError(res, 500, "Errore interno del server");
    }
  });

  app.get("/api/settings/floating-widget", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("floating_widget_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch (err) {
      console.warn("[client-settings] Failed to fetch setting:", err);
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/all", async (_req, res) => {
    try {
      const [syneco, emailVerification, chatbot, autoMatching, customRoutes, paypal, sosEnabled, mapsEnabled, mapsProvider, unitsPref] = await storage.getAppSettings([
        "syneco_branding_visible",
        "email_verification_enabled",
        "chatbot_enabled",
        "auto_matching_enabled",
        "custom_routes_enabled",
        "paypal_email",
        "sos_enabled",
        "maps_enabled",
        "maps_provider",
        "units_preference_enabled",
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
