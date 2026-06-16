// LARGE-FILE-LOCKED — limite: 550
// Aggiungi nuove funzionalità in: server/routes/planned-routes/waypoints.next.ts
import { sendError } from "../../lib/api-response";
import { Router, Request, Response } from "express";
import { requireAuth, computeBikerScoreFromPoints } from "./utils";
import { aiPromptSchema, calculateRouteRequestSchema } from "@shared/validators";
import { z } from "zod";
import { generateRouteObject, streamRouteText } from "./waypoints.next";
import { isOllamaConfigured } from "../../lib/ollama-client";
import { isGroqConfigured } from "../../lib/groq-client";
import { isOpenAiRouteConfigured } from "../../lib/openai-route-client";
import { haversineKm } from "../../geo";
const poiPhotoSchema = z.object({ poiId: z.string().min(1, "poiId obbligatorio") });
import { ACTIVE_PROFILE } from "../../graphhopper-client";
import {
  getActiveRouter,
  CrossGroupRoutingError,
  AreaNotEnabledError,
} from "../../routing/router-selector";
import type { RouteRequest } from "../../routing/graphhopper-adapter";
import { ROUTING_AREA_OUTCOME_MESSAGES } from "@shared/routing-areas";
import {
  buildGeometricWeights,
  buildTelemetryWeightsForRoute,
  extractRouteWayIds,
  normalizeStyle,
  normalizeDrivingProfile,
} from "../../routing/route-weights";
import {
  fetchWeatherForWaypoints,
  samplePointsAlongPath,
  buildWeatherAvoidAreas,
  type WeatherSample,
} from "./weather-helper";

const router = Router();

// ─── Routing helpers ──────────────────────────────────────────────────────────


const AI_SYSTEM_PROMPT = `Sei un assistente per pianificazione giri in moto.
Analizza la richiesta e restituisci SOLO un oggetto JSON con:
- title: string
- startLocation: string (città o indirizzo geografico di partenza)
- endLocation: string (città o indirizzo geografico di arrivo)
- waypoints: string[] (SOLO luoghi geografici: città, strade, passi — NON ristoranti/hotel/locali)
- poiStops: [{near: string, query: string, category: string}] o null — tappa di tipo POI (ristorante, hotel, rifugio, officina, ecc.). "near" = città/zona geografica vicino al POI (es: "Trieste"), "query" = descrizione del POI (es: "trattoria di carne"), "category" = tipo (restaurant|hotel|fuel|motorcycle|alpine_hut|camp_site|other)
- style: "curvy"|"balanced"|"fast"
- isRoundTrip: boolean
- isMultiDay: boolean
- daysEstimate: number
- maxHoursPerDay: number (default 6)
- avoidHighways: boolean
- notes: string
IMPORTANTE: waypoints contiene SOLO luoghi geografici (città, strade, valichi). Ristoranti, hotel, rifugi, officine vanno in poiStops (non in waypoints).`;

const AI_TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS ?? "30000", 10) || 30000;
const AI_MAX_RETRIES = 2;

const routeSchema = z.object({
  title: z.string(),
  startLocation: z.string(),
  endLocation: z.string(),
  waypoints: z.array(z.string()),
  poiStops: z.array(z.object({
    near: z.string(),
    query: z.string(),
    category: z.string(),
  })).nullable(),
  style: z.enum(["curvy", "balanced", "fast"]),
  isRoundTrip: z.boolean(),
  isMultiDay: z.boolean(),
  daysEstimate: z.number(),
  maxHoursPerDay: z.number(),
  avoidHighways: z.boolean(),
  notes: z.string(),
});

type RouteObject = z.infer<typeof routeSchema>;

/**
 * Estrae TUTTI i blocchi { ... } con graffe BILANCIATE di primo livello da una
 * stringa, ignorando le graffe contenute dentro stringhe JSON (e i relativi escape).
 * Restituire più candidati evita i falsi negativi quando il testo di contorno
 * contiene altre graffe (es. "{placeholder}") prima/dopo il JSON vero.
 */
function extractBalancedJsonBlocks(text: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        blocks.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return blocks;
}

/**
 * Estrae e valida un oggetto route dal testo grezzo del modello.
 * I modelli locali a volte avvolgono il JSON in fence markdown o aggiungono
 * testo prima/dopo: proviamo prima il testo intero, poi ciascun blocco { ... }
 * bilanciato. Restituisce null se non c'è JSON valido (nessuna eccezione).
 */
function tryParseRoute(text: string): RouteObject | null {
  if (!text) return null;
  const candidates: string[] = [text.trim(), ...extractBalancedJsonBlocks(text)];
  for (const candidate of candidates) {
    try {
      return routeSchema.parse(JSON.parse(candidate));
    } catch { /* prova il prossimo candidato */ }
  }
  return null;
}

