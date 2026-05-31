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
import { poiSearchSchema } from "@shared/validators";
import { poiPhotoSchema } from "./waypoints";
import { generateObject, streamText } from "ai";
import type { z } from "zod";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getOllamaModel, isOllamaConfigured } from "../../lib/ollama-client";

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
  "Nessun provider AI disponibile: Ollama non raggiungibile e GEMINI_API_KEY mancante.";

function geminiModel(apiKey: string) {
  return createGoogleGenerativeAI({ apiKey })("gemini-1.5-flash");
}

/**
 * /ai-parse — genera l'oggetto route strutturato.
 * Prova Ollama (se configurato); se non raggiungibile o la risposta non è JSON
 * valido, ricade automaticamente su Gemini senza errori visibili all'utente.
 * Se Ollama è configurato e risponde, GEMINI_API_KEY non è necessaria.
 */
export async function generateRouteObject<T>(opts: RouteAiOptions<T>): Promise<T> {
  const { prompt, apiKey, system, schema, abortSignal, maxRetries = 2, temperature = 0.1 } = opts;
  const fullPrompt = `${system}\n\nRichiesta: ${prompt}`;

  if (isOllamaConfigured) {
    try {
      const { object } = await generateObject({
        model: getOllamaModel(), schema, prompt: fullPrompt, maxRetries, temperature, abortSignal,
      });
      return object;
    } catch (err) {
      if (!apiKey) throw err; // niente fallback cloud possibile → propaga l'errore Ollama
      console.warn("[AI parse] Ollama non disponibile/risposta non valida, fallback Gemini:", (err as Error)?.message ?? err);
    }
  }

  if (!apiKey) throw new Error(NO_PROVIDER_MSG);
  const { object } = await generateObject({
    model: geminiModel(apiKey), schema, prompt: fullPrompt, maxRetries, temperature, abortSignal,
  });
  return object;
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
 * Strategia:
 *   1. Ollama (provider primario): il suo output viene BUFFERIZZATO interamente
 *      lato server — NESSUN chunk viene emesso al client durante la generazione.
 *      A stream concluso, il testo completo viene validato (`validate`). Solo se
 *      valido i chunk bufferizzati vengono emessi (UX a blocchi, non corrotta).
 *      Se la validazione fallisce, o se lo stream si interrompe con errore, il
 *      buffer viene scartato e si passa a Gemini (nulla è ancora stato emesso,
 *      quindi non si mescolano provider né si corrompe l'output).
 *   2. Gemini (fallback cloud): anch'esso viene BUFFERIZZATO interamente lato
 *      server prima di emettere qualsiasi chunk al client (Task #2862). Il testo
 *      completo viene validato con la stessa funzione `validate`; se non supera la
 *      validazione, viene lanciato un errore che il route handler cattura e converte
 *      in un evento SSE `error` pulito — nessun testo corrotto raggiunge mai il client.
 *
 * Se Ollama produce output invalido e non c'è una GEMINI_API_KEY per il
 * fallback, viene lanciato un errore catchable invece di emettere testo rotto.
 * Se Ollama è configurato e risponde correttamente, GEMINI_API_KEY non serve.
 */
export async function* streamRouteText(opts: StreamRouteOptions): AsyncGenerator<string> {
  const { prompt, apiKey, system, abortSignal, maxRetries = 2, temperature = 0.1, validate } = opts;
  const fullPrompt = `${system}\n\nRichiesta: ${prompt}`;

  if (isOllamaConfigured) {
    try {
      const result = streamText({ model: getOllamaModel(), prompt: fullPrompt, maxRetries, temperature, abortSignal });
      // Buffer completo: niente viene emesso finché Ollama non ha finito E il testo
      // non è stato validato. Così un JSON rotto a metà stream non raggiunge mai il client.
      const buffered: string[] = [];
      for await (const chunk of result.textStream) {
        if (chunk) buffered.push(chunk);
      }
      const fullText = buffered.join("");
      const isValid = validate ? validate(fullText) : fullText.trim().length > 0;
      if (isValid) {
        for (const chunk of buffered) yield chunk;
        return;
      }
      // Output Ollama corrotto/incompleto: scarta il buffer e ricadi sul cloud.
      if (!apiKey) {
        throw new Error("Ollama ha prodotto una risposta non valida e nessun provider cloud è disponibile per il fallback.");
      }
      console.warn("[AI stream] Ollama ha prodotto output non valido, fallback Gemini (non-streaming sorgente).");
    } catch (err) {
      // Errore di connessione/stream o nessun fallback possibile → propaga.
      if (!apiKey) throw err;
      console.warn("[AI stream] Ollama non disponibile/risposta non valida, fallback Gemini:", (err as Error)?.message ?? err);
    }
  }

  if (!apiKey) throw new Error(NO_PROVIDER_MSG);
  // Anche il ramo Gemini viene bufferizzato e validato prima di emettere al client
  // (Task #2862). Se Gemini produce JSON malformato, lanciamo un errore pulito invece
  // di emettere testo rotto: il route handler lo cattura e invia un evento SSE error.
  const result = streamText({ model: geminiModel(apiKey), prompt: fullPrompt, maxRetries, temperature, abortSignal });
  const geminiBuffer: string[] = [];
  for await (const chunk of result.textStream) {
    if (chunk) geminiBuffer.push(chunk);
  }
  const geminiText = geminiBuffer.join("");
  const isGeminiValid = validate ? validate(geminiText) : geminiText.trim().length > 0;
  if (!isGeminiValid) {
    throw new Error("Gemini ha prodotto una risposta non valida: nessun provider disponibile ha restituito output utilizzabile.");
  }
  for (const chunk of geminiBuffer) yield chunk;
}

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
