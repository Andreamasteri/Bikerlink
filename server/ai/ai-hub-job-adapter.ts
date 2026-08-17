/**
 * Inactive BikerLink -> AI-Hub adapter.
 *
 * With AI_HUB_WIRING_ENABLED unset/false this module performs no network
 * request and returns a controlled disabled result. Existing direct routes
 * remain the active path until an explicit rollout changes the flag.
 */

import {
  AI_HUB_JOB_SCHEMA_VERSION,
  DEFAULT_AI_HUB_RETRY,
  isAiHubWiringEnabled,
  type AiHubJobEnvelope,
} from "./ai-hub-contract";
import { canonicalAgent, type WiringAgent, type WiringCapability } from "./agent-role-registry";

export interface AiHubSubmitResult {
  ok: boolean;
  status: "disabled" | "submitted" | "error";
  jobId?: string;
  error?: string;
}

const CONTROL_URL_ENV = "AI_HUB_CONTROL_URL";
const BEARER_TOKEN_ENV = "AI_HUB_BEARER_TOKEN";

const ALLOWED_TARGETS: Readonly<Record<WiringCapability, WiringAgent>> = {
  chat: "bowie",
  route: "horus",
  matching: "ares",
  diagnostics_review: "ares",
  orchestration: "ares",
  "audio.create_soundtrack": "nadir",
  code_review: "quebracho",
};

function isAllowedTarget(agent: WiringAgent, capability: WiringCapability): boolean {
  return canonicalAgent(agent) === canonicalAgent(ALLOWED_TARGETS[capability]);
}

export async function submitAiHubJob(
  request: Omit<AiHubJobEnvelope, "schema_version" | "source_app" | "retry" | "archive"> & {
    retry?: AiHubJobEnvelope["retry"];
    archive?: AiHubJobEnvelope["archive"];
  },
): Promise<AiHubSubmitResult> {
  if (!isAiHubWiringEnabled()) {
    return { ok: false, status: "disabled", error: "ai_hub_wiring_disabled" };
  }

  const agent = canonicalAgent(request.requested_agent);
  if (request.capability === "indexing.embeddings") {
    return { ok: false, status: "error", error: "indexing_service_is_separate" };
  }
  if (!isAllowedTarget(agent, request.capability)) {
    return { ok: false, status: "error", error: "capability_agent_mismatch" };
  }

  const baseUrl = process.env[CONTROL_URL_ENV]?.trim().replace(/\/+$/, "");
  const token = process.env[BEARER_TOKEN_ENV]?.trim();
  if (!baseUrl || !token) {
    return { ok: false, status: "error", error: "ai_hub_control_credentials_missing" };
  }

  const envelope: AiHubJobEnvelope = {
    schema_version: AI_HUB_JOB_SCHEMA_VERSION,
    source_app: "bikerlink",
    retry: request.retry ?? DEFAULT_AI_HUB_RETRY,
    archive: request.archive ?? { required: true, mode: "ai_hub_archive" },
    ...request,
    requested_agent: agent,
  };

  try {
    const response = await fetch(baseUrl + "/v1/jobs", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        "Idempotency-Key": envelope.idempotency_key,
      },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return { ok: false, status: "error", error: "ai_hub_http_" + response.status };
    }
    const body = (await response.json()) as { job_id?: string };
    return body.job_id
      ? { ok: true, status: "submitted", jobId: body.job_id }
      : { ok: false, status: "error", error: "ai_hub_job_id_missing" };
  } catch {
    // No fallback is intentional: TC unavailability is a controlled error.
    return { ok: false, status: "error", error: "ai_hub_unavailable" };
  }
}
