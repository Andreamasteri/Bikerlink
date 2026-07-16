/**
 * Nadir — storage del manuale a testo libero (Task #75, step 1).
 *
 * Il manuale è persistito in AppSettings (chiave `nadir_manual_text`), NON in un
 * file git: un admin può leggerlo/scriverlo dal pannello senza redeploy.
 */
import { createHash } from "node:crypto";
import { storage } from "../../storage";
import {
  NADIR_LOG_PREFIX,
  NADIR_MANUAL_KEY,
  NADIR_MANUAL_PREVIOUS_KEY,
  NADIR_MANUAL_TRANSLATIONS_KEY,
} from "./constants";
import { SOURCE_APP_LANGUAGE, TRANSLATABLE_APP_LANGUAGES, type AppLanguageCode } from "@shared/languages";

/** Legge il manuale ITALIANO corrente (stringa vuota se mai scritto). Sorgente di verità. */
export async function getNadirManual(): Promise<string> {
  const row = await storage.getAppSetting(NADIR_MANUAL_KEY);
  return row?.value ?? "";
}

/**
 * Task #107 — Una traduzione del manuale, con l'hash della versione italiana
 * da cui è stata generata (rileva traduzioni stantie rispetto alla sorgente).
 */
export interface NadirManualTranslation {
  text: string;
  translatedAt: string;
  sourceHash: string;
}

export type NadirManualTranslations = Partial<Record<AppLanguageCode, NadirManualTranslation>>;

/** Hash stabile del testo del manuale italiano, usato per legare le traduzioni alla sorgente. */
export function hashManualText(text: string): string {
  return createHash("sha256").update(text ?? "").digest("hex").slice(0, 32);
}

/** Legge la mappa completa delle traduzioni (vuota se mai generate). */
export async function getNadirManualTranslations(): Promise<NadirManualTranslations> {
  const row = await storage.getAppSetting(NADIR_MANUAL_TRANSLATIONS_KEY);
  const raw = row?.valueJson;
  if (raw && typeof raw === "object") return raw as NadirManualTranslations;
  return {};
}

/** Sovrascrive l'intera mappa delle traduzioni (chiamata dopo aver rigenerato il manuale). */
export async function saveNadirManualTranslations(
  translations: NadirManualTranslations,
): Promise<void> {
  await storage.upsertAppSetting(NADIR_MANUAL_TRANSLATIONS_KEY, undefined, translations);
  console.log(
    `${NADIR_LOG_PREFIX} traduzioni manuale aggiornate (${Object.keys(translations).length} lingue)`,
  );
}

/**
 * Task #113 — Aggiorna la traduzione di UNA SOLA lingua senza toccare le altre
 * (usato dal ritraduci-singola-lingua manuale dal pannello admin: legge la
 * mappa corrente, sostituisce solo `lang`, riscrive tutta la mappa).
 */
export async function saveNadirManualTranslation(
  lang: AppLanguageCode,
  entry: NadirManualTranslation,
): Promise<void> {
  const current = await getNadirManualTranslations();
  current[lang] = entry;
  await saveNadirManualTranslations(current);
}

/**
 * Legge il manuale nella lingua richiesta: italiano dalla sorgente, le altre
 * lingue dalla mappa traduzioni. Fallback all'italiano se la lingua richiesta
 * non ha (ancora) una traduzione — mai una stringa vuota se l'italiano esiste.
 */
export async function getNadirManualForLanguage(lang: AppLanguageCode): Promise<string> {
  const italian = await getNadirManual();
  if (lang === SOURCE_APP_LANGUAGE) return italian;
  const translations = await getNadirManualTranslations();
  const entry = translations[lang];
  // Task #107 fix — una traduzione è valida SOLO se il suo sourceHash combacia
  // con l'italiano ATTUALE. Se l'italiano è cambiato da quando la traduzione è
  // stata generata (nuova scansione di Horus con traduzioni parzialmente fallite,
  // o un admin che ha modificato a mano il manuale italiano — vedi
  // server/routes/admin/nadir.ts) la traduzione è considerata stantia e si ricade
  // sull'italiano, invece di servire testo tradotto disallineato dalla sorgente.
  if (entry?.text?.trim() && entry.sourceHash === hashManualText(italian)) return entry.text;
  return italian;
}

