/**
 * Route AI Provider Config — BikerLink
 *
 * Gestisce la catena dei provider AI usata da generateRouteObject e
 * streamRouteText (Ollama → Groq → Gemini). Segue lo stesso pattern
 * del toggle routing_kill_switch: env override wins, poi DB setting,
 * poi default hard-coded.
 *
 * DB key: `ai_route_provider_chain` — JSON array ordinato di RouteProviderId.
 * Env override: ROUTE_AI_PROVIDERS — CSV (es. "groq,gemini" salta Ollama).
 *   Valore "auto" (o vuoto) ripristina il default completo.
 *
 * Catena di default: ollama → groq → gemini
 */

import { storage } from "../storage";
import { isAiFallbackEnabled, isAiFallbackEnabledSync } from "./fallback-switch";
import { isOllamaConfigured } from "../lib/ollama-client";
import { isGroqConfigured } from "../lib/groq-client";
import { isOpenAiRouteConfigured } from "../lib/openai-route-client";

export type RouteProviderId = "ollama" | "groq" | "gemini" | "openai";

export const ALL_ROUTE_PROVIDERS: RouteProviderId[] = ["ollama", "groq", "gemini", "openai"];
export const DEFAULT_ROUTE_CHAIN: RouteProviderId[] = ["ollama", "groq", "gemini", "openai"];
const DB_KEY = "ai_route_provider_chain";

function parseChain(raw: string): RouteProviderId[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is RouteProviderId => ALL_ROUTE_PROVIDERS.includes(s as RouteProviderId));
}

/**
 * Ritorna la chain attiva nel seguente ordine di priorità:
 * 1. Variabile d'ambiente ROUTE_AI_PROVIDERS (es. "groq,gemini")
 * 2. Impostazione DB ai_route_provider_chain
 * 3. Default ["ollama","groq","gemini"]
 */
export async function getEffectiveRouteChain(): Promise<RouteProviderId[]> {
  // Task #110 — Master switch "Fallback AI" OFF (default): chain self-hosted-only
  // (solo Ollama/ThinkCentre), a prescindere da env override, config DB salvata o
  // chiavi cloud presenti. Con OFF nessun provider cloud viene mai tentato.
  if (!(await isAiFallbackEnabled())) return ["ollama"];

  const envOverride = process.env.ROUTE_AI_PROVIDERS;
  if (envOverride && envOverride !== "auto") {
    const parsed = parseChain(envOverride);
    if (parsed.length > 0) return parsed;
  }

  try {
    const row = await storage.getAppSetting(DB_KEY);
    if (row?.valueJson && Array.isArray(row.valueJson)) {
      const saved = (row.valueJson as string[]).filter((id): id is RouteProviderId =>
        ALL_ROUTE_PROVIDERS.includes(id as RouteProviderId),
      );
      if (saved.length > 0) return saved;
    }
  } catch {
    /* best-effort */
  }

  return [...DEFAULT_ROUTE_CHAIN];
}

/**
 * Ritorna la chain attiva in modo SINCRONO (solo env override, poi default).
 * Usato quando non è possibile fare await (costruttori sincroni, ecc.).
 * Per la chain DB usare getEffectiveRouteChain().
 */
export function getEffectiveRouteChainSync(): RouteProviderId[] {
  // Task #110 — master switch OFF (default): self-hosted-only.
  if (!isAiFallbackEnabledSync()) return ["ollama"];

  const envOverride = process.env.ROUTE_AI_PROVIDERS;
  if (envOverride && envOverride !== "auto") {
    const parsed = parseChain(envOverride);
    if (parsed.length > 0) return parsed;
  }
  return [...DEFAULT_ROUTE_CHAIN];
}

/** Persiste la chain nel DB. Passa array vuoto per ripristinare il default. */
export async function setRouteProviderChain(chain: RouteProviderId[]): Promise<void> {
  const valid = chain.filter((id) => ALL_ROUTE_PROVIDERS.includes(id));
  await storage.upsertAppSetting(DB_KEY, undefined, valid.length > 0 ? valid : DEFAULT_ROUTE_CHAIN);
}

export interface RouteProviderStatus {
  id: RouteProviderId;
  label: string;
  configured: boolean;
  inChain: boolean;
  position: number | null;
  envKey: string | null;
}

/** Snapshot dello stato di ciascun provider + posizione nella chain attiva. */
export async function getRouteProviderStatusList(): Promise<{
  statuses: RouteProviderStatus[];
  chain: RouteProviderId[];
  envOverride: string | null;
}> {
  const chain = await getEffectiveRouteChain();
  const envOverride = process.env.ROUTE_AI_PROVIDERS ?? null;

  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY);

  const statuses: RouteProviderStatus[] = [
    {
      id: "ollama",
      label: "Ollama (self-hosted)",
      configured: isOllamaConfigured,
      inChain: chain.includes("ollama"),
      position: chain.includes("ollama") ? chain.indexOf("ollama") + 1 : null,
      envKey: "BOWIE_OLLAMA_URL",
    },
    {
      id: "groq",
      label: "Groq (cloud veloce)",
      configured: isGroqConfigured,
      inChain: chain.includes("groq"),
      position: chain.includes("groq") ? chain.indexOf("groq") + 1 : null,
      envKey: "GROQ_API_KEY",
    },
    {
      id: "gemini",
      label: "Gemini (cloud)",
      configured: geminiConfigured,
      inChain: chain.includes("gemini"),
      position: chain.includes("gemini") ? chain.indexOf("gemini") + 1 : null,
      envKey: "GEMINI_API_KEY",
    },
    {
      id: "openai",
      label: "OpenAI (gpt-4o-mini)",
      configured: isOpenAiRouteConfigured,
      inChain: chain.includes("openai"),
      position: chain.includes("openai") ? chain.indexOf("openai") + 1 : null,
      envKey: "OPENAI_API_KEY",
    },
  ];

  return { statuses, chain, envOverride: envOverride && envOverride !== "auto" ? envOverride : null };
}
