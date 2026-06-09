// Task #2825 — Rilevamento condiviso dell'errore "chiave AI mancante".
// Usato ovunque il client chiami un endpoint AI per mostrare il banner
// "Funzione AI non attivata" invece di un errore generico.

export const AI_KEY_MISSING_MESSAGE = "Funzione AI non attivata — contatta l'amministratore";

// Riconosce i messaggi 503 che indicano una chiave/provider AI non configurato.
// Copre sia gli endpoint a chiave singola (GEMINI_API_KEY) sia gli endpoint con
// fallback chain (AI_PROVIDER_UNAVAILABLE / nessun provider AI configurato).
const AI_KEY_MISSING_PATTERN =
  /(GEMINI_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY|AI_PROVIDER_UNAVAILABLE|chiave AI|nessun provider AI)/i;

export function isAiKeyMissingResponse(status: number, message?: string | null): boolean {
  return status === 503 && AI_KEY_MISSING_PATTERN.test(String(message ?? ""));
}

export class AiKeyMissingError extends Error {
  code = "AI_KEY_MISSING" as const;
  constructor() {
    super(AI_KEY_MISSING_MESSAGE);
    this.name = "AiKeyMissingError";
  }
}

export function isAiKeyMissingError(err: unknown): boolean {
  return err instanceof AiKeyMissingError || (err as { code?: string })?.code === "AI_KEY_MISSING";
}
