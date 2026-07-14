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

// Task #5197 — Le AI di BikerLink: Bowie (entry point), Horus (percorsi),
// Ares (diagnostica, solo admin). Task #4 — Quebracho (coordinatore, solo admin).
// Il server comunica CHI sta rispondendo.
export interface AssistantPersona {
  id: "bowie" | "horus" | "ares" | "quebracho";
  name: string;
}

export interface AssistantChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AssistantProposedAction[];
  createdAt: number;
  // Task #5197 — quale AI ha prodotto questo messaggio (solo per role assistant).
  persona?: AssistantPersona;
}
