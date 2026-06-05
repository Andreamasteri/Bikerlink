/**
 * OpenAI Route Client — BikerLink
 *
 * OpenAI è il 4° e ultimo provider nella catena AI dei percorsi:
 *   Ollama (locale) → Groq (cloud veloce) → Gemini (cloud) → OpenAI (cloud finale)
 *
 * Variabili d'ambiente:
 *   OPENAI_API_KEY — Chiave API OpenAI. Se non impostata, `isOpenAiRouteConfigured`
 *                    è false e il flusso salta OpenAI senza errori visibili.
 *   OPENAI_ROUTE_MODEL — Modello da usare (default "gpt-4o-mini").
 *
 * Usa @ai-sdk/openai (già presente nel progetto per altri moduli) così da essere
 * compatibile con generateObject e streamText del Vercel AI SDK.
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_ROUTE_MODEL = process.env.OPENAI_ROUTE_MODEL ?? "gpt-4o-mini";

/** true quando OPENAI_API_KEY è impostata (OpenAI abilitato come fallback finale). */
export const isOpenAiRouteConfigured = Boolean(OPENAI_API_KEY);

/**
 * Restituisce un LanguageModel del Vercel AI SDK puntato su OpenAI.
 * Lancia subito un errore catchable se OPENAI_API_KEY non è impostata — così il
 * chiamante può rilevare la mancanza di configurazione senza errori visibili
 * all'utente.
 */
export function getOpenAiRouteModel(model: string = OPENAI_ROUTE_MODEL): LanguageModel {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI non configurato: variabile OPENAI_API_KEY mancante.");
  }
  const provider = createOpenAI({ apiKey: OPENAI_API_KEY });
  return provider(model);
}
