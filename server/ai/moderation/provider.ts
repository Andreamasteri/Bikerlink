// Task #2532 — Provider abstraction con fallback chain Groq → Gemini → OpenAI.
// Tutti i consumer AI moderazione passano da qui. Restituisce un model handle
// pronto per generateObject/streamText con metadata cost tracking.
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { limiters } from "../../lib/throttle";
import { storage } from "../../storage";
import { getOllamaModel, isOllamaConfigured } from "../../lib/ollama-client";
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
  // Presente solo per modelli che non supportano json_schema mode (es. Llama 3.x su Groq).
  // Quando impostato, generateObject DEVE ricevere mode:"json" altrimenti fallisce.
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
      // llama-3.x-* non supportano json_schema su Groq → richiedono mode:"json" se forzati.
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
// (nessun limiter Bottleneck). Ritorna null se OLLAMA_URL non è configurato.
function tryBuildOllama(): ResolvedModel | null {
  if (!isOllamaConfigured) return null;
  try {
    const modelId = process.env.OLLAMA_MODEL ?? "llama3.1:8b";
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

// Ordine di preferenza: vedi _ai-stack-decision.md.
// Groq primario (free, Llama 3.3 70B) → Gemini (free, Flash) → OpenAI.
// Quando i free tier esauriscono il cap giornaliero, la chain prosegue; per
// l'assistente, l'ultima rete è Ollama (illimitato, gestito in agent.ts).
const DEFAULT_BRAIN_CHAIN: AiProviderId[] = ["groq", "google", "openai"];
const DEFAULT_ROUTER_CHAIN: AiProviderId[] = ["groq", "google", "openai"];

export interface ResolveOpts {
  role?: ModelRole;
  preferredProvider?: AiProviderId | "auto";
  forcedModelId?: string;
  // Task #2966 — Se true, dopo aver esaurito la chain cloud (Groq→Gemini→OpenAI)
  // prova Ollama self-hosted come rete finale illimitata.
  ollamaBackstop?: boolean;
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
  const chain = buildChain(role, opts.preferredProvider);
  for (const id of chain) {
    const m = tryBuild(id, role, opts.forcedModelId);
    if (m) return m;
  }
  throw new Error("AI_PROVIDER_UNAVAILABLE: nessun provider AI configurato o disponibile");
}

// Per-request fallback: prova ogni provider della chain DENTRO la stessa richiesta.
// Se uno fallisce, marca cooldown e prova il successivo. Solo l'ultimo errore propaga.
export async function runWithFallback<T>(
  opts: ResolveOpts,
  fn: (m: ResolvedModel) => Promise<T>,
): Promise<{ value: T; model: ResolvedModel }> {
  const role: ModelRole = opts.role ?? "brain";
  const preferred = opts.preferredProvider ?? (await readPreferredProvider());
  const chain = buildChain(role, preferred);
  let lastErr: unknown = null;
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
  // Task #2966 — Ollama backstop: rete finale locale illimitata (ThinkCentre).
  // Attiva solo con opts.ollamaBackstop. Non tocca health/cooldown/cap dei
  // provider cloud (Ollama è self-hosted, fuori dai limiti free tier).
  if (opts.ollamaBackstop) {
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

// Task #2825 — Variabili d'ambiente che attivano almeno un provider AI.
export const AI_PROVIDER_ENV_VARS = ["GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "OLLAMA_URL"] as const;

// Messaggio standard 503 quando nessun provider AI è configurato. Contiene i nomi
// delle variabili mancanti così il client può riconoscere il caso "chiave mancante".
export const AI_NO_PROVIDER_MESSAGE =
  "Servizio AI non disponibile: nessuna chiave AI configurata (OPENAI_API_KEY / GEMINI_API_KEY / OLLAMA_URL mancante)";

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
  return getConfiguredProviders().length > 0 || Boolean(process.env.OLLAMA_URL);
}

export { readPreferredProvider, getGroqTpdStatus };
export type { ResolvedModel };
