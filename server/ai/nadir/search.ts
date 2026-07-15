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
  entityTypeToOrigin,
  type NadirOrigin,
} from "./constants";

export interface NadirFragment {
  origin: NadirOrigin;
  text: string;
  similarity: number;
  entityId: string;
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
  { origin: NadirOrigin; text: string; userId?: string | null }
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
  const { requesterId = null, includeAllUsers = false } = opts;
  const cleaned = (query ?? "").trim();
  if (!cleaned) return { model: getLastUsedModelTag(), fragments: [] };

  const vec = await generateEmbedding(cleaned);
  const modelTag = getLastUsedModelTag();
  const manifest = await loadFragmentManifest();

  // Una query per entityType (findSimilar filtra per un solo entityType/field).
  const perType = await Promise.all(
    NADIR_ENTITY_TYPES.map((entityType) =>
      findSimilar(entityType, NADIR_FIELD, vec, Math.max(limit, 5), 0, modelTag).catch((err) => {
        console.warn(
          `${NADIR_LOG_PREFIX} findSimilar(${entityType}) fallita:`,
          (err as Error)?.message ?? err,
        );
        return [] as Awaited<ReturnType<typeof findSimilar>>;
      }),
    ),
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
      });
    }
  }

  fragments.sort((a, b) => b.similarity - a.similarity);
  return { model: modelTag, fragments: fragments.slice(0, limit) };
}
