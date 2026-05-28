// Task #2698 — Tipi condivisi client per AI Assistant utente.
export type AssistantActionId = string;

export interface AssistantPlatformConfig {
  enabled: boolean;
  modes: { fab: boolean; selective: boolean; onboarding: boolean };
  actions: Record<string, boolean>;
  proactive: Record<string, boolean>;
  customFaqKeys: string[];
}

export interface AssistantKnowledgeEntry {
  id: string;
  question: string;
  answer: string;
}

export interface AssistantConfigResponse {
  platform: "android" | "ios";
  config: AssistantPlatformConfig;
  knowledge: AssistantKnowledgeEntry[];
}

export interface AssistantPrefs {
  disabled?: boolean;
  proactiveDisabled?: boolean;
  onboardingDisabled?: boolean;
  updatedAt?: string;
}

export interface AssistantProposedAction {
  actionId: string;
  params: unknown;
  confirmKey: string;
}

export interface AssistantChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AssistantProposedAction[];
  createdAt: number;
}
