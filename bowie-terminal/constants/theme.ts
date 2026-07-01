// Palette BikerLink replicata (l'app è standalone, non importa dal repo madre).
// I 4 temi rispecchiano constants/colors.ts di BikerLink. Il terminale colora
// i prefissi delle persona: Bowie = accent, Horus = blu navigazione, Ares = rosso.

export type ThemeName = "attuale" | "asfalto" | "velocita" | "rotta";
export type PersonaId = "bowie" | "horus" | "ares";

export interface TerminalTheme {
  background: string;
  text: string;
  textSecondary: string;
  border: string;
  bowie: string;
  horus: string;
  ares: string;
  error: string;
}

export const THEMES: Record<ThemeName, TerminalTheme> = {
  attuale: {
    background: "#0D0D0D",
    text: "#FFFFFF",
    textSecondary: "#AAAAAA",
    border: "#333333",
    bowie: "#FF6600",
    horus: "#4A90D9",
    ares: "#E63946",
    error: "#F44336",
  },
  asfalto: {
    background: "#F5F0E8",
    text: "#1C1410",
    textSecondary: "#7A6A5A",
    border: "#C8B89A",
    bowie: "#D4691E",
    horus: "#5B8FBA",
    ares: "#C0392B",
    error: "#C0392B",
  },
  velocita: {
    background: "#0D0E1A",
    text: "#F0F4FF",
    textSecondary: "#8A90B0",
    border: "#2A2E4A",
    bowie: "#FF6B00",
    horus: "#4A90D9",
    ares: "#FF2244",
    error: "#FF2244",
  },
  rotta: {
    background: "#1A1A1A",
    text: "#F2EDE4",
    textSecondary: "#9A9590",
    border: "#3D3D3D",
    bowie: "#C41230",
    horus: "#5A8FA0",
    ares: "#C41230",
    error: "#C41230",
  },
};

export const THEME_NAMES: ThemeName[] = ["attuale", "asfalto", "velocita", "rotta"];

export function isThemeName(v: string): v is ThemeName {
  return (THEME_NAMES as string[]).includes(v);
}

export const PERSONA_IDS: PersonaId[] = ["bowie", "horus", "ares"];

export function isPersonaId(v: string): v is PersonaId {
  return (PERSONA_IDS as string[]).includes(v);
}

export function personaColor(theme: TerminalTheme, persona: PersonaId): string {
  if (persona === "horus") return theme.horus;
  if (persona === "ares") return theme.ares;
  return theme.bowie;
}

export function personaLabel(persona: PersonaId): string {
  if (persona === "horus") return "HORUS";
  if (persona === "ares") return "ARES ";
  return "BOWIE";
}
