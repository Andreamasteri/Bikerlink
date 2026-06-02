/**
 * waypoints.next.ts — file successore di waypoints.ts
 *
 * Convenzione di utilizzo:
 *   - Aggiungere qui SOLO codice nuovo (non spostare codice esistente da waypoints.ts).
 *   - Esportare dal file e importare in waypoints.ts (o nel router principale) quanto necessario.
 *
 * Task #2847 — resolver AI con Ollama come provider primario e Gemini come
 * fallback automatico per il parsing dei percorsi (/ai-parse + /ai-stream).
 * Task #2853 — buffering + validazione stream Ollama prima di emettere al client.
 */

import { Router, Request, Response } from "express";
import { sendError } from "../../lib/api-response";
import { requireAuth } from "./utils";
import { poiSearchSchema, poiRequestSchema } from "@shared/validators";
import { poiPhotoSchema } from "./waypoints";
import { z } from "zod";
import { fetchWeatherForWaypoints } from "./weather-helper";
import { generateObject, streamText } from "ai";

// Task #2633 — weather helpers estratti per riuso da /weather/:id (GET).
const weatherWaypointsSchema = z.object({
  routeId: z.string().optional(),
  waypoints: z.array(z.object({ lat: z.number().finite(), lng: z.number().finite(), name: z.string().optional() })).min(1).max(8),
  departureIso: z.string().optional(),
  avgSpeedKmh: z.number().optional(),
});
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getOllamaModel, isOllamaConfigured } from "../../lib/ollama-client";
import { getGroqModel, isGroqConfigured } from "../../lib/groq-client";
import { getEffectiveRouteChain } from "../../ai/route-provider-config";

interface RouteAiOptions<T> {
  prompt: string;
  /** Chiave Gemini per il fallback cloud. Opzionale: con Ollama configurato il flusso può girare senza. */
  apiKey?: string;
  system: string;
  schema: z.ZodType<T>;
  abortSignal?: AbortSignal;
  maxRetries?: number;
  temperature?: number;
}

const NO_PROVIDER_MSG =
  "Nessun provider AI disponibile: Ollama non raggiungibile, GROQ_API_KEY e GEMINI_API_KEY mancanti.";

function geminiModel(apiKey: string) {
  return createGoogleGenerativeAI({ apiKey })("gemini-1.5-flash");
}

/**
 * /ai-parse — genera l'oggetto route strutturato.
 * Catena di provider configurabile a runtime dall'admin (env ROUTE_AI_PROVIDERS o
 * DB ai_route_provider_chain). Ordine default: Ollama → Groq → Gemini.
 * Se un provider fallisce, passa al successivo nella chain senza errori visibili.
 */
export async function generateRouteObject<T>(opts: RouteAiOptions<T>): Promise<T> {
  const { prompt, apiKey, system, schema, abortSignal, maxRetries = 2, temperature = 0.1 } = opts;
  const fullPrompt = `${system}\n\nRichiesta: ${prompt}`;

  const chain = await getEffectiveRouteChain();
  let lastErr: unknown = null;

  for (let i = 0; i < chain.length; i++) {
    const providerId = chain[i];
    const isLast = i === chain.length - 1;

    if (providerId === "ollama") {
      if (!isOllamaConfigured) continue;
      try {
        const { object } = await generateObject({
          model: getOllamaModel(), schema, prompt: fullPrompt, maxRetries, temperature, abortSignal,
        });
        return object;
      } catch (err) {
        lastErr = err;
        if (isLast) throw err;
        console.warn("[AI parse] Ollama non disponibile/risposta non valida, fallback provider successivo:", (err as Error)?.message ?? err);
      }
    } else if (providerId === "groq") {
      if (!isGroqConfigured) continue;
      try {
        const { object } = await generateObject({
          model: getGroqModel(), schema, prompt: fullPrompt, maxRetries, temperature, abortSignal,
        });
        return object;
      } catch (err) {
        lastErr = err;
        if (isLast) throw err;
        console.warn("[AI parse] Groq non disponibile/risposta non valida, fallback provider successivo:", (err as Error)?.message ?? err);
      }
    } else if (providerId === "gemini") {
      if (!apiKey) continue;
      try {
        const { object } = await generateObject({
          model: geminiModel(apiKey), schema, prompt: fullPrompt, maxRetries, temperature, abortSignal,
        });
        return object;
      } catch (err) {
        lastErr = err;
        if (isLast) throw err;
        console.warn("[AI parse] Gemini non disponibile/risposta non valida:", (err as Error)?.message ?? err);
      }
    }
  }

  if (lastErr) throw lastErr;
  throw new Error(NO_PROVIDER_MSG);
}

