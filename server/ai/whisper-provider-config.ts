/**
 * Whisper STT Provider Config — BikerLink
 *
 * Gestisce la catena dei provider STT (Speech-to-Text) usata dalla route
 * /api/whisper/transcribe. Segue lo stesso pattern di route-provider-config.ts:
 * env override wins, poi DB setting, poi default hard-coded.
 *
 * DB key: `stt_provider_chain` — JSON array ordinato di SttProviderId.
 * Env override: STT_PROVIDERS — CSV (es. "groq,openai" salta home).
 *   Valore "auto" (o vuoto) ripristina il default completo.
 *
 * Catena di default: home → groq → openai
 */

import { storage } from "../storage";

export type SttProviderId = "home" | "groq" | "openai";

export const ALL_STT_PROVIDERS: SttProviderId[] = ["home", "groq", "openai"];
export const DEFAULT_STT_CHAIN: SttProviderId[] = ["home", "groq", "openai"];
const DB_KEY = "stt_provider_chain";

function parseChain(raw: string): SttProviderId[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is SttProviderId => ALL_STT_PROVIDERS.includes(s as SttProviderId));
}

/**
 * Ritorna la chain attiva nel seguente ordine di priorità:
 * 1. Variabile d'ambiente STT_PROVIDERS (es. "groq,openai")
 * 2. Impostazione DB stt_provider_chain
 * 3. Default ["home","groq","openai"]
 */
export async function getEffectiveSttChain(): Promise<SttProviderId[]> {
  const envOverride = process.env.STT_PROVIDERS;
  if (envOverride && envOverride !== "auto") {
    const parsed = parseChain(envOverride);
    if (parsed.length > 0) return parsed;
  }

  try {
    const row = await storage.getAppSetting(DB_KEY);
    if (row?.valueJson && Array.isArray(row.valueJson)) {
      const saved = (row.valueJson as string[]).filter((id): id is SttProviderId =>
        ALL_STT_PROVIDERS.includes(id as SttProviderId),
      );
      if (saved.length > 0) return saved;
    }
  } catch {
    /* best-effort */
  }

  return [...DEFAULT_STT_CHAIN];
}

/** Persiste la chain nel DB. Passa array vuoto per ripristinare il default. */
export async function setSttProviderChain(chain: SttProviderId[]): Promise<void> {
  const valid = chain.filter((id) => ALL_STT_PROVIDERS.includes(id));
  await storage.upsertAppSetting(DB_KEY, undefined, valid.length > 0 ? valid : DEFAULT_STT_CHAIN);
}

export interface SttProviderStatus {
  id: SttProviderId;
  label: string;
  configured: boolean;
  tokenConfigured?: boolean;
  inChain: boolean;
  position: number | null;
  envKey: string | null;
}

/** Snapshot dello stato di ciascun provider + posizione nella chain attiva. */
export async function getSttProviderStatusList(): Promise<{
  statuses: SttProviderStatus[];
  chain: SttProviderId[];
  envOverride: string | null;
}> {
  const chain = await getEffectiveSttChain();
  const envOverride = process.env.STT_PROVIDERS ?? null;

  const homeConfigured = Boolean(process.env.WHISPER_URL);
  const groqConfigured = Boolean(process.env.GROQ_API_KEY);
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);

  const statuses: SttProviderStatus[] = [
    {
      id: "home",
      label: "ThinkCentre (Whisper)",
      configured: homeConfigured,
      tokenConfigured: Boolean(process.env.WHISPER_TOKEN),
      inChain: chain.includes("home"),
      position: chain.includes("home") ? chain.indexOf("home") + 1 : null,
      envKey: "WHISPER_URL",
    },
    {
      id: "groq",
      label: "Groq (whisper-large-v3-turbo)",
      configured: groqConfigured,
      inChain: chain.includes("groq"),
      position: chain.includes("groq") ? chain.indexOf("groq") + 1 : null,
      envKey: "GROQ_API_KEY",
    },
    {
      id: "openai",
      label: "OpenAI (whisper-1)",
      configured: openaiConfigured,
      inChain: chain.includes("openai"),
      position: chain.includes("openai") ? chain.indexOf("openai") + 1 : null,
      envKey: "OPENAI_API_KEY",
    },
  ];

  return {
    statuses,
    chain,
    envOverride: envOverride && envOverride !== "auto" ? envOverride : null,
  };
}