/**
 * Tutte le versioni del manuale ATTUALMENTE disponibili, chiave = lingua.
 * Usato dalla reindicizzazione Nadir per indicizzare ogni lingua separatamente.
 * Include sempre l'italiano (se non vuoto) e le traduzioni presenti, anche se
 * parziali/incomplete rispetto a APP_LANGUAGES.
 */
export async function getAllNadirManualVersions(): Promise<Partial<Record<AppLanguageCode, string>>> {
  const [italian, translations] = await Promise.all([
    getNadirManual(),
    getNadirManualTranslations(),
  ]);
  const out: Partial<Record<AppLanguageCode, string>> = {};
  if (italian.trim()) out[SOURCE_APP_LANGUAGE] = italian;
  // Task #107 fix — indicizza SOLO le traduzioni ancora allineate all'italiano
  // corrente (stesso controllo sourceHash di getNadirManualForLanguage). Una
  // traduzione stantia (italiano cambiato da quando è stata generata) non va
  // indicizzata: verrebbe servita come se fosse corretta, mentre la ricerca deve
  // ricadere sull'italiano (sempre presente sopra) per quella lingua finché non
  // viene rigenerata.
  const currentHash = hashManualText(italian);
  for (const [lang, entry] of Object.entries(translations) as [AppLanguageCode, NadirManualTranslation][]) {
    if (entry?.text?.trim() && entry.sourceHash === currentHash) out[lang] = entry.text;
  }
  return out;
}

/**
 * Task #112 — Stato per-lingua delle traduzioni rispetto all'italiano ATTUALE,
 * per il pannello admin: `current` = sourceHash combacia con l'italiano di ora,
 * `stale` = esiste ma è legata a una versione precedente (il manuale è stato
 * cambiato — es. da uno hand-edit admin — da quando è stata generata),
 * `missing` = mai tradotta in quella lingua.
 */
export type NadirManualTranslationState = "current" | "stale" | "missing";

export interface NadirManualTranslationStatusEntry {
  lang: AppLanguageCode;
  state: NadirManualTranslationState;
  translatedAt: string | null;
}

/** Stato di tutte le lingue traducibili rispetto al manuale italiano corrente. */
export async function getNadirManualTranslationStatus(): Promise<NadirManualTranslationStatusEntry[]> {
  const [italian, translations] = await Promise.all([
    getNadirManual(),
    getNadirManualTranslations(),
  ]);
  const currentHash = hashManualText(italian);
  return TRANSLATABLE_APP_LANGUAGES.map((lang) => {
    const entry = translations[lang];
    if (!entry?.text?.trim()) {
      return { lang, state: "missing" as const, translatedAt: null };
    }
    return {
      lang,
      state: (entry.sourceHash === currentHash ? "current" : "stale") as NadirManualTranslationState,
      translatedAt: entry.translatedAt,
    };
  });
}

/** Versione precedente del manuale, catturata prima dell'ultima sovrascrittura. */
export interface NadirManualBackup {
  text: string;
  savedAt: string;
}

/**
 * Task #87/#86 — Legge la versione PRECEDENTE del manuale (l'ultima archiviata
 * prima di una sovrascrittura). Ritorna null se non esiste ancora un backup.
 */
export async function getNadirManualPrevious(): Promise<NadirManualBackup | null> {
  const row = await storage.getAppSetting(NADIR_MANUAL_PREVIOUS_KEY);
  const raw = row?.valueJson;
  if (raw && typeof raw === "object" && typeof (raw as NadirManualBackup).text === "string") {
    return raw as NadirManualBackup;
  }
  return null;
}

