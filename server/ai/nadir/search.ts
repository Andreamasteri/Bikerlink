/**
 * Nadir — ricerca semantica (Task #75, step 4 core).
 *
 * Trasforma una query in embedding e restituisce i frammenti più simili dalle tre
 * sorgenti Nadir (manuale / conversazioni / commenti), riusando la pipeline di
 * embedding locale e lo store pgvector/HNSW esistenti (vedi constants.ts per la
 * divergenza architetturale dal repo gemello).
 */
import { generateEmbedding, findSimilar } from "../../embeddings";
import { getLastUsedModelTag } from "../../embeddings/client";
import { storage } from "../../storage";
import {
  NADIR_ENTITY_TYPES,
  NADIR_FIELD,
  NADIR_FRAGMENTS_KEY,
  NADIR_LOG_PREFIX,
  NADIR_MANUAL_ENTITY_TYPE,
  entityTypeToOrigin,
  type NadirOrigin,
} from "./constants";
import { APP_LANGUAGES, SOURCE_APP_LANGUAGE, type AppLanguageCode } from "@shared/languages";

export interface NadirFragment {
  origin: NadirOrigin;
  text: string;
  similarity: number;
  entityId: string;
  /** Task #107 — lingua del frammento, presente SOLO per origin="manual" (le altre sorgenti sono testo utente non tradotto). */
  lang?: AppLanguageCode;
}

export interface NadirSearchResult {
  /** Tag del modello di embedding effettivamente usato per la query. */
  model: string;
  fragments: NadirFragment[];
}

/**
 * Manifest testo dei frammenti indicizzati: chiave `${entityType}:${entityId}`.
 * `userId` è presente SOLO per i frammenti di conversazione (privati per-utente):
 * serve a scoping l'accesso in ricerca (vedi `searchNadir`). Manuale e commenti
 * sono contenuti pubblici e non lo portano.
 */
export type NadirFragmentManifest = Record<
  string,
  { origin: NadirOrigin; text: string; userId?: string | null; lang?: AppLanguageCode }
>;

/**
 * Opzioni di accesso per `searchNadir`. I frammenti di CONVERSAZIONE sono privati:
 * si restituiscono solo al loro proprietario (`requesterId`) oppure in un contesto
 * admin/di sistema (`includeAllUsers`). Manuale e commenti sono pubblici.
 */
export interface NadirSearchOpts {
  /** Id dell'utente richiedente: sblocca SOLO le sue conversazioni. */
  requesterId?: string | null;
  /** Contesto admin/di sistema: sblocca le conversazioni di tutti gli utenti. */
  includeAllUsers?: boolean;
  /**
   * Task #107 — Lingua del richiedente: filtra i frammenti del MANUALE alla
   * versione tradotta corrispondente (conversazioni/commenti restano testo
   * utente originale, non tradotto). Default italiano. Se la lingua richiesta
   * non ha frammenti indicizzati, si ricade su qualunque lingua disponibile
   * (in pratica l'italiano, sempre presente) invece di restituire zero risultati.
   */
  language?: AppLanguageCode;
}

export async function loadFragmentManifest(): Promise<NadirFragmentManifest> {
  const row = await storage.getAppSetting(NADIR_FRAGMENTS_KEY);
  const raw = row?.valueJson;
  if (raw && typeof raw === "object") return raw as NadirFragmentManifest;
  return {};
}

/**
 * Cerca i `limit` frammenti più simili alla `query` tra tutte le sorgenti Nadir,
 * riordinati per similarità decrescente. Il testo di ciascun frammento è recuperato
 * dal manifest costruito durante la reindicizzazione.
 *
 * Filtro per modello: interroghiamo `findSimilar` con il tag del modello usato per
 * la query, così confrontiamo solo righe omogenee (la similarità coseno tra
 * provider diversi — openai vs local — non è significativa).
 */
export async function searchNadir(
  query: string,
  limit = 5,
  opts: NadirSearchOpts = {},
): Promise<NadirSearchResult> {
  const { requesterId = null, includeAllUsers = false, language = SOURCE_APP_LANGUAGE } = opts;
  const cleaned = (query ?? "").trim();
  if (!cleaned) return { model: getLastUsedModelTag(), fragments: [] };

  const vec = await generateEmbedding(cleaned);
  const modelTag = getLastUsedModelTag();
  const manifest = await loadFragmentManifest();

  // Task #107 — Il manuale è ora indicizzato in TUTTE le lingue app (stesso
  // contenuto, testi diversi): a parità di `limit` i risultati grezzi rischiano
  // di essere dominati da una sola lingua (o mescolare lingue diverse) prima del
  // filtro sotto. Sovra-peschiamo SOLO l'entityType manuale di un fattore pari al
  // numero di lingue, così dopo aver filtrato sulla lingua richiesta restano
  // comunque abbastanza candidati; le altre sorgenti (testo utente, non tradotto)
  // restano al fetch minimo di sempre.
  const perType = await Promise.all(
    NADIR_ENTITY_TYPES.map((entityType) => {
      const fetchLimit =
        entityType === NADIR_MANUAL_ENTITY_TYPE
          ? Math.max(limit, 5) * APP_LANGUAGES.length
          : Math.max(limit, 5);
      return findSimilar(entityType, NADIR_FIELD, vec, fetchLimit, 0, modelTag).catch((err) => {
        console.warn(
          `${NADIR_LOG_PREFIX} findSimilar(${entityType}) fallita:`,
          (err as Error)?.message ?? err,
        );
        return [] as Awaited<ReturnType<typeof findSimilar>>;
      });
    }),
  );

  const fragments: NadirFragment[] = [];
  for (const hits of perType) {
    for (const hit of hits) {
      const origin = entityTypeToOrigin(hit.entityType);
      if (!origin) continue;
      const entry = manifest[`${hit.entityType}:${hit.entityId}`];
      // Frammento senza testo nel manifest (riga stantia): lo saltiamo invece di
      // restituire un risultato senza contenuto.
      if (!entry?.text) continue;
      // SICUREZZA (Task #75): i frammenti di CONVERSAZIONE sono privati per-utente.
      // Vanno restituiti SOLO al proprietario (requesterId corrispondente) o in un
      // contesto admin/di sistema (includeAllUsers). Fail-closed: senza un
      // requesterId che combacia, si scarta — mai esporre le chat AI di altri utenti.
      if (origin === "conversation" && !includeAllUsers) {
        if (!requesterId || entry.userId !== requesterId) continue;
      }
      fragments.push({
        origin,
        text: entry.text,
        similarity: hit.similarity,
        entityId: hit.entityId,
        lang: entry.lang,
      });
    }
  }

  // Task #107 — Scoping per lingua SOLO sui frammenti del manuale: se esistono
  // frammenti nella lingua richiesta, teniamo solo quelli (stessa profondità di
  // risposta dell'italiano); altrimenti ricadiamo su tutte le lingue disponibili
  // per il manuale (in pratica l'italiano, sempre presente) invece di azzerare i
  // risultati. Conversazioni/commenti non sono per-lingua e restano invariati.
  const manualFragments = fragments.filter((f) => f.origin === "manual");
  const manualInLanguage = manualFragments.filter((f) => f.lang === language);
  const droppedManual = new Set(
    manualInLanguage.length > 0
      ? manualFragments.filter((f) => f.lang !== language)
      : [],
  );
  const scoped = fragments.filter((f) => !droppedManual.has(f));

  scoped.sort((a, b) => b.similarity - a.similarity);
  return { model: modelTag, fragments: scoped.slice(0, limit) };
}
