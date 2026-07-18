// Task #8 — Roster client delle AI di BikerLink (lato UI). Fonte di verità è il
// server (endpoint roster introdotto da #4: quali agenti sono realmente
// configurati/raggiungibili). Questo modulo fornisce SOLO il fallback statico
// noto usato quando l'endpoint non è ancora disponibile o non risponde, così la
// UI degrada con grazia senza mai crashare. Nessun contratto server è definito
// qui — vedi hooks/useAssistantRoster.ts per il consumo.
import type { AssistantPersona } from "./types";

export interface AssistantRosterEntry {
  id: AssistantPersona["id"];
  name: string;
  /** true se raggiungibile solo dagli amministratori. */
  adminOnly: boolean;
}

// Elenco noto (specchio di server/ai/assistant/roster.ts): usato SOLO come
// degradazione quando il roster server non è disponibile.
// Quebracho rimosso (Task #591 — unificato in Horus, che assorbe anche il
// ruolo di coordinatore dei job AI in background).
export const KNOWN_ASSISTANT_PERSONAS: AssistantRosterEntry[] = [
  { id: "bowie", name: "Bowie", adminOnly: false },
  { id: "horus", name: "Horus", adminOnly: false },
  { id: "ares", name: "Ares", adminOnly: true },
];

/** Nome canonico di una persona dal roster, con fallback all'elenco noto. */
export function rosterPersonaName(
  roster: AssistantRosterEntry[],
  id: AssistantPersona["id"],
  fallbackName?: string,
): string {
  const entry = roster.find((p) => p.id === id) ?? KNOWN_ASSISTANT_PERSONAS.find((p) => p.id === id);
  return entry?.name ?? fallbackName ?? "Bowie";
}
