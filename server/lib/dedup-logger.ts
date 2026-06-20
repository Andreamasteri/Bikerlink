/**
 * De-dup logger per errori non-fatali ricorrenti dei cicli di background.
 *
 * Durante un blip transitorio del DB più sottosistemi falliscono insieme e, senza
 * de-dup, ognuno emette uno stack trace per ogni tick → tempesta di log. Questo
 * helper logga la PRIMA occorrenza per ogni chiave subito, poi sopprime le
 * successive dentro una finestra temporale e a fine finestra emette un riassunto
 * con il conteggio degli errori soppressi e l'ultimo messaggio.
 */

interface DedupEntry {
  suppressed: number;
  firstAt: number;
  lastMessage: string;
  timer: NodeJS.Timeout;
}

const DEFAULT_WINDOW_MS = 60_000;
const entries = new Map<string, DedupEntry>();

function flush(key: string): void {
  const e = entries.get(key);
  if (!e) return;
  entries.delete(key);
  if (e.suppressed > 0) {
    const secs = Math.max(1, Math.round((Date.now() - e.firstAt) / 1000));
    console.warn(
      `[${key}] +${e.suppressed} altri errori simili negli ultimi ${secs}s — ultimo: ${e.lastMessage}`,
    );
  }
}

function toMessage(detail: unknown): string {
  if (detail instanceof Error) return detail.message;
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  try {
    return String(detail);
  } catch {
    return "(unprintable)";
  }
}

/**
 * Logga un errore non-fatale con de-duplicazione per chiave.
 * @param key   etichetta stabile del sottosistema (es. "watchdog/signals").
 * @param message descrizione breve dell'errore.
 * @param detail errore o dato opzionale (solo il messaggio viene stampato, niente stack trace).
 * @param windowMs finestra di soppressione (default 60s).
 */
export function dedupWarn(
  key: string,
  message: string,
  detail?: unknown,
  windowMs: number = DEFAULT_WINDOW_MS,
): void {
  const detailMsg = toMessage(detail);
  const full = detailMsg ? `${message}: ${detailMsg}` : message;
  const existing = entries.get(key);
  if (existing) {
    existing.suppressed++;
    existing.lastMessage = full;
    return;
  }
  console.warn(`[${key}] ${full}`);
  const timer = setTimeout(() => flush(key), windowMs);
  timer.unref?.();
  entries.set(key, { suppressed: 0, firstAt: Date.now(), lastMessage: full, timer });
}
