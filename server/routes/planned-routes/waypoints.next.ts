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

import { z } from "zod";
import { generateObject, streamText } from "ai";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getOllamaModel, getOllamaModelId, isOllamaConfigured, isOllamaReachable } from "../../lib/ollama-client";
import { getGroqModel, getGroqParseModel, isGroqConfigured } from "../../lib/groq-client";
import { getOpenAiRouteModel, isOpenAiRouteConfigured } from "../../lib/openai-route-client";
import { getEffectiveRouteChain } from "../../ai/route-provider-config";
import { incrementProviderStat } from "../../ai/route-provider-stats";

// Groq llama-3.x models do not support json_schema structured outputs in AI SDK v6
// (the `mode` parameter was removed). Detect at startup so the check is free at request time.
// Default is openai/gpt-oss-20b (strict-capable) so _GROQ_PARSE_NEEDS_JSON_MODE is false
// unless GROQ_PARSE_MODEL is explicitly overridden to a llama model.
const _GROQ_PARSE_MODEL_ID = process.env.GROQ_PARSE_MODEL ?? "openai/gpt-oss-20b";
const _GROQ_PARSE_NEEDS_JSON_MODE = /^(llama-3\.|meta-llama\/llama-3)/.test(_GROQ_PARSE_MODEL_ID);

/**
 * generateObject wrapper for the Groq parse model that is tolerant of llama-3.x
 * models. If the configured GROQ_PARSE_MODEL is a llama model it uses
 * output:"no-schema" + manual Zod parse (same strategy as generateStructured in
 * provider.ts). For strict-capable models (e.g. openai/gpt-oss-20b) it falls
 * through to a normal schema-passing generateObject call.
 */
async function groqGenerateObject<T>(params: {
  schema: z.ZodType<T>;
  prompt: string;
  temperature: number;
  maxRetries: number;
  abortSignal?: AbortSignal;
}): Promise<{ object: T }> {
  const model = getGroqParseModel();
  if (_GROQ_PARSE_NEEDS_JSON_MODE) {
    let shape = "";
    try {
      shape = JSON.stringify(z.toJSONSchema(params.schema as unknown as z.ZodType));
    } catch { /* schema non serializzabile: prompt JSON generico */ }
    const noSchemaPrompt = shape
      ? `${params.prompt}\n\nRispondi ESCLUSIVAMENTE con un oggetto JSON valido e conforme a questo JSON Schema (nessun testo, markdown o commento extra):\n${shape}`
      : `${params.prompt}\n\nRispondi ESCLUSIVAMENTE con un oggetto JSON valido (nessun testo, markdown o commento extra).`;
    const res = await generateObject({
      model, output: "no-schema", prompt: noSchemaPrompt,
      temperature: params.temperature, maxRetries: params.maxRetries, abortSignal: params.abortSignal,
    });
    const object = params.schema.parse(res.object);
    return { object };
  }
  // check-ai-direct-generateobject: safe — only reached when _GROQ_PARSE_NEEDS_JSON_MODE=false (non-llama model)
  const { object } = await generateObject({
    model, schema: params.schema, prompt: params.prompt,
    temperature: params.temperature, maxRetries: params.maxRetries, abortSignal: params.abortSignal,
  });
  return { object };
}

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
  "Nessun provider AI disponibile al momento, riprova tra qualche minuto.";

/**
 * Rimuove i blocchi di ragionamento `<think>…</think>` e i tag `</think>` orfani
 * che qwen3:4b (Horus) può emettere anche con `think:false` su Ollama.
 * Stessa logica di stripThink in server/ai/assistant/inter-agent.ts.
 */
