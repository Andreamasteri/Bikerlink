// LARGE-FILE-LOCKED — limite: 550
// Aggiungi nuove funzionalità in: server/routes/planned-routes/waypoints.next.ts
import { sendError } from "../../lib/api-response";
import { Router, Request, Response } from "express";
import { requireAuth } from "./utils";
import { aiPromptSchema, calculateRouteRequestSchema } from "@shared/validators";
import { z } from "zod";
import { generateRouteObject, streamRouteText } from "./waypoints.next";
import { geminiErrorMessage, extractElevationProfile } from "./waypoints-helpers";
import { isOllamaConfigured } from "../../lib/ollama-client";
import { isGroqConfigured } from "../../lib/groq-client";
import { isOpenAiRouteConfigured } from "../../lib/openai-route-client";
export const poiPhotoSchema = z.object({ poiId: z.string().min(1, "poiId obbligatorio") });
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
import type { TelemetryCoverage } from "../../routing/route-weights";
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

import { handleCalculateRoute } from "./waypoints.part2";
router.post("/calculate", handleCalculateRoute);
export default router;
