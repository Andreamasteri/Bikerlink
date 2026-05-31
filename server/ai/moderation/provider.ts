// Task #2532 — Provider abstraction con fallback chain Anthropic → OpenAI → Google.
// Tutti i consumer AI moderazione passano da qui. Restituisce un model handle
// pronto per generateObject/streamText con metadata cost tracking.
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { limiters } from "../../lib/throttle";
import { storage } from "../../storage";
import type { AiProviderHealth, AiProviderId } from "./types";

export type ModelRole = "brain" | "router";

interface ResolvedModel {
  id: AiProviderId;
  providerName: string;
  modelId: string;
  model: LanguageModelV2;
  scheduler: <T>(fn: () => Promise<T>) => Promise<T>;
}

// Prezzi $ per 1k token (Maggio 2026, vedi _ai-stack-decision.md). Aggiornati a mano.
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-6": { in: 0.003, out: 0.015 },
  "gpt-5.1": { in: 0.0025, out: 0.01 },
  "gemini-2.5-pro": { in: 0.00125, out: 0.005 },
  "gemini-2.5-flash-lite": { in: 0.0001, out: 0.0004 },
  // Task #2698 — modello leggero per AI Assistant utente
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
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
  anthropic: { id: "anthropic", available: true, cooldownUntil: 0, quotaError: false },
  openai: { id: "openai", available: true, cooldownUntil: 0, quotaError: false },
  google: { id: "google", available: true, cooldownUntil: 0, quotaError: false },
};

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
// persistiti prima del riavvio del server.
export async function initProviderHealth(): Promise<void> {
  const ids: AiProviderId[] = ["anthropic", "openai", "google"];
  await Promise.all(ids.map(async (id) => {
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
  }));
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
  return Date.now() >= health[id].cooldownUntil;
}

function tryBuild(id: AiProviderId, role: ModelRole, forcedModelId?: string): ResolvedModel | null {
  if (!isAvailable(id)) return null;
  try {
    if (id === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return null;
      const modelId = forcedModelId ?? "claude-sonnet-4-6";
      const client = createAnthropic({ apiKey: key });
      return {
        id, providerName: "anthropic", modelId,
        model: client(modelId) as unknown as LanguageModelV2,
        scheduler: <T>(fn: () => Promise<T>) => limiters.anthropic.schedule(fn),
      };
    }
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
      // Per riattivare Gemini: imposta GEMINI_API_KEY nel pannello Secrets con una chiave
      // pagante (Google AI Studio → piano a pagamento). La chiave free tier ha quota 0
      // e genera "RESOURCE_EXHAUSTED" continuamente. Senza chiave pagante Gemini resta
      // disabilitato e il sistema usa Anthropic/OpenAI come fallback.
      const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
      if (!key) return null;
      const modelId = forcedModelId ?? (role === "router" ? "gemini-2.5-flash-lite" : "gemini-2.5-pro");
      const client = createGoogleGenerativeAI({ apiKey: key });
      return {
        id, providerName: "google", modelId,
        model: client(modelId) as unknown as LanguageModelV2,
        scheduler: <T>(fn: () => Promise<T>) => limiters.gemini.schedule(fn),
      };
    }
  } catch (err) {
    markProviderError(id, err);
  }
  return null;
}

// Ordine di preferenza: vedi _ai-stack-decision.md.
const DEFAULT_BRAIN_CHAIN: AiProviderId[] = ["anthropic", "openai", "google"];
const DEFAULT_ROUTER_CHAIN: AiProviderId[] = ["google", "openai", "anthropic"];

export interface ResolveOpts {
  role?: ModelRole;
  preferredProvider?: AiProviderId | "auto";
  forcedModelId?: string;
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
    if (v === "anthropic" || v === "openai" || v === "google") return v;
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
    try {
      const value = await fn(m);
      markProviderOk(m.id);
      return { value, model: m };
    } catch (err) {
      markProviderError(m.id, err);
      lastErr = err;
      console.warn(`[ai-provider] ${m.providerName}/${m.modelId} fallito, provo fallback:`, (err as Error).message);
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("AI_PROVIDER_UNAVAILABLE: nessun provider AI configurato o disponibile");
}

// Task #2825 — Variabili d'ambiente che attivano almeno un provider AI.
export const AI_PROVIDER_ENV_VARS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"] as const;

// Messaggio standard 503 quando nessun provider AI è configurato. Contiene i nomi
// delle variabili mancanti così il client può riconoscere il caso "chiave mancante".
export const AI_NO_PROVIDER_MESSAGE =
  "Servizio AI non disponibile: nessuna chiave AI configurata (ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY mancante)";

// Ritorna gli ID dei provider che hanno una chiave configurata (ignora il cooldown).
export function getConfiguredProviders(): AiProviderId[] {
  const out: AiProviderId[] = [];
  if (process.env.ANTHROPIC_API_KEY) out.push("anthropic");
  if (process.env.OPENAI_API_KEY) out.push("openai");
  if (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY) out.push("google");
  return out;
}

// True se almeno un provider AI è configurato con una chiave.
export function hasAnyAiProvider(): boolean {
  return getConfiguredProviders().length > 0;
}

export { readPreferredProvider };
export type { ResolvedModel };
