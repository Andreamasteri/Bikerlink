/**
 * Task #13 — helper condiviso per riconoscere violazioni di vincolo UNIQUE a
 * livello Postgres (SQLSTATE 23505) e distinguerle in base al nome del
 * vincolo/indice coinvolto, così le route possono restituire un messaggio
 * applicativo mirato ("nickname già in uso" ecc.) invece di un generico 500.
 *
 * Serve da rete di sicurezza per le race condition (due richieste concorrenti
 * che superano entrambe il check "esiste già?" prima dell'INSERT): il check
 * applicativo pre-insert resta la UX primaria, questo helper copre il caso in
 * cui il DB arriva a rifiutare comunque l'INSERT.
 */

interface PgUniqueViolationError {
  code?: string;
  constraint?: string;
}

export function isUniqueViolation(error: unknown, constraintName?: string): boolean {
  const pgError = error as PgUniqueViolationError | null | undefined;
  if (!pgError || pgError.code !== "23505") return false;
  if (!constraintName) return true;
  return pgError.constraint === constraintName;
}