export interface StreamRouteOptions extends Omit<RouteAiOptions<unknown>, "schema"> {
  /**
   * Valida il testo COMPLETO prodotto da Ollama prima che venga emesso al client.
   * Restituisce true se il contenuto è utilizzabile (es. JSON che rispetta lo
   * schema), false se è corrotto/incompleto. Se assente, si considera valido
   * qualunque testo non vuoto.
   *
   * Quando la validazione fallisce, l'output di Ollama viene scartato (nulla è
   * stato emesso) e — se disponibile — si ricade in modo pulito su Gemini.
   */
  validate?: (fullText: string) => boolean;
}

/**
 * /ai-stream — stream testuale resiliente con buffering + validazione.
 *
 * Problema risolto (Task #2853): se Ollama inizia a rispondere ma produce JSON
 * malformato a metà stream, i chunk già emessi non sono ritrasmettibili e
 * l'utente riceverebbe una risposta corrotta, senza possibilità di fallback.
 *
 * Strategia (catena: Ollama → Groq → Gemini):
 *   1. Ollama (provider primario, locale): il suo output viene BUFFERIZZATO
 *      interamente lato server — NESSUN chunk viene emesso al client durante la
 *      generazione. A stream concluso, il testo completo viene validato
 *      (`validate`). Solo se valido i chunk bufferizzati vengono emessi (UX a
 *      blocchi, non corrotta). Se la validazione fallisce, o se lo stream si
 *      interrompe con errore, il buffer viene scartato e si passa al cloud
 *      (nulla è ancora stato emesso, quindi non si mescolano provider né si
 *      corrompe l'output).
 *   2. Groq (fallback cloud veloce): se GROQ_API_KEY è presente, viene tentato
 *      prima di Gemini con la stessa logica di buffering completo + validazione.
 *      Se non valido (o non configurato) si passa a Gemini.
 *   3. Gemini (fallback cloud finale): anch'esso viene BUFFERIZZATO interamente
 *      lato server prima di emettere qualsiasi chunk al client (Task #2862). Il
 *      testo completo viene validato con la stessa funzione `validate`; se non
 *      supera la validazione, viene lanciato un errore che il route handler
 *      cattura e converte in un evento SSE `error` pulito — nessun testo corrotto
 *      raggiunge mai il client.
 *
 * Se Ollama produce output invalido e non c'è alcun provider cloud (né Groq né
 * GEMINI_API_KEY), viene lanciato un errore catchable invece di emettere testo
 * rotto. Se almeno un provider risponde correttamente, gli altri non servono.
 */

/**
 * Bufferizza interamente lo stream di un provider cloud e lo valida prima di
 * restituire i chunk. Restituisce i chunk se il testo completo è valido, oppure
 * `null` se l'output è corrotto/incompleto (così il chiamante può passare al
 * provider successivo senza aver emesso nulla al client).
 */
