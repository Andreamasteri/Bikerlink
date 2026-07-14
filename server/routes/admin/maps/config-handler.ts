import { Router, type Request, type Response } from "express";
import { storage } from "../../../storage";
import { sendError } from "../../../lib/api-response";
import { getGeocodeCacheStats } from "../../../lib/photon-client";
import {
  AVAILABLE_RENDERERS, AVAILABLE_TILES, AVAILABLE_ENGINES, AVAILABLE_PROFILES,
  DEFAULT_RENDERER, DEFAULT_TILE, DEFAULT_ENGINE, DEFAULT_PROFILE,
} from "./options";
import type { MapsRendererId, MapsTileId, RoutingEngineId, RoutingProfileId, MapsRollout } from "@shared/maps-config";
import { checkQuota } from "../../../routing/mapbox/quota-guard";
import { getDemSource } from "../../../../lib/maplibre/style-3d";
import { getPhotonHealthSnapshot } from "../../../lib/photon-client";

const router = Router();

/**
 * Mapbox è non-stub (implementato) quando compare in AVAILABLE_ENGINES con implemented:true.
 * La quota viene sempre inclusa nel payload config perché Mapbox è sempre disponibile.
 */
function isMapboxAvailable(): boolean {
  return AVAILABLE_ENGINES.some((e) => e.id === "mapbox-directions" && e.implemented);
}

router.get("/config", async (_req: Request, res: Response) => {
  try {
    const [rolloutSetting, rendererSetting, tileSetting, engineSetting, profileSetting, osmSetting, matchingIntegrationSetting, testerCustomizeSetting, photonHealth] =
      await Promise.all([
        storage.getAppSetting("maps_rollout"),
        storage.getAppSetting("maps_renderer"),
        storage.getAppSetting("maps_tile"),
        storage.getAppSetting("maps_routing_engine"),
        storage.getAppSetting("maps_routing_profile"),
        storage.getAppSetting("osm_last_updated_at"),
        storage.getAppSetting("matching_integration"),
        storage.getAppSetting("maps_tester_can_customize"),
        getPhotonHealthSnapshot(),
      ]);

    const routing = (engineSetting?.value ?? DEFAULT_ENGINE) as RoutingEngineId;

    const normalizeTileId = (v: string | undefined): MapsTileId => {
      const legacy: Record<string, MapsTileId> = {
        carto_light: "carto-light",
        carto_dark: "carto-dark",
        osm: "osm-standard",
      };
      const raw = v ?? DEFAULT_TILE;
      return (legacy[raw] ?? raw) as MapsTileId;
    };


    let mapbox_quota: object | undefined;
    if (isMapboxAvailable()) {
      const quota = await checkQuota().catch(() => null);
      if (quota) {
        mapbox_quota = {
          used: quota.used,
          limit: quota.limit,
          percent: quota.percent,
          warning_threshold: quota.warning_threshold,
          resets_at: quota.resets_at,
        };
      }
    }

    const maplibreKey = process.env.MAPLIBRE_API_KEY;
    const tileSourceStatus: "maptiler" | "demo" =
      maplibreKey && maplibreKey.length > 4 ? "maptiler" : "demo";

    const payload: Record<string, unknown> = {
      rollout: (rolloutSetting?.value ?? "disabled") as MapsRollout,
      renderer: (rendererSetting?.value ?? DEFAULT_RENDERER) as MapsRendererId,
      tile: normalizeTileId(tileSetting?.value ?? undefined),
      routing,
      profile: (profileSetting?.value ?? DEFAULT_PROFILE) as RoutingProfileId,
      tile_source_status: tileSourceStatus,
      dem_source: getDemSource(),
      renderer_notes: "Renderer sperimentali sono stub — delegano a Leaflet.",
      routing_notes: "Engine sperimentali sono stub — delegano a GraphHopper.",
      osm_last_updated_at: osmSetting?.value ?? null,
      available_renderers: AVAILABLE_RENDERERS,
      available_tiles: AVAILABLE_TILES,
      available_engines: AVAILABLE_ENGINES,
      available_profiles: AVAILABLE_PROFILES,
      // Task #2528 — toggle integrazione matching ↔ planned routes
      matching_integration: matchingIntegrationSetting?.value !== "false",
      // Consenti ai tester di personalizzare renderer/tile dal proprio profilo (default OFF)
      tester_can_customize: testerCustomizeSetting?.value === "true",
      photon: photonHealth,
    };

    if (mapbox_quota !== undefined) {
      payload.mapbox_quota = mapbox_quota;
    }

    return res.json(payload);
  } catch (err) {
    console.error("[admin/maps/config] GET error:", err);
    return sendError(res, 500, "Errore caricamento configurazione mappe");
  }
});

