/**
 * pool-config.ts — FONTE UNICA DI VERITÀ per tutte le costanti del pool Postgres
 * e del budget connessioni background.
 *
 * Nessun valore di pool deve essere hardcoded altrove: importare da qui.
 * assertPoolConfigInvariants() va chiamata al bootstrap del server e nei test:
 * fallisce con un errore esplicito se le costanti sono incoerenti tra loro.
 */

// ── Nomi applicazione (pg_stat_activity) ────────────────────────────────────
/** application_name del pool principale — usato per filtrare pg_stat_activity. */
export const APP_NAME = "bikerlink-app";

/** application_name del pool di monitoraggio (max:1, riservato alle diagnosi). */
export const MONITOR_APP_NAME = "bikerlink-monitor";

// ── Pool principale ──────────────────────────────────────────────────────────

/** Numero massimo di connessioni del pool principale. */
export const POOL_MAX = 10;

/**
 * Numero minimo di connessioni caldes tenute aperte tra i tick del watchdog.
 * Senza min=1 il pool era evictato completamente ogni 10s (idleTimeoutMillis)
 * → cold-start con picco di concorrenza ad ogni tick → waiting>0 sistematico.
 */
export const POOL_MIN = 1;

/**
 * Timeout idle prima di evictare una connessione non in uso (ms).
 * 10s < timeout lato Neon (Frankfurt, eu-central-1): le connessioni vengono
 * rilasciate lato client prima che il server le droppi.
 */
export const POOL_IDLE_TIMEOUT_MS = 10_000;

/**
 * Timeout massimo per stabilire una nuova connessione (ms).
 * 8s: dato sufficiente per Neon Frankfurt ad accettare connessioni durante
 * picchi di concorrenza (tick watchdog con collector in parallelo).
 */
export const POOL_CONNECTION_TIMEOUT_MS = 8_000;

/**
 * statement_timeout di default per il pool principale (ms).
 * Protegge contro query che tengono connessioni appese.
 */
export const POOL_STATEMENT_TIMEOUT_MS = 5_000;

/**
 * Timeout per sessioni idle in transaction (ms).
 * 60s > qualsiasi statement_timeout con margine; uccide transazioni dimenticate
 * che altrimenti tengono connessioni in "idle in transaction".
 */
export const POOL_IDLE_IN_TRANSACTION_TIMEOUT_MS = 60_000;

// ── Pool di monitoraggio (riservato, max:1) ──────────────────────────────────

/** Massimo connessioni del pool di monitoraggio. Mai cambiare — è per le crisi. */
export const MONITORING_POOL_MAX = 1;

/** Idle timeout del pool di monitoraggio — più generoso perché usato di rado. */
export const MONITORING_POOL_IDLE_TIMEOUT_MS = 60_000;

/** Connection timeout del pool di monitoraggio. */
export const MONITORING_POOL_CONNECTION_TIMEOUT_MS = 4_000;

/** statement_timeout del pool di monitoraggio — più lungo per query diagnostiche. */
export const MONITORING_POOL_STATEMENT_TIMEOUT_MS = 8_000;

// ── Budget job background (pool-governor) ────────────────────────────────────

/**
 * Numero massimo di connessioni che i job background possono usare in parallelo.
 * Lascia POOL_MAX - BG_DB_MAX_CONCURRENCY connessioni per il traffico utente.
 * INVARIANTE: BG_DB_MAX_CONCURRENCY < POOL_MAX (verificata da assertPoolConfigInvariants).
 */
export const BG_DB_MAX_CONCURRENCY =
  Number.parseInt(process.env.BG_DB_MAX_CONCURRENCY ?? "", 10) || 3;

/**
 * statement_timeout per connessioni bg (ms).
 * Più lungo del default del pool: i job bg possono fare query più pesanti
 * ma non possono tenerle appese indefinitamente.
 * INVARIANTE: BG_DB_STATEMENT_TIMEOUT_MS > POOL_STATEMENT_TIMEOUT_MS.
 */
export const BG_DB_STATEMENT_TIMEOUT_MS = 12_000;

