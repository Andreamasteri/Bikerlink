import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { THEMES, THEME_META, ThemeName, ThemeColors } from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const STORAGE_KEY = "@bikerlink_brand_theme";
const VALID_THEMES: ThemeName[] = ["attuale", "asfalto", "velocita", "rotta"];

interface ThemeContextType {
  currentTheme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  colors: ThemeColors;
  userSwitchingEnabled: boolean;
  adminDefaultTheme: ThemeName;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  currentTheme: "attuale",
  setTheme: () => {},
  colors: THEMES.attuale,
  userSwitchingEnabled: false,
  adminDefaultTheme: "attuale",
  isLoading: true,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentThemeState] = useState<ThemeName>("attuale");
  const [userSwitchingEnabled, setUserSwitchingEnabled] = useState(false);
  const [adminDefaultTheme, setAdminDefaultTheme] = useState<ThemeName>("attuale");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const [serverRes, stored] = await Promise.all([
          fetch(new URL("/api/settings/theme", getApiUrl()).toString()).then(r => r.json()).catch(() => null),
          AsyncStorage.getItem(STORAGE_KEY).catch(() => null),
        ]);

        const switching: boolean = serverRes?.userSwitchingEnabled === true;
        const serverDefault: ThemeName = VALID_THEMES.includes(serverRes?.defaultTheme) ? serverRes.defaultTheme : "attuale";

        setUserSwitchingEnabled(switching);
        setAdminDefaultTheme(serverDefault);

        if (switching && stored && VALID_THEMES.includes(stored as ThemeName)) {
          setCurrentThemeState(stored as ThemeName);
        } else {
          setCurrentThemeState(serverDefault);
        }
      } catch {
        setCurrentThemeState("attuale");
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const setTheme = useCallback((theme: ThemeName) => {
    setCurrentThemeState(theme);
    AsyncStorage.setItem(STORAGE_KEY, theme).catch(() => {});
  }, []);

  const contextValue = useMemo(
    () => ({
      currentTheme,
      setTheme,
      colors: THEMES[currentTheme],
      userSwitchingEnabled,
      adminDefaultTheme,
      isLoading,
    }),
    [currentTheme, setTheme, userSwitchingEnabled, adminDefaultTheme, isLoading]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { THEME_META, THEMES, VALID_THEMES };
export type { ThemeName };
