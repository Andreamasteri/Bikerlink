import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type AppLanguage, setAppLanguage, getAppLanguage } from "@/lib/i18n";

const STORAGE_KEY = "@bikerlink_language";

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  renderKey: number;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "it",
  setLanguage: () => {},
  renderKey: 0,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(getAppLanguage());
  const [renderKey, setRenderKey] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && (stored === "it" || stored === "en" || stored === "de" || stored === "es" || stored === "fr")) {
        setAppLanguage(stored as AppLanguage);
        setLanguageState(stored as AppLanguage);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const setLanguage = useCallback((lang: AppLanguage) => {
    if (lang === getAppLanguage()) return;
    setAppLanguage(lang);
    setLanguageState(lang);
    setRenderKey((k) => k + 1);
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {});
  }, []);

  if (!loaded) return null;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, renderKey }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