function geminiErrorMessage(err: unknown): { httpStatus: number; message: string } {
  const e = err as { name?: string; message?: string; status?: number; statusCode?: number; code?: number };
  if (e.name === "AbortError") {
    return { httpStatus: 504, message: "Il servizio AI ha impiegato troppo tempo, riprova tra qualche secondo" };
  }
  const msg = (e?.message ?? "").toLowerCase();
  const status = e?.status ?? e?.statusCode ?? e?.code;
  const isRateLimit = status === 429 || msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource_exhausted");
  if (isRateLimit) {
    return { httpStatus: 429, message: "Tutti i servizi AI sono temporaneamente saturi, riprova tra qualche minuto" };
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
  if (!apiKey && !isOllamaConfigured && !isGroqConfigured && !isOpenAiRouteConfigured) return sendError(res, 503, "Servizio AI non disponibile: nessun provider configurato (Ollama, Groq, Gemini o OpenAI)");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const onClose = () => { controller.abort(); clearTimeout(timeout); };
  req.on("close", onClose);

  try {
    const { result: object, provider_used } = await generateRouteObject({
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
    console.info(`[AI parse] provider usato: ${provider_used} | poiStops raw: ${JSON.stringify(object.poiStops)}`);

    // ── Risoluzione automatica poiStops ──────────────────────────────────────
    const rawPoiStops = object.poiStops ?? [];
    let resolvedPoiStops: Array<{ near: string; query: string; category: string; options: unknown[] }> = [];
    if (rawPoiStops.length > 0) {
      try {
        const { searchPoi } = await import("../../lib/overpass-client");
        const { geocode } = await import("../../lib/nominatim-client");
        resolvedPoiStops = await Promise.all(
          rawPoiStops.map(async (stop) => {
            try {
              const geoResults = await geocode(stop.near);
              const geo = geoResults[0];
              const options = geo ? await searchPoi(stop.query, geo.lat, geo.lng, 30) : [];
              console.info(`[AI parse] poiStop "${stop.query}" near "${stop.near}" → ${options.length} risultati Overpass`);
              return { ...stop, options };
            } catch (stopErr) {
              console.warn(`[AI parse] poiStop "${stop.query}" near "${stop.near}" — errore:`, (stopErr as Error)?.message ?? stopErr);
              return { ...stop, options: [] };
            }
          })
        );
      } catch (poiErr: unknown) {
        console.warn("[AI parse] poiStops resolution error:", (poiErr as Error)?.message ?? poiErr);
      }
    }

    return res.json({
      ...object,
      provider_used,
      ...(resolvedPoiStops.length > 0 ? { resolvedPoiStops } : {}),
    });
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
  if (!apiKey && !isOllamaConfigured && !isGroqConfigured && !isOpenAiRouteConfigured) return sendError(res, 503, "Servizio AI non disponibile: nessun provider configurato (Ollama, Groq, Gemini o OpenAI)");

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
    let aiProvider: string | null = null;
    for await (const chunk of streamRouteText({
      prompt,
      apiKey,
      system: AI_SYSTEM_PROMPT,
      maxRetries: AI_MAX_RETRIES,
      temperature: 0.1,
      abortSignal: controller.signal,
      // Buffering + validazione lato Ollama: i chunk vengono emessi solo se il testo
      // completo è un JSON valido secondo routeSchema. In caso contrario lo stream
      // ricade su Gemini senza emettere output corrotto (Task #2853).
      validate: (text) => tryParseRoute(text) !== null,
      onProviderSelected: (provider) => { aiProvider = provider; },
    })) {
      if (chunk) {
        fullText += chunk;
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
    }

    clearTimeout(timeout);
    req.off("close", onClose);

    console.info(`[AI stream] provider usato: ${aiProvider ?? "unknown"}`);
    const parsed = tryParseRoute(fullText);
    res.write(`event: done\ndata: ${JSON.stringify({ parsed, provider_used: aiProvider })}\n\n`);
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
    const { geocode } = await import("../../lib/nominatim-client");
    const results = await geocode(q);
    return res.json(results);
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
    routingProfile,
    avoidHighways = false,
    avoidTolls = false,
    avoidFerries = false,
    avoidUnpaved = false,
    avoidWeather = false,
    roundTripHours,
    isRoundTrip,
    roundTripDirection,
    headingDeg,
    language: _language,
    geocodingOk: clientGeocodingOk,
  } = parsedCalc.data;

  const normStyle = normalizeStyle(style);
  const normProfile = normalizeDrivingProfile(drivingProfile);
  // "auto panoramica": profilo veicolo Valhalla (costing auto curvy). È un asse
  // distinto dallo stile/telemetria moto — quando attivo, il router-selector
  // instrada SEMPRE a Valhalla senza fallback a GraphHopper.
  const isAutoCurvy = routingProfile === "auto_curvy";

  const DIRECTION_DEGREES: Record<string, number> = {
    N: 0, NE: 45, E: 90, SE: 135, S: 180, SO: 225, O: 270, NO: 315,
  };

  let effectiveWaypoints = waypoints;
  if (isRoundTrip && roundTripDirection && DIRECTION_DEGREES[roundTripDirection] !== undefined) {
    const headingDeg = DIRECTION_DEGREES[roundTripDirection];
    const headingRad = headingDeg * Math.PI / 180;
    const start = waypoints[0];
    const styleAvgSpeed: Record<string, number> = { direct: 80, curvy: 55, balanced: 65, fast: 85, extra_curvy: 50 };
    const avgKmh = styleAvgSpeed[normStyle] ?? 65;
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
      profile: isAutoCurvy ? "auto_curvy" : ACTIVE_PROFILE,
      instructions: true,
      calc_points: true,
      points_encoded: false,
      optimize: false,
      elevation: true,
    };

    if (isRoundTrip && headingDeg !== undefined && headingDeg !== null) {
      body.heading = headingDeg;
    }

    // Strato geometrico (base stabile per tutti i profili) + regole di avoidance.
    const geo = buildGeometricWeights(normStyle, { avoidHighways });
    const avoidRules: Array<{ if: string; multiply_by: number }> = [];
    if (avoidTolls) avoidRules.push({ if: "toll == ALL", multiply_by: 0.0 });
    if (avoidFerries) avoidRules.push({ if: "road_environment == FERRY", multiply_by: 0.0 });
    if (avoidUnpaved) avoidRules.push({ if: "road_environment == UNPAVED", multiply_by: 0.0 });
    const basePriority = [...geo.priority, ...avoidRules];

    const { resolveRouterOpts } = await import("./waypoints.next");
    const routerOpts = await resolveRouterOpts(userId, body.points as [number, number][], normStyle);

    // geocodingOk: il client informa il server se il geocoding è andato a buon
    // fine per tutti i waypoint (es. Nominatim disponibile). Se assente, si
    // assume true (coordinate già risolte o fornite direttamente via GPS/mappa).
    const geocodingOk = clientGeocodingOk ?? true;

    const runRoute = (
      priorityRules: Array<{ if: string; multiply_by: number }>,
      areas?: Record<string, unknown>,
    ) => {
      // Richiediamo i details osm_way_id per poter valutare la copertura
      // telemetrica sui segmenti effettivi del percorso.
      const reqBody: Record<string, unknown> = { ...body, details: ["osm_way_id"] };
      const customModel: Record<string, unknown> = {};
      if (priorityRules.length > 0) customModel.priority = priorityRules;
      if (geo.distanceInfluence !== undefined) customModel.distance_influence = geo.distanceInfluence;
      if (areas) customModel.areas = areas;
      if (Object.keys(customModel).length > 0) reqBody.custom_model = customModel;
      return getActiveRouter(reqBody as unknown as RouteRequest, routerOpts, res, geocodingOk);
    };

    // Percorso geometrico di base: è il risultato per il profilo "geometric" e
    // la base su cui valutare la copertura telemetrica del percorso richiesto.
    const baseResult = await runRoute(basePriority);
    let path = baseResult.paths[0];
    // Insieme di regole di priorità effettivamente applicate al percorso finale
    // (base + eventuale strato telemetrico). Serve come base per l'eventuale
    // ricalcolo "evita maltempo" così da non perdere gli altri vincoli.
    let effectivePriority = basePriority;

    // Strato telemetrico opzionale (real / my_style): applicato SOLO se i
    // segmenti effettivi del percorso hanno copertura curvy_score valida.
    // Altrimenti si mantiene il percorso geometrico e si segnala il warning.
    // Saltato per "auto panoramica": la telemetria è specifica per la moto e
    // Valhalla non applica il custom_model GraphHopper.
    if (!isAutoCurvy && normProfile !== "geometric") {
      const routeWayIds = extractRouteWayIds(path as { details?: Record<string, unknown> });
      const telemetry = await buildTelemetryWeightsForRoute(normProfile, userId, routeWayIds);
      if (telemetry.applied) {
        try {
          const boosted = await runRoute([...basePriority, ...telemetry.priority]);
          path = boosted.paths[0];
          effectivePriority = [...basePriority, ...telemetry.priority];
        } catch (telemetryErr: unknown) {
          // Lo strato telemetrico (regole su osm_way_id) può non essere supportato
          // dal motore di routing: mantieni il geometrico (fallback stabile) e
          // segnala il warning all'utente.
          console.warn("[routing] telemetry layer failed, keep geometric:", (telemetryErr as Error)?.message ?? telemetryErr);
          myStyleWarning = "insufficient_data";
        }
      } else {
        myStyleWarning = telemetry.warning;
      }
    }

    // Strato meteo opzionale ("evita zone con maltempo"): campiona il meteo lungo
    // il percorso finale e, se trova zone avverse, ricalcola evitandole. Se non è
    // possibile evitarle (motore senza supporto aree o zone inevitabili) si tiene
    // il percorso migliore disponibile e si restituisce un warning STRUTTURATO —
    // mai un fallimento silenzioso.
    let weatherWarning: string | null = null;
    if (avoidWeather) {
      try {
        const coords = (path.points as { coordinates?: number[][] })?.coordinates;
        const samples = samplePointsAlongPath(coords, 8);
        if (samples.length > 0) {
          const departure = new Date(Date.now() + 3600_000);
          const weather = await fetchWeatherForWaypoints(samples, departure);
          const evaluated = weather.filter((w): w is WeatherSample => !!w);
          const adverse = evaluated.filter((w) => !w.isSuitable);
          if (evaluated.length === 0) {
            // Provider meteo degradato: nessun punto valutabile → non possiamo
            // confermare l'assenza di maltempo. Mai un fallimento silenzioso.
            weatherWarning = "weather_unavoidable";
          } else if (adverse.length > 0) {
            const avoid = buildWeatherAvoidAreas(adverse.map((a) => ({ lat: a.lat, lng: a.lng })));
            try {
              const rerouted = await runRoute([...effectivePriority, ...avoid.priority], avoid.areas);
              const newPath = rerouted.paths[0];
              const newCoords = (newPath.points as { coordinates?: number[][] })?.coordinates;
              const newSamples = samplePointsAlongPath(newCoords, 8);
              const newWeather = await fetchWeatherForWaypoints(newSamples, departure);
              const stillAdverse = newWeather.filter((w): w is WeatherSample => !!w && !w.isSuitable);
              // Adottiamo comunque il percorso ricalcolato (best effort), ma se
              // restano zone avverse segnaliamo che il maltempo non è evitabile.
              path = newPath;
              if (stillAdverse.length > 0) weatherWarning = "weather_unavoidable";
            } catch (avoidErr: unknown) {
              console.warn("[routing] weather avoidance failed, keep route:", (avoidErr as Error)?.message ?? avoidErr);
              weatherWarning = "weather_unavoidable";
            }
          }
        }
      } catch (weatherErr: unknown) {
        // Campionamento meteo non disponibile: non blocchiamo il calcolo del
        // percorso, ma non possiamo confermare l'assenza di maltempo.
        console.warn("[routing] weather sampling failed:", (weatherErr as Error)?.message ?? weatherErr);
        weatherWarning = "weather_unavoidable";
      }
    }

    return res.json({
      encoded: path.points,
      distanceKm: Math.round(path.distance / 100) / 10,
      durationMinutes: Math.round(path.time / 60000),
      instructions: path.instructions ?? [],
      bikerScore: 0.8,
      elevation: extractElevationProfile(path.points as string, (path as { points_encoded?: boolean; points?: { coordinates?: number[][] } }).points_encoded === false ? (path.points as { coordinates?: number[][] })?.coordinates : undefined),
      warning: myStyleWarning,
      weatherWarning,
    });
  } catch (err: unknown) {
    // Esiti bloccanti del routing ad aree: risposta 422 tipizzata { code, message }
    // con messaggio amichevole in italiano (lockstep col contratto condiviso).
    if (err instanceof CrossGroupRoutingError || err instanceof AreaNotEnabledError) {
      return res.status(422).json({
        code: err.code,
        message: ROUTING_AREA_OUTCOME_MESSAGES[err.code],
      });
    }
    const errMsg = (err as Error)?.message ?? "Errore di routing";
    console.error("[routing] error:", errMsg);
    const isWaypointError = errMsg.includes("HTTP 400") || errMsg.toLowerCase().includes("cannot find point") || errMsg.toLowerCase().includes("point 0 is out");
    if (isWaypointError) {
      return sendError(res, 422, "Waypoint non raggiungibili: verifica i punti selezionati sulla mappa");
    }
    if (isAutoCurvy) {
      return sendError(res, 503, "Server panoramico non disponibile al momento. Riprova più tardi o scegli un altro profilo.");
    }
    return sendError(res, 503, "Server di routing non disponibile al momento, riprova tra qualche secondo");
  }
});

export { poiPhotoSchema };
export default router;
