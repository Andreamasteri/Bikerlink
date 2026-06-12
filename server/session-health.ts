const SESSION_ERROR_THRESHOLD = 5;

let consecutiveErrors = 0;
let totalErrors = 0;
let lastErrorAt: Date | null = null;
let lastAlertAt: Date | null = null;
let alertsFired = 0;

export function recordSessionError(source: string, message: string): void {
  consecutiveErrors++;
  totalErrors++;
  lastErrorAt = new Date();

  const crossed = consecutiveErrors === SESSION_ERROR_THRESHOLD;
  const repeating = consecutiveErrors > SESSION_ERROR_THRESHOLD && consecutiveErrors % SESSION_ERROR_THRESHOLD === 0;

  if (crossed || repeating) {
    lastAlertAt = new Date();
    alertsFired++;
    console.error(
      `[CRITICAL] [session-health] Il session store registra ${consecutiveErrors} errori consecutivi — ` +
      `utenti potrebbero perdere la sessione. source=${source} lastErr="${message}" ` +
      `totalErrors=${totalErrors} alertsFired=${alertsFired}`
    );
  } else {
    console.error(`[session-health] Errore consecutivo #${consecutiveErrors} (soglia=${SESSION_ERROR_THRESHOLD}) source=${source}: ${message}`);
  }
}

export function recordSessionSuccess(): void {
  if (consecutiveErrors > 0) {
    console.log(`[session-health] Connessione ripristinata dopo ${consecutiveErrors} errori consecutivi.`);
    consecutiveErrors = 0;
  }
}

export function getSessionHealthStats() {
  return {
    consecutiveErrors,
    totalErrors,
    threshold: SESSION_ERROR_THRESHOLD,
    alertsFired,
    status: consecutiveErrors >= SESSION_ERROR_THRESHOLD ? "critical" : consecutiveErrors > 0 ? "degraded" : "ok",
    lastErrorAt: lastErrorAt?.toISOString() ?? null,
    lastAlertAt: lastAlertAt?.toISOString() ?? null,
  };
}
