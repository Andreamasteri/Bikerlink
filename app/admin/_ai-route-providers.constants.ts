// overflow di app/admin/ai-route-providers.tsx — tipi e costanti estratti
import type { MaterialCommunityIcons } from "@expo/vector-icons";

export type RouteProviderId = "ollama" | "groq" | "gemini" | "openai";

export interface ProviderStatus {
  id: RouteProviderId;
  label: string;
  configured: boolean;
  inChain: boolean;
  position: number | null;
  envKey: string | null;
}

export interface StatusResp {
  statuses: ProviderStatus[];
  chain: RouteProviderId[];
  envOverride: string | null;
}

export interface PingResult {
  ok: boolean;
  latency_ms: number;
  error?: string;
  reply?: string | null;
}

export type PingState = "idle" | "loading" | "ok" | "error";

export interface ProviderPing {
  state: PingState;
  latency_ms?: number;
  error?: string;
}

export interface ProviderStat {
  provider: string;
  count: number;
}

export const PROVIDER_ICONS: Record<RouteProviderId, keyof typeof MaterialCommunityIcons.glyphMap> = {
  ollama: "brain",
  groq: "lightning-bolt",
  gemini: "cloud-outline",
  openai: "robot-outline",
};

export const PROVIDER_COLORS: Record<RouteProviderId, string> = {
  ollama: "#FF6600",
  groq: "#7C3AED",
  gemini: "#0EA5E9",
  openai: "#10A37F",
};

export const PROVIDER_DESC: Record<RouteProviderId, string> = {
  ollama: "Self-hosted sul ThinkCentre. Gratuito e privato. Richiede OLLAMA_URL.",
  groq: "Cloud veloce (LPU hardware Groq). Free tier 1000 req/giorno. Richiede GROQ_API_KEY.",
  gemini: "Cloud (Google AI Studio). Free tier 1500 req/giorno. Richiede GEMINI_API_KEY.",
  openai: "Fallback cloud finale (OpenAI). gpt-4o-mini. Richiede OPENAI_API_KEY.",
};

export const ALL_PROVIDERS: RouteProviderId[] = ["ollama", "groq", "gemini", "openai"];
