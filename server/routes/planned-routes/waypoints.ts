// LARGE-FILE-LOCKED — limite: 550
// Aggiungi nuove funzionalità in: server/routes/planned-routes/waypoints.next.ts
import { sendError } from "../../lib/api-response";
import { Router, Request, Response } from "express";
import { requireAuth, computeBikerScoreFromPoints } from "./utils";
import { poiSearchSchema, aiPromptSchema, calculateRouteRequestSchema, poiRequestSchema } from "@shared/validators";
import { z } from "zod";
import { generateRouteObject, streamRouteText } from "./waypoints.next";
import { isOllamaConfigured } from "../../lib/ollama-client";
const weatherWaypointsSchema = z.object({
  routeId: z.string().optional(),
  waypoints: z.array(z.object({ lat: z.number().finite(), lng: z.number().finite(), name: z.string().optional() })).min(1).max(8),
  departureIso: z.string().optional(),
  avgSpeedKmh: z.number().optional(),
});
import { haversineKm } from "../../geo";
// Task #2633 — weather helpers estratti per riuso da /weather/:id (GET).
import { fetchWeatherForWaypoints } from "./weather-helper";
const poiPhotoSchema = z.object({ poiId: z.string().min(1, "poiId obbligatorio") });
import { ACTIVE_PROFILE } from "../../graphhopper-client";
import { getActiveRouter } from "../../routing/router-selector";
import type { RouteRequest } from "../../routing/graphhopper-adapter";

const router = Router();

// ─── Routing helpers ──────────────────────────────────────────────────────────

function buildFallbackRoute(waypoints: Array<{ lat: number; lng: number }>) {
  let totalDist = 0;
  for (let i = 1; i < waypoints.length; i++) {
    totalDist += haversineKm(waypoints[i-1].lat, waypoints[i-1].lng, waypoints[i].lat, waypoints[i].lng);
  }
  const rawPoints = waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng }));
  return {
    encoded: null as string | null,
    rawPoints,
    distanceKm: Math.round(totalDist * 10) / 10,
    durationMinutes: Math.round(totalDist / 70 * 60),
    bikerScore: computeBikerScoreFromPoints(rawPoints),
    approximate: true,
    warning: "routing_unavailable" as const,
  };
}

const AI_SYSTEM_PROMPT = `Sei un assistente per pianificazione giri in moto.
Analizza la richiesta e restituisci SOLO un oggetto JSON con:
- title: string
- startLocation: string
- endLocation: string
- waypoints: string[]
- style: "curvy"|"balanced"|"fast"
- isRoundTrip: boolean
- isMultiDay: boolean
- daysEstimate: number
- maxHoursPerDay: number (default 6)
- avoidHighways: boolean
- notes: string`;

const AI_TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS ?? "30000", 10) || 30000;
const AI_MAX_RETRIES = 2;

const routeSchema = z.object({
  title: z.string(),
  startLocation: z.string(),
  endLocation: z.string(),
  waypoints: z.array(z.string()),
  style: z.enum(["curvy", "balanced", "fast"]),
  isRoundTrip: z.boolean(),
  isMultiDay: z.boolean(),
  daysEstimate: z.number(),
  maxHoursPerDay: z.number(),
  avoidHighways: z.boolean(),
  notes: z.string(),
});

function geminiErrorMessage(err: unknown): { httpStatus: number; message: string } {
  const e = err as { name?: string; message?: string; status?: number; statusCode?: number; code?: number };
  if (e.name === "AbortError") {
    return { httpStatus: 504, message: "Il servizio AI ha impiegato troppo tempo, riprova tra qualche secondo" };
  }
  const msg = (e?.message ?? "").toLowerCase();
  const status = e?.status ?? e?.statusCode ?? e?.code;
  const isRateLimit = status === 429 || msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource_exhausted");
  if (isRateLimit) {
    return { httpStatus: 429, message: "Troppe richieste AI: limite di utilizzo raggiunto, riprova tra qualche minuto" };
  }
  const isTransient = status === 503 || msg.includes("503") || msg.includes("unavailable") || msg.includes("overloaded");
  if (isTransient) {
    return { httpStatus: 503, message: "Servizio AI temporaneamente non disponibile, riprova tra qualche secondo" };
  }
  return { httpStatus: 503, message: "Errore durante l'elaborazione della richiesta AI" };
}

