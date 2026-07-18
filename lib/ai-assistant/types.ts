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

// Task #5197 — Le AI di BikerLink: Bowie (entry point), Horus (percorsi +
// coordinatore job AI in background), Ares (diagnostica, solo admin).
// Quebracho rimosso (Task #591 — unificato in Horus). Il server comunica CHI sta rispondendo.
export interface AssistantPersona {
  id: "bowie" | "horus" | "ares";
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
  // Task #44 — true quando questo messaggio è terminato in un errore
  // TRANSITORIO (server/rete): la UI offre "Riprova" per rimandare la stessa
  // richiesta (recuperabile dalla reply-cache se il server aveva già finito).
  // Assente/false = nessun errore, oppure errore permanente (nessun "Riprova").
  errorRecoverable?: boolean;
  // Task #141 — true quando il modello sta ragionando (evento SSE "thinking")
  // ma non ha ancora emesso testo: la UI mostra "sta pensando…" invece del
  // generico "sta scrivendo…". qwen3 (Horus/Bowie) ragiona ~45–60s prima del
  // primo token, quindi questo indicatore dà feedback immediato all'utente.
  thinking?: boolean;
}
