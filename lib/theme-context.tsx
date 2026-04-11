import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { THEMES, type ThemeName, type ThemeColors } from "@/constants/colors";

const STORAGE_KEY = "@bikerlink_brand_theme";
const VALID_THEMES: ThemeName[] = ["attuale", "asfalto", "velocita", "rotta"];

interface ThemeContextType {
  currentTheme: ThemeName;
  colors: ThemeColors;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  currentTheme: "attuale",
  colors: THEMES.attuale.colors,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<ThemeName>("attuale");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && VALID_THEMES.includes(stored as ThemeName)) {
        setCurrentTheme(stored as ThemeName);
      }
    }).catch(() => {});
  }, []);

  const setTheme = useCallback((theme: ThemeName) => {
    setCurrentTheme(theme);
    AsyncStorage.setItem(STORAGE_KEY, theme).catch(() => {});
  }, []);

  return (
    <ThemeContext.Provider value={{ currentTheme, colors: THEMES[currentTheme].colors, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