router.put("/renderer", async (req: Request, res: Response) => {
  try {
    const { renderer, tile } = req.body as { renderer?: unknown; tile?: unknown };
    const validRenderers = AVAILABLE_RENDERERS.map((r) => r.id);
    const validTiles = AVAILABLE_TILES.map((t) => t.id);

    if (!renderer || !validRenderers.includes(renderer as MapsRendererId)) {
      return sendError(res, 400, `renderer non valido. Valori ammessi: ${validRenderers.join(", ")}`);
    }
    if (tile !== undefined && !validTiles.includes(tile as MapsTileId)) {
      return sendError(res, 400, `tile non valido. Valori ammessi: ${validTiles.join(", ")}`);
    }

    await Promise.all([
      storage.upsertAppSetting("maps_renderer", renderer as string),
      tile !== undefined
        ? storage.upsertAppSetting("maps_tile", tile as string)
        : Promise.resolve(),
    ]);

    return res.json({ ok: true, renderer, tile: tile ?? DEFAULT_TILE });
  } catch (err) {
    console.error("[admin/maps/config] PUT renderer error:", err);
    return sendError(res, 500, "Errore aggiornamento renderer");
  }
});

router.put("/routing", async (req: Request, res: Response) => {
  try {
    const { engine, profile } = req.body as { engine?: unknown; profile?: unknown };
    const validEngines = AVAILABLE_ENGINES.map((e) => e.id);
    const validProfiles = AVAILABLE_PROFILES.map((p) => p.id);

    if (!engine || !validEngines.includes(engine as RoutingEngineId)) {
      return sendError(res, 400, `engine non valido. Valori ammessi: ${validEngines.join(", ")}`);
    }
    if (profile !== undefined && !validProfiles.includes(profile as RoutingProfileId)) {
      return sendError(res, 400, `profile non valido. Valori ammessi: ${validProfiles.join(", ")}`);
    }

    await Promise.all([
      storage.upsertAppSetting("maps_routing_engine", engine as string),
      profile !== undefined
        ? storage.upsertAppSetting("maps_routing_profile", profile as string)
        : Promise.resolve(),
    ]);

    return res.json({ ok: true, engine, profile: profile ?? DEFAULT_PROFILE });
  } catch (err) {
    console.error("[admin/maps/config] PUT routing error:", err);
    return sendError(res, 500, "Errore aggiornamento routing engine");
  }
});

/**
 * Task #2528 — Toggle integrazione matching ↔ planned routes.
 * Disabilitabile in emergenza per stoppare job analisi + matcher invite.
 */
router.put("/matching-integration", async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== "boolean") {
      return sendError(res, 400, "enabled (boolean) obbligatorio");
    }
    await storage.upsertAppSetting("matching_integration", enabled ? "true" : "false");
    try {
      const mod = await import("../../../matching/jobs/analyze-planned-route");
      mod.invalidateMatchingIntegrationCache();
    } catch { /* ignore — modulo non disponibile */ }
    return res.json({ ok: true, enabled });
  } catch (err) {
    console.error("[admin/maps/config] PUT matching-integration error:", err);
    return sendError(res, 500, "Errore aggiornamento integrazione matching");
  }
});

/**
 * PUT /admin/maps/tester-customize — abilita/disabilita la personalizzazione
 * renderer/tile da parte dei tester (rollout=tester). Persiste in app_settings.
 */
router.put("/tester-customize", async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== "boolean") {
      return sendError(res, 400, "enabled (boolean) obbligatorio");
    }
    await storage.upsertAppSetting("maps_tester_can_customize", enabled ? "true" : "false");
    return res.json({ ok: true, enabled });
  } catch (err) {
    console.error("[admin/maps/config] PUT tester-customize error:", err);
    return sendError(res, 500, "Errore aggiornamento personalizzazione tester");
  }
});

/**
 * GET /admin/maps/geocode-cache — statistiche cache Photon (hits, misses, size).
 * Utile per monitorare l'efficacia del caching e il carico sul server Photon.
 */
router.get("/geocode-cache", (_req: Request, res: Response) => {
  return res.json(getGeocodeCacheStats());
});

export default router;
