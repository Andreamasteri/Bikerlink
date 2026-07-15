/**
 * Nadir — traduzione del manuale in tutte le lingue app (Task #107, esteso dal
 * Task #112).
 *
 * Logica di traduzione condivisa fra i due punti che possono cambiare il
 * manuale italiano (sorgente di verità):
 *   - Horus, a fine scansione MANUALE (server/ai/assistant/horus-scanner-finalize.ts);
 *   - un admin che modifica a mano il manuale dal pannello
 *     (server/routes/admin/nadir.ts, PUT /manual).
 *
 * In entrambi i casi il testo italiano cambia e le traduzioni esistenti restano
 * legate al vecchio sourceHash: getNadirManualForLanguage/getAllNadirManualVersions
 * già ricadono automaticamente sull'italiano per una traduzione stantia (vedi
 * manual.ts). Questo modulo fornisce il modo per RIGENERARE le traduzioni dopo
 * un cambiamento, così le lingue non restino sull'italiano più del necessario.
 */
import { callOllamaChat } from "../../lib/ollama-client";
import { HORUS_THINK_TAG_CONTRACT } from "../assistant/codebase-inventory";
import {
  getNadirManual,
  saveNadirManualTranslations,
  hashManualText,
  type NadirManualTranslations,
} from "./manual";
import { reindexNadir } from "./reindex";
import { NADIR_LOG_PREFIX } from "./constants";
import { TRANSLATABLE_APP_LANGUAGES, APP_LANGUAGE_NAMES, type AppLanguageCode } from "@shared/languages";

// `persona: "horus"` sceglie SOLO l'endpoint, NON il modello: senza `model`
// esplicito ricadrebbe su BOWIE_OLLAMA_MODEL. La traduzione del manuale deve
// girare sul modello di Horus (qwen3:4b), come nella scansione MANUALE.
const HORUS_MODEL_ID = process.env.HORUS_OLLAMA_MODEL?.trim() || "qwen3:4b";

// Verificato: il manuale intero supera comodamente la finestra di generazione
// di un solo turno. Si traduce un BLOCCO alla volta (spezzato sui titoli "## ",
// stesso confine usato per assemblare il manuale in horus-scanner-finalize.ts).
const TRANSLATE_NUM_PREDICT = 4000;

/** qwen3 può lasciare un `</think>` orfano anche con think:false. */
function stripThink(text: string): string {
  if (!text) return "";
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const orphan = out.lastIndexOf("</think>");
  if (orphan !== -1) out = out.slice(orphan + "</think>".length);
  return out.trim();
}

async function translateManualBlock(block: string, langName: string): Promise<string | null> {
  const prompt = `Sei un traduttore tecnico. Traduci FEDELMENTE in ${langName} il testo qui sotto, che è un frammento del manuale tecnico dell'app BikerLink scritto per istruire agenti AI. Mantieni ESATTAMENTE la struttura Markdown (titoli "##", paragrafi, elenchi), non aggiungere né omettere contenuto, non aggiungere commenti tuoi, non tradurre nomi propri di prodotto (es. "BikerLink", "Horus", "Bowie", "Nadir"). Restituisci SOLO il testo tradotto, nient'altro.

TESTO ORIGINALE (italiano):
${block}

TRADUZIONE (${langName}):`;
  const raw = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    model: HORUS_MODEL_ID,
    system: HORUS_THINK_TAG_CONTRACT,
    temperature: 0.2,
    numPredict: TRANSLATE_NUM_PREDICT,
  });
  const clean = stripThink(raw ?? "").trim();
  return clean.length > 0 ? clean : null;
}

/**
 * Traduce l'intero manuale (italiano) in `lang`, blocco per blocco. Ritorna
 * null se NESSUN blocco è stato tradotto con successo (mai una traduzione
 * vuota/parziale silenziosa: il chiamante ricade sull'italiano per quella lingua).
 */
export async function translateManualToLanguage(
  manual: string,
  lang: AppLanguageCode,
): Promise<string | null> {
  const langName = APP_LANGUAGE_NAMES[lang];
  const blocks = manual.split(/\n(?=## )/).filter((b) => b.trim().length > 0);
  const translatedBlocks: string[] = [];
  for (const block of blocks) {
    const translated = await translateManualBlock(block, langName);
    if (translated) translatedBlocks.push(translated);
  }
  if (translatedBlocks.length === 0) return null;
  return translatedBlocks.join("\n\n");
}

// Guardia in-process: evita due rigenerazioni delle traduzioni in corsa in
// contemporanea (es. una scansione Horus + un salvataggio admin quasi simultanei),
// che sprecherebbero chiamate Ollama e potrebbero sovrascriversi a vicenda.
let retranslationInFlight = false;

/**
 * Rigenera le traduzioni del manuale ITALIANO CORRENTE in tutte le lingue app
 * e reindicizza. Best-effort per lingua: una traduzione fallita non blocca le
 * altre (quella lingua resta sull'italiano, già gestito da getNadirManualForLanguage).
 * `reason` è solo per il log (es. "admin-edit", "horus-scan").
 */
export async function retranslateManualNow(
  reason: string,
): Promise<{ translatedLangs: AppLanguageCode[]; skipped: boolean }> {
  if (retranslationInFlight) {
    console.log(
      `${NADIR_LOG_PREFIX} rigenerazione traduzioni (${reason}) saltata: un'altra è già in corso`,
    );
    return { translatedLangs: [], skipped: true };
  }
  retranslationInFlight = true;
  try {
    const manual = await getNadirManual();
    if (!manual.trim()) return { translatedLangs: [], skipped: false };

    const now = new Date().toISOString();
    const sourceHash = hashManualText(manual);
    const translations: NadirManualTranslations = {};
    for (const lang of TRANSLATABLE_APP_LANGUAGES) {
      try {
        const translated = await translateManualToLanguage(manual, lang);
        if (translated) translations[lang] = { text: translated, translatedAt: now, sourceHash };
      } catch (e) {
        console.warn(
          `${NADIR_LOG_PREFIX} traduzione ${lang} fallita (${reason}, non-fatale, fallback italiano):`,
          (e as Error).message,
        );
      }
    }
    const translatedLangs = Object.keys(translations) as AppLanguageCode[];
    if (translatedLangs.length > 0) {
      await saveNadirManualTranslations(translations);
    }
    await reindexNadir("manual").catch((e) => {
      console.warn(
        `${NADIR_LOG_PREFIX} reindicizzazione post-traduzione fallita (${reason}, non-fatale):`,
        (e as Error).message,
      );
    });
    console.log(
      `${NADIR_LOG_PREFIX} rigenerazione traduzioni (${reason}): ${translatedLangs.length}/${TRANSLATABLE_APP_LANGUAGES.length} lingue`,
    );
    return { translatedLangs, skipped: false };
  } finally {
    retranslationInFlight = false;
  }
}

/** True se una rigenerazione delle traduzioni è attualmente in corso (per lo stato admin). */
export function isRetranslationInFlight(): boolean {
  return retranslationInFlight;
}
