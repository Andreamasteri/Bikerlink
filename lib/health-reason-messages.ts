// Mappa centralizzata reason tecnici → messaggi user-friendly (Task #5147).
//
// Usata da DegradedBanner (reason da /api/health degradedReasons[]) e da
// HealthBanner (reason da health arbiter via auth-context healthReason).
//
// Il match è per sottostringa (case-insensitive) sul join dei reason tecnici.
// L'ordine definisce la priorità quando più match avvengono contemporaneamente.
// I reason di sola manutenzione (vacuum, log-retention, snapshot, quota-reset,
// ota-*, ecc.) NON sono in mappa: per quelli resta il testo generico.
//
// Task #5153: ogni entry può portare tabName + featureLabel opzionali per
// mostrare shortcut "Vai alla sezione" nel modal HealthBanner.

export interface ReasonEntry {
  match: string;
  message: string;
  /** Nome del tab (route Expo Router senza prefisso) es. "ride", "match" */
  tabName?: string;
  /** Label leggibile della sezione mostrata nel bottone shortcut */
  featureLabel?: string;
}

export const REASON_MESSAGES: ReadonlyArray<ReasonEntry> = [
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
  {
    match: "weekly-curvy-score",
    message: "Il calcolo dei percorsi panoramici è temporaneamente non disponibile",
    tabName: "ride",
    featureLabel: "Pianificazione percorsi",
  },
  {
    match: "nightly-map-matching",
    message: "L'elaborazione dei tracciati GPS potrebbe essere in ritardo",
    tabName: "tracking",
    featureLabel: "Tracking GPS",
  },
  {
    match: "daily-time-profile",
    message: "Le stime sui tempi di percorrenza potrebbero essere meno precise",
    tabName: "ride",
    featureLabel: "Pianificazione percorsi",
  },
  {
    match: "match-rules-cache",
    message: "L'abbinamento tra biker potrebbe essere temporaneamente limitato",
    tabName: "match",
    featureLabel: "Abbinamento biker",
  },
  {
    match: "critical-reports-notifier",
    message: "Le notifiche delle segnalazioni potrebbero arrivare in ritardo",
  },
  {
    match: "ai-moderation",
    message: "La moderazione automatica dei contenuti è temporaneamente limitata",
  },
];

export const GENERIC_MESSAGE_DEGRADED = "Alcune funzioni potrebbero essere temporaneamente limitate";
export const GENERIC_MESSAGE_BROKEN   = "Alcune funzioni potrebbero non rispondere. Stiamo lavorando per ripristinarle.";
export const GENERIC_MESSAGE_SLOW     = "Alcune funzioni potrebbero essere più lente del solito.";

export interface ReasonResult {
  message: string;
  tabName?: string;
  featureLabel?: string;
}

// Traduce i reason tecnici in messaggi comprensibili con eventuale shortcut
// di navigazione. Restituisce i risultati mappati (in ordine di priorità,
// deduplicati per messaggio) oppure il fallback se nessun reason è riconosciuto.
export function reasonsToMessages(
  reasons: string[] | string | undefined,
  fallback: string = GENERIC_MESSAGE_DEGRADED
): ReasonResult[] {
  if (!reasons || (Array.isArray(reasons) && reasons.length === 0)) {
    return [{ message: fallback }];
  }
  const haystack = (Array.isArray(reasons) ? reasons.join(" ") : reasons).toLowerCase();
  const matched: ReasonResult[] = [];
  const seenMessages = new Set<string>();
  for (const entry of REASON_MESSAGES) {
    if (haystack.includes(entry.match.toLowerCase()) && !seenMessages.has(entry.message)) {
      seenMessages.add(entry.message);
      matched.push({
        message: entry.message,
        tabName: entry.tabName,
        featureLabel: entry.featureLabel,
      });
    }
  }
  return matched.length > 0 ? matched : [{ message: fallback }];
}
