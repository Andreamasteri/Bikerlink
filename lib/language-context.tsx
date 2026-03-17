import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type AppLanguage, setAppLanguage, getAppLanguage, tWithLang, langToLocale } from "@/lib/i18n";

const STORAGE_KEY = "@bikerlink_language";

const VALID_LANGS: AppLanguage[] = ["it", "en", "de", "es", "fr"];

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
      const lang: AppLanguage = (stored && VALID_LANGS.includes(stored as AppLanguage))
        ? (stored as AppLanguage)
        : "it";
      setAppLanguage(lang);
      setLanguageState(lang);
      setLoaded(true);
    }).catch(() => {
      setAppLanguage("it");
      setLoaded(true);
    });
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

export function useT() {
  const { language } = useContext(LanguageContext);
  return useMemo(() => (key: string) => tWithLang(key, language), [language]);
}

export function useLocale() {
  const { language } = useContext(LanguageContext);
  return useMemo(() => langToLocale(language), [language]);
}
