/**
 * Versioned application-side contract for inactive AI-Hub job wiring.
 *
 * The queue transport is intentionally separate from interactive chat
 * streaming. Callers must use the adapter, which refuses to submit while the
 * feature flag is off.
 */

import type { WiringAgent, WiringCapability } from "./agent-role-registry";

export const AI_HUB_JOB_SCHEMA_VERSION = 1 as const;
export const AI_HUB_WIRING_FLAG = "AI_HUB_WIRING_ENABLED";
export const AI_HUB_WIRING_DEFAULT = false;

export interface AiHubRetryPolicy {
  max_attempts: number;
  backoff_ms: number;
  retryable_errors: readonly string[];
}

export interface AiHubArchivePolicy {
  required: boolean;
  mode: "ai_hub_archive";
}

export interface AiHubJobEnvelope {
  schema_version: typeof AI_HUB_JOB_SCHEMA_VERSION;
  job_type: string;
  source_app: "bikerlink";
  request_id: string;
  correlation_id: string;
  conversation_id?: string | null;
  turn_id?: string | null;
  idempotency_key: string;
  requested_agent: WiringAgent;
  capability: WiringCapability;
  capability_label?: string | null;
  priority?: number;
  payload: Record<string, unknown>;
  retry: AiHubRetryPolicy;
  archive: AiHubArchivePolicy;
}

export const DEFAULT_AI_HUB_RETRY: AiHubRetryPolicy = {
  max_attempts: 2,
  backoff_ms: 1000,
  retryable_errors: ["worker_unavailable", "temporary_network_error", "timeout"],
};

export function isAiHubWiringEnabled(): boolean {
  return process.env[AI_HUB_WIRING_FLAG]?.trim().toLowerCase() === "true";
}

export const SOUNDTRACK_CAPABILITY = {
  id: "audio.create_soundtrack" as const,
  label: "Crea colonna sonora",
  agent: "nadir" as const,
  modeConfigRef: "nadir.audio_creation",
  active: false,
};
