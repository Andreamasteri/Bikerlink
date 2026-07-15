/**
 * Ares Jobs — costanti condivise (Task #87).
 *
 * Ares (AI di diagnostica tecnica, modello devstral su PC fisso dedicato via
 * ARES_OLLAMA_*) ha DUE capacità long-running, entrambe on-demand:
 *   • "analysis" — analisi completa di codice + DB → proposte/migliorie.
 *   • "manual"   — generazione di un manuale testuale dell'intera app,
 *                  salvato nello storage del manuale di Nadir.
 *
 * Nessuna delle due parte da sola: nessun timer, nessuna schedulazione. Vengono
 * avviate SOLO su richiesta esplicita (pannello admin, azione admin, o richiesta
 * a Bowie in chat). Una volta avviate proseguono in autonomia fino alla fine.
 *
 * Questo file contiene SOLO costanti/tuning: nessun secret, nessuna logica.
 */

export type AresJobMode = "analysis" | "manual";

/** Chiavi AppSetting che persistono lo stato dei due job (valueJson). */
export const ARES_JOB_KEYS: Record<AresJobMode, string> = {
  analysis: "ares_job_analysis",
  manual: "ares_job_manual",
};

/** Prefisso di log così l'attività dei job Ares è sempre riconoscibile. */
export const ARES_JOB_LOG_PREFIX = "[AresJob]";

// ── Dimensionamento (throughput di Ares: modello più pesante, PC dedicato) ─────
// Ares regge un contesto più ampio di Bowie/Horus: raggruppiamo più file per
// chunk così il numero di chiamate (lente: 55–170s l'una) resta gestibile e
// l'INTERA app entra nel tetto di sicurezza. Con ~2000 file sorgente, 36 KB per
// chunk servono ~380 chunk: sotto SAFETY_MAX_CHUNKS, quindi copertura completa.
export const CHUNK_BYTE_BUDGET = 36_000; // byte di codice sorgente per chunk
export const MAX_FILE_BYTES = 12_000; // file più grandi vengono troncati (testa)
export const SAFETY_MAX_CHUNKS = 500; // tetto di sicurezza sul numero di chunk

// Timeout per chiamata ad Ares: cold-load devstral 55–170s (vedi memoria
// ares-devstral-cold-load-latency) → mai sotto 170s.
export const ARES_CALL_TIMEOUT_MS = 200_000;
export const NUM_PREDICT_ANALYSIS = 900;
export const NUM_PREDICT_MANUAL = 1_100;
export const NUM_PREDICT_SYNTHESIS = 1_400;

// Tetto sul testo accumulato in stato (protegge la dimensione dell'AppSetting).
export const MAX_ACCUM_CHARS = 320_000;
export const MAX_FINDING_CHARS = 2_400; // per singolo chunk di analisi
export const MAX_SECTION_CHARS = 2_800; // per singola sezione di manuale
// Il manuale finale salvato in Nadir (lo schema admin accetta max 200_000 char).
export const MANUAL_MAX_CHARS = 200_000;

// ── Coordinamento con l'uso interattivo di Ares ────────────────────────────────
// Prima di ogni chiamata di un chunk, il job cede la precedenza alle
// consultazioni interattive di Ares (mid-chat). Attende al massimo IDLE_WAIT_MAX
// per non restare bloccato per sempre.
export const IDLE_POLL_MS = 1_000;
export const IDLE_WAIT_MAX_MS = 5 * 60_000;

// Uno stato persistito "running" più vecchio di questo, senza un loop in-process
// vivo, è considerato interrotto (es. riavvio del processo): niente auto-ripresa.
export const STALE_RUNNING_MS = 10 * 60_000;
