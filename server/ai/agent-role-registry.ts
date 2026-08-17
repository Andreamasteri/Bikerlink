/**
 * Functional AI role registry for the inactive AI-Hub wiring.
 *
 * This registry describes authority and capability routing only. It does not
 * replace the legacy direct-path model defaults or claim a runtime GPU/model
 * assignment. Runtime discovery remains owned by AI-Hub.
 */

export type WiringAgent = "bowie" | "horus" | "ares" | "nadir" | "quebracho" | "qq";

export type WiringCapability =
  | "chat"
  | "route"
  | "matching"
  | "diagnostics_review"
  | "orchestration"
  | "audio.create_soundtrack"
  | "indexing.embeddings"
  | "code_review";

export interface AgentRole {
  displayName: string;
  role: string;
  capabilities: readonly WiringCapability[];
  authority: string;
  aliases?: readonly string[];
  modeConfigRef?: string;
}

export const AI_AGENT_ROLE_REGISTRY: Record<WiringAgent, AgentRole> = {
  bowie: {
    displayName: "Bowie",
    role: "chat_and_invocation",
    capabilities: ["chat"],
    authority: "conversation_entrypoint",
  },
  horus: {
    displayName: "Horus",
    role: "routing_only",
    capabilities: ["route"],
    authority: "route_selection",
  },
  ares: {
    displayName: "Ares",
    role: "matching_diagnostics_review_orchestration",
    capabilities: ["matching", "diagnostics_review", "orchestration"],
    authority: "matching_and_control_decisions",
  },
  nadir: {
    displayName: "Nadir",
    role: "audio_only",
    capabilities: ["audio.create_soundtrack"],
    authority: "audio_creation",
    modeConfigRef: "nadir.audio_creation",
  },
  quebracho: {
    displayName: "Quebracho",
    role: "code_and_deep_review",
    capabilities: ["code_review"],
    authority: "repository_review",
    aliases: ["qq"],
  },
  qq: {
    displayName: "Quebracho",
    role: "compatibility_alias",
    capabilities: ["code_review"],
    authority: "repository_review",
    aliases: ["quebracho"],
  },
};

export const AI_HUB_UI_OPTIONS = [
  {
    id: "audio.create_soundtrack" as const,
    label: "Crea colonna sonora",
    agent: "nadir" as const,
    modeConfigRef: "nadir.audio_creation",
    active: false,
  },
] as const;

export function canonicalAgent(agent: WiringAgent): Exclude<WiringAgent, "qq"> {
  return agent === "qq" ? "quebracho" : agent;
}
