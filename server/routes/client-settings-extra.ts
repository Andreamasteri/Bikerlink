import type { Express, Request } from "express";
import { isValhallaAvailableCached } from "../routing/valhalla-client";
import { storage } from "../storage";
import { TILE_PROVIDERS, DEFAULT_TILE_PROVIDER_ID, findTileProvider } from "../../lib/maps/tile-providers";
import { getPublicTileInfo } from "../../lib/maps/tile-for-renderer";

/**
 * Rotte di impostazioni client aggiuntive (overflow di client-settings.ts, che è
 * bloccato a dimensione massima — vedi header di quel file).
 */
export function registerClientSettingsExtraRoutes(app: Express) {
  // Gate pubblico per il profilo "auto panoramica" (auto_curvy): vero solo se il
  // server Valhalla self-hosted è configurato e raggiungibile. Il client usa
  // questo flag per mostrare/nascondere l'opzione nel pianificatore giri.
  app.get("/api/settings/valhalla-available", async (_req, res) => {
    try {
      const available = await isValhallaAvailableCached();
      res.json({ available });
    } catch (err) {
      console.warn("[client-settings-extra] valhalla-available check failed:", err);
      res.json({ available: false });
    }
  });

  app.get("/api/settings/maps", async (_req, res) => {
    try {
      const [enabledSetting, providerSetting, rolloutSetting, rendererSetting, engineSetting, activeTileSetting] = await Promise.all([
        storage.getAppSetting("maps_enabled"),
        storage.getAppSetting("maps_provider"),
        storage.getAppSetting("maps_rollout"),
        storage.getAppSetting("maps_renderer"),
        storage.getAppSetting("maps_routing_engine"),
        storage.getAppSetting("active_tile_provider"),
      ]);
      const rawTileId = activeTileSetting?.value ?? DEFAULT_TILE_PROVIDER_ID;
      const rawProvider = findTileProvider(rawTileId);
      const activeTileId = (rawProvider && !rawProvider.archived) ? rawTileId : DEFAULT_TILE_PROVIDER_ID;
      const tileProviderObj = findTileProvider(activeTileId) ?? findTileProvider(DEFAULT_TILE_PROVIDER_ID)!;
      res.json({
        enabled: enabledSetting?.value !== "false",
        provider: providerSetting?.value || "carto_light",
        rollout: rolloutSetting?.value ?? "disabled",
        renderer: rendererSetting?.value ?? "leaflet",
        engine: engineSetting?.value ?? "graphhopper",
        tile_provider: getPublicTileInfo(tileProviderObj),
      });
    } catch (err) {
      console.warn("[client-settings-extra] Failed to fetch maps settings:", err);
      const fallback = findTileProvider(DEFAULT_TILE_PROVIDER_ID)!;
      res.json({ enabled: true, provider: "carto_light", rollout: "disabled", renderer: "leaflet", engine: "graphhopper", tile_provider: getPublicTileInfo(fallback) });
    }
  });

  app.get("/api/settings/maps-rollout", async (_req, res) => {
    try {
      const [rolloutSetting, rendererSetting, engineSetting, testerCustomizeSetting] = await Promise.all([
        storage.getAppSetting("maps_rollout"),
        storage.getAppSetting("maps_renderer"),
        storage.getAppSetting("maps_routing_engine"),
        storage.getAppSetting("maps_tester_can_customize"),
      ]);
      res.json({
        rollout: rolloutSetting?.value ?? "disabled",
        renderer: rendererSetting?.value ?? "leaflet",
        engine: engineSetting?.value ?? "graphhopper",
        testerCanCustomize: testerCustomizeSetting?.value === "true",
      });
    } catch (err) {
      console.warn("[client-settings-extra] Failed to fetch maps-rollout settings:", err);
      res.json({ rollout: "disabled", renderer: "leaflet", engine: "graphhopper", testerCanCustomize: false });
    }
  });

  app.get("/api/settings/maps-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("maps_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch (err) {
      console.warn("[client-settings-extra] Failed to fetch setting:", err);
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

  app.get("/api/settings/tile-providers", async (req: Request, res) => {
    try {
      const { getStatus } = await import("./maps/provider-status");
      const setting = await storage.getAppSetting("active_tile_provider");
      const rawActiveId = setting?.value ?? DEFAULT_TILE_PROVIDER_ID;
      const rawActiveProvider = findTileProvider(rawActiveId);

      const platformFilter = req.query?.platform as string | undefined;

      const filteredProviders = TILE_PROVIDERS.filter((p) => {
        if (p.archived) return false;
        if (!platformFilter) return true;
        return p.platform === platformFilter || p.platform === "both";
      });

      let activeId: string;
      if (!rawActiveProvider || rawActiveProvider.archived) {
        activeId = DEFAULT_TILE_PROVIDER_ID;
      } else if (platformFilter && !filteredProviders.find((p) => p.id === rawActiveId)) {
        activeId = filteredProviders[0]?.id ?? DEFAULT_TILE_PROVIDER_ID;
      } else {
        activeId = rawActiveId;
      }

      const providers = await Promise.all(
        filteredProviders.map(async (p) => {
          const status = await getStatus(p.id);
          return {
            id: p.id,
            label: p.label,
            category: p.category,
            cost: p.cost,
            tierLimited: p.tierLimited ?? false,
            maxZoom: p.maxZoom,
            rendererCompat: p.rendererCompat,
            urlTemplate: p.urlTemplate,
            keyRequired: !!p.apiKeyEnvVar,
            isActive: p.id === activeId,
            platform: p.platform,
            status,
          };
        }),
      );

      const activeProvider = providers.find((p) => p.isActive) ?? providers[0];
      const fallbackActive = activeProvider?.status !== "active";

      res.json({ providers, activeId, active: activeProvider, fallback_active: fallbackActive });
    } catch (err) {
      console.warn("[client-settings-extra] Failed to fetch tile-providers:", err);
      const fallback = findTileProvider(DEFAULT_TILE_PROVIDER_ID)!;
      res.json({ providers: [], activeId: DEFAULT_TILE_PROVIDER_ID, active: getPublicTileInfo(fallback), fallback_active: false });
    }
  });
}
