/**
 * Ollama Client — BikerLink (Task #2847)
 *
 * Wrappa le chiamate al server Ollama self-hosted, esposto via tunnel/Nginx
 * (stesso pattern di GraphHopper: URL + token in header custom).
 *
 * Variabili d'ambiente:
 *   BOWIE_OLLAMA_URL    — URL base del server Ollama (es: https://bikerlink.tail5056aa.ts.net/ollama)
 *                   Se non impostata, le funzioni lanciano un errore catchable e il
 *                   chiamante ricade sul provider cloud (Gemini/OpenAI).
 *   BOWIE_OLLAMA_TOKEN  — Token per il server self-hosted (header Authorization: Bearer).
 *   BOWIE_OLLAMA_MODEL  — Modello locale da usare.
 *                   Default: "mistral-nemo:latest" (il modello custom "bikerlink",
 *                   basato su mistral-nemo:latest, è il valore consigliato via secret).
 *
 *   HORUS_OLLAMA_URL / HORUS_OLLAMA_TOKEN — opzionali. Horus gira sulla STESSA
 *                   infra di Bowie (stesso container Ollama sul ThinkCentre): se
 *                   non impostate, ricadono su BOWIE_OLLAMA_URL/TOKEN. Esistono come
 *                   secret separati solo per dare a Horus diagnostica indipendente
 *                   (admin panel, probe) — non per puntare a un server diverso.
 *
 * L'integrazione usa il Vercel AI SDK (package `ollama-ai-provider-v2`,
 * compatibile con `ai` v6 + `zod` v4) così da poter usare lo stesso modello
 * sia con `generateObject`/`streamText` (parsing percorsi) sia con
 * `callOllamaChat` (traduzioni i18n).
 *
 * Task #3017 — JSON repair layer: prima di propagare un errore di parse,
 * `callOllamaChat` tenta un repair del JSON malformato (trailing comma, blocchi
 * ```json```, chiavi non quotate) e logga ogni repair come 'json_repaired' in ai_call_logs.
 */

import { createOllama } from "ollama-ai-provider-v2";
import { generateObject, generateText, type LanguageModel } from "ai";
import type { z } from "zod";
import { repairJson } from "./json-repair";
import { isThinkCentreOffline } from "./thinkcentre-offline";
import { logAiCall } from "./ai-logger";
import { cfAccessHeaders } from "./cf-access";

const BOWIE_OLLAMA_URL = process.env.BOWIE_OLLAMA_URL?.trim().replace(/\/$/, "");
const BOWIE_OLLAMA_TOKEN = process.env.BOWIE_OLLAMA_TOKEN ?? "";
// Horus: stessa infra di Bowie. HORUS_OLLAMA_URL/TOKEN sono secret separati solo
// per diagnostica indipendente (vedi commento file-level) — se assenti, fallback su Bowie.
const HORUS_OLLAMA_URL = process.env.HORUS_OLLAMA_URL?.trim().replace(/\/$/, "") || BOWIE_OLLAMA_URL;
const HORUS_OLLAMA_TOKEN = process.env.HORUS_OLLAMA_TOKEN ?? BOWIE_OLLAMA_TOKEN;

export type OllamaPersona = "bowie" | "horus";

function endpointFor(persona: OllamaPersona): { url?: string; token: string } {
  return persona === "horus"
    ? { url: HORUS_OLLAMA_URL, token: HORUS_OLLAMA_TOKEN }
    : { url: BOWIE_OLLAMA_URL, token: BOWIE_OLLAMA_TOKEN };
}

/**
 * Header per le richieste verso il server Ollama self-hosted.
 * Combina il token custom (Authorization: Bearer) con il Service Token
 * Cloudflare Access (vedi cf-access.ts), così l'edge CF valida la richiesta
 * prima dell'origine. L'URL self-hosted è SEMPRE self-hosted (nessun fallback cloud),
 * quindi gli header CF Access sono sempre appropriati qui.
 *
 * Nota: NON impostiamo un header Host — il requisito di Ollama 0.24+
 * (Host == localhost) è gestito da nginx sull'origine (proxy_set_header Host
 * "localhost"), quindi resta intatto.
 */
function ollamaHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  Object.assign(h, cfAccessHeaders());
  return h;
}
// Task #3017: il modello default è "bikerlink" (Modelfile custom). Se BOWIE_OLLAMA_MODEL
// non è impostato, il setup script lo setta a "bikerlink" dopo la creazione.
const BOWIE_OLLAMA_MODEL = process.env.BOWIE_OLLAMA_MODEL ?? "mistral-nemo:latest";

/** true quando BOWIE_OLLAMA_URL è impostato (Ollama abilitato come provider primario). */
export const isOllamaConfigured = Boolean(BOWIE_OLLAMA_URL);

