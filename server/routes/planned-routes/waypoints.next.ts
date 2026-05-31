/**
 * waypoints.next.ts — file successore di waypoints.ts
 *
 * Quando waypoints.ts supererà la soglia delle 600 righe, spostare qui
 * i nuovi blocchi (handler, helper, schema) invece di aggiungerne altri
 * all'originale.
 *
 * Convenzione di utilizzo:
 *   - Aggiungere qui SOLO codice nuovo (non spostare codice esistente da waypoints.ts).
 *   - Esportare dal file e importare in waypoints.ts (o nel router principale) quanto necessario.
 *   - Aggiornare questo commento man mano che il file cresce.
 *
 * Task #2847 — resolver AI con Ollama come provider primario e Gemini come
 * fallback automatico per il parsing dei percorsi (/ai-parse + /ai-stream).
 */

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

/**
 * /ai-stream — stream testuale token-per-token.
 * Prova Ollama (se configurato): se la connessione fallisce PRIMA del primo
 * token, ricade su Gemini. Una volta emesso il primo chunk Ollama, vi resta:
 * un errore a metà stream viene propagato (NON si passa a Gemini) perché i
 * chunk già inviati al client non sono ritrasmettibili e mescolare due provider
 * produrrebbe output incoerente. La validazione JSON finale resta al chiamante.
 * Se Ollama è configurato e risponde, GEMINI_API_KEY non è necessaria.
 */
export async function* streamRouteText(opts: Omit<RouteAiOptions<unknown>, "schema">): AsyncGenerator<string> {
  const { prompt, apiKey, system, abortSignal, maxRetries = 2, temperature = 0.1 } = opts;
  const fullPrompt = `${system}\n\nRichiesta: ${prompt}`;

  if (isOllamaConfigured) {
    let started = false;
    try {
      const result = streamText({ model: getOllamaModel(), prompt: fullPrompt, maxRetries, temperature, abortSignal });
      const iterator = result.textStream[Symbol.asyncIterator]();
      const first = await iterator.next(); // può lanciare se Ollama è offline (prima del primo chunk)
      if (!first.done) {
        started = true;
        yield first.value;
        for (let n = await iterator.next(); !n.done; n = await iterator.next()) {
          yield n.value;
        }
      }
      return;
    } catch (err) {
      // Stream già iniziato o nessun fallback possibile → propaga senza mescolare provider.
      if (started || !apiKey) throw err;
      console.warn("[AI stream] Ollama non disponibile, fallback Gemini:", (err as Error)?.message ?? err);
    }
  }

  if (!apiKey) throw new Error(NO_PROVIDER_MSG);
  const result = streamText({ model: geminiModel(apiKey), prompt: fullPrompt, maxRetries, temperature, abortSignal });
  for await (const chunk of result.textStream) {
    yield chunk;
  }
}
