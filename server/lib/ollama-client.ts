/**
 * Ollama Client — BikerLink (Task #2847)
 *
 * Wrappa le chiamate al server Ollama self-hosted, esposto via tunnel/Nginx
 * (stesso pattern di GraphHopper: URL + token in header custom).
 *
 * Variabili d'ambiente:
 *   OLLAMA_URL    — URL base del server Ollama (es: https://bikerlink.tail5056aa.ts.net/ollama)
 *                   Se non impostata, le funzioni lanciano un errore catchable e il
 *                   chiamante ricade sul provider cloud (Gemini/OpenAI).
 *   OLLAMA_TOKEN  — Token per il server self-hosted (header X-Ollama-Token).
 *   OLLAMA_MODEL  — Modello locale da usare (default "llama3.2:latest").
 *
 * L'integrazione usa il Vercel AI SDK (package `ollama-ai-provider-v2`,
 * compatibile con `ai` v6 + `zod` v4) così da poter usare lo stesso modello
 * sia con `generateObject`/`streamText` (parsing percorsi) sia con
 * `callOllamaChat` (traduzioni i18n).
 */

import { createOllama } from "ollama-ai-provider-v2";
import { generateObject, generateText, type LanguageModel } from "ai";
import type { z } from "zod";

const OLLAMA_URL = process.env.OLLAMA_URL?.replace(/\/$/, "");
const OLLAMA_TOKEN = process.env.OLLAMA_TOKEN ?? "";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:latest";

/** true quando OLLAMA_URL è impostato (Ollama abilitato come provider primario). */
export const isOllamaConfigured = Boolean(OLLAMA_URL);

/**
 * Restituisce un LanguageModel del Vercel AI SDK puntato sul server Ollama.
 * Lancia subito un errore catchable se OLLAMA_URL non è impostato — così il
 * chiamante può ricadere sul provider cloud senza errori visibili all'utente.
 */
export function getOllamaModel(model: string = OLLAMA_MODEL): LanguageModel {
  if (!OLLAMA_URL) {
    throw new Error("Ollama non configurato: variabile OLLAMA_URL mancante.");
  }
  const provider = createOllama({
    baseURL: `${OLLAMA_URL}/api`,
    headers: OLLAMA_TOKEN ? { "X-Ollama-Token": OLLAMA_TOKEN } : undefined,
  });
  return provider(model);
}

export interface OllamaChatOptions {
  system?: string;
  temperature?: number;
  abortSignal?: AbortSignal;
  /** Tentativi extra del Vercel AI SDK su errori transitori (default 2). */
  maxRetries?: number;
  /** Retry manuali aggiuntivi quando il modello locale rompe il JSON (default 1). */
  jsonRetries?: number;
}

/**
 * Chiama il modello Ollama locale.
 *
 * - Se `schema` è fornito, usa `generateObject` e restituisce l'oggetto validato
 *   contro lo schema zod. I modelli 7-8B a volte rompono il JSON: oltre ai retry
 *   nativi del SDK, viene eseguito un retry manuale (`jsonRetries`) prima di
 *   propagare l'errore al chiamante (che ricadrà sul provider cloud).
 * - Senza `schema`, usa `generateText` e restituisce la stringa generata.
 *
 * Lancia un errore catchable se Ollama non è raggiungibile o la risposta non è
 * valida: il chiamante è responsabile del fallback verso il provider cloud.
 */
export async function callOllamaChat<T = string>(
  prompt: string,
  schema?: z.ZodType<T>,
  options: OllamaChatOptions = {},
): Promise<T> {
  const { system, temperature = 0.2, abortSignal, maxRetries = 2, jsonRetries = 1 } = options;
  const model = getOllamaModel();

  if (!schema) {
    const { text } = await generateText({ model, system, prompt, temperature, maxRetries, abortSignal });
    return text as unknown as T;
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= jsonRetries; attempt++) {
    try {
      const { object } = await generateObject({ model, schema, system, prompt, temperature, maxRetries, abortSignal });
      return object;
    } catch (err) {
      lastErr = err;
      if (attempt < jsonRetries) {
        console.warn(`[Ollama] risposta non valida (tentativo ${attempt + 1}/${jsonRetries + 1}), riprovo:`, (err as Error)?.message ?? err);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
