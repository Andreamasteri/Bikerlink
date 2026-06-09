// LARGE-FILE-LOCKED — limite: 209
// Aggiungi nuove funzionalità in: server/routes/planned-routes/extras.next.ts
import { sendError } from "../../lib/api-response";
import { Router, Request, Response } from "express";
import { storage } from "../../storage";
import { requireAuth, decodePolyline } from "./utils";
import { hotelsSchema, segmentMultidaySchema } from "@shared/validators";
import { haversineKm } from "../../geo";

const router = Router();

router.get("/my-style-profile", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const { getUserStyleProfile } = await import("../../curvy-score-job");
    const { storage: st } = await import("../../storage");

    const [profile, targetKmSetting] = await Promise.all([
      getUserStyleProfile(userId),
      st.getAppSetting("telemetry_target_km"),
    ]);

    const targetKm = parseInt(targetKmSetting?.value ?? "400", 10);
    const userKm = profile?.totalKm ?? 0;
    const hasReachedThreshold = userKm >= targetKm;

    return res.json({
      totalKm: userKm,
      targetKm,
      hasReachedThreshold,
      progressPct: Math.min(100, Math.round((userKm / targetKm) * 100)),
      avgLeanAngle: profile?.avgLeanAngle ?? null,
      avgGforce: profile?.avgGforce ?? null,
      sampleCount: profile?.sampleCount ?? 0,
    });
  } catch (err) {
    console.error("[planned-routes/my-style-profile] error:", err);
    return sendError(res, 500, "Errore caricamento profilo");
  }
});

router.post("/hotels", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsedHotels = hotelsSchema.safeParse(req.body);
  if (!parsedHotels.success) return sendError(res, 400, parsedHotels.error.issues[0].message);
  const { lat, lng, radius = 10000 } = parsedHotels.data;

  try {
    type HotelElement = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: { name?: string; stars?: string; phone?: string; website?: string } };
    type OverpassResponse = { elements?: HotelElement[] };

    const query = `[out:json][timeout:25];(node["tourism"="hotel"](around:${radius},${lat},${lng});way["tourism"="hotel"](around:${radius},${lat},${lng}););out body;>;out skel qt;`;
    const resp = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
    });
    const data = await resp.json() as OverpassResponse;
    const elements = (data.elements ?? [])
      .filter((e) => e.lat || (e.center && e.center.lat))
      .map((e) => ({
        name: e.tags?.name || "Hotel",
        lat: e.lat || e.center!.lat,
        lng: e.lon || e.center!.lon,
        stars: e.tags?.stars,
        phone: e.tags?.phone,
        website: e.tags?.website,
      }));

    return res.json({ days: [{ waypoint: `${lat},${lng}`, hotels: elements.slice(0, 5) }] });
  } catch (err) {
    console.error("[hotels] error:", err);
    return sendError(res, 502, "Hotel non disponibili");
  }
});

router.post("/segment-multiday", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsedSmd = segmentMultidaySchema.safeParse(req.body);
  if (!parsedSmd.success) return sendError(res, 400, parsedSmd.error.issues[0].message);
  const { waypoints } = parsedSmd.data;

  try {
    type DaySegment = { day: number; waypoints: typeof waypoints; estimatedKm: number; estimatedMinutes: number; endPoint: (typeof waypoints)[number]; isFeasible: boolean };
    const days: DaySegment[] = [];
    days.push({
      day: 1,
      waypoints: waypoints,
      estimatedKm: 100,
      estimatedMinutes: 120,
      endPoint: waypoints[waypoints.length - 1],
      isFeasible: true,
    });

    return res.json({ days, totalDays: 1, kmPerDay: 100 });
  } catch (err) {
    console.error("[segment-multiday] error:", err);
    return sendError(res, 500, "Errore segmentazione");
  }
});

