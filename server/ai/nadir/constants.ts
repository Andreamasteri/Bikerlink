/**
 * Nadir — motore di ricerca semantica (Task #75).
 *
 * Nadir NON è una persona che chatta: è un MOTORE DI RICERCA. Trasforma una
 * domanda in un embedding e restituisce i frammenti più simili da tre sorgenti:
 *   • un manuale a testo libero scritto dagli admin (modificabile senza deploy),
 *   • una finestra recente di turni di conversazione AI,
 *   • una finestra recente di testo scritto dagli utenti (commenti hazard).
 *
 * ── DIVERGENZA ARCHITETTURALE DAL REPO GEMELLO (BikerBlog) ──────────────────
 * In BikerBlog, Nadir gira come SERVIZIO STANDALONE sul ThinkCentre con un
 * modello Ollama dedicato (`all-minilm`). Qui NON lo replichiamo: riusiamo la
 * pipeline di embedding locale + lo store pgvector/HNSW già esistente
 * (`server/embeddings/`), la stessa usata dal matching. Stesso risultato di
 * ricerca semantica, ZERO nuova dipendenza infrastrutturale sul TC, e si
 * incastra nel pattern esistente di BikerLink. Questa NON è una lacuna: è una
 * scelta deliberata. Non trasformarla in un servizio TC senza motivo.
 *
 * Nadir è ADDITIVO: usa i propri `entityType` distinti nello store condiviso e
 * non tocca in alcun modo come il matching (Bio/Music/Telemetry affinity) usa
 * lo stesso store.
 */

// ── Prefisso di log/identità ──────────────────────────────────────────────────
// Ogni riga di log e ogni campo di stato di Nadir porta questo prefisso, così la
// sua attività non viene MAI confusa con l'uso generico degli embedding nello
// stesso store (matching, bio, ecc.).
export const NADIR_LOG_PREFIX = "[Nadir]";

// ── entityType distinti nello store condiviso ─────────────────────────────────
// La colonna `entity_type` di `embeddings` è testo libero: questi valori sono
// esclusivi di Nadir e non collidono con quelli del matching.
export const NADIR_MANUAL_ENTITY_TYPE = "nadir_manual";
export const NADIR_CONVERSATION_ENTITY_TYPE = "nadir_conversation";
export const NADIR_COMMENT_ENTITY_TYPE = "nadir_comment";

/** Tutti gli entityType di Nadir (per query di conteggio/ricerca). */
export const NADIR_ENTITY_TYPES = [
  NADIR_MANUAL_ENTITY_TYPE,
  NADIR_CONVERSATION_ENTITY_TYPE,
  NADIR_COMMENT_ENTITY_TYPE,
] as const;

/** Campo unico usato da tutte le righe Nadir nello store embeddings. */
export const NADIR_FIELD = "content";

/** Origine leggibile di un frammento, esposta ad agenti e admin. */
export type NadirOrigin = "manual" | "conversation" | "comment";

export function entityTypeToOrigin(entityType: string): NadirOrigin | null {
  switch (entityType) {
    case NADIR_MANUAL_ENTITY_TYPE:
      return "manual";
    case NADIR_CONVERSATION_ENTITY_TYPE:
      return "conversation";
    case NADIR_COMMENT_ENTITY_TYPE:
      return "comment";
    default:
      return null;
  }
}

export function originToEntityType(origin: NadirOrigin): string {
  switch (origin) {
    case "manual":
      return NADIR_MANUAL_ENTITY_TYPE;
    case "conversation":
      return NADIR_CONVERSATION_ENTITY_TYPE;
    case "comment":
      return NADIR_COMMENT_ENTITY_TYPE;
  }
}

// ── Chiavi AppSetting ─────────────────────────────────────────────────────────
// Il manuale e lo stato di Nadir vivono in AppSettings (persistiti, NON file
// git), così un admin può modificarli senza redeploy.
export const NADIR_MANUAL_KEY = "nadir_manual_text"; // value: testo libero
export const NADIR_FRAGMENTS_KEY = "nadir_fragments"; // valueJson: manifest testo
export const NADIR_INDEX_STATUS_KEY = "nadir_index_status"; // valueJson
export const NADIR_SEARCH_HEALTH_KEY = "nadir_search_health"; // valueJson

// ── Finestre e chunking ───────────────────────────────────────────────────────
// Finestre LIMITATE: l'indice Nadir resta contenuto e prevedibile (il job
// notturno pota ciò che esce dalla finestra).
export const MANUAL_CHUNK_SIZE = 600; // caratteri per chunk del manuale
export const MANUAL_MAX_CHUNKS = 80; // tetto di sicurezza sui chunk del manuale
export const CONVERSATION_WINDOW = 200; // ultimi N turni di conversazione AI
export const COMMENT_WINDOW = 200; // ultimi N commenti hazard
export const MIN_FRAGMENT_CHARS = 12; // ignora frammenti troppo corti/rumore

// ── Gating per intento (cue di richiamo semantico) ────────────────────────────
// `search_manual` NON è mai un default silenzioso: si attiva SOLO quando il
// messaggio contiene un cue esplicito di richiamo semantico. Le frasi sono
// quelle definite nel piano del Task #75.
export const SEARCH_MANUAL_RE =
  /per\s+significato|\bmanuale\b|cosa\s+ti\s+avevo\s+detto|ne\s+avevamo\s+gi[àa]\s+parlato|come\s+avevamo\s+detto|knowledge\s*base|base\s+di\s+conoscenza/i;
