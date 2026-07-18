// Task #2532 — Provider abstraction con fallback chain Groq → Gemini → OpenAI.
// Tutti i consumer AI moderazione passano da qui. Restituisce un model handle
// pronto per generateObject/streamText con metadata cost tracking.
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { generateObject } from "ai";
import { z } from "zod";
import { limiters } from "../../lib/throttle";
import { storage } from "../../storage";
import { getOllamaModel, isOllamaConfigured } from "../../lib/ollama-client";
import { AGENT_MODEL_DEFAULTS } from "../../lib/agent-constants";
import { isThinkCentreOffline } from "../../lib/thinkcentre-offline";
import { isAiFallbackEnabled, isAiFallbackEnabledSync } from "../fallback-switch";
import type { AiProviderHealth, AiProviderId } from "./types";
import {
  isGroqTpdExceededSync,
  recordGroqTokens,
  loadGroqTpdFromDb,
  getGroqTpdStatus,
} from "../groq-quota";

export type ModelRole = "brain" | "router";

interface ResolvedModel {
  // "ollama" è la rete finale self-hosted: non è un AiProviderId perché vive
  // fuori dai cooldown/cap dei provider cloud (illimitato, locale).
  id: AiProviderId | "ollama";
  providerName: string;
  modelId: string;
  model: LanguageModelV2;
  scheduler: <T>(fn: () => Promise<T>) => Promise<T>;
  // Presente solo per modelli che NON supportano structured outputs json_schema
  // (es. Llama 3.x su Groq). In AI SDK v6 il parametro `mode` è stato rimosso:
  // per questi modelli si usa generateStructured() che instrada su output:"no-schema"
  // (JSON-object mode) + validazione Zod manuale. Vedi generateStructured().
  objectMode?: "json";
}

// Prezzi $ per 1k token (Maggio 2026, vedi _ai-stack-decision.md). Aggiornati a mano.
const PRICING: Record<string, { in: number; out: number }> = {
  "gpt-5.1": { in: 0.0025, out: 0.01 },
  "gemini-2.5-pro": { in: 0.00125, out: 0.005 },
  "gemini-2.5-flash": { in: 0.0003, out: 0.0025 },
  "gemini-2.5-flash-lite": { in: 0.0001, out: 0.0004 },
  // Task #2698 — modello leggero per AI Assistant utente
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
  // Groq free tier: costo zero (limitato da RPM/RPD, vedi DAILY_CAPS).
  "llama-3.3-70b-versatile": { in: 0, out: 0 },
  "llama-3.1-8b-instant": { in: 0, out: 0 },
  "meta-llama/llama-4-scout-17b-16e-instruct": { in: 0, out: 0 },
  "openai/gpt-oss-20b": { in: 0, out: 0 },
};

export function estimateCostUsd(modelId: string, tokensIn: number, tokensOut: number): number {
  const p = PRICING[modelId] ?? { in: 0.001, out: 0.003 };
  return (tokensIn / 1000) * p.in + (tokensOut / 1000) * p.out;
}

// Soft circuit-breaker per ogni provider: 60s di cooldown dopo errore generico,
// 6 ore di cooldown per errori di quota (evita spam nei log per tutta la notte).
const COOLDOWN_MS = 60_000;
const QUOTA_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 ore

const QUOTA_ERROR_PATTERNS = ["quota", "rate_limit", "RESOURCE_EXHAUSTED"];

function isQuotaError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return QUOTA_ERROR_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

const health: Record<AiProviderId, AiProviderHealth & { cooldownUntil: number; quotaError: boolean }> = {
  openai: { id: "openai", available: true, cooldownUntil: 0, quotaError: false },
  google: { id: "google", available: true, cooldownUntil: 0, quotaError: false },
  groq: { id: "groq", available: true, cooldownUntil: 0, quotaError: false },
};