router.get("/:id/elevation", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const route = await storage.getPlannedRoute(id);
    if (!route) return sendError(res, 404, "Percorso non trovato");
    if (route.userId !== userId && route.visibility !== "public") {
      return sendError(res, 403, "Non autorizzato");
    }

    const meta = (route.metadata ?? {}) as Record<string, unknown>;
    if (meta.elevationCache) {
      return res.json({ ...(meta.elevationCache as object), cached: true });
    }

    let rawPoints: [number, number][] = [];
    if (route.polyline) {
      rawPoints = decodePolyline(route.polyline);
    } else {
      const wps = (route.waypoints as Array<{ lat: number; lng: number }>) ?? [];
      rawPoints = wps.filter((wp) => wp.lat !== 0 || wp.lng !== 0).map((wp) => [wp.lat, wp.lng]);
    }

    if (rawPoints.length === 0) {
      return sendError(res, 422, "Nessun punto disponibile per il profilo altimetrico");
    }

    const MAX_SAMPLES = 100;
    const step = Math.max(1, Math.ceil(rawPoints.length / MAX_SAMPLES));
    const sampled: [number, number][] = [];
    for (let i = 0; i < rawPoints.length; i += step) {
      sampled.push(rawPoints[i]);
    }
    const last = rawPoints[rawPoints.length - 1];
    if (sampled[sampled.length - 1] !== last && sampled.length < MAX_SAMPLES) {
      sampled.push(last);
    }
    if (sampled.length > MAX_SAMPLES) sampled.length = MAX_SAMPLES;

    const distKm: number[] = [0];
    for (let i = 1; i < sampled.length; i++) {
      distKm.push(distKm[i - 1] + haversineKm(sampled[i-1][0], sampled[i-1][1], sampled[i][0], sampled[i][1]));
    }

    const locationsStr = sampled.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join("|");
    const topoUrl = `https://api.opentopodata.org/v1/srtm90m?locations=${locationsStr}`;

    type TopoResult = { elevation?: number };
    type TopoResponse = { status: string; results?: TopoResult[] };

    let elevations: number[];
    try {
      const topoResp = await fetch(topoUrl, {
        headers: { "User-Agent": "BikerLink/4.0 (info@bikerlink.it)" },
      });
      if (!topoResp.ok) throw new Error(`OpenTopoData ${topoResp.status}`);
      const topoData = await topoResp.json() as TopoResponse;
      if (topoData.status !== "OK") throw new Error("OpenTopoData status: " + topoData.status);
      elevations = (topoData.results ?? []).map((r) => Math.round(r.elevation ?? 0));
    } catch (err) {
      console.error("[elevation] OpenTopoData error:", err);
      return sendError(res, 502, "Dati altimetrici non disponibili al momento");
    }

    const validEle = elevations.filter((e) => e != null && !isNaN(e));
    if (validEle.length === 0) {
      return sendError(res, 502, "Dati altimetrici non disponibili al momento");
    }
    const minEle = Math.min(...validEle);
    const maxEle = Math.max(...validEle);
    let totalGain = 0;
    let totalLoss = 0;
    for (let i = 1; i < elevations.length; i++) {
      const diff = elevations[i] - elevations[i - 1];
      if (diff > 0) totalGain += diff;
      else totalLoss += Math.abs(diff);
    }

    const payload = {
      elevations,
      distanceKm: distKm.map((d) => Math.round(d * 10) / 10),
      minEle: Math.round(minEle),
      maxEle: Math.round(maxEle),
      totalGain: Math.round(totalGain),
      totalLoss: Math.round(totalLoss),
      points: sampled.length,
    };

    storage.updatePlannedRoute(id, {
      metadata: { ...meta, elevationCache: payload },
    }).catch((err: unknown) => console.error("[elevation] cache save error:", err));

    return res.json(payload);
  } catch (err) {
    console.error("[elevation] error:", err);
    return sendError(res, 500, "Errore profilo altimetrico");
  }
});

export default router;
