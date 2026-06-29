// Mappa centralizzata reason tecnici → messaggi user-friendly (Task #5147).
//
// Usata da DegradedBanner (reason da /api/health degradedReasons[]) e da
// HealthBanner (reason da health arbiter via auth-context healthReason).
//
// Il match è per sottostringa (case-insensitive) sul join dei reason tecnici.
// L'ordine definisce la priorità quando più match avvengono contemporaneamente.
// I reason di sola manutenzione (vacuum, log-retention, snapshot, quota-reset,
// ota-*, ecc.) NON sono in mappa: per quelli resta il testo generico.

export const REASON_MESSAGES: ReadonlyArray<{ match: string; message: string }> = [
  // ── Health Arbiter / watchdog ──────────────────────────────────────────────
  { match: "db ping",         message: "Il database risponde lentamente — alcune operazioni potrebbero richiedere più tempo del solito" },
  { match: "db ping lento",   message: "Il database risponde lentamente — alcune operazioni potrebbero richiedere più tempo del solito" },
  { match: "latenza api",     message: "Il server risponde più lentamente del normale — alcune richieste potrebbero impiegarci un po' di più" },
  { match: "p95_ms",          message: "Il server risponde più lentamente del normale — alcune richieste potrebbero impiegarci un po' di più" },
  { match: "api latency",     message: "Il server risponde più lentamente del normale — alcune richieste potrebbero impiegarci un po' di più" },
  { match: "latency",         message: "Il server risponde più lentamente del normale — alcune richieste potrebbero impiegarci un po' di più" },
  { match: "memory",          message: "Il server è sotto pressione di memoria — alcune funzioni potrebbero essere temporaneamente più lente" },
  { match: "cpu",             message: "Il server è sotto carico elevato — alcune funzioni potrebbero essere temporaneamente più lente" },
  { match: "queue",           message: "La coda di elaborazione è congestionata — alcune operazioni potrebbero subire ritardi" },
  { match: "timeout",         message: "Alcune operazioni stanno impiegando troppo tempo — riprova tra qualche istante" },
  { match: "connection",      message: "Problema di connessione al database — alcune funzioni potrebbero non rispondere" },
  // ── Scheduler / sottosistemi funzionali ───────────────────────────────────
  { match: "weekly-curvy-score",       message: "Il calcolo dei percorsi panoramici è temporaneamente non disponibile" },
  { match: "nightly-map-matching",     message: "L'elaborazione dei tracciati GPS potrebbe essere in ritardo" },
  { match: "daily-time-profile",       message: "Le stime sui tempi di percorrenza potrebbero essere meno precise" },
  { match: "match-rules-cache",        message: "L'abbinamento tra biker potrebbe essere temporaneamente limitato" },
  { match: "critical-reports-notifier",message: "Le notifiche delle segnalazioni potrebbero arrivare in ritardo" },
  { match: "ai-moderation",           message: "La moderazione automatica dei contenuti è temporaneamente limitata" },
];

export const GENERIC_MESSAGE_DEGRADED = "Alcune funzioni potrebbero essere temporaneamente limitate";
export const GENERIC_MESSAGE_BROKEN   = "Alcune funzioni potrebbero non rispondere. Stiamo lavorando per ripristinarle.";
export const GENERIC_MESSAGE_SLOW     = "Alcune funzioni potrebbero essere più lente del solito.";

// Traduce i reason tecnici in messaggi comprensibili. Restituisce i messaggi
// mappati (in ordine di priorità, deduplicati) oppure il fallback se nessun
// reason è riconosciuto.
export function reasonsToMessages(
  reasons: string[] | string | undefined,
  fallback: string = GENERIC_MESSAGE_DEGRADED
): string[] {
  if (!reasons || (Array.isArray(reasons) && reasons.length === 0)) return [fallback];
  const haystack = (Array.isArray(reasons) ? reasons.join(" ") : reasons).toLowerCase();
  const matched: string[] = [];
  for (const { match, message } of REASON_MESSAGES) {
    if (haystack.includes(match.toLowerCase()) && !matched.includes(message)) {
      matched.push(message);
    }
  }
  return matched.length > 0 ? matched : [fallback];
}
