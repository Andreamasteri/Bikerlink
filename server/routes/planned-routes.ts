import { Router, Request, Response } from "express";
import { generateObject, streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { storage } from "../storage";
import type { InsertPlannedRoute } from "@shared/schema";
import { haversineKm } from "../geo";
import { calculateRoute as ghCalculateRoute, isSelfHosted } from "../graphhopper-client";

const router = Router();

// ─── Auth helper ──────────────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response): string | null {
  const userId = (req.session as any)?.userId as string | undefined;
  if (!userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return userId;
}

// ─── Polyline helpers ─────────────────────────────────────────────────────────

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, b: number;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

function computeBikerScore(encodedPolyline: string): number {
  const pts = decodePolyline(encodedPolyline);
  if (pts.length < 3) return 0;
  let totalAngle = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const v1 = [pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]];
    const v2 = [pts[i+1][0] - pts[i][0], pts[i+1][1] - pts[i][1]];
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const mag1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2);
    const mag2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2);
    if (mag1 > 0 && mag2 > 0) {
      const cosA = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
      totalAngle += Math.acos(cosA);
    }
  }
  return Math.round(Math.min(1, totalAngle / (pts.length * 0.3)) * 100) / 100;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// ─── Weather helpers ──────────────────────────────────────────────────────────

function weatherCodeToDesc(code: number): string {
  if (code === 0) return "Sereno";
  if (code <= 3) return "Parzialmente nuvoloso";
  if (code <= 9) return "Nebbia";
  if (code <= 19) return "Pioggia leggera";
  if (code <= 29) return "Temporale";
  if (code <= 39) return "Neve leggera";
  if (code <= 49) return "Nebbia densa";
  if (code <= 59) return "Pioggerella";
  if (code <= 69) return "Pioggia";
  if (code <= 79) return "Neve";
  if (code <= 84) return "Rovesci";
  if (code <= 99) return "Temporale";
  return "Sconosciuto";
}

function isSuitableForRiding(code: number, windSpeedKmh: number): boolean {
  if (code >= 20 && code <= 99) return false;
  if (windSpeedKmh > 60) return false;
  return true;
}

async function fetchWeatherForWaypoints(
  waypoints: Array<{ lat: number; lng: number; name?: string }>,
  departure: Date,
  avgSpeedKmh: number = 70
): Promise<any[]> {
  const results: any[] = [];

  // Compute cumulative haversine distance to each waypoint for ETA estimation
  const cumulativeKm: number[] = [0];
  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const cur = waypoints[i];
    cumulativeKm.push(cumulativeKm[i - 1] + haversineKm(prev.lat, prev.lng, cur.lat, cur.lng));
  }

  for (let wi = 0; wi < Math.min(waypoints.length, 10); wi++) {
    const wp = waypoints[wi];
    if (!wp.lat || !wp.lng) { results.push(null); continue; }

    // ETA = departure + travel time to this waypoint at avgSpeedKmh
    const travelHours = cumulativeKm[wi] / avgSpeedKmh;
    const etaMs = departure.getTime() + travelHours * 3600_000;
    const eta = new Date(etaMs);
    const dateStr = eta.toISOString().split("T")[0];
    const hour = eta.getHours();

    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(wp.lat));
      url.searchParams.set("longitude", String(wp.lng));
      url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weathercode");
      url.searchParams.set("hourly", "temperature_2m,precipitation_probability,wind_speed_10m,weathercode");
      url.searchParams.set("timezone", "Europe/Rome");
      url.searchParams.set("start_date", dateStr);
      url.searchParams.set("end_date", dateStr);

      const resp = await fetch(url.toString());
      if (!resp.ok) { results.push(null); continue; }
      const data = await resp.json() as any;
      const hourly = data.hourly ?? {};
      const daily = data.daily ?? {};
      const clampedHour = Math.min(hour, (hourly.temperature_2m?.length ?? 1) - 1);

      results.push({
        lat: wp.lat, lng: wp.lng, name: wp.name ?? "",
        etaIso: eta.toISOString(),
        etaOffsetHours: Math.round(travelHours * 10) / 10,
        tempMax: daily.temperature_2m_max?.[0] ?? null,
        tempMin: daily.temperature_2m_min?.[0] ?? null,
        tempNow: hourly.temperature_2m?.[clampedHour] ?? null,
        precipitation: daily.precipitation_sum?.[0] ?? 0,
        windSpeed: hourly.wind_speed_10m?.[clampedHour] ?? null,
        precipProb: hourly.precipitation_probability?.[clampedHour] ?? 0,
        weatherCode: hourly.weathercode?.[clampedHour] ?? 0,
        weatherDesc: weatherCodeToDesc(hourly.weathercode?.[clampedHour] ?? 0),
        isSuitable: isSuitableForRiding(hourly.weathercode?.[clampedHour] ?? 0, hourly.wind_speed_10m?.[clampedHour] ?? 0),
      });
    } catch { results.push(null); }
  }
  return results;
}

// ─── Fallback route builder ───────────────────────────────────────────────────

function computeBikerScoreFromPoints(pts: Array<{ lat: number; lng: number }>): number {
  if (pts.length < 3) return 0;
  let totalAngle = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const v1 = [pts[i].lat - pts[i-1].lat, pts[i].lng - pts[i-1].lng];
    const v2 = [pts[i+1].lat - pts[i].lat, pts[i+1].lng - pts[i].lng];
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const mag1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2);
    const mag2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2);
    if (mag1 > 0 && mag2 > 0) {
      const cosA = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
      totalAngle += Math.acos(cosA);
    }
  }
  return Math.round(Math.min(1, totalAngle / (pts.length * 0.3)) * 100) / 100;
}

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

// ─── AI: parse natural language route request ─────────────────────────────────

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