/** Config diagnostica (URL + token configurato sì/no) per una persona — admin panel. */
export function getOllamaDiagnostics(persona: OllamaPersona): { url?: string; tokenConfigured: boolean } {
  const { url, token } = endpointFor(persona);
  return { url, tokenConfigured: Boolean(token) };
}

// ─── Circuit breaker — probe con cache 60s (per persona) ──────────────────────

const PROBE_TIMEOUT_MS = 2500;
const PROBE_CACHE_TTL_MS = 60_000;

const _probeResult: Record<OllamaPersona, boolean | null> = { bowie: null, horus: null };
const _probeTs: Record<OllamaPersona, number> = { bowie: 0, horus: 0 };

/**
 * Verifica se il server Ollama è raggiungibile con un probe leggero (timeout 2.5s).
 * Il risultato è messo in cache per 60 secondi per non aggiungere latenza ad ogni
 * chiamata AI. Se il probe fallisce con ECONNREFUSED o timeout, ritorna false
 * immediatamente così il chiamante salta Ollama senza aspettare AI_TIMEOUT_MS.
 */
export async function isOllamaReachable(persona: OllamaPersona = "bowie"): Promise<boolean> {
  const { url, token } = endpointFor(persona);
  if (!url) return false;

  // ThinkCentre offline (spento O in manutenzione): salta subito Ollama senza
  // probe di rete — il chiamante ricade istantaneamente sul provider cloud.
  if (await isThinkCentreOffline()) return false;

  const now = Date.now();
  if (_probeResult[persona] !== null && now - _probeTs[persona] < PROBE_CACHE_TTL_MS) {
    return _probeResult[persona] as boolean;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const headers = ollamaHeaders(token);
    // /api/tags è l'endpoint standard Ollama che restituisce la lista dei modelli:
    // più stabile e affidabile di HEAD / (che su Ollama 0.24+ può tornare 403
    // se il Host header non è localhost — problema già fixato in nginx, ma il probe
    // dal backend usa l'URL diretto, quindi /api/tags è più robusto).
    const res = await fetch(`${url}/api/tags`, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timer);
    _probeResult[persona] = res.ok || res.status < 500;
    _probeTs[persona] = Date.now();
    return _probeResult[persona] as boolean;
  } catch {
    _probeResult[persona] = false;
    _probeTs[persona] = Date.now();
    return false;
  }
}

/** Invalida la cache del probe (es. dopo un cambio di configurazione). */
export function resetOllamaProbeCache(): void {
  _probeResult.bowie = null;
  _probeResult.horus = null;
  _probeTs.bowie = 0;
  _probeTs.horus = 0;
}

/**
 * Restituisce un LanguageModel del Vercel AI SDK puntato sul server Ollama.
 * Lancia subito un errore catchable se l'URL self-hosted non è impostato — così il
 * chiamante può ricadere sul provider cloud senza errori visibili all'utente.
 */
export function getOllamaModel(model: string = BOWIE_OLLAMA_MODEL, persona: OllamaPersona = "bowie"): LanguageModel {
  const { url, token } = endpointFor(persona);
  if (!url) {
    throw new Error(`Ollama non configurato: variabile ${persona === "horus" ? "HORUS" : "BOWIE"}_OLLAMA_URL mancante.`);
  }
  const headers = ollamaHeaders(token);
  const provider = createOllama({
    baseURL: `${url}/api`,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
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
  /** Persona la cui config (URL/token) usare — default "bowie". */
  persona?: OllamaPersona;
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
  const { system, temperature = 0.2, abortSignal, maxRetries = 2, jsonRetries = 1, onRepair, persona = "bowie" } = options;

  // ThinkCentre offline (spento O in manutenzione): non tentare nemmeno la
  // chiamata — lancia subito così il chiamante scala al provider cloud senza
  // attendere il timeout di rete del server locale.
  if (await isThinkCentreOffline()) {
    throw new Error("Ollama non disponibile: ThinkCentre offline (spento o in manutenzione).");
  }
  const model = getOllamaModel(undefined, persona);

  if (!schema) {
    const { text } = await generateText({ model, system, prompt, temperature, maxRetries, abortSignal });
    return text as unknown as T;
  }

  let lastErr: unknown;
  const callStart = Date.now();
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
            // Scrivi il repair in ai_call_logs — fire-and-forget, non blocca il ritorno.
            logAiCall({
              provider: "ollama",
              modelId: BOWIE_OLLAMA_MODEL,
              tokensIn: 0,
              tokensOut: 0,
              latencyMs: Date.now() - callStart,
              costUsd: 0,
              error: "json_repaired",
            });
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
