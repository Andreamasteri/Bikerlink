import { Router, Request, Response } from "express";
import { sendError } from "../../lib/api-response";
import { requireAuth } from "./utils";
import { poiSearchSchema, poiRequestSchema } from "@shared/validators";
import { poiPhotoSchema } from "./waypoints";

export const geocodeRouter = Router();

geocodeRouter.get("/reverse", async (req: Request, res: Response) => {
  const { lat, lon, zoom } = req.query as { lat?: string; lon?: string; zoom?: string };
  if (!lat || !lon) return sendError(res, 400, "Parametri lat e lon obbligatori");
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum)) return sendError(res, 400, "lat e lon devono essere numeri validi");
  const zoomNum = zoom !== undefined ? parseInt(zoom, 10) : 14;
  const safeZoom = isNaN(zoomNum) ? 14 : Math.max(0, Math.min(18, zoomNum));
  try {
    const { reverseGeocode } = await import("../../lib/photon-client");
    const result = await reverseGeocode(latNum, lonNum, safeZoom);
    return res.json(result);
  } catch (err) {
    console.error("[reverse-geocode] error:", err);
    return sendError(res, 502, "Reverse geocoding non disponibile");
  }
});

export const poiExtraRouter = Router();

poiExtraRouter.get("/poi-search", async (req: Request, res: Response) => {
  const { q, near } = req.query as { q?: string; near?: string };
  if (!q || !near) return sendError(res, 400, "Parametri 'q' e 'near' obbligatori");

  try {
    const { geocode } = await import("../../lib/photon-client");
    const { searchPoi } = await import("../../lib/overpass-client");

    const geoResults = await geocode(near);
    if (!geoResults.length) {
      return res.json([]);
    }
    const geo = geoResults[0];
    const results = await searchPoi(q, geo.lat, geo.lng, 30);
    return res.json(results);
  } catch (err) {
    console.error("[poi-search] error:", err);
    return sendError(res, 502, "Ricerca POI non disponibile");
  }
});

poiExtraRouter.post("/poi-photo", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsedPhoto = poiPhotoSchema.safeParse(req.body);
  if (!parsedPhoto.success) return sendError(res, 400, parsedPhoto.error.issues[0].message);
  const { poiId: _poiId } = parsedPhoto.data;

  try {
    return res.json({ photoUrl: null });
  } catch (err) {
    console.error("[poi-photo] error:", err);
    return res.json({ photoUrl: null });
  }
});

poiExtraRouter.post("/poi-search", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsedSearch = poiSearchSchema.safeParse(req.body);
  if (!parsedSearch.success) return sendError(res, 400, parsedSearch.error.issues[0].message);
  const { lat, lng, radius = 10000 } = parsedSearch.data;

  try {
    const overpassQuery = `[out:json][timeout:25];(node["name"](around:${radius},${lat},${lng});way["name"](around:${radius},${lat},${lng}););out body;>;out skel qt;`;
    const resp = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(overpassQuery),
    });
    type OverpassNode = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
    const data = await resp.json() as { elements?: OverpassNode[] };
    const results = (data.elements ?? []).filter((e) => e.lat || (e.center && e.center.lat)).map((e) => ({
      name: e.tags?.name || "POI",
      lat: e.lat || e.center!.lat,
      lng: e.lon || e.center!.lon,
    }));
    return res.json(results);
  } catch (err) {
    console.error("[poi-search] error:", err);
    return sendError(res, 502, "Ricerca non disponibile");
  }
});

poiExtraRouter.post("/poi", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsedPoi = poiRequestSchema.safeParse(req.body);
  if (!parsedPoi.success) return sendError(res, 400, parsedPoi.error.issues[0].message);
  const { bbox, types } = parsedPoi.data;

  try {
    const category = types?.[0] || "viewpoint";
    const overpassCategoryMap: Record<string, string> = {
      viewpoint: "tourism=viewpoint",
      parking: "amenity=parking",
      fuel: "amenity=fuel",
      restaurant: "amenity=restaurant",
      hotel: "tourism=hotel",
      attraction: "tourism=attraction",
      mechanic: "shop=motorcycle_repair",
    };

    const filter = overpassCategoryMap[category] || "tourism=viewpoint";
    const query = `[out:json][timeout:25];(node["${filter.split('=')[0]}"="${filter.split('=')[1]}"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});way["${filter.split('=')[0]}"="${filter.split('=')[1]}"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}););out body;>;out skel qt;`;
    const url = "https://overpass-api.de/api/interpreter";

    const resp = await fetch(url, {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
    });

    if (!resp.ok) throw new Error("Overpass API error");
    type OverpassElement = { id: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
    const data = await resp.json() as { elements?: OverpassElement[] };

    const results = (data.elements ?? []).filter((e) => e.lat || (e.center && e.center.lat)).map((e) => ({
      id: e.id,
      name: e.tags?.name || category,
      lat: e.lat || e.center!.lat,
      lng: e.lon || e.center!.lon,
      category,
      tags: e.tags,
    }));

    return res.json(results);
  } catch (err) {
    console.error("[poi] error:", err);
    return sendError(res, 502, "Punti di interesse non disponibili");
  }
});

export async function resolveRouterOpts(
  userId: string,
  points: [number, number][],
  style: string,
): Promise<import("../../routing/router-selector").RouterSelectorOptions> {
  const { storage } = await import("../../storage");
  const { resolveRoutingEngine } = await import("../../routing/function-engine-config");
  const { isAiRoutingMode, buildAiRoutingContext } = await import("../../routing/ai-engine-decider");
  const { ARCHIVED_ROUTING_ENGINES } = await import("@shared/maps-config");
  const [rolloutSetting, routingEngine, routeUser, aiModeRaw] = await Promise.all([
    storage.getAppSetting("maps_rollout"),
    resolveRoutingEngine(),
    storage.getUser(userId),
    isAiRoutingMode(),
  ]);
  const aiMode = aiModeRaw && !ARCHIVED_ROUTING_ENGINES.has("ai" as import("@shared/maps-config").RoutingEngineId);
  return {
    rollout: (rolloutSetting?.value ?? "disabled") as import("@shared/maps-config").MapsRollout,
    engine: routingEngine,
    isMapTester: routeUser?.mapTester ?? false,
    aiMode,
    aiContext: aiMode ? buildAiRoutingContext(points, style) : undefined,
  };
}
