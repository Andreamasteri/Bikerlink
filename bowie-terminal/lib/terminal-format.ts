import type { PersonaId } from "../constants/theme";

// Messaggio di benvenuto fisso (hardcoded, non generato dall'AI).
export const WELCOME = `Son nato nel fuoco
Son cresciuto giocando con l'acqua

Davanti a me si son prostrati
Dei, Sovrani, Principi e servi

M'ha accarezzato il vento.
Parlami, sono qui per te.`;

export const PERSONA_NAMES: Record<PersonaId, string> = {
  bowie: "Bowie",
  horus: "Horus",
  ares: "Ares",
};

const IMG_URL_REGEX = /https?:\/\/\S+?\.(?:png|jpe?g|webp|gif)/gi;

export function extractImageUrls(text: string): string[] {
  return text.match(IMG_URL_REGEX) ?? [];
}

export interface Line {
  id: string;
  kind: "user" | "ai" | "system";
  persona?: PersonaId;
  text: string;
  // Task #5327 — immagine allegata dall'utente (uri locale del picker).
  imageUri?: string;
}
