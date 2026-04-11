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

export const THEMES: Record<ThemeName, { label: string; description: string; colors: ThemeColors }> = {
  attuale: {
    label: "Attuale",
    description: "Dark con arancio — il classico BikerLink",
    colors: {
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
  },
  asfalto: {
    label: "Asfalto Caldo",
    description: "Nero caldo + arancio bruciato + sfondo crema",
    colors: {
      primary: "#1C1208",
      accent: "#D4691E",
      accentRed: "#C0392B",
      maleIcon: "#4A90D9",
      femaleIcon: "#E91E8C",
      coupleIcon: "#D4691E",
      background: "#100E09",
      surface: "#1F1A12",
      surfaceLight: "#2C2418",
      text: "#F5E6C8",
      textSecondary: "#A89070",
      border: "#3A3020",
      success: "#5D9E5A",
      warning: "#D4691E",
      error: "#C0392B",
      syneco: "#2E7D32",
      light: {
        text: "#F5E6C8",
        background: "#100E09",
        tint: "#D4691E",
        tabIconDefault: "#6A5840",
        tabIconSelected: "#D4691E",
      },
    },
  },
  velocita: {
    label: "Velocità Pura",
    description: "Nero elettrico + arancio neon + blu notte",
    colors: {
      primary: "#0A0A14",
      accent: "#FF6B00",
      accentRed: "#FF3060",
      maleIcon: "#1A6AFF",
      femaleIcon: "#FF3060",
      coupleIcon: "#FF6B00",
      background: "#050510",
      surface: "#0F0F20",
      surfaceLight: "#16163A",
      text: "#E8EEFF",
      textSecondary: "#7080AA",
      border: "#1E1E40",
      success: "#00C853",
      warning: "#FF6B00",
      error: "#FF3060",
      syneco: "#00875A",
      light: {
        text: "#E8EEFF",
        background: "#050510",
        tint: "#FF6B00",
        tabIconDefault: "#3A4070",
        tabIconSelected: "#FF6B00",
      },
    },
  },
  rotta: {
    label: "Rotta Libera",
    description: "Antracite + rosso racing italiano + bianco sporco",
    colors: {
      primary: "#1A1A1E",
      accent: "#C41230",
      accentRed: "#C41230",
      maleIcon: "#4A90D9",
      femaleIcon: "#C41230",
      coupleIcon: "#C41230",
      background: "#0F0F12",
      surface: "#1C1C22",
      surfaceLight: "#28282F",
      text: "#F0ECE8",
      textSecondary: "#908880",
      border: "#2E2E38",
      success: "#4CAF50",
      warning: "#E08020",
      error: "#C41230",
      syneco: "#2E7D32",
      light: {
        text: "#F0ECE8",
        background: "#0F0F12",
        tint: "#C41230",
        tabIconDefault: "#585858",
        tabIconSelected: "#C41230",
      },
    },
  },
};

const Colors = THEMES.attuale.colors;

export default Colors;
