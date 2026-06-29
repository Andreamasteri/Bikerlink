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
 *   OLLAMA_TOKEN  — Token per il server self-hosted (header Authorization: Bearer).
 *   OLLAMA_MODEL  — Modello locale da usare.
 *                   Default: "mistral-nemo:latest" (il modello custom "bikerlink",
 *                   basato su mistral-nemo:latest, è il valore consigliato via secret).
 *
 * L'integrazione usa il Vercel AI SDK (package `ollama-ai-provider-v2`,
 * compatibile con `ai` v6 + `zod` v4) così da poter usare lo stesso modello
 * sia con `generateObject`/`streamText` (parsing percorsi) sia con
 * `callOllamaChat` (traduzioni i18n).
 *
 * Task #3017 — JSON repair layer: prima di propagare un errore di parse,
 * `callOllamaChat` tenta un repair del JSON malformato (trailing comma, blocchi
 * ```json```, chiavi non quotate) e logga ogni repair come 'repaired' in ai_call_logs.
 */

import { createOllama } from "ollama-ai-provider-v2";
import { generateObject, generateText, type LanguageModel } from "ai";
import type { z } from "zod";
import { repairJson } from "./json-repair";
import { isThinkCentreOffline } from "./thinkcentre-offline";

const OLLAMA_URL = process.env.OLLAMA_URL?.replace(/\/$/, "");
const OLLAMA_TOKEN = process.env.OLLAMA_TOKEN ?? "";
// Task #3017: il modello default è "bikerlink" (Modelfile custom). Se OLLAMA_MODEL
// non è impostato, il setup script lo setta a "bikerlink" dopo la creazione.
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "mistral-nemo:latest";

/** true quando OLLAMA_URL è impostato (Ollama abilitato come provider primario). */
export const isOllamaConfigured = Boolean(OLLAMA_URL);

// ─── Circuit breaker — probe con cache 60s ────────────────────────────────────

const PROBE_TIMEOUT_MS = 2500;
const PROBE_CACHE_TTL_MS = 60_000;

let _probeResult: boolean | null = null;
let _probeTs = 0;

/**
 * Verifica se il server Ollama è raggiungibile con un probe leggero (timeout 2.5s).
 * Il risultato è messo in cache per 60 secondi per non aggiungere latenza ad ogni
 * chiamata AI. Se il probe fallisce con ECONNREFUSED o timeout, ritorna false
 * immediatamente così il chiamante salta Ollama senza aspettare AI_TIMEOUT_MS.
 */
export async function isOllamaReachable(): Promise<boolean> {
  if (!OLLAMA_URL) return false;

  // ThinkCentre offline (spento O in manutenzione): salta subito Ollama senza
  // probe di rete — il chiamante ricade istantaneamente sul provider cloud.
  if (await isThinkCentreOffline()) return false;

  const now = Date.now();
  if (_probeResult !== null && now - _probeTs < PROBE_CACHE_TTL_MS) {
    return _probeResult;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const headers: Record<string, string> = OLLAMA_TOKEN
      ? { "Authorization": `Bearer ${OLLAMA_TOKEN}` }
      : {};
    // /api/tags è l'endpoint standard Ollama che restituisce la lista dei modelli:
    // più stabile e affidabile di HEAD / (che su Ollama 0.24+ può tornare 403
    // se il Host header non è localhost — problema già fixato in nginx, ma il probe
    // dal backend usa l'URL OLLAMA_URL diretto, quindi /api/tags è più robusto).
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timer);
    _probeResult = res.ok || res.status < 500;
    _probeTs = Date.now();
    return _probeResult;
  } catch {
    _probeResult = false;
    _probeTs = Date.now();
    return false;
  }
}

/** Invalida la cache del probe (es. dopo un cambio di configurazione). */
export function resetOllamaProbeCache(): void {
  _probeResult = null;
  _probeTs = 0;
}

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
    headers: OLLAMA_TOKEN ? { "Authorization": `Bearer ${OLLAMA_TOKEN}` } : undefined,
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
  /** Callback opzionale invocato quando il JSON repair ha successo (per logging). */
  onRepair?: (attempt: number) => void;
}

/**
 * Chiama il modello Ollama locale.
 *
 * - Se `schema` è fornito, usa `generateObject` e restituisce l'oggetto validato
 *   contro lo schema zod. I modelli 7-8B a volte rompono il JSON: oltre ai retry
 *   nativi del SDK, viene eseguito un repair (Task #3017) + retry manuale
 *   (`jsonRetries`) prima di propagare l'errore al chiamante (che ricadrà sul
 *   provider cloud).
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
  const { system, temperature = 0.2, abortSignal, maxRetries = 2, jsonRetries = 1, onRepair } = options;

  // ThinkCentre offline (spento O in manutenzione): non tentare nemmeno la
  // chiamata — lancia subito così il chiamante scala al provider cloud senza
  // attendere il timeout di rete del server locale.
  if (await isThinkCentreOffline()) {
    throw new Error("Ollama non disponibile: ThinkCentre offline (spento o in manutenzione).");
  }
  const model = getOllamaModel();

  if (!schema) {
    const { text } = await generateText({ model, system, prompt, temperature, maxRetries, abortSignal });
    return text as unknown as T;
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= jsonRetries; attempt++) {
    try {
      // check-ai-direct-generateobject: safe — Ollama supports json_schema natively
      const { object } = await generateObject({ model, schema, system, prompt, temperature, maxRetries, abortSignal });
      return object;
    } catch (err) {
      lastErr = err;

      // Task #3017 — JSON repair: tenta di estrarre il raw text dall'errore e ripararlo.
      // Alcune versioni del SDK espongono il testo grezzo nel campo `text` o `cause`.
      const rawText = extractRawTextFromError(err);
      if (rawText) {
        const repaired = repairJson(rawText);
        if (repaired.ok) {
          const validated = schema.safeParse(repaired.value);
          if (validated.success) {
            console.warn(`[Ollama] JSON repair riuscito (tentativo ${attempt + 1})`);
            onRepair?.(attempt + 1);
            return validated.data;
          }
        }
      }

      if (attempt < jsonRetries) {
        console.warn(`[Ollama] risposta non valida (tentativo ${attempt + 1}/${jsonRetries + 1}), riprovo:`, (err as Error)?.message ?? err);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Estrae il testo grezzo dall'errore di parsing del SDK AI (heuristic). */
function extractRawTextFromError(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  // Vercel AI SDK espone il testo nel campo `text` o nella cause
  const e = err as Error & { text?: string; cause?: { text?: string } };
  if (typeof e.text === "string" && e.text.length > 0) return e.text;
  if (typeof e.cause?.text === "string" && e.cause.text.length > 0) return e.cause.text;
  // Ultimo tentativo: cerca nel messaggio d'errore un JSON tra backtick
  const m = err.message.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (m) return m[1];
  return null;
}