function geminiErrorMessage(err: any): { httpStatus: number; message: string } {
  if (err.name === "AbortError") {
    return { httpStatus: 504, message: "Il servizio AI ha impiegato troppo tempo, riprova tra qualche secondo" };
  }
  const msg = (err?.message ?? "").toLowerCase();
  const status = err?.status ?? err?.statusCode ?? err?.code;
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

router.post("/ai-parse", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { prompt } = req.body as { prompt?: string };
  if (!prompt) return res.status(400).json({ message: "Testo richiesto" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ message: "Servizio AI non disponibile: chiave GEMINI_API_KEY mancante" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const onClose = () => { controller.abort(); clearTimeout(timeout); };
  req.on("close", onClose);

  const googleProvider = createGoogleGenerativeAI({ apiKey });

  try {
    const { object } = await generateObject({
      model: googleProvider("gemini-2.5-flash"),
      schema: routeSchema,
      prompt: `${AI_SYSTEM_PROMPT}\n\nRichiesta: ${prompt}`,
      maxRetries: AI_MAX_RETRIES,
      temperature: 0.1,
      maxTokens: 512,
      abortSignal: controller.signal,
    });
    clearTimeout(timeout);
    req.off("close", onClose);
    return res.json(object);
  } catch (err: any) {
    clearTimeout(timeout);
    req.off("close", onClose);
    console.error("[AI parse] error:", err?.message ?? err);
    const { httpStatus, message } = geminiErrorMessage(err);
    return res.status(httpStatus).json({ message });
  }
});

router.post("/ai-stream", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { prompt } = req.body as { prompt?: string };
  if (!prompt) return res.status(400).json({ message: "Testo richiesto" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ message: "Servizio AI non disponibile: chiave GEMINI_API_KEY mancante" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const onClose = () => { controller.abort(); clearTimeout(timeout); };
  req.on("close", onClose);

  const googleProvider = createGoogleGenerativeAI({ apiKey });

  try {
    const result = streamText({
      model: googleProvider("gemini-2.5-flash"),
      prompt: `${AI_SYSTEM_PROMPT}\n\nRichiesta: ${prompt}`,
      maxRetries: AI_MAX_RETRIES,
      temperature: 0.1,
      maxTokens: 512,
      abortSignal: controller.signal,
    });

    let fullText = "";
    for await (const chunk of result.textStream) {
      if (chunk) {
        fullText += chunk;
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
    }

    clearTimeout(timeout);
    req.off("close", onClose);

    let parsed: any = null;
    try { parsed = routeSchema.parse(JSON.parse(fullText)); } catch { /* keep null */ }
    res.write(`event: done\ndata: ${JSON.stringify({ parsed })}\n\n`);
    res.end();
  } catch (err: any) {
    clearTimeout(timeout);
    req.off("close", onClose);
    console.error("[AI stream] error:", err?.message ?? err);
    const { message } = geminiErrorMessage(err);
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    res.end();
  }
});

export function fallbackAiParse(prompt: string) {
  const lower = prompt.toLowerCase();
  return {
    title: "Giro in moto",
    startLocation: "", endLocation: "", waypoints: [] as string[],
    style: lower.includes("veloce") || lower.includes("autostrada") ? "fast"
      : lower.includes("curve") || lower.includes("curvy") || lower.includes("panoramic") ? "curvy" : "balanced",
    isRoundTrip: lower.includes("ritorno") || lower.includes("andata e ritorno"),
    isMultiDay: lower.includes("giorni") || lower.includes("settimana") || lower.includes("weekend"),
    daysEstimate: lower.includes("settimana") ? 7 : lower.includes("weekend") ? 2 : 1,
    maxHoursPerDay: 6,
    avoidHighways: lower.includes("senza autostrada") || lower.includes("evit"),
    notes: prompt,
  };
}

// ─── Geocoding via Nominatim ──────────────────────────────────────────────────

router.get("/geocode", async (req: Request, res: Response) => {
  const { q } = req.query as { q?: string };
  if (!q) return res.status(400).json({ message: "Query richiesta" });
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=it`;
    const resp = await fetch(url, { headers: { "User-Agent": "BikerLink/4.0 (info@bikerlink.it)" } });
    const data = await resp.json() as any[];
    return res.json(data.map((r) => ({
      name: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon),
    })));
  } catch (err) {
    console.error("[geocode] error:", err);
    return res.status(502).json({ message: "Geocoding non disponibile" });
  }
});

// ─── Route calculation via GraphHopper ───────────────────────────────────────

// ─── Elevation profile extractor (from GH points with elevation) ──────────────

function extractElevationProfile(
  encodedOrPoints: string | null,
  ghPointsWithElevation?: number[][]
): { profile: Array<{ distanceKm: number; altitudeM: number }>; gainM: number; minM: number; maxM: number } | null {
  if (!ghPointsWithElevation || ghPointsWithElevation.length < 2) return null;
  // GH returns [lng, lat, elevation] per point when elevation=true and points_encoded=false
  const pts = ghPointsWithElevation; // [lng, lat, elev]
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
    // Downsample: keep 1 point every ~50 points max (cap at 200 points)
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

// ─── Driving profile: user's telemetry threshold + personal style ─────────────

router.get("/my-style-profile", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const { getUserStyleProfile } = await import("../curvy-score-job");
    const { storage: st } = await import("../storage");

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
    return res.status(500).json({ message: "Errore caricamento profilo" });
  }
});

router.post("/calculate", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

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
    language,
  } = req.body as {
    waypoints: Array<{ lat: number; lng: number }>;
    style?: string;
    drivingProfile?: "geometric" | "real" | "my_style";
    avoidHighways?: boolean;
    avoidTolls?: boolean;
    avoidFerries?: boolean;
    avoidUnpaved?: boolean;
    roundTripHours?: number;
    isRoundTrip?: boolean;
    roundTripDirection?: string;
    headingDeg?: number;
    language?: string;
  };

  if (!waypoints || waypoints.length < 2) {
    return res.status(400).json({ message: "Almeno 2 waypoint richiesti" });
  }

  // ── Compass direction: insert intermediate waypoint in given bearing ────────
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

  if (!isSelfHosted && !process.env.GRAPHHOPPER_API_KEY) {
    console.warn("[GraphHopper] non configurato, uso percorso approssimativo");
    return res.json(buildFallbackRoute(effectiveWaypoints));
  }

  let myStyleWarning: string | null = null;

  try {
    const body: any = {
      points: effectiveWaypoints.map((wp) => [wp.lng, wp.lat]),
      profile: "motorcycle",
      instructions: true,
      calc_points: true,
      points_encoded: false,
      optimize: false,
      elevation: true,
    };

    // Heading for round trip
    if (isRoundTrip && headingDeg !== undefined && headingDeg !== null) {
      body.heading = headingDeg;
    }

    // Build priority and speed rules per 5-level curviness
    const priority: Array<{ if: string; multiply_by: number }> = [];

    if (style === "extra_curvy") {
      priority.push(
        { if: "road_class == MOTORWAY", multiply_by: avoidHighways ? 0.0 : 0.05 },
        { if: "road_class == TRUNK", multiply_by: 0.1 },
        { if: "road_class == PRIMARY", multiply_by: 0.3 },
        { if: "road_class == SECONDARY", multiply_by: 1.0 },
        { if: "road_class == TERTIARY", multiply_by: 1.5 },
        { if: "road_class == UNCLASSIFIED", multiply_by: 1.4 },
        { if: "road_class == RESIDENTIAL", multiply_by: 1.2 }
      );
    } else if (style === "curvy") {
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
    } else if (style === "direct") {
      // Direct = fastest possible, motorways preferred
      if (avoidHighways) {
        priority.push({ if: "road_class == MOTORWAY", multiply_by: 0.0 });
      } else {
        priority.push({ if: "road_class == MOTORWAY", multiply_by: 1.5 });
      }
    }

    // Toll avoidance
    if (avoidTolls) {
      priority.push({ if: "toll == ALL", multiply_by: 0.0 });
    }
    // Highway avoidance (extra check for modes that don't handle it above)
    if (avoidHighways && style !== "curvy" && style !== "balanced" && style !== "extra_curvy" && style !== "direct" && style !== "fast") {
      priority.push({ if: "road_class == MOTORWAY", multiply_by: 0.0 });
    }
    // Ferry avoidance
    if (avoidFerries) {
      priority.push({ if: "road_environment == FERRY", multiply_by: 0.0 });
    }
    // Unpaved/sterrato avoidance
    if (avoidUnpaved) {
      priority.push({ if: "road_environment == UNPAVED", multiply_by: 0.0 });
      priority.push({ if: "surface == GRAVEL", multiply_by: 0.0 });
      priority.push({ if: "surface == DIRT", multiply_by: 0.0 });
      priority.push({ if: "surface == UNPAVED", multiply_by: 0.0 });
    }

    // ── Driving profile adjustments (Fase 3) ───────────────────────────────
    // Per "real" e "my_style" applichiamo moltiplicatori addizionali basati
    // sulla telemetria reale. Poiché GH Cloud non supporta lookups per-edge
    // su tabelle esterne, usiamo l'approccio aggregato: le strade che la
    // telemetria riconosce come curvose tendono a essere TERTIARY e
    // UNCLASSIFIED → aumentiamo il loro peso rispetto al profilo geometrico.

    if (drivingProfile === "real" && (style === "curvy" || style === "extra_curvy" || style === "balanced")) {
      // Aggiungi boost telemetria a strade tipicamente curvose in Italia
      // basato sul curvy_score medio per classe stradale da segment_telemetry.
      // I valori numerici qui sono derivati dall'analisi aggregata: le strade
      // TERTIARY e UNCLASSIFIED hanno mediamente curvy_score più alto.
      priority.push(
        { if: "road_class == TERTIARY", multiply_by: 1.3 },
        { if: "road_class == UNCLASSIFIED", multiply_by: 1.2 },
        { if: "road_class == SECONDARY", multiply_by: 1.1 },
      );
    } else if (drivingProfile === "my_style") {
      // Per "il mio stile" calcoliamo il profilo utente e adattiamo i pesi.
      // Viene eseguito in modo lazy e non blocca il calcolo se fallisce.
      try {
        const { getUserStyleProfile } = await import("../curvy-score-job");
        const userProfile = await getUserStyleProfile(userId);
        if (userProfile?.avgLeanAngle !== null && userProfile?.avgLeanAngle !== undefined) {
          const lean = userProfile.avgLeanAngle;
          // Biker aggressivo (>25°): massimizza le curve piccole e tortuose
          if (lean > 25) {
            priority.push(
              { if: "road_class == TERTIARY", multiply_by: 1.5 },
              { if: "road_class == UNCLASSIFIED", multiply_by: 1.4 },
              { if: "road_class == SECONDARY", multiply_by: 1.2 },
              { if: "road_class == PRIMARY", multiply_by: 0.4 },
              { if: "road_class == TRUNK", multiply_by: 0.15 },
            );
          } else if (lean > 15) {
            // Biker medio: preferisce curve ma non le più estreme
            priority.push(
              { if: "road_class == TERTIARY", multiply_by: 1.35 },
              { if: "road_class == UNCLASSIFIED", multiply_by: 1.25 },
              { if: "road_class == SECONDARY", multiply_by: 1.15 },
            );
          } else {
            // Biker comfort (<15°): strade larghe e sicure con qualche curva
            priority.push(
              { if: "road_class == SECONDARY", multiply_by: 1.2 },
              { if: "road_class == PRIMARY", multiply_by: 0.9 },
              { if: "road_class == TERTIARY", multiply_by: 1.1 },
            );
          }
        }
      } catch {
        // Fallback al profilo geometrico — segnala il fallback nella risposta
        myStyleWarning = "my_style_fallback";
      }
    }

    if (priority.length > 0) {
      body.custom_model = { priority };
    }

    let ghData: any;
    try {
      const ghResult = await ghCalculateRoute({
        points: body.points as [number, number][],
        profile: body.profile as string,
        instructions: body.instructions as boolean,
        calc_points: body.calc_points as boolean,
        points_encoded: false,
        optimize: body.optimize as boolean,
        elevation: body.elevation as boolean,
        ...(body.heading !== undefined ? { heading: body.heading as number } : {}),
        ...(body.custom_model ? { custom_model: body.custom_model as Record<string, unknown> } : {}),
        language: language ?? "it",
      });
      ghData = ghResult;
    } catch (ghErr) {
      console.error("[GraphHopper] error:", ghErr);
      return res.json(buildFallbackRoute(waypoints));
    }

    const data = ghData as any;
    const path = data.paths?.[0];
    if (!path) {
      console.warn("[GraphHopper] nessun percorso trovato, uso fallback approssimativo");
      return res.json(buildFallbackRoute(waypoints));
    }

    // With points_encoded=false, path.points is a GeoJSON object with coordinates array [lng, lat, elev]
    const ghPoints: number[][] = path.points?.coordinates ?? [];
    // Re-encode to polyline for storage (lat/lng only)
    const rawPoints: Array<{ lat: number; lng: number }> = ghPoints.map((p: number[]) => ({ lat: p[1], lng: p[0] }));

    // Compute biker score from raw points using shared helper
    const bikerScore = computeBikerScoreFromPoints(rawPoints);

    const distanceKm = Math.round((path.distance ?? 0) / 100) / 10;
    const durationMinutes = Math.round((path.time ?? 0) / 60000);

    // Extract navigation steps from GraphHopper instructions
    const navigationSteps = (path.instructions ?? []).map((instr: any) => ({
      sign: instr.sign ?? 0,
      text: instr.text ?? "",
      distance: Math.round(instr.distance ?? 0),
      time: Math.round((instr.time ?? 0) / 1000),
      interval: instr.interval ?? [0, 0],
      streetName: instr.street_name ?? "",
    }));

    // Extract elevation profile
    const elevationData = extractElevationProfile(null, ghPoints);

    // Compute target duration warning for round-trip
    const targetMinutes = roundTripHours ? roundTripHours * 60 : null;
    const durationDeviation = targetMinutes
      ? Math.abs(durationMinutes - targetMinutes) / targetMinutes
      : null;

    return res.json({
      encoded: null,
      rawPoints,
      distanceKm,
      durationMinutes,
      bikerScore,
      navigationSteps,
      targetDurationMinutes: targetMinutes,
      durationDeviationPct: durationDeviation !== null ? Math.round(durationDeviation * 100) : null,
      elevationProfile: elevationData?.profile ?? null,
      elevationGainM: elevationData?.gainM ?? null,
      altitudeMinM: elevationData?.minM ?? null,
      altitudeMaxM: elevationData?.maxM ?? null,
      ...(myStyleWarning ? { warning: myStyleWarning } : {}),
    });
  } catch (err) {
    console.error("[GraphHopper] fetch error:", err);
    return res.json({ ...buildFallbackRoute(waypoints), ...(myStyleWarning ? { warning: myStyleWarning } : {}) });
  }
});

// ─── Weather: GET /weather/:id (route-based with cache) ──────────────────────

router.get("/weather/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;
  const { departureTime: depParam } = req.query as { departureTime?: string };

  try {
    const route = await storage.getPlannedRoute(id);
    if (!route) return res.status(404).json({ message: "Percorso non trovato" });
    if (route.userId !== userId && route.visibility !== "public") {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const departure = depParam ? new Date(depParam) : new Date(Date.now() + 3600_000);

    // Check cache (valid for 1h)
    const cache = await storage.getRouteWeatherCache(id);
    if (cache && cache.weatherData) {
      const cacheAge = Date.now() - new Date(cache.createdAt).getTime();
      const depClose = cache.departureTime &&
        Math.abs(new Date(cache.departureTime).getTime() - departure.getTime()) < 3600_000;
      if (cacheAge < 3600_000 && depClose) {
        const wd = cache.weatherData as any;
        return res.json({ waypoints: wd.waypoints ?? [], departureTime: departure.toISOString(), cached: true });
      }
    }

    const waypoints = (route.waypoints as Array<{ lat: number; lng: number; name?: string }>) ?? [];
    if (!waypoints.length) return res.json({ waypoints: [], departureTime: departure.toISOString() });

    // Estimate avg speed from style (curvy=60, balanced=70, fast=90)
    const styleSpeedMap: Record<string, number> = { curvy: 60, balanced: 70, fast: 90 };
    const avgSpeedKmh = styleSpeedMap[route.style ?? "balanced"] ?? 70;

    const results = await fetchWeatherForWaypoints(waypoints, departure, avgSpeedKmh);

    // Store cache
    await storage.upsertRouteWeatherCache({
      routeId: id,
      departureTime: departure,
      weatherData: { waypoints: results } as any,
    });

    // Persist compact weather summary in route metadata for list card display
    const hasRain = results.some((w: any) => (w.precipProb ?? 0) > 30 || (w.precipitation ?? 0) > 2);
    const avgTempRaw = results.reduce((s: number, w: any) => s + (w.tempNow ?? 0), 0) / Math.max(1, results.length);
    const summaryIcon = hasRain ? "rainy" : results.some((w: any) => (w.cloudCover ?? 0) > 60) ? "cloudy" : "sunny";
    await storage.updatePlannedRoute(id, {
      metadata: {
        ...(route.metadata as object ?? {}),
        weatherSummary: {
          icon: summaryIcon,
          avgTemp: Math.round(avgTempRaw),
          hasRain,
          updatedAt: new Date().toISOString(),
        },
      } as any,
    }).catch(() => {});

    return res.json({ waypoints: results, departureTime: departure.toISOString(), cached: false });
  } catch (err) {
    console.error("[weather/:id] error:", err);
    return res.status(502).json({ message: "Meteo non disponibile" });
  }
});

// ─── Weather: POST /weather (ad-hoc waypoints, no cache) ─────────────────────

router.post("/weather", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { waypoints, departureTime } = req.body as {
    waypoints: Array<{ lat: number; lng: number; name?: string }>;
    departureTime?: string;
  };

  if (!waypoints?.length) return res.status(400).json({ message: "Waypoint richiesti" });

  try {
    const departure = departureTime ? new Date(departureTime) : new Date(Date.now() + 3600_000);
    const results = await fetchWeatherForWaypoints(waypoints, departure);
    return res.json({ waypoints: results, departureTime: departure.toISOString() });
  } catch (err) {
    console.error("[weather] error:", err);
    return res.status(502).json({ message: "Meteo non disponibile" });
  }
});

// ─── POI Photos: GET /poi/:id/photos ──────────────────────────────────────────

router.get("/poi/:id/photos", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const poiId = req.params["id"] as string;

  try {
    const { db } = await import("../db");
    const { poiPhotos } = await import("@shared/schema");
    const { eq, desc } = await import("drizzle-orm");
    const photos = await db
      .select()
      .from(poiPhotos)
      .where(eq(poiPhotos.poiId, poiId))
      .orderBy(desc(poiPhotos.createdAt))
      .limit(20);
    return res.json({ photos });
  } catch (err) {
    console.error("[poi photos GET] error:", err);
    return res.json({ photos: [] });
  }
});

// ─── POI Photos: POST /poi/:id/photos ─────────────────────────────────────────

router.post("/poi/:id/photos", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const poiId = req.params["id"] as string;

  const { photoBase64, mimeType = "image/jpeg", caption } = req.body as {
    photoBase64: string;
    mimeType?: string;
    caption?: string;
  };

  if (!photoBase64) return res.status(400).json({ message: "Immagine richiesta" });

  try {
    const { uploadBuffer, getPublicUrl } = await import("../objectStorage");
    const { db } = await import("../db");
    const { poiPhotos } = await import("@shared/schema");

    const buffer = Buffer.from(photoBase64, "base64");
    const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const objectPath = `public/poi-photos/${poiId}/${userId}-${Date.now()}.${ext}`;

    await uploadBuffer(objectPath, buffer, mimeType);
    const photoUrl = await getPublicUrl(objectPath);

    const [photo] = await db.insert(poiPhotos).values({
      poiId,
      userId,
      photoUrl,
      caption: caption ?? null,
    }).returning();

    return res.status(201).json({ photo });
  } catch (err) {
    console.error("[poi photos POST] error:", err);
    return res.status(500).json({ message: "Errore caricamento foto" });
  }
});

// ─── POI: GET /poi (query params: bbox, types) ────────────────────────────────

router.get("/poi", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { minLat, minLng, maxLat, maxLng, types: typesParam } = req.query as {
    minLat?: string; minLng?: string; maxLat?: string; maxLng?: string; types?: string;
  };

  if (!minLat || !minLng || !maxLat || !maxLng) {
    return res.status(400).json({ message: "Parametri bbox richiesti: minLat, minLng, maxLat, maxLng" });
  }

  const types = typesParam ? typesParam.split(",") : ["fuel", "rest", "viewpoint", "hotel"];
  const [bMinLat, bMinLng, bMaxLat, bMaxLng] = [parseFloat(minLat), parseFloat(minLng), parseFloat(maxLat), parseFloat(maxLng)];

  try {
    const pois = await fetchPOI({ minLat: bMinLat, minLng: bMinLng, maxLat: bMaxLat, maxLng: bMaxLng }, types);
    return res.json({ pois });
  } catch (err) {
    console.error("[poi GET] error:", err);
    return res.json({ pois: [] });
  }
});

// ─── POI: POST /poi (body bbox) ──────────────────────────────────────────────

router.post("/poi", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { bbox, types = ["fuel", "rest", "viewpoint", "hotel"] } = req.body as {
    bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number };
    types?: string[];
  };

  if (!bbox) return res.status(400).json({ message: "Bounding box richiesta" });

  try {
    const pois = await fetchPOI(bbox, types);
    return res.json({ pois });
  } catch (err) {
    console.error("[poi POST] error:", err);
    return res.json({ pois: [] });
  }
});

async function fetchPOI(
  bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number },
  types: string[]
): Promise<any[]> {
  const { minLat, minLng, maxLat, maxLng } = bbox;
  const filters: string[] = [];

  if (types.includes("fuel"))
    filters.push(`node["amenity"="fuel"](${minLat},${minLng},${maxLat},${maxLng});`);
  if (types.includes("rest")) {
    filters.push(`node["amenity"="restaurant"](${minLat},${minLng},${maxLat},${maxLng});`);
    filters.push(`node["amenity"="cafe"](${minLat},${minLng},${maxLat},${maxLng});`);
  }
  if (types.includes("hotel"))
    filters.push(`node["tourism"="hotel"](${minLat},${minLng},${maxLat},${maxLng});`);
  if (types.includes("viewpoint"))
    filters.push(`node["tourism"="viewpoint"](${minLat},${minLng},${maxLat},${maxLng});`);

  if (!filters.length) return [];

  const query = `[out:json][timeout:15];\n(\n${filters.join("\n")}\n);\nout body 80;`;
  const resp = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!resp.ok) return [];
  const data = await resp.json() as any;

  return (data.elements ?? []).map((el: any) => ({
    id: el.id,
    lat: el.lat,
    lng: el.lon,
    type: el.tags?.amenity ?? el.tags?.tourism ?? "point",
    name: el.tags?.name ?? el.tags?.["name:it"] ?? null,
    brand: el.tags?.brand ?? null,
    phone: el.tags?.phone ?? null,
    website: el.tags?.website ?? null,
    openingHours: el.tags?.["opening_hours"] ?? null,
  }));
}

// ─── Hotel suggestions for multi-day (Overpass + Booking.com link) ────────────

router.post("/hotels", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { dayEndPoints, checkIn, nights = 1 } = req.body as {
    dayEndPoints: Array<{ lat: number; lng: number; name?: string }>;
    checkIn?: string;
    nights?: number;
  };

  if (!dayEndPoints?.length) return res.status(400).json({ message: "Punti fine tappa richiesti" });

  try {
    const checkInDate = checkIn ?? new Date().toISOString().split("T")[0];
    const checkOutDate = new Date(new Date(checkInDate).getTime() + nights * 86400000)
      .toISOString().split("T")[0];

    const results: any[] = [];

    for (const pt of dayEndPoints) {
      const radius = 0.15; // ~15km
      const bbox = {
        minLat: pt.lat - radius, minLng: pt.lng - radius,
        maxLat: pt.lat + radius, maxLng: pt.lng + radius,
      };

      const hotels = await fetchPOI(bbox, ["hotel"]);

      // Build Booking.com link for this area
      const cityName = pt.name ?? `${pt.lat.toFixed(2)},${pt.lng.toFixed(2)}`;
      const bookingUrl = `https://www.booking.com/searchresults.it.html?ss=${encodeURIComponent(cityName)}&checkin=${checkInDate}&checkout=${checkOutDate}&group_adults=1&no_rooms=1`;

      results.push({
        dayEnd: pt,
        hotels: hotels.slice(0, 10),
        bookingUrl,
        checkIn: checkInDate,
        checkOut: checkOutDate,
      });
    }

    return res.json({ days: results });
  } catch (err) {
    console.error("[hotels] error:", err);
    return res.status(502).json({ message: "Hotel non disponibili" });
  }
});

// ─── Multi-day segmentation ───────────────────────────────────────────────────

router.post("/segment-multiday", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { waypoints, distanceKm, durationMinutes, daysCount = 2, maxHoursPerDay = 6 } = req.body as {
    waypoints: Array<{ lat: number; lng: number; name?: string }>;
    distanceKm: number;
    durationMinutes: number;
    daysCount: number;
    maxHoursPerDay: number;
  };

  if (!waypoints?.length || waypoints.length < 2) {
    return res.status(400).json({ message: "Waypoint richiesti" });
  }

  try {
    const maxMinutesPerDay = maxHoursPerDay * 60;
    const minutesPerSegment = durationMinutes / daysCount;
    const kmPerSegment = distanceKm / daysCount;

    const days: any[] = [];
    const wpPerDay = Math.max(1, Math.floor(waypoints.length / daysCount));

    for (let day = 0; day < daysCount; day++) {
      const startIdx = day * wpPerDay;
      const endIdx = day === daysCount - 1 ? waypoints.length - 1 : Math.min((day + 1) * wpPerDay, waypoints.length - 1);
      const dayWps = waypoints.slice(startIdx, endIdx + 1);

      days.push({
        day: day + 1,
        waypoints: dayWps,
        estimatedKm: Math.round(kmPerSegment * 10) / 10,
        estimatedMinutes: Math.round(Math.min(minutesPerSegment, maxMinutesPerDay)),
        endPoint: dayWps[dayWps.length - 1],
        isFeasible: minutesPerSegment <= maxMinutesPerDay,
      });
    }

    return res.json({ days, totalDays: daysCount, kmPerDay: Math.round(kmPerSegment * 10) / 10 });
  } catch (err) {
    console.error("[segment-multiday] error:", err);
    return res.status(500).json({ message: "Errore segmentazione" });
  }
});

// ─── Compatible bikers near route ────────────────────────────────────────────

router.get("/compatible-bikers/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const route = await storage.getPlannedRoute(id);
    if (!route) return res.status(404).json({ message: "Percorso non trovato" });

    const waypoints = (route.waypoints as Array<{ lat: number; lng: number; name?: string }>) ?? [];
    const originWp = waypoints.find((wp) => wp.lat !== 0 && wp.lng !== 0);
    if (!originWp) return res.json({ bikers: [], count: 0 });

    // Get bikers with proposals or online bikers near the start of this route (50km radius)
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");

    // Riding style compatibility: map route style to preferred rider styles
    const styleToRiderStyles: Record<string, string[]> = {
      curvy: ["sport", "adventure", "enduro", "touring", "sport_touring"],
      balanced: ["touring", "sport_touring", "naked", "adventure", "sport"],
      fast: ["sport", "sport_touring", "naked", "superbike"],
    };
    const compatibleStyles = styleToRiderStyles[route.style ?? "balanced"] ?? [];

    const nearbyProfiles = await db.execute(sql`
      SELECT up.user_id, up.latitude, up.longitude, u.nickname, u.user_type,
             u.avatar_url, up.riding_style, up.is_available, up.hide_from_map,
             u.last_login_at,
             -- Proximity score (0-50): closer = higher score
             GREATEST(0, 50 - (
               6371 * acos(
                 cos(radians(${originWp.lat})) * cos(radians(up.latitude)) *
                 cos(radians(up.longitude) - radians(${originWp.lng})) +
                 sin(radians(${originWp.lat})) * sin(radians(up.latitude))
               )
             )) AS proximity_score,
             -- Style match bonus: +30 if riding style is compatible with route style
             CASE WHEN up.riding_style = ANY(${compatibleStyles}) THEN 30 ELSE 0 END AS style_score,
             -- Availability bonus: +20 if currently marked available
             CASE WHEN up.is_available IS TRUE THEN 20 ELSE 0 END AS avail_score
      FROM user_profiles up
      JOIN users u ON u.id = up.user_id
      WHERE up.latitude IS NOT NULL AND up.longitude IS NOT NULL
        AND u.status = 'active' AND u.id != ${userId}
        AND up.hide_from_map IS NOT TRUE
        -- Active in last 30 days
        AND (u.last_login_at IS NULL OR u.last_login_at > NOW() - INTERVAL '30 days')
        -- Within 50km of route start
        AND (
          6371 * acos(
            cos(radians(${originWp.lat})) * cos(radians(up.latitude)) *
            cos(radians(up.longitude) - radians(${originWp.lng})) +
            sin(radians(${originWp.lat})) * sin(radians(up.latitude))
          )
        ) < 50
      ORDER BY (
        GREATEST(0, 50 - (
          6371 * acos(
            cos(radians(${originWp.lat})) * cos(radians(up.latitude)) *
            cos(radians(up.longitude) - radians(${originWp.lng})) +
            sin(radians(${originWp.lat})) * sin(radians(up.latitude))
          )
        )) +
        CASE WHEN up.riding_style = ANY(${compatibleStyles}) THEN 30 ELSE 0 END +
        CASE WHEN up.is_available IS TRUE THEN 20 ELSE 0 END
      ) DESC
      LIMIT 15
    `);

    const bikers = nearbyProfiles.rows.map((r: any) => ({
      userId: r.user_id,
      nickname: r.nickname,
      userType: r.user_type,
      avatarUrl: r.avatar_url,
      ridingStyle: r.riding_style,
      isAvailable: r.is_available,
      styleCompatible: compatibleStyles.includes(r.riding_style ?? ""),
      distanceKm: originWp ? Math.round(haversineKm(originWp.lat, originWp.lng, r.latitude, r.longitude)) : null,
      matchScore: Math.round(Number(r.proximity_score ?? 0) + Number(r.style_score ?? 0) + Number(r.avail_score ?? 0)),
    }));

    // Persist biker count in route metadata for list card display
    await storage.updatePlannedRoute(id, {
      metadata: {
        ...(route.metadata as object ?? {}),
        bikerCount: bikers.length,
        bikerUpdatedAt: new Date().toISOString(),
      } as any,
    }).catch(() => {});

    return res.json({ bikers, count: bikers.length, routeId: id });
  } catch (err) {
    console.error("[compatible-bikers] error:", err);
    return res.json({ bikers: [], count: 0 });
  }
});

