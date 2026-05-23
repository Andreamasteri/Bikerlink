import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type AppLanguage, setAppLanguage, getAppLanguage, tWithLang, langToLocale } from "@/lib/i18n";

const STORAGE_KEY = "@bikerlink_language";

const VALID_LANGS: AppLanguage[] = ["it", "en", "de", "es", "fr", "el", "tr"];

/**
 * Derive an AppLanguage from the device's system locale using the built-in
 * Intl API (available in Hermes/React Native and web).
 * Returns null if no supported language is detected.
 */
function detectDeviceLanguage(): AppLanguage | null {
  try {
    let locales: string[] = [];
    if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
      const resolved = Intl.DateTimeFormat().resolvedOptions().locale;
      if (resolved) locales.push(resolved);
    }
    // Navigator is available on web
    if (typeof navigator !== "undefined") {
      const nav = navigator as any;
      if (Array.isArray(nav.languages)) locales.push(...nav.languages);
      else if (nav.language) locales.push(nav.language);
    }
    for (const loc of locales) {
      // Normalise: "de-DE" → "de", "fr-CH" → "fr", etc.
      const primary = loc.split("-")[0].toLowerCase() as AppLanguage;
      if (VALID_LANGS.includes(primary)) return primary;
    }
  } catch {
    // Silently ignore — Intl may not be available in all environments
  }
  return null;
}

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
    // Fallback chain: stored preference → device locale → Italian
    const deviceLang = detectDeviceLanguage();
    const defaultLang: AppLanguage = deviceLang ?? "it";

    // Safety timeout: if AsyncStorage doesn't respond within 3s, use fallback
    const timeout = setTimeout(() => {
      setAppLanguage(defaultLang);
      setLoaded(true);
    }, 3000);

    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      clearTimeout(timeout);
      const lang: AppLanguage = (stored && VALID_LANGS.includes(stored as AppLanguage))
        ? (stored as AppLanguage)
        : defaultLang;
      setAppLanguage(lang);
      setLanguageState(lang);
      setLoaded(true);
    }).catch(() => {
      clearTimeout(timeout);
      setAppLanguage(defaultLang);
      setLanguageState(defaultLang);
      setLoaded(true);
    });

    return () => clearTimeout(timeout);
  }, []);

  const setLanguage = useCallback((lang: AppLanguage) => {
    if (lang === getAppLanguage()) return;
    setAppLanguage(lang);
    setLanguageState(lang);
    setRenderKey((k) => k + 1);
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {});
  }, []);

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