async function bufferAndValidateStream(
  model: Parameters<typeof streamText>[0]["model"],
  fullPrompt: string,
  opts: { maxRetries: number; temperature: number; abortSignal?: AbortSignal; validate?: (t: string) => boolean },
): Promise<string[] | null> {
  const { maxRetries, temperature, abortSignal, validate } = opts;
  const result = streamText({ model, prompt: fullPrompt, maxRetries, temperature, abortSignal });
  const buffered: string[] = [];
  for await (const chunk of result.textStream) {
    if (chunk) buffered.push(chunk);
  }
  const fullText = buffered.join("");
  const isValid = validate ? validate(fullText) : fullText.trim().length > 0;
  return isValid ? buffered : null;
}

export async function* streamRouteText(opts: StreamRouteOptions): AsyncGenerator<string> {
  const { prompt, apiKey, system, abortSignal, maxRetries = 2, temperature = 0.1, validate } = opts;
  const fullPrompt = `${system}\n\nRichiesta: ${prompt}`;
  const streamOpts = { maxRetries, temperature, abortSignal, validate };

  const chain = await getEffectiveRouteChain();

  for (let i = 0; i < chain.length; i++) {
    const providerId = chain[i];
    const isLast = i === chain.length - 1;

    if (providerId === "ollama") {
      if (!isOllamaConfigured) continue;
      try {
        const buffered = await bufferAndValidateStream(getOllamaModel(), fullPrompt, streamOpts);
        if (buffered) {
          for (const chunk of buffered) yield chunk;
          return;
        }
        if (isLast) {
          throw new Error("Ollama ha prodotto una risposta non valida e nessun provider successivo è disponibile.");
        }
        console.warn("[AI stream] Ollama output non valido, fallback provider successivo.");
      } catch (err) {
        if (isLast) throw err;
        console.warn("[AI stream] Ollama non disponibile/risposta non valida, fallback:", (err as Error)?.message ?? err);
      }
    } else if (providerId === "groq") {
      if (!isGroqConfigured) continue;
      try {
        const buffered = await bufferAndValidateStream(getGroqModel(), fullPrompt, streamOpts);
        if (buffered) {
          for (const chunk of buffered) yield chunk;
          return;
        }
        if (isLast) {
          throw new Error("Groq ha prodotto una risposta non valida e nessun provider successivo è disponibile.");
        }
        console.warn("[AI stream] Groq output non valido, fallback provider successivo.");
      } catch (err) {
        if (isLast) throw err;
        console.warn("[AI stream] Groq non disponibile/risposta non valida, fallback:", (err as Error)?.message ?? err);
      }
    } else if (providerId === "gemini") {
      if (!apiKey) continue;
      // Gemini bufferizzato + validato (Task #2862): se produce JSON malformato,
      // lanciamo un errore pulito invece di emettere testo rotto.
      const geminiBuffer = await bufferAndValidateStream(geminiModel(apiKey), fullPrompt, streamOpts);
      if (!geminiBuffer) {
        throw new Error("Gemini ha prodotto una risposta non valida: nessun provider disponibile ha restituito output utilizzabile.");
      }
      for (const chunk of geminiBuffer) yield chunk;
      return;
    }
  }

  throw new Error(NO_PROVIDER_MSG);
}

// ─── Reverse Geocoding route ───────────────────────────────────────────────────

export const geocodeRouter = Router();

geocodeRouter.get("/reverse", async (req: Request, res: Response) => {
  const { lat, lon } = req.query as { lat?: string; lon?: string };
  if (!lat || !lon) return sendError(res, 400, "Parametri lat e lon obbligatori");
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum)) return sendError(res, 400, "lat e lon devono essere numeri validi");
  try {
    const { reverseGeocode } = await import("../../lib/nominatim-client");
    const result = await reverseGeocode(latNum, lonNum);
    return res.json(result);
  } catch (err) {
    console.error("[reverse-geocode] error:", err);
    return sendError(res, 502, "Reverse geocoding non disponibile");
  }
});

// ─── POI routes (moved from waypoints.ts to keep it under 550 lines) ──────────

export const poiExtraRouter = Router();

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

poiExtraRouter.post("/weather", async (req: Request, res: Response) => {
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
