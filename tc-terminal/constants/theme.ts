// Palette terminale TC — dark/monospace. Un solo tema (nessun switcher).
export const THEME = {
  background: "#0D0D0D",
  surface: "#1A1A1A",
  text: "#00FF41",          // verde terminale classico
  textSecondary: "#888888",
  border: "#333333",
  accent: "#00FF41",
  accentDim: "#007A20",
  error: "#FF4444",
  connected: "#00FF41",
  disconnected: "#FF4444",
  input: "#1C1C1C",
  inputText: "#FFFFFF",
} as const;

export type TerminalTheme = typeof THEME;