// Tetti giornalieri (RPD) free tier — guardia proattiva per NON sforare le quote
// gratuite. Quando un provider raggiunge il cap, isAvailable() lo salta fino al
// reset di mezzanotte UTC (la chain passa al provider successivo / Ollama).
// Override con *_RPD_LIMIT se passi a un piano a pagamento. Infinity = nessun cap.
// Parse difensivo: un *_RPD_LIMIT non numerico o <= 0 NON deve disattivare il cap
// (sarebbe un "sforo" silenzioso). In quel caso si ricade sul default sicuro.
function parseCap(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(`[ai] *_RPD_LIMIT non valido ("${raw}") → uso default ${fallback}`);
    return fallback;
  }
  return n;
}

const DAILY_CAPS: Record<AiProviderId, number> = {
  groq: parseCap(process.env.GROQ_RPD_LIMIT, 1000),
  google: parseCap(process.env.GEMINI_RPD_LIMIT, 1500),
  openai: parseCap(process.env.OPENAI_RPD_LIMIT, Infinity),
};

const dailyUsage: Record<AiProviderId, { day: string; count: number }> = {
  openai: { day: "", count: 0 },
  google: { day: "", count: 0 },
  groq: { day: "", count: 0 },
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDailyCount(id: AiProviderId): number {
  const rec = dailyUsage[id];
  if (rec.day !== todayUtc()) return 0;
  return rec.count;
}

function incrDailyCount(id: AiProviderId): void {
  const day = todayUtc();
  const rec = dailyUsage[id];
  if (rec.day !== day) {
    dailyUsage[id] = { day, count: 1 };
  } else {
    rec.count += 1;
  }
}

function withinDailyCap(id: AiProviderId): boolean {
  const cap = DAILY_CAPS[id];
  if (!Number.isFinite(cap)) return true;
  return getDailyCount(id) < cap;
}

// Snapshot uso giornaliero per pannello admin / diagnostica.
export function getDailyUsage(): Array<{ id: AiProviderId; used: number; cap: number }> {
  return (Object.keys(DAILY_CAPS) as AiProviderId[]).map((id) => ({
    id,
    used: getDailyCount(id),
    cap: DAILY_CAPS[id],
  }));
}

const COOLDOWN_DB_KEY = (id: AiProviderId) => `ai_provider_cooldown_${id}`;

interface PersistedCooldown {
  cooldownUntil: number;
  quotaError: boolean;
  lastError?: string;
  lastErrorAt?: string;
}

function persistCooldown(id: AiProviderId, data: PersistedCooldown | null): void {
  if (data === null) {
    storage.upsertAppSetting(COOLDOWN_DB_KEY(id), undefined, { cooldownUntil: 0, quotaError: false }).catch(() => {});
  } else {
    storage.upsertAppSetting(COOLDOWN_DB_KEY(id), undefined, data).catch(() => {});
  }
}

export function markProviderError(id: AiProviderId, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const quota = isQuotaError(msg);
  health[id].available = false;
  health[id].lastError = msg.slice(0, 200);
  health[id].lastErrorAt = new Date().toISOString();
  health[id].quotaError = quota;
  // Errori di quota: cooldown lungo (6 ore) per non intasare i log con retry inutili.
  health[id].cooldownUntil = Date.now() + (quota ? QUOTA_COOLDOWN_MS : COOLDOWN_MS);
  // Persist only quota errors (long cooldown) — short cooldowns (60s) don't survive restarts.
  if (quota) {
    persistCooldown(id, {
      cooldownUntil: health[id].cooldownUntil,
      quotaError: true,
      lastError: health[id].lastError,
      lastErrorAt: health[id].lastErrorAt,
    });
  }
}

export function markProviderOk(id: AiProviderId): void {
  health[id].available = true;
  health[id].cooldownUntil = 0;
  health[id].quotaError = false;
  persistCooldown(id, null);
}

// Chiamare una volta dopo le migrazioni DB per ripristinare i cooldown quota
// persistiti prima del riavvio del server e per caricare il contatore TPD Groq.
export async function initProviderHealth(): Promise<void> {
  const ids: AiProviderId[] = ["openai", "google"];
  await Promise.all([
    ...ids.map(async (id) => {
      try {
        const row = await storage.getAppSetting(COOLDOWN_DB_KEY(id));
        if (!row?.valueJson) return;
        const data = row.valueJson as PersistedCooldown;
        if (!data.quotaError || !data.cooldownUntil) return;
        const remaining = data.cooldownUntil - Date.now();
        if (remaining <= 0) return;
        health[id].available = false;
        health[id].cooldownUntil = data.cooldownUntil;
        health[id].quotaError = true;
        if (data.lastError) health[id].lastError = data.lastError;
        if (data.lastErrorAt) health[id].lastErrorAt = data.lastErrorAt;
        console.log(`[ai-provider] ${id} quota cooldown ripristinato: ${Math.round(remaining / 60_000)}min rimasti`);
      } catch {/* best-effort */}
    }),
    // Carica il contatore TPD Groq dal DB in modo che il soft-cap sopravviva ai restart.
    loadGroqTpdFromDb().catch(() => {}),
  ]);
}

export function getProviderHealth(): AiProviderHealth[] {
  const now = Date.now();
  return (Object.values(health) as Array<AiProviderHealth & { cooldownUntil: number; quotaError: boolean }>).map((h) => {
    const effectivelyAvailable = h.available && now >= h.cooldownUntil;
    const remainingMs = !effectivelyAvailable && h.cooldownUntil > now ? h.cooldownUntil - now : 0;
    return {
      id: h.id,
      available: effectivelyAvailable,
      lastError: h.lastError,
      lastErrorAt: h.lastErrorAt,
      ...(remainingMs > 0 ? { cooldownRemainingMs: remainingMs, isQuotaError: h.quotaError } : {}),
    };
  });
}

function isAvailable(id: AiProviderId): boolean {
  if (Date.now() < health[id].cooldownUntil) return false;
  if (!withinDailyCap(id)) return false;
  // Groq TPD soft-cap: salta Groq per il resto del giorno se i token giornalieri
  // superano la soglia configurata (default 160k). Logga solo una volta al superamento.
  if (id === "groq" && isGroqTpdExceededSync()) return false;
  return true;
}

function tryBuild(id: AiProviderId, role: ModelRole, forcedModelId?: string): ResolvedModel | null {
  if (!isAvailable(id)) return null;
  try {
    if (id === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return null;
      const modelId = forcedModelId ?? "gpt-5.1";
      const client = createOpenAI({ apiKey: key });
      return {
        id, providerName: "openai", modelId,
        model: client(modelId) as unknown as LanguageModelV2,
        scheduler: <T>(fn: () => Promise<T>) => limiters.openai.schedule(fn),
      };
    }
    if (id === "google") {
      // Free tier (Google AI Studio, nessuna carta): usa i modelli Flash. Gemini 2.5 Pro
      // dal 1 aprile 2026 è solo a pagamento → su free tier darebbe RESOURCE_EXHAUSTED.
      // Limiti free gestiti da limiters.gemini (RPM) + DAILY_CAPS.google (RPD 1500).
      const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
      if (!key) return null;
      const modelId = forcedModelId ?? (role === "router" ? "gemini-2.5-flash-lite" : "gemini-2.5-flash");
      const client = createGoogleGenerativeAI({ apiKey: key });
      return {
        id, providerName: "google", modelId,
        model: client(modelId) as unknown as LanguageModelV2,
        scheduler: <T>(fn: () => Promise<T>) => limiters.gemini.schedule(fn),
      };
    }
    if (id === "groq") {
      // Groq è OpenAI-compatibile → riusa createOpenAI con baseURL Groq. Free tier
      // (nessuna carta): limiti free gestiti da limiters.groq (RPM 30) + DAILY_CAPS.groq (RPD 1000).
      const key = process.env.GROQ_API_KEY;
      if (!key) return null;
      // openai/gpt-oss-20b è l'unico modello Groq free-tier con strict mode (constrained
      // decoding). Confermato free tier nelle Groq rate-limits (30 RPM / 1K RPD).
      // Per abilitare strict mode (strict: true in Groq API), passare strictJsonSchema:true
      // via providerOptions nei singoli generateObject call site.
      // llama-3.x-* NON supportano structured outputs json_schema su Groq: vengono
      // marcati objectMode:"json" e instradati da generateStructured() su
      // output:"no-schema" (JSON-object mode) + validazione Zod. In AI SDK v6 il
      // parametro `mode` non esiste più, quindi non si passa più mode:"json".
      const modelId = forcedModelId ?? "openai/gpt-oss-20b";
      const client = createOpenAI({ apiKey: key, baseURL: "https://api.groq.com/openai/v1" });
      const needsJsonMode = /^(llama-3\.|meta-llama\/llama-3)/.test(modelId);
      return {
        id, providerName: "groq", modelId,
        model: client(modelId) as unknown as LanguageModelV2,
        scheduler: <T>(fn: () => Promise<T>) => limiters.groq.schedule(fn),
        ...(needsJsonMode ? { objectMode: "json" as const } : {}),
      };
    }
  } catch (err) {
    markProviderError(id, err);
  }
  return null;
}

// Task #2966 — Rete finale self-hosted: Ollama (ThinkCentre). Illimitato e locale,
// quindi fuori dai cooldown/cap dei provider cloud. Lo scheduler è pass-through
// (nessun limiter Bottleneck). Ritorna null se BOWIE_OLLAMA_URL non è configurato.
export function tryBuildOllama(): ResolvedModel | null {
  if (!isOllamaConfigured) return null;
  try {
    const modelId = process.env.BOWIE_OLLAMA_MODEL ?? AGENT_MODEL_DEFAULTS.bowie;
    const model = getOllamaModel(modelId) as unknown as LanguageModelV2;
    return {
      id: "ollama",
      providerName: "ollama",
      modelId,
      model,
      scheduler: <T>(fn: () => Promise<T>) => fn(),
    };
  } catch {
    return null;
  }
}

// Task #3872 — Ordine cascade universale: Ollama (ThinkCentre, costo zero, tentato
// per PRIMO in runWithFallback) → Groq (free, Llama) → Gemini (free, Flash) → OpenAI.
// Questi array rappresentano la chain cloud fallback; Ollama è gestito separatamente
// all'inizio di runWithFallback (non è un AiProviderId perché non ha cap/cooldown cloud).
const DEFAULT_BRAIN_CHAIN: AiProviderId[] = ["groq", "google", "openai"];
const DEFAULT_ROUTER_CHAIN: AiProviderId[] = ["groq", "google", "openai"];

export interface ResolveOpts {
  role?: ModelRole;
  preferredProvider?: AiProviderId | "auto";
  forcedModelId?: string;
  // Task #2966 — Se true, dopo aver esaurito la chain cloud (Groq→Gemini→OpenAI)
  // prova Ollama self-hosted come rete finale illimitata.
  // Deprecato: con Ollama-first (Task #3872) Ollama viene tentato PRIMA della chain cloud;
  // questo flag è mantenuto per compatibilità ma è ora ridondante.
  ollamaBackstop?: boolean;
  // Task #3872 — Se true, salta Ollama completamente (cloud-only). Usare solo per
  // casi in cui Ollama non è adatto, es. tool calling multi-step (moderation chat).
  skipOllama?: boolean;
}

function buildChain(role: ModelRole, preferred?: AiProviderId | "auto"): AiProviderId[] {
  const base = role === "router" ? DEFAULT_ROUTER_CHAIN : DEFAULT_BRAIN_CHAIN;
  if (preferred && preferred !== "auto") {
    return [preferred, ...base.filter((id) => id !== preferred)];
  }
  return base;
}

// Legge la preferenza salvata dall'admin (settings). Best-effort, fallback "auto".
async function readPreferredProvider(): Promise<AiProviderId | "auto"> {
  try {
    const row = await storage.getAppSetting("ai_moderation_preferred_provider");
    const v = (row?.value ?? "auto") as string;
    if (v === "openai" || v === "google" || v === "groq") return v;
  } catch {/* ignore */}
  return "auto";
}

export function resolveModel(opts: ResolveOpts = {}): ResolvedModel {
  const role: ModelRole = opts.role ?? "brain";
  // Task #110 — Master switch "Fallback AI" OFF (default): resolveModel costruisce
  // SOLO modelli cloud (Ollama passa da tryBuildOllama), quindi con il fallback
  // disattivato lancia un errore chiaro invece di raggiungere un provider cloud.
  if (!isAiFallbackEnabledSync()) {
    throw new Error(
      "AI_SELFHOSTED_ONLY: fallback cloud disattivato (solo ThinkCentre) — nessun provider cloud disponibile",
    );
  }
  const chain = buildChain(role, opts.preferredProvider);
  for (const id of chain) {
    const m = tryBuild(id, role, opts.forcedModelId);
    if (m) return m;
  }
  throw new Error("AI_PROVIDER_UNAVAILABLE: nessun provider AI configurato o disponibile");
}

// Per-request fallback: prova ogni provider della chain DENTRO la stessa richiesta.
// Se uno fallisce, marca cooldown e prova il successivo. Solo l'ultimo errore propaga.
//
// Task #3872 — Ordine cascade universale: Ollama (ThinkCentre, costo zero) → Groq →
// Gemini → OpenAI. Ollama viene tentato per PRIMO se configurato e non esplicitamente
// saltato (skipOllama: true). Se Ollama è offline/lento la chain prosegue normalmente.
export async function runWithFallback<T>(
  opts: ResolveOpts,
  fn: (m: ResolvedModel) => Promise<T>,
): Promise<{ value: T; model: ResolvedModel }> {
  const role: ModelRole = opts.role ?? "brain";
  const preferred = opts.preferredProvider ?? (await readPreferredProvider());
  const chain = buildChain(role, preferred);
  let lastErr: unknown = null;

  // Task #110 — Master switch "Fallback AI". Quando OFF (default) l'intera app usa
  // SOLO il modello self-hosted ThinkCentre (Ollama): la chain cloud (Groq/Gemini/
  // OpenAI) NON viene mai tentata. In OFF ignoriamo skipOllama così un tentativo
  // self-hosted avviene comunque; se fallisce, si propaga un errore chiaro.
  const fallbackEnabled = await isAiFallbackEnabled();

  // Ollama-first: se configurato e non esplicitamente saltato, prova Ollama
  // prima della chain cloud. Ollama è self-hosted e a costo zero; se è offline
  // o risponde lentamente la chain cloud prosegue senza impatto su health/cooldown.
  // Con il master switch OFF il tentativo self-hosted è forzato (self-hosted-only).
  const attemptOllamaFirst = fallbackEnabled ? !opts.skipOllama : true;
  if (attemptOllamaFirst && !(await isThinkCentreOffline())) {
    const om = tryBuildOllama();
    if (om) {
      try {
        const value = await om.scheduler(() => fn(om));
        console.log(`[ai-provider] risposta da ${om.providerName}/${om.modelId} (ollama-first)`);
        return { value, model: om };
      } catch (err) {
        lastErr = err;
        console.warn(
          `[ai-provider] ollama-first fallito${fallbackEnabled ? ", scalo a chain cloud" : " (fallback cloud disattivato)"}:`,
          (err as Error).message,
        );
      }
    }
  }

  // Task #110 — Master switch OFF: non toccare MAI la chain cloud. Degrada con un
  // errore chiaro così i caller possono gestire il fallimento invece di raggiungere
  // silenziosamente un provider cloud.
  if (!fallbackEnabled) {
    if (lastErr) throw lastErr;
    throw new Error(
      "AI_SELFHOSTED_UNAVAILABLE: fallback cloud disattivato (solo ThinkCentre) e il modello self-hosted non è disponibile",
    );
  }

  for (const id of chain) {
    const m = tryBuild(id, role, opts.forcedModelId);
    if (!m) continue;
    incrDailyCount(id); // conteggio proattivo per il cap giornaliero free tier
    try {
      const value = await fn(m);
      markProviderOk(id);
      console.log(`[ai-provider] risposta da ${m.providerName}/${m.modelId}`);
      // Registra i token usati su Groq per il soft-cap TPD giornaliero.
      // generateObject: usage è direttamente sull'oggetto ritornato.
      // streamText: usage è una Promise che si risolve al completamento dello stream.
      if (id === "groq") {
        const v = value as unknown as { usage?: unknown };
        if (v?.usage instanceof Promise) {
          // streamText: aspetta la Promise in background — non blocca la risposta.
          (v.usage as Promise<{ inputTokens?: number; outputTokens?: number }>)
            .then((u) => {
              const total = (u?.inputTokens ?? 0) + (u?.outputTokens ?? 0);
              if (total > 0) recordGroqTokens(total);
            })
            .catch(() => {});
        } else {
          const u = v?.usage as { inputTokens?: number; outputTokens?: number } | undefined;
          const total = (u?.inputTokens ?? 0) + (u?.outputTokens ?? 0);
          if (total > 0) recordGroqTokens(total);
        }
      }
      return { value, model: m };
    } catch (err) {
      markProviderError(id, err);
      lastErr = err;
      console.warn(`[ai-provider] ${m.providerName}/${m.modelId} fallito, provo fallback:`, (err as Error).message);
    }
  }
  // Task #2966/3872 — ollamaBackstop è ora ridondante (Ollama è già il primo tentativo),
  // ma viene mantenuto per compatibilità con i caller che lo impostano esplicitamente
  // e non è stato ancora aggiornato. Se skipOllama è true, questo blocco non si esegue
  // (rispetta l'intento del caller di non usare Ollama).
  if (opts.ollamaBackstop && !opts.skipOllama && !(await isThinkCentreOffline())) {
    const om = tryBuildOllama();
    if (om) {
      try {
        const value = await om.scheduler(() => fn(om));
        console.log(`[ai-provider] risposta da ${om.providerName}/${om.modelId} (backstop)`);
        return { value, model: om };
      } catch (err) {
        lastErr = err;
        console.warn(`[ai-provider] ollama backstop fallito:`, (err as Error).message);
      }
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("AI_PROVIDER_UNAVAILABLE: nessun provider AI configurato o disponibile");
}

// Task #4857 — Helper structured-generation v6-compatibile.
// AI SDK v6 ha RIMOSSO il parametro `mode` di generateObject: ora ogni chiamata
// invia una richiesta json_schema nativa, che Groq RIFIUTA per i modelli llama-3.x
// ("json_schema non supportato da llama-3.3-70b-versatile per structured outputs").
// Per questi modelli (flag objectMode:"json", impostato in tryBuild sul ramo groq)
// si usa output:"no-schema" (JSON-object mode), si inietta la forma dello schema nel
// prompt e si valida manualmente con schema.parse (throw → la fallback chain lo cattura).
// I modelli schema-capable (Groq gpt-oss, Gemini, OpenAI, Ollama) restano invariati.
export interface StructuredGenOpts<T> {
  schema: z.ZodType<T>;
  schemaName?: string;
  schemaDescription?: string;
  system?: string;
  prompt: string;
  temperature?: number;
  abortSignal?: AbortSignal;
  // Task #25 — opzioni provider-specifiche (es. { ollama: { think: false } } per
  // disattivare il ragionamento esplicito di qwen3 quando si genera JSON strutturato).
  providerOptions?: Record<string, Record<string, unknown>>;
}

export interface StructuredGenResult<T> {
  object: T;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export async function generateStructured<T>(
  m: ResolvedModel,
  opts: StructuredGenOpts<T>,
): Promise<StructuredGenResult<T>> {
  // Ollama (Bowie=qwen3:1.7b) "pensa" di default: disattiviamo il ragionamento
  // esplicito quando genera JSON strutturato, altrimenti i blocchi <think>
  // rompono il parsing. Rispetta eventuali override espliciti del chiamante.
  const providerOptions =
    m.id === "ollama"
      ? {
          ...(opts.providerOptions ?? {}),
          ollama: { think: false, ...(opts.providerOptions?.ollama ?? {}) },
        }
      : opts.providerOptions;
  if (m.objectMode === "json") {
    // Modello senza json_schema (Groq llama-3.x): no-schema + Zod parse manuale.
    let shape = "";
    try {
      shape = JSON.stringify(z.toJSONSchema(opts.schema as unknown as z.ZodType));
    } catch {/* schema non serializzabile: prompt JSON generico */}
    const prompt = shape
      ? `${opts.prompt}\n\nRispondi ESCLUSIVAMENTE con un oggetto JSON valido e conforme a questo JSON Schema (nessun testo, markdown o commento extra):\n${shape}`
      : `${opts.prompt}\n\nRispondi ESCLUSIVAMENTE con un oggetto JSON valido (nessun testo, markdown o commento extra).`;
    const res = await generateObject({
      model: m.model,
      output: "no-schema",
      instructions: opts.system,
      prompt,
      temperature: opts.temperature,
      abortSignal: opts.abortSignal,
      ...(providerOptions ? { providerOptions: providerOptions as never } : {}),
    });
    const object = opts.schema.parse(res.object);
    return { object, usage: res.usage };
  }
  // Modello schema-capable: structured outputs nativi (invariato).
  const res = await generateObject({
    model: m.model,
    schema: opts.schema,
    schemaName: opts.schemaName,
    schemaDescription: opts.schemaDescription,
    instructions: opts.system,
    prompt: opts.prompt,
    temperature: opts.temperature,
    abortSignal: opts.abortSignal,
    ...(providerOptions ? { providerOptions: providerOptions as never } : {}),
  });
  return { object: res.object, usage: res.usage };
}

// Task #2825 — Variabili d'ambiente che attivano almeno un provider AI.
export const AI_PROVIDER_ENV_VARS = ["GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "BOWIE_OLLAMA_URL"] as const;

// Messaggio standard 503 quando nessun provider AI è configurato. Contiene i nomi
// delle variabili mancanti così il client può riconoscere il caso "chiave mancante".
export const AI_NO_PROVIDER_MESSAGE =
  "Servizio AI non disponibile: nessuna chiave AI configurata (OPENAI_API_KEY / GEMINI_API_KEY / BOWIE_OLLAMA_URL mancante)";

// Ritorna gli ID dei provider che hanno una chiave configurata (ignora il cooldown).
export function getConfiguredProviders(): AiProviderId[] {
  const out: AiProviderId[] = [];
  if (process.env.GROQ_API_KEY) out.push("groq");
  if (process.env.OPENAI_API_KEY) out.push("openai");
  if (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY) out.push("google");
  return out;
}

// True se almeno un provider AI è configurato (cloud o Ollama self-hosted).
export function hasAnyAiProvider(): boolean {
  return getConfiguredProviders().length > 0 || Boolean(process.env.BOWIE_OLLAMA_URL?.trim());
}

export { readPreferredProvider, getGroqTpdStatus };
export type { ResolvedModel };