// ─── Elevation profile extractor ──────────────────────────────────────────────

function extractElevationProfile(
  encodedOrPoints: string | null,
  ghPointsWithElevation?: number[][]
): { profile: Array<{ distanceKm: number; altitudeM: number }>; gainM: number; minM: number; maxM: number } | null {
  if (!ghPointsWithElevation || ghPointsWithElevation.length < 2) return null;
  const pts = ghPointsWithElevation;
  let cumulativeDist = 0;
  let gainM = 0;
  let minM = Infinity;
  let maxM = -Infinity;
  const profile: Array<{ distanceKm: number; altitudeM: number }> = [];

  for (let i = 0; i < pts.length; i++) {
    const elev = pts[i][2] ?? 0;
    if (i > 0) {
      const prev = pts[i - 1];
      cumulativeDist += haversineKm(prev[1], prev[0], pts[i][1], pts[i][0]);
      const prevElev = prev[2] ?? 0;
      if (elev > prevElev) gainM += elev - prevElev;
    }
    if (elev < minM) minM = elev;
    if (elev > maxM) maxM = elev;
    if (pts.length <= 200 || i % Math.ceil(pts.length / 200) === 0) {
      profile.push({ distanceKm: Math.round(cumulativeDist * 100) / 100, altitudeM: Math.round(elev) });
    }
  }

  return {
    profile,
    gainM: Math.round(gainM),
    minM: minM === Infinity ? 0 : Math.round(minM),
    maxM: maxM === -Infinity ? 0 : Math.round(maxM),
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post("/ai-parse", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsedAi = aiPromptSchema.safeParse(req.body);
  if (!parsedAi.success) return sendError(res, 400, parsedAi.error.issues[0].message);
  const { prompt } = parsedAi.data;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && !isOllamaConfigured) return sendError(res, 503, "Servizio AI non disponibile: nessun provider configurato (Ollama o GEMINI_API_KEY)");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const onClose = () => { controller.abort(); clearTimeout(timeout); };
  req.on("close", onClose);

  try {
    const object = await generateRouteObject({
      prompt,
      apiKey,
      system: AI_SYSTEM_PROMPT,
      schema: routeSchema,
      maxRetries: AI_MAX_RETRIES,
      temperature: 0.1,
      abortSignal: controller.signal,
    });
    clearTimeout(timeout);
    req.off("close", onClose);
    return res.json(object);
  } catch (err: unknown) {
    clearTimeout(timeout);
    req.off("close", onClose);
    console.error("[AI parse] error:", (err as Error)?.message ?? err);
    const { httpStatus, message } = geminiErrorMessage(err);
    return res.status(httpStatus).json({ message });
  }
});

router.post("/ai-stream", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsedAiStream = aiPromptSchema.safeParse(req.body);
  if (!parsedAiStream.success) return sendError(res, 400, parsedAiStream.error.issues[0].message);
  const { prompt } = parsedAiStream.data;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && !isOllamaConfigured) return sendError(res, 503, "Servizio AI non disponibile: nessun provider configurato (Ollama o GEMINI_API_KEY)");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const onClose = () => { controller.abort(); clearTimeout(timeout); };
  req.on("close", onClose);

  try {
    let fullText = "";
    for await (const chunk of streamRouteText({
      prompt,
      apiKey,
      system: AI_SYSTEM_PROMPT,
      maxRetries: AI_MAX_RETRIES,
      temperature: 0.1,
      abortSignal: controller.signal,
    })) {
      if (chunk) {
        fullText += chunk;
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
    }

    clearTimeout(timeout);
    req.off("close", onClose);

    let parsed: unknown = null;
    try { parsed = routeSchema.parse(JSON.parse(fullText)); } catch { /* keep null */ }
    res.write(`event: done\ndata: ${JSON.stringify({ parsed })}\n\n`);
    res.end();
  } catch (err: unknown) {
    clearTimeout(timeout);
    req.off("close", onClose);
    console.error("[AI stream] error:", (err as Error)?.message ?? err);
    const { message } = geminiErrorMessage(err);
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    res.end();
  }
});