// ─── GPX import ──────────────────────────────────────────────────────────────

router.post("/import-gpx", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { gpxContent, title: titleOverride, visibility = "public" } = req.body as {
    gpxContent: string;
    title?: string;
    visibility?: string;
  };

  if (!gpxContent) return res.status(400).json({ message: "Contenuto GPX richiesto" });

  try {
    // Robust attr extractor — works regardless of attribute order or quote style
    function gpxAttr(tag: string, attr: string): string | null {
      const m = tag.match(new RegExp(`\\b${attr}\\s*=\\s*['"]([^'"]+)['"]`, "i"));
      return m?.[1] ?? null;
    }

    // Parse waypoints from <wpt> tags (attribute-order-independent)
    const wptOpenTagRegex = /<wpt\b([^>]*?)>/g;
    const waypoints: Array<{ lat: number; lng: number; name: string }> = [];
    let wptTagMatch;
    while ((wptTagMatch = wptOpenTagRegex.exec(gpxContent)) !== null) {
      const attrs = wptTagMatch[1];
      const lat = gpxAttr(attrs, "lat");
      const lon = gpxAttr(attrs, "lon");
      if (!lat || !lon) continue;
      // Grab <name> content from the wpt element
      const rest = gpxContent.slice(wptTagMatch.index + wptTagMatch[0].length);
      const nameM = rest.match(/^[\s\S]*?(?:<name>([^<]*)<\/name>)?[\s\S]*?<\/wpt>/);
      waypoints.push({
        lat: parseFloat(lat),
        lng: parseFloat(lon),
        name: nameM?.[1] ?? "",
      });
    }

    // Parse track points from <trkpt> tags (attribute-order-independent)
    const trkPtOpenTagRegex = /<trkpt\b([^>]*?)\/?>/g;
    const trackPoints: [number, number][] = [];
    let trkMatch;
    while ((trkMatch = trkPtOpenTagRegex.exec(gpxContent)) !== null) {
      const attrs = trkMatch[1];
      const lat = gpxAttr(attrs, "lat");
      const lon = gpxAttr(attrs, "lon");
      if (lat && lon) trackPoints.push([parseFloat(lat), parseFloat(lon)]);
    }

    // Extract title
    const nameMeta = gpxContent.match(/<metadata>[\s\S]*?<name>([^<]*)<\/name>[\s\S]*?<\/metadata>/);
    const trkName = gpxContent.match(/<trk>[\s\S]*?<name>([^<]*)<\/name>/);
    const gpxTitle = titleOverride ?? nameMeta?.[1] ?? trkName?.[1] ?? "Percorso importato";

    // Calculate distance from track points
    let distanceKm = 0;
    for (let i = 1; i < trackPoints.length; i++) {
      distanceKm += haversineKm(trackPoints[i-1][0], trackPoints[i-1][1], trackPoints[i][0], trackPoints[i][1]);
    }

    // Use waypoints as the saved waypoints, fallback to first/last track point
    const finalWaypoints = waypoints.length > 0 ? waypoints :
      trackPoints.length >= 2 ? [
        { lat: trackPoints[0][0], lng: trackPoints[0][1], name: "Partenza" },
        { lat: trackPoints[trackPoints.length-1][0], lng: trackPoints[trackPoints.length-1][1], name: "Arrivo" },
      ] : [];

    if (finalWaypoints.length < 2 && trackPoints.length < 2) {
      return res.status(400).json({ message: "GPX non valido: nessun waypoint o traccia trovata" });
    }

    const route = await storage.createPlannedRoute({
      userId,
      title: gpxTitle,
      waypoints: finalWaypoints,
      polyline: null,
      distanceKm: Math.round(distanceKm * 10) / 10,
      durationMinutes: Math.round(distanceKm / 70 * 60),
      bikerScore: 0.5,
      style: "balanced",
      visibility: visibility as any,
      isMultiDay: false,
      metadata: { importedFromGpx: true, trackPointCount: trackPoints.length } as any,
    });

    return res.status(201).json(route);
  } catch (err) {
    console.error("[import-gpx] error:", err);
    return res.status(500).json({ message: "Errore importazione GPX" });
  }
});

