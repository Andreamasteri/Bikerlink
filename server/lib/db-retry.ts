// Helper per eseguire operazioni DB con retry automatico su errori transitori.
//
// Errori retriable: timeout di connessione, connection drop (pool sotto pressione).
// Errori NON retriable: constraint violation (23xxx), errori di sintassi (42xxx),
// data exception (22xxx) — questi indicano un problema logico, non transitorio.
//
// Strategia: max 2 tentativi aggiuntivi dopo il primo fallimento,
// backoff esponenziale 1s → 3s.

const RETRIABLE_MESSAGES = [
  "connection timeout",
  "Connection terminated",
  "Connection terminated unexpectedly",
  "ECONNRESET",
  "ETIMEDOUT",
  "connect ECONNREFUSED",
  "read ECONNRESET",
  "socket hang up",
];

// PostgreSQL SQLSTATE code prefixes che NON devono essere ritentati
const NON_RETRIABLE_PG_CODE_PREFIXES = ["22", "23", "42", "53", "57"];

function isRetriable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message ?? "";
  // Controlla il codice SQLSTATE (errori drizzle/pg espongono .code)
  const code: string | undefined = (err as unknown as Record<string, unknown>).code as string | undefined;
  if (code && NON_RETRIABLE_PG_CODE_PREFIXES.some((p) => code.startsWith(p))) {
    return false;
  }
  return RETRIABLE_MESSAGES.some((m) => msg.includes(m));
}

const BACKOFF_MS = [1_000, 3_000];

/**
 * Esegue `fn` con retry su errori di connessione DB transitori.
 *
 * @param label   Etichetta per i log (es. "[ota-rollback]")
 * @param fn      La funzione asincrona che esegue la query
 * @returns       Il valore restituito da `fn`
 * @throws        L'ultimo errore se tutti i tentativi falliscono
 */
export async function withDbRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetriable(err) || attempt === BACKOFF_MS.length) {
        throw err;
      }
      const delay = BACKOFF_MS[attempt];
      console.warn(
        `${label} DB errore transitorio (tentativo ${attempt + 1}/${BACKOFF_MS.length + 1}), retry tra ${delay}ms:`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}