function stripThink(text: string): string {
  let out = (text ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const closeTag = "</think>";
  const closeIdx = out.toLowerCase().indexOf(closeTag);
  if (closeIdx !== -1) {
    out = out.slice(closeIdx + closeTag.length).trim();
  }
  return out;
}

/**
 * Restituisce true se l'errore è un 429 rate-limit (qualsiasi provider).
 * In questo caso il chiamante deve saltare IMMEDIATAMENTE al provider successivo
 * senza retry sul provider corrente (maxRetries spreca tempo su un provider esaurito).
 */
function isRateLimitError(err: unknown): boolean {
  const e = err as { status?: number; statusCode?: number; code?: number; message?: string };
  const status = e?.status ?? e?.statusCode ?? e?.code;
  if (status === 429) return true;
  const msg = (e?.message ?? "").toLowerCase();
  return msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource_exhausted");
}

function geminiModel(apiKey: string) {
  return createGoogleGenerativeAI({ apiKey })("gemini-2.0-flash");
}

/**
 * /ai-parse — genera l'oggetto route strutturato.
 * Catena di provider configurabile a runtime dall'admin (env ROUTE_AI_PROVIDERS o
 * DB ai_route_provider_chain). Ordine default: Ollama → Groq → Gemini.
 * Se un provider fallisce, passa al successivo nella chain senza errori visibili.
 * Restituisce anche il provider vincitore come `provider_used`.
 */
export async function generateRouteObject<T>(opts: RouteAiOptions<T>): Promise<{ result: T; provider_used: string }> {
  const { prompt, apiKey, system, schema, abortSignal, temperature = 0.1 } = opts;
  const fullPrompt = `${system}\n\nRichiesta: ${prompt}`;

  const chain = await getEffectiveRouteChain();
  let lastErr: unknown = null;

  for (let i = 0; i < chain.length; i++) {
    const providerId = chain[i];
    const isLast = i === chain.length - 1;

    if (providerId === "ollama") {
      if (!isOllamaConfigured) continue;
      if (!(await isOllamaReachable("horus"))) {
        console.info("[AI parse] Ollama probe fallito (offline/irraggiungibile), skip a provider successivo.");
        continue;
      }
      try {
        const horusModelId = getOllamaModelId("horus");
        console.info(`[AI parse] Ollama → persona=horus model=${horusModelId}`);
        // check-ai-direct-generateobject: safe — Ollama supports json_schema natively
        const { object } = await generateObject({
          model: getOllamaModel(horusModelId, "horus"), schema, prompt: fullPrompt,
          maxRetries: 0, temperature, abortSignal,
          providerOptions: { ollama: { think: false } },
        });
        incrementProviderStat("ollama");
        return { result: object, provider_used: "ollama" };
      } catch (err) {
        lastErr = err;
        if (isLast) throw err;
        const rateLimited = isRateLimitError(err);
        console.warn(`[AI parse] Ollama ${rateLimited ? "429 rate-limit, skip immediato" : "non disponibile/risposta non valida, fallback provider successivo"}:`, (err as Error)?.message ?? err);
      }
    } else if (providerId === "groq") {
      if (!isGroqConfigured) continue;
      try {
        const { object } = await groqGenerateObject({ schema, prompt: fullPrompt, maxRetries: 0, temperature, abortSignal });
        incrementProviderStat("groq");
        return { result: object, provider_used: "groq" };
      } catch (err) {
        lastErr = err;
        if (isLast) throw err;
        const rateLimited = isRateLimitError(err);
        console.warn(`[AI parse] Groq ${rateLimited ? "429 rate-limit, skip immediato" : "non disponibile/risposta non valida, fallback provider successivo"}:`, (err as Error)?.message ?? err);
      }
    } else if (providerId === "gemini") {
      if (!apiKey) continue;
      try {
        // check-ai-direct-generateobject: safe — Gemini supports json_schema natively
        const { object } = await generateObject({
          model: geminiModel(apiKey), schema, prompt: fullPrompt,
          maxRetries: 0, temperature, abortSignal,
        });
        incrementProviderStat("gemini");
        return { result: object, provider_used: "gemini" };
      } catch (err) {
        lastErr = err;
        if (isLast) throw err;
        const rateLimited = isRateLimitError(err);
        console.warn(`[AI parse] Gemini ${rateLimited ? "429 rate-limit, skip immediato" : "non disponibile/risposta non valida"}:`, (err as Error)?.message ?? err);
      }
    } else if (providerId === "openai") {
      if (!isOpenAiRouteConfigured) continue;
      try {
        // check-ai-direct-generateobject: safe — OpenAI supports json_schema natively
        const { object } = await generateObject({
          model: getOpenAiRouteModel(), schema, prompt: fullPrompt,
          maxRetries: 0, temperature, abortSignal,
        });
        incrementProviderStat("openai");
        return { result: object, provider_used: "openai" };
      } catch (err) {
        lastErr = err;
        if (isLast) throw err;
        const rateLimited = isRateLimitError(err);
        console.warn(`[AI parse] OpenAI ${rateLimited ? "429 rate-limit, skip immediato" : "non disponibile/risposta non valida"}:`, (err as Error)?.message ?? err);
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
  /**
   * Callback invocata non appena il provider vincitore è stato selezionato
   * (dopo bufferizzazione + validazione, prima di emettere i chunk).
   * Utile per tracciare quale provider ha effettivamente risposto.
   */
  onProviderSelected?: (provider: string) => void;
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
  // Rimuove i tag <think>…</think> e i </think> orfani che Horus (qwen3:4b) può
  // emettere anche con think:false — il testo pulito viene passato a validate e
  // restituito come unico chunk (il client riceve solo la risposta finale, mai il
  // ragionamento intermedio).
  const rawText = buffered.join("");
  const fullText = stripThink(rawText);
  const isValid = validate ? validate(fullText) : fullText.trim().length > 0;
  return isValid ? [fullText] : null;
}

export async function* streamRouteText(opts: StreamRouteOptions): AsyncGenerator<string> {
  const { prompt, apiKey, system, abortSignal, temperature = 0.1, validate, onProviderSelected } = opts;
  const fullPrompt = `${system}\n\nRichiesta: ${prompt}`;

  const chain = await getEffectiveRouteChain();

  // maxRetries: 0 su ogni chiamata — il chain loop esterno gestisce il fallback.
  // Questo garantisce skip immediato su 429 senza sprecare retry sullo stesso provider esaurito.
  const streamOpts = { maxRetries: 0, temperature, abortSignal, validate };

  for (let i = 0; i < chain.length; i++) {
    const providerId = chain[i];
    const isLast = i === chain.length - 1;

    if (providerId === "ollama") {
      if (!isOllamaConfigured) continue;
      if (!(await isOllamaReachable("horus"))) {
        console.info("[AI stream] Ollama probe fallito (offline/irraggiungibile), skip a provider successivo.");
        continue;
      }
      try {
        const horusModelId = getOllamaModelId("horus");
        console.info(`[AI stream] Ollama → persona=horus model=${horusModelId}`);
        const buffered = await bufferAndValidateStream(getOllamaModel(horusModelId, "horus"), fullPrompt, streamOpts);
        if (buffered) {
          incrementProviderStat("ollama");
          onProviderSelected?.("ollama");
          for (const chunk of buffered) yield chunk;
          return;
        }
        if (isLast) {
          throw new Error("Ollama ha prodotto una risposta non valida e nessun provider successivo è disponibile.");
        }
        console.warn("[AI stream] Ollama output non valido, fallback provider successivo.");
      } catch (err) {
        if (isLast) throw err;
        const rateLimited = isRateLimitError(err);
        console.warn(`[AI stream] Ollama ${rateLimited ? "429 rate-limit, skip immediato" : "non disponibile/risposta non valida, fallback"}:`, (err as Error)?.message ?? err);
      }
    } else if (providerId === "groq") {
      if (!isGroqConfigured) continue;
      try {
        const buffered = await bufferAndValidateStream(getGroqModel(), fullPrompt, streamOpts);
        if (buffered) {
          incrementProviderStat("groq");
          onProviderSelected?.("groq");
          for (const chunk of buffered) yield chunk;
          return;
        }
        if (isLast) {
          throw new Error("Groq ha prodotto una risposta non valida e nessun provider successivo è disponibile.");
        }
        console.warn("[AI stream] Groq output non valido, fallback provider successivo.");
      } catch (err) {
        if (isLast) throw err;
        const rateLimited = isRateLimitError(err);
        console.warn(`[AI stream] Groq ${rateLimited ? "429 rate-limit, skip immediato" : "non disponibile/risposta non valida, fallback"}:`, (err as Error)?.message ?? err);
      }
    } else if (providerId === "gemini") {
      if (!apiKey) continue;
      try {
        const geminiBuffer = await bufferAndValidateStream(geminiModel(apiKey), fullPrompt, streamOpts);
        if (!geminiBuffer) {
          if (isLast) {
            throw new Error("Gemini ha prodotto una risposta non valida: nessun provider disponibile ha restituito output utilizzabile.");
          }
          console.warn("[AI stream] Gemini output non valido, fallback provider successivo.");
          continue;
        }
        incrementProviderStat("gemini");
        onProviderSelected?.("gemini");
        for (const chunk of geminiBuffer) yield chunk;
        return;
      } catch (err) {
        if (isLast) throw err;
        const rateLimited = isRateLimitError(err);
        console.warn(`[AI stream] Gemini ${rateLimited ? "429 rate-limit, skip immediato" : "non disponibile/risposta non valida"}:`, (err as Error)?.message ?? err);
      }
    } else if (providerId === "openai") {
      if (!isOpenAiRouteConfigured) continue;
      try {
        const openaiBuffer = await bufferAndValidateStream(getOpenAiRouteModel(), fullPrompt, streamOpts);
        if (!openaiBuffer) {
          if (isLast) {
            throw new Error("OpenAI ha prodotto una risposta non valida: nessun provider disponibile ha restituito output utilizzabile.");
          }
          console.warn("[AI stream] OpenAI output non valido, fallback provider successivo.");
          continue;
        }
        incrementProviderStat("openai");
        onProviderSelected?.("openai");
        for (const chunk of openaiBuffer) yield chunk;
        return;
      } catch (err) {
        if (isLast) throw err;
        const rateLimited = isRateLimitError(err);
        console.warn(`[AI stream] OpenAI ${rateLimited ? "429 rate-limit, skip immediato" : "non disponibile/risposta non valida"}:`, (err as Error)?.message ?? err);
      }
    }
  }

  throw new Error(NO_PROVIDER_MSG);
}

export * from "./waypoints.next.part2";
