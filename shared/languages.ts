/**
 * Task #107 — Elenco canonico delle lingue supportate dall'app, condiviso tra
 * client (lib/i18n.ts, lib/language-context.tsx) e server (traduzione del
 * manuale di Horus + indicizzazione/ricerca Nadir multilingua).
 *
 * NON duplica la logica di caricamento traduzioni UI (resta in lib/i18n.ts):
 * qui vive SOLO l'elenco dei codici e i nomi nativi, riusabili senza tirarsi
 * dietro dipendenze React Native lato server.
 */
export const APP_LANGUAGES = ["it", "en", "de", "es", "fr", "el", "tr"] as const;
export type AppLanguageCode = (typeof APP_LANGUAGES)[number];

/** Lingua sorgente in cui Horus genera il manuale prima di tradurlo. */
export const SOURCE_APP_LANGUAGE: AppLanguageCode = "it";

/** Lingue che richiedono una traduzione (tutte tranne la sorgente). */
export const TRANSLATABLE_APP_LANGUAGES = APP_LANGUAGES.filter(
  (l) => l !== SOURCE_APP_LANGUAGE,
);

/** Nome nativo di ciascuna lingua, usato nel prompt di traduzione di Horus. */
export const APP_LANGUAGE_NAMES: Record<AppLanguageCode, string> = {
  it: "Italiano",
  en: "English",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  el: "Ελληνικά",
  tr: "Türkçe",
};

export function isAppLanguageCode(value: unknown): value is AppLanguageCode {
  return typeof value === "string" && (APP_LANGUAGES as readonly string[]).includes(value);
}