router.get("/geocode", async (req: Request, res: Response) => {
  const { q } = req.query as { q?: string };
  if (!q) return sendError(res, 400, "Query richiesta");
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=it`;
    const resp = await fetch(url, { headers: { "User-Agent": "BikerLink/4.0 (info@bikerlink.it)" } });
    type NominatimResult = { display_name: string; lat: string; lon: string };
    const data = await resp.json() as NominatimResult[];
    return res.json(data.map((r) => ({
      name: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon),
    })));
  } catch (err) {
    console.error("[geocode] error:", err);
    return sendError(res, 502, "Geocoding non disponibile");
  }
});

router.post("/calculate", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsedCalc = calculateRouteRequestSchema.safeParse(req.body);
  if (!parsedCalc.success) {
    return sendError(res, 400, parsedCalc.error.issues[0].message);
  }
  const {
    waypoints,
    style = "curvy",
    drivingProfile = "geometric",
    avoidHighways = false,
    avoidTolls = false,
    avoidFerries = false,
    avoidUnpaved = false,
    roundTripHours,
    isRoundTrip,
    roundTripDirection,
    headingDeg,
    language: _language,
  } = parsedCalc.data;

  const DIRECTION_DEGREES: Record<string, number> = {
    N: 0, NE: 45, E: 90, SE: 135, S: 180, SO: 225, O: 270, NO: 315,
  };

  let effectiveWaypoints = waypoints;
  if (isRoundTrip && roundTripDirection && DIRECTION_DEGREES[roundTripDirection] !== undefined) {
    const headingDeg = DIRECTION_DEGREES[roundTripDirection];
    const headingRad = headingDeg * Math.PI / 180;
    const start = waypoints[0];
    const styleAvgSpeed: Record<string, number> = { curvy: 55, balanced: 65, fast: 85 };
    const avgKmh = styleAvgSpeed[style] ?? 65;
    const offsetKm = (roundTripHours ?? 2) * avgKmh * 0.4;
    const deltaLat = offsetKm / 111.32;
    const deltaLng = offsetKm / (111.32 * Math.cos(start.lat * Math.PI / 180));
    const midLat = start.lat + deltaLat * Math.cos(headingRad);
    const midLng = start.lng + deltaLng * Math.sin(headingRad);
    const last = waypoints[waypoints.length - 1];
    const otherWps = waypoints.slice(1, -1);
    effectiveWaypoints = [
      start,
      { lat: midLat, lng: midLng },
      ...otherWps,
      last,
    ];
  }

  let myStyleWarning: string | null = null;

  try {
    const body: Record<string, unknown> = {
      points: effectiveWaypoints.map((wp) => [wp.lng, wp.lat]),
      profile: ACTIVE_PROFILE,
      instructions: true,
      calc_points: true,
      points_encoded: false,
      optimize: false,
      elevation: true,
    };

    if (isRoundTrip && headingDeg !== undefined && headingDeg !== null) {
      body.heading = headingDeg;
    }

    const priority: Array<{ if: string; multiply_by: number }> = [];

    if (style === "curvy") {
      priority.push(
        { if: "road_class == MOTORWAY", multiply_by: avoidHighways ? 0.0 : 0.1 },
        { if: "road_class == TRUNK", multiply_by: 0.2 },
        { if: "road_class == PRIMARY", multiply_by: 0.5 },
        { if: "road_class == SECONDARY", multiply_by: 1.0 },
        { if: "road_class == TERTIARY", multiply_by: 1.2 },
        { if: "road_class == UNCLASSIFIED", multiply_by: 1.1 }
      );
    } else if (style === "balanced") {
      priority.push(
        { if: "road_class == MOTORWAY", multiply_by: avoidHighways ? 0.0 : 0.4 },
        { if: "road_class == SECONDARY", multiply_by: 1.1 }
      );
    } else if (style === "fast") {
      if (avoidHighways) {
        priority.push({ if: "road_class == MOTORWAY", multiply_by: 0.0 });
      }
    }

    if (avoidTolls) {
      priority.push({ if: "toll == ALL", multiply_by: 0.0 });
    }
    if (avoidHighways && style !== "curvy" && style !== "balanced" && style !== "fast") {
      priority.push({ if: "road_class == MOTORWAY", multiply_by: 0.0 });
    }
    if (avoidFerries) {
      priority.push({ if: "road_environment == FERRY", multiply_by: 0.0 });
    }
    if (avoidUnpaved) {
      priority.push({ if: "road_environment == UNPAVED", multiply_by: 0.0 });
    }

    if (drivingProfile === "my_style") {
      const { getUserStyleProfile } = await import("../../curvy-score-job");
      const { storage: st } = await import("../../storage");
      const [uProfile, targetKmSetting] = await Promise.all([
        getUserStyleProfile(userId),
        st.getAppSetting("telemetry_target_km"),
      ]);
      const targetKm = parseInt(targetKmSetting?.value ?? "400", 10);
      const userKm = uProfile?.totalKm ?? 0;

      if (userKm >= targetKm && uProfile?.avgLeanAngle) {
        const leanFactor = Math.min(1.5, Math.max(0.8, (uProfile.avgLeanAngle / 30)));
        priority.push({ if: "road_class == SECONDARY || road_class == TERTIARY", multiply_by: leanFactor });
      } else {
        myStyleWarning = "insufficient_data";
      }
    }

    if (priority.length > 0) {
      body.custom_model = { priority };
    }

    const { storage: _st } = await import("../../storage");
    const [rolloutSetting, engineSetting, routeUser] = await Promise.all([
      _st.getAppSetting("maps_rollout"),
      _st.getAppSetting("maps_routing_engine"),
      _st.getUser(userId),
    ]);
    const routeResult = await getActiveRouter(
      body as unknown as RouteRequest,
      {
        rollout: (rolloutSetting?.value ?? "disabled") as import("@shared/maps-config").MapsRollout,
        engine: (engineSetting?.value ?? "graphhopper") as import("@shared/maps-config").RoutingEngineId,
        isMapTester: routeUser?.mapTester ?? false,
      },
      res
    );
    const path = routeResult.paths[0];

    return res.json({
      encoded: path.points,
      distanceKm: Math.round(path.distance / 100) / 10,
      durationMinutes: Math.round(path.time / 60000),
      instructions: path.instructions ?? [],
      bikerScore: 0.8,
      elevation: extractElevationProfile(path.points as string, (path as { points_encoded?: boolean; points?: { coordinates?: number[][] } }).points_encoded === false ? (path.points as { coordinates?: number[][] })?.coordinates : undefined),
      warning: myStyleWarning,
    });
  } catch (err: unknown) {
    console.error("[routing] error:", (err as Error)?.message ?? err);
    return res.json(buildFallbackRoute(effectiveWaypoints));
  }
});

router.post("/weather", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsedWp = weatherWaypointsSchema.safeParse(req.body);
  if (!parsedWp.success) return sendError(res, 400, parsedWp.error.issues[0].message);
  const { waypoints, departureIso, avgSpeedKmh } = parsedWp.data;

  try {
    const departure = departureIso ? new Date(departureIso) : new Date();
    const weather = await fetchWeatherForWaypoints(waypoints, departure, avgSpeedKmh);
    return res.json(weather);
  } catch (err) {
    console.error("[weather] error:", err);
    return sendError(res, 502, "Meteo non disponibile");
  }
});

router.post("/poi", async (req: Request, res: Response) => {
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

router.post("/poi-photo", async (req: Request, res: Response) => {
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

router.post("/poi-search", async (req: Request, res: Response) => {
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

export default router;