// ─── Save / list / get / delete planned routes ────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const body = req.body as Partial<InsertPlannedRoute> & { title: string; navigationSteps?: any[] };
  if (!body.title) return res.status(400).json({ message: "Titolo richiesto" });

  try {
    const route = await storage.createPlannedRoute({
      userId,
      title: body.title,
      description: body.description ?? null,
      waypoints: (body.waypoints as any) ?? [],
      polyline: body.polyline ?? null,
      navigationSteps: (body.navigationSteps as any) ?? null,
      distanceKm: body.distanceKm ?? 0,
      durationMinutes: body.durationMinutes ?? 0,
      bikerScore: body.bikerScore ?? 0,
      style: (body.style as any) ?? "curvy",
      visibility: (body.visibility as any) ?? "public",
      isMultiDay: body.isMultiDay ?? false,
      metadata: (body.metadata as any) ?? {},
    });
    return res.status(201).json(route);
  } catch (err) {
    console.error("[planned-routes] create error:", err);
    return res.status(500).json({ message: "Errore salvataggio" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { filter } = req.query as { filter?: string };

  try {
    if (filter === "public") {
      const routes = await storage.getPublicPlannedRoutes(50);
      return res.json(routes);
    }
    const routes = await storage.getPlannedRoutes(userId);
    return res.json(routes);
  } catch (err) {
    console.error("[planned-routes] list error:", err);
    return res.status(500).json({ message: "Errore caricamento" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const route = await storage.getPlannedRoute(id);
    if (!route) return res.status(404).json({ message: "Percorso non trovato" });
    if (route.userId !== userId && route.visibility !== "public") {
      return res.status(403).json({ message: "Accesso non consentito" });
    }
    return res.json(route);
  } catch (err) {
    console.error("[planned-routes] get error:", err);
    return res.status(500).json({ message: "Errore" });
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const existing = await storage.getPlannedRoute(id);
    if (!existing) return res.status(404).json({ message: "Non trovato" });
    if (existing.userId !== userId) return res.status(403).json({ message: "Non autorizzato" });

    const updated = await storage.updatePlannedRoute(id, req.body);
    return res.json(updated);
  } catch (err) {
    console.error("[planned-routes] update error:", err);
    return res.status(500).json({ message: "Errore aggiornamento" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const existing = await storage.getPlannedRoute(id);
    if (!existing) return res.status(404).json({ message: "Non trovato" });
    if (existing.userId !== userId) return res.status(403).json({ message: "Non autorizzato" });

    await storage.deletePlannedRoute(id);
    return res.status(204).send();
  } catch (err) {
    console.error("[planned-routes] delete error:", err);
    return res.status(500).json({ message: "Errore eliminazione" });
  }
});

// ─── Elevation profile ────────────────────────────────────────────────────────

router.get("/:id/elevation", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const route = await storage.getPlannedRoute(id);
    if (!route) return res.status(404).json({ message: "Percorso non trovato" });
    if (route.userId !== userId && route.visibility !== "public") {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    // ── Elevation cache check (stored in metadata, no expiry — data is static) ──
    const meta = (route.metadata ?? {}) as Record<string, unknown>;
    if (meta.elevationCache) {
      return res.json({ ...(meta.elevationCache as object), cached: true });
    }

    // Build sample points from polyline or waypoints
    let rawPoints: [number, number][] = [];
    if (route.polyline) {
      rawPoints = decodePolyline(route.polyline);
    } else {
      const wps = (route.waypoints as Array<{ lat: number; lng: number }>) ?? [];
      rawPoints = wps.filter((wp) => wp.lat !== 0 || wp.lng !== 0).map((wp) => [wp.lat, wp.lng]);
    }

    if (rawPoints.length === 0) {
      return res.status(422).json({ message: "Nessun punto disponibile per il profilo altimetrico" });
    }

    // Downsample to max 100 points (OpenTopoData limit per request)
    const MAX_SAMPLES = 100;
    const step = Math.max(1, Math.ceil(rawPoints.length / MAX_SAMPLES));
    const sampled: [number, number][] = [];
    for (let i = 0; i < rawPoints.length; i += step) {
      sampled.push(rawPoints[i]);
    }
    // Always include the last point (without exceeding MAX_SAMPLES)
    const last = rawPoints[rawPoints.length - 1];
    if (sampled[sampled.length - 1] !== last && sampled.length < MAX_SAMPLES) {
      sampled.push(last);
    }
    // Hard cap — guarantee we never exceed OpenTopoData limit
    if (sampled.length > MAX_SAMPLES) sampled.length = MAX_SAMPLES;

    // Compute cumulative distance (km) for each sampled point
    const distKm: number[] = [0];
    for (let i = 1; i < sampled.length; i++) {
      distKm.push(distKm[i - 1] + haversineKm(sampled[i-1][0], sampled[i-1][1], sampled[i][0], sampled[i][1]));
    }

    // Call OpenTopoData SRTM90m (free, no key required)
    const locationsStr = sampled.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join("|");
    const topoUrl = `https://api.opentopodata.org/v1/srtm90m?locations=${locationsStr}`;

    let elevations: number[];
    try {
      const topoResp = await fetch(topoUrl, {
        headers: { "User-Agent": "BikerLink/4.0 (info@bikerlink.it)" },
      });
      if (!topoResp.ok) throw new Error(`OpenTopoData ${topoResp.status}`);
      const topoData = await topoResp.json() as any;
      if (topoData.status !== "OK") throw new Error("OpenTopoData status: " + topoData.status);
      elevations = (topoData.results as any[]).map((r: any) => Math.round(r.elevation ?? 0));
    } catch (err) {
      console.error("[elevation] OpenTopoData error:", err);
      // Fallback: return empty to let client show unavailable
      return res.status(502).json({ message: "Dati altimetrici non disponibili al momento" });
    }

    // Compute stats
    const validEle = elevations.filter((e) => e != null && !isNaN(e));
    if (validEle.length === 0) {
      return res.status(502).json({ message: "Dati altimetrici non disponibili al momento" });
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

    // Persist elevation cache in metadata (fire-and-forget — don't block the response)
    storage.updatePlannedRoute(id, {
      metadata: { ...meta, elevationCache: payload },
    }).catch((err: unknown) => console.error("[elevation] cache save error:", err));

    return res.json(payload);
  } catch (err) {
    console.error("[elevation] error:", err);
    return res.status(500).json({ message: "Errore profilo altimetrico" });
  }
});

// ─── GPX export ───────────────────────────────────────────────────────────────

router.get("/:id/export.gpx", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const route = await storage.getPlannedRoute(id);
    if (!route) return res.status(404).json({ message: "Non trovato" });
    if (route.userId !== userId && route.visibility !== "public") {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const waypoints = (route.waypoints as Array<{ lat: number; lng: number; name?: string }>) ?? [];
    let trackPoints: [number, number][] = [];

    if (route.polyline) {
      trackPoints = decodePolyline(route.polyline);
    } else if (waypoints.length) {
      trackPoints = waypoints.map((wp) => [wp.lat, wp.lng]);
    }

    const now = new Date().toISOString();
    const trkpts = trackPoints
      .map(([lat, lng]) => `    <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"></trkpt>`)
      .join("\n");

    const wpts = waypoints
      .map((wp, i) => `  <wpt lat="${wp.lat.toFixed(6)}" lon="${wp.lng.toFixed(6)}"><name>${escapeXml(wp.name ?? `Tappa ${i + 1}`)}</name></wpt>`)
      .join("\n");

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BikerLink" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(route.title)}</name>
    <time>${now}</time>
  </metadata>
${wpts}
  <trk>
    <name>${escapeXml(route.title)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;

    res.setHeader("Content-Type", "application/gpx+xml");
    res.setHeader("Content-Disposition", `attachment; filename="giro-${route.id}.gpx"`);
    return res.send(gpx);
  } catch (err) {
    console.error("[gpx] export error:", err);
    return res.status(500).json({ message: "Errore export GPX" });
  }
});

export default router;
