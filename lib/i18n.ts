export type AppLanguage = "it" | "en" | "de" | "es" | "fr" | "el" | "tr";

let currentLanguage: AppLanguage = "it";

const cache: Partial<Record<AppLanguage, Record<string, string>>> = {};

function loadTranslations(lang: AppLanguage): Record<string, string> {
  if (cache[lang]) return cache[lang]!;
  switch (lang) {
    case "it": cache.it = require("./i18n/it").default; return cache.it!;
    case "en": cache.en = require("./i18n/en").default; return cache.en!;
    case "de": cache.de = require("./i18n/de").default; return cache.de!;
    case "es": cache.es = require("./i18n/es").default; return cache.es!;
    case "fr": cache.fr = require("./i18n/fr").default; return cache.fr!;
    case "el": cache.el = require("./i18n/el").default; return cache.el!;
    case "tr": cache.tr = require("./i18n/tr").default; return cache.tr!;
    default:   cache.it = require("./i18n/it").default; return cache.it!;
  }
}

export function setAppLanguage(lang: AppLanguage) {
  currentLanguage = lang;
  loadTranslations(lang);
}

export function getAppLanguage(): AppLanguage {
  return currentLanguage;
}

export function langToLocale(lang: AppLanguage): string {
  switch (lang) {
    case "it": return "it-IT";
    case "en": return "en-GB";
    case "de": return "de-DE";
    case "es": return "es-ES";
    case "fr": return "fr-FR";
    case "el": return "el-GR";
    case "tr": return "tr-TR";
    default:   return "it-IT";
  }
}

export function getCurrentLocale(): string {
  return langToLocale(currentLanguage);
}

export function t(key: string): string {
  const v = loadTranslations(currentLanguage)[key];
  return (v && v.trim()) ? v : (loadTranslations("it")[key] ?? key);
}

export function tWithLang(key: string, lang: AppLanguage): string {
  const v = loadTranslations(lang)[key];
  return (v && v.trim()) ? v : (loadTranslations("it")[key] ?? key);
}
