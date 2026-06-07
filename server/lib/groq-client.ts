/**
 * Groq Client — BikerLink (Task #2930)
 *
 * Groq è un provider AI **cloud** (api.groq.com): NON è self-hostable sul
 * ThinkCentre perché gira solo sull'hardware LPU proprietario nei loro
 * datacenter. Entra quindi nella catena come fallback cloud veloce, tra
 * Ollama (primario, locale) e Gemini (fallback cloud finale):
 *
 *   Ollama (locale) → Groq (cloud veloce) → Gemini (cloud finale)
 *
 * Variabili d'ambiente:
 *   GROQ_API_KEY  — Chiave API Groq (https://console.groq.com/keys). Se non
 *                   impostata, `isGroqConfigured` è false e il flusso salta
 *                   Groq ricadendo direttamente su Gemini.
 *   GROQ_MODEL    — Modello Groq da usare (default "llama-3.3-70b-versatile",
 *                   lo stesso usato dal modulo di moderazione).
 *
 * L'integrazione usa il Vercel AI SDK (package `@ai-sdk/groq`, compatibile con
 * `ai` v6 + `zod` v4) così da poter usare lo stesso modello sia con
 * `generateObject` (parsing percorsi) sia con `streamText` (streaming testuale).
 */

import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

/**
 * Modello Groq dedicato al parsing strutturato (generateObject / json_schema).
 * Deve essere un modello che supporta structured outputs — NON tutti lo fanno
 * (es. openai/gpt-oss-20b non lo supporta). Se GROQ_PARSE_MODEL non è impostato,
 * usa llama-3.3-70b-versatile che supporta json_schema nativamente.
 */
const GROQ_PARSE_MODEL = process.env.GROQ_PARSE_MODEL ?? "llama-3.3-70b-versatile";

/** true quando GROQ_API_KEY è impostata (Groq abilitato come fallback cloud). */
export const isGroqConfigured = Boolean(GROQ_API_KEY);

/**
 * Restituisce un LanguageModel del Vercel AI SDK puntato su Groq.
 * Lancia subito un errore catchable se GROQ_API_KEY non è impostata — così il
 * chiamante può ricadere sul fallback successivo (Gemini) senza errori visibili
 * all'utente.
 */
export function getGroqModel(model: string = GROQ_MODEL): LanguageModel {
  if (!GROQ_API_KEY) {
    throw new Error("Groq non configurato: variabile GROQ_API_KEY mancante.");
  }
  const provider = createGroq({ apiKey: GROQ_API_KEY });
  return provider(model);
}

/**
 * Modello Groq per parsing strutturato (generateObject / json_schema).
 * Usa sempre GROQ_PARSE_MODEL (default llama-3.3-70b-versatile) che supporta
 * structured outputs, indipendentemente da GROQ_MODEL che può puntare a modelli
 * non compatibili (es. openai/gpt-oss-20b che non supporta json_schema).
 */
export function getGroqParseModel(): LanguageModel {
  if (!GROQ_API_KEY) {
    throw new Error("Groq non configurato: variabile GROQ_API_KEY mancante.");
  }
  const provider = createGroq({ apiKey: GROQ_API_KEY });
  return provider(GROQ_PARSE_MODEL);
}