/**
 * Numero massimo di job in attesa nella coda del governor.
 * Oltre questo limite i nuovi job sono rifiutati (BgDbQueueOverflowError).
 */
export const BG_DB_MAX_QUEUE =
  Number.parseInt(process.env.BG_DB_MAX_QUEUE ?? "", 10) || 64;

/**
 * Timeout massimo di attesa in coda (ms).
 * Un job che attende oltre questo limite è ormai stantio → scartato.
 */
export const BG_DB_QUEUE_TIMEOUT_MS =
  Number.parseInt(process.env.BG_DB_QUEUE_TIMEOUT_MS ?? "", 10) || 30_000;

/**
 * Numero di ping lenti consecutivi prima di attivare il kill-switch adattivo.
 * Quando il DB è lento, il governor rifiuta i job non critici per scaricarlo.
 * Neon ha latenze più alte di Postgres managed → soglia alzata a 8.
 */
export const BG_DB_SLOW_THRESHOLD =
  Number.parseInt(process.env.BG_DB_SLOW_THRESHOLD ?? "", 10) || 8;

// ── Saturazione sostenuta (backpressure gate) ────────────────────────────────

/**
 * Grace window per il gate di saturazione sostenuta (ms).
 * Un singolo istante di saturazione NON è sufficiente per emettere 503:
 * il pool deve restare saturo per almeno POOL_SATURATION_GRACE_MS continui.
 */
export const POOL_SATURATION_GRACE_MS = 500;

// ── Validazione ──────────────────────────────────────────────────────────────

/**
 * Verifica la coerenza delle costanti del pool. Lancia un errore esplicito se
 * le invarianti fondamentali non sono rispettate. Chiamare al bootstrap del
 * server (server/boot-sequence.ts o equivalente) e nei test di integrazione.
 *
 * Invarianti:
 *   1. BG_DB_MAX_CONCURRENCY < POOL_MAX — i job bg non possono saturare da soli il pool
 *   2. BG_DB_STATEMENT_TIMEOUT_MS > POOL_STATEMENT_TIMEOUT_MS — coerenza timeout
 *   3. POOL_CONNECTION_TIMEOUT_MS > 0 — timeout positivo
 *   4. POOL_MAX > 0 — pool con almeno 1 connessione
 *   5. POOL_MIN <= POOL_MAX — invariante pg.Pool
 */
export function assertPoolConfigInvariants(): void {
  const errors: string[] = [];

  if (BG_DB_MAX_CONCURRENCY >= POOL_MAX) {
    errors.push(
      `BG_DB_MAX_CONCURRENCY (${BG_DB_MAX_CONCURRENCY}) >= POOL_MAX (${POOL_MAX}): ` +
      `i job background potrebbero saturare l'intero pool e affamare il traffico utente.`,
    );
  }

  if (BG_DB_STATEMENT_TIMEOUT_MS <= POOL_STATEMENT_TIMEOUT_MS) {
    errors.push(
      `BG_DB_STATEMENT_TIMEOUT_MS (${BG_DB_STATEMENT_TIMEOUT_MS}ms) <= ` +
      `POOL_STATEMENT_TIMEOUT_MS (${POOL_STATEMENT_TIMEOUT_MS}ms): ` +
      `i timeout bg devono essere più generosi del default, non più restrittivi.`,
    );
  }

  if (POOL_CONNECTION_TIMEOUT_MS <= 0) {
    errors.push(`POOL_CONNECTION_TIMEOUT_MS (${POOL_CONNECTION_TIMEOUT_MS}) deve essere > 0.`);
  }

  if (POOL_MAX <= 0) {
    errors.push(`POOL_MAX (${POOL_MAX}) deve essere > 0.`);
  }

  if (POOL_MIN > POOL_MAX) {
    errors.push(
      `POOL_MIN (${POOL_MIN}) > POOL_MAX (${POOL_MAX}): invariante pg.Pool violata.`,
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `[pool-config] Invarianti violate — correggi le costanti in server/lib/pool-config.ts:\n` +
      errors.map((e) => `  • ${e}`).join("\n"),
    );
  }
}
