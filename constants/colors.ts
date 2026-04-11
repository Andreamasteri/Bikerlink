export interface ThemeColors {
  primary: string;
  accent: string;
  accentRed: string;
  maleIcon: string;
  femaleIcon: string;
  coupleIcon: string;
  background: string;
  surface: string;
  surfaceLight: string;
  text: string;
  textSecondary: string;
  textMuted?: string;
  card?: string;
  border: string;
  success: string;
  warning: string;
  error: string;
  syneco: string;
  light: {
    text: string;
    background: string;
    tint: string;
    tabIconDefault: string;
    tabIconSelected: string;
  };
}

export type ThemeName = "attuale" | "asfalto" | "velocita" | "rotta";

export const THEMES: Record<ThemeName, ThemeColors> = {
  attuale: {
    primary: "#1A1A1A",
    accent: "#FF6600",
    accentRed: "#E63946",
    maleIcon: "#4A90D9",
    femaleIcon: "#E91E8C",
    coupleIcon: "#FF8C00",
    background: "#0D0D0D",
    surface: "#1E1E1E",
    surfaceLight: "#2A2A2A",
    text: "#FFFFFF",
    textSecondary: "#AAAAAA",
    border: "#333333",
    success: "#4CAF50",
    warning: "#FF9800",
    error: "#F44336",
    syneco: "#2E7D32",
    light: {
      text: "#FFFFFF",
      background: "#0D0D0D",
      tint: "#FF6600",
      tabIconDefault: "#666666",
      tabIconSelected: "#FF6600",
    },
  },
  asfalto: {
    primary: "#1C1410",
    accent: "#D4691E",
    accentRed: "#C0392B",
    maleIcon: "#5B8FBA",
    femaleIcon: "#D4669A",
    coupleIcon: "#D4691E",
    background: "#F5F0E8",
    surface: "#EDE5D8",
    surfaceLight: "#E0D5C4",
    text: "#1C1410",
    textSecondary: "#7A6A5A",
    border: "#C8B89A",
    success: "#4CAF50",
    warning: "#E07B30",
    error: "#C0392B",
    syneco: "#2E7D32",
    light: {
      text: "#1C1410",
      background: "#F5F0E8",
      tint: "#D4691E",
      tabIconDefault: "#9A8A7A",
      tabIconSelected: "#D4691E",
    },
  },
  velocita: {
    primary: "#0A0A0F",
    accent: "#FF6B00",
    accentRed: "#FF2244",
    maleIcon: "#4A90D9",
    femaleIcon: "#FF2288",
    coupleIcon: "#FF6B00",
    background: "#0D0E1A",
    surface: "#151726",
    surfaceLight: "#1E2035",
    text: "#F0F4FF",
    textSecondary: "#8A90B0",
    border: "#2A2E4A",
    success: "#00E676",
    warning: "#FF6B00",
    error: "#FF2244",
    syneco: "#00C853",
    light: {
      text: "#F0F4FF",
      background: "#0D0E1A",
      tint: "#FF6B00",
      tabIconDefault: "#5A6080",
      tabIconSelected: "#FF6B00",
    },
  },
  rotta: {
    primary: "#2D2D2D",
    accent: "#C41230",
    accentRed: "#C41230",
    maleIcon: "#5A8FA0",
    femaleIcon: "#C41260",
    coupleIcon: "#C41230",
    background: "#1A1A1A",
    surface: "#252525",
    surfaceLight: "#303030",
    text: "#F2EDE4",
    textSecondary: "#9A9590",
    border: "#3D3D3D",
    success: "#4CAF50",
    warning: "#E07B30",
    error: "#C41230",
    syneco: "#2E7D32",
    light: {
      text: "#F2EDE4",
      background: "#1A1A1A",
      tint: "#C41230",
      tabIconDefault: "#6A6560",
      tabIconSelected: "#C41230",
    },
  },
};

export const THEME_META: Record<ThemeName, { label: string; description: string }> = {
  attuale: { label: "Attuale", description: "Dark con arancio — identità corrente" },
  asfalto: { label: "Asfalto Caldo", description: "Nero caldo + arancio bruciato + crema" },
  velocita: { label: "Velocità Pura", description: "Nero elettrico + arancio neon + blu notte" },
  rotta: { label: "Rotta Libera", description: "Antracite + rosso racing + bianco sporco" },
};

const Colors: ThemeColors = THEMES.attuale;

export default Colors;