/**
 * Task #87/#86 — Salva il manuale ARCHIVIANDO prima la versione corrente in un
 * backup dedicato (NADIR_MANUAL_PREVIOUS_KEY), così si può sempre
 * recuperare/confrontare il manuale di prima. Usato dalla rigenerazione
 * automatica del manuale (Ares e Horus): la reindicizzazione resta a carico del
 * chiamante (come saveNadirManual). Ritorna sia `previous` (il backup archiviato,
 * null se non c'era nulla) sia `backedUp` (comodo booleano equivalente).
 */
export async function saveNadirManualWithBackup(
  text: string,
): Promise<{ saved: string; previous: NadirManualBackup | null; backedUp: boolean }> {
  const current = await getNadirManual();
  let previous: NadirManualBackup | null = null;
  if (current.trim().length > 0) {
    previous = { text: current, savedAt: new Date().toISOString() };
    await storage.upsertAppSetting(NADIR_MANUAL_PREVIOUS_KEY, undefined, previous);
    console.log(
      `${NADIR_LOG_PREFIX} versione precedente del manuale archiviata (${current.length} caratteri) prima della sovrascrittura`,
    );
  }
  const saved = await saveNadirManual(text);
  return { saved, previous, backedUp: previous !== null };
}

/**
 * Salva il manuale. Ritorna il testo salvato (troncato/normalizzato). Il salvataggio
 * NON reindicizza da solo: la reindicizzazione avviene di notte o via "reindex now".
 */
export async function saveNadirManual(text: string): Promise<string> {
  const cleaned = (text ?? "").toString();
  await storage.upsertAppSetting(NADIR_MANUAL_KEY, cleaned);
  console.log(`${NADIR_LOG_PREFIX} manuale aggiornato (${cleaned.length} caratteri)`);
  return cleaned;
}

/**
 * Spezza il manuale in chunk indicizzabili. Divide prima sui doppi ritorni a capo
 * (paragrafi), poi taglia i paragrafi troppo lunghi a `MANUAL_CHUNK_SIZE` caratteri.
 * Deterministico: l'indice `i` del chunk è stabile finché il testo non cambia.
 *
 * Task #195 — quando un paragrafo supera chunkSize (es. una sezione Dizionario
 * dell'Interfaccia con molti bottoni), lo split preferisce:
 *   1. Confini \n### (sottosezione interna), così ogni blocco schermata resta integro;
 *   2. L'ultimo \n prima del limite, per non tagliare a metà una riga;
 *   3. Hard byte cut come ultima risorsa (paragrafi senza newline).
 */
export function chunkManual(
  text: string,
  chunkSize: number,
  maxChunks: number,
): string[] {
  const normalized = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= chunkSize) {
      chunks.push(para);
    } else {
      // Taglia il paragrafo troppo lungo rispettando i confini di riga e sezione.
      let start = 0;
      while (start < para.length) {
        const remaining = para.slice(start);
        if (remaining.length <= chunkSize) {
          const trimmed = remaining.trim();
          if (trimmed) chunks.push(trimmed);
          break;
        }
        const window = para.slice(start, start + chunkSize);
        // 1) Preferisci l'ultimo \n### prima del limite (confine di sotto-sezione).
        const sectionIdx = window.lastIndexOf("\n### ");
        if (sectionIdx > 0) {
          const trimmed = window.slice(0, sectionIdx).trim();
          if (trimmed) chunks.push(trimmed);
          start += sectionIdx + 1; // salta il \n, la prossima slice parte da ###
          if (chunks.length >= maxChunks) break;
          continue;
        }
        // 2) Fallback: ultimo \n prima del limite (non taglia a metà riga).
        const newlineIdx = window.lastIndexOf("\n");
        if (newlineIdx > 0) {
          const trimmed = window.slice(0, newlineIdx).trim();
          if (trimmed) chunks.push(trimmed);
          start += newlineIdx + 1;
          if (chunks.length >= maxChunks) break;
          continue;
        }
        // 3) Ultima risorsa: hard byte cut (paragrafo senza newline).
        const trimmed = window.trim();
        if (trimmed) chunks.push(trimmed);
        start += chunkSize;
        if (chunks.length >= maxChunks) break;
      }
    }
    if (chunks.length >= maxChunks) break;
  }
  return chunks.slice(0, maxChunks);
}
