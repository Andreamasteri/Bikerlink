/**
 * crash-backoff.ts
 *
 * Anti crash-loop: persiste i timestamp dei crash recenti su /tmp e calcola un
 * backoff crescente da applicare PRIMA del process.exit(1). Senza questo, un DB
 * managed lento produce boot ripetuti ravvicinati (osservato: 4 boot in ~50min):
 * crash → restart immediato → DB ancora degradato → ricrash → loop.
 *
 * Funzionamento:
 *  - ogni crash registra `Date.now()` in un file JSON, scartando i timestamp più
 *    vecchi di CRASH_WINDOW_MS (finestra scorrevole).
 *  - il backoff cresce esponenzialmente col numero di crash recenti
 *    (base * 2^(n-1)), con cap massimo. Il primo crash isolato attende poco
 *    (base), una raffica viene progressivamente rallentata fino al cap.
 *  - il delay è applicato con un blocking sleep sincrono (Atomics.wait): siamo
 *    già in fase di crash, bloccare l'event loop prima dell'exit è sicuro e
 *    deterministico (a differenza di setTimeout, che può non scattare se l'event
 *    loop è in stato degradato durante un uncaughtException).
 *  - un boot andato a buon fine chiama resetCrashBackoff(): un crash isolato dopo
 *    un periodo sano non eredita il conteggio di una raffica passata.
 */

import fs from "fs";

const CRASH_BACKOFF_FILE = process.env.CRASH_BACKOFF_FILE || "/tmp/server-crash-backoff.json";

/** Finestra scorrevole entro cui i crash "contano" per il backoff. */
const CRASH_WINDOW_MS = Number(process.env.CRASH_WINDOW_MS) || 5 * 60_000;
/** Delay del primo crash recente. */
const CRASH_BASE_DELAY_MS = Number(process.env.CRASH_BASE_DELAY_MS) || 2_000;
/** Cap massimo del backoff: un crash-loop non resta mai "down" più di così tra i restart. */
const CRASH_MAX_DELAY_MS = Number(process.env.CRASH_MAX_DELAY_MS) || 30_000;

/**
 * Numero minimo di crash nella finestra oltre il quale consideriamo il backoff
 * "scattato più volte di fila" → sintomo di un DB managed lento al boot, da
 * segnalare proattivamente agli admin (non risolvibile lato codice, ma utile
 * saperlo per indagare).
 */
const CRASH_ALERT_THRESHOLD = Number(process.env.CRASH_ALERT_THRESHOLD) || 3;
/** Throttle dell'alert: max 1 ogni X ms, per non spammare durante un loop. */
const CRASH_ALERT_THROTTLE_MS = Number(process.env.CRASH_ALERT_THROTTLE_MS) || 15 * 60_000;
/** File che persiste il timestamp dell'ultimo alert inviato (per il throttle). */
const CRASH_ALERT_SENT_FILE = process.env.CRASH_ALERT_SENT_FILE || "/tmp/server-crash-backoff-alert.json";

function readTimestamps(): number[] {
  try {
    const raw = fs.readFileSync(CRASH_BACKOFF_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is number => typeof t === "number" && Number.isFinite(t));
    }
  } catch {
    /* file assente o corrotto → nessun crash registrato */
  }
  return [];
}

/**
 * Registra il crash corrente e restituisce il backoff (ms) da attendere prima
 * dell'exit. Da chiamare una sola volta per crash, dentro l'handler di processo.
 */
export function recordCrashAndBackoff(): number {
  const now = Date.now();
  const recent = readTimestamps().filter((t) => now - t < CRASH_WINDOW_MS);
  recent.push(now);
  try {
    fs.writeFileSync(CRASH_BACKOFF_FILE, JSON.stringify(recent), "utf8");
  } catch {
    /* siamo in crash, best-effort */
  }
  const n = recent.length;
  const backoff = CRASH_BASE_DELAY_MS * 2 ** (n - 1);
  return Math.min(CRASH_MAX_DELAY_MS, Math.max(0, backoff));
}

/**
 * Azzera il conteggio dei crash recenti. Da chiamare a boot completato: un run
 * sano "perdona" i crash precedenti così il prossimo crash isolato attende solo
 * il delay base invece di ereditare un backoff alto.
 */
export function resetCrashBackoff(): void {
  try {
    if (fs.existsSync(CRASH_BACKOFF_FILE)) fs.unlinkSync(CRASH_BACKOFF_FILE);
  } catch {
    /* non bloccare il boot per questo */
  }
  try {
    // Boot sano: azzera anche il throttle dell'alert così un nuovo loop futuro
    // segnala subito invece di ereditare l'ultimo invio.
    if (fs.existsSync(CRASH_ALERT_SENT_FILE)) fs.unlinkSync(CRASH_ALERT_SENT_FILE);
  } catch {
    /* best-effort */
  }
}

function readAlertSentAt(): number | null {
  try {
    const raw = fs.readFileSync(CRASH_ALERT_SENT_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && typeof (parsed as { sentAt?: unknown }).sentAt === "number") {
      const v = (parsed as { sentAt: number }).sentAt;
      return Number.isFinite(v) ? v : null;
    }
  } catch {
    /* assente o corrotto → nessun invio precedente */
  }
  return null;
}

function writeAlertSentAt(ts: number): void {
  try {
    fs.writeFileSync(CRASH_ALERT_SENT_FILE, JSON.stringify({ sentAt: ts }), "utf8");
  } catch {
    /* best-effort: se non riusciamo a persistere il throttle, peggio un alert in più che zero */
  }
}

export interface CrashBackoffAlertDecision {
  /** true se va emesso un alert ADESSO (soglia superata e throttle non attivo). */
  emit: boolean;
  /** numero di crash nella finestra scorrevole al momento del check. */
  crashCount: number;
  /** ampiezza della finestra in minuti (per il testo dell'alert). */
  windowMinutes: number;
  /** soglia oltre la quale scatta l'alert. */
  threshold: number;
}

/**
 * Valuta se il backoff anti crash-loop è "scattato più volte di fila" e se va
 * emesso un alert agli admin. Da chiamare a boot (quando il DB è pronto), legge
 * i timestamp dei crash recenti persistiti su /tmp: se ce ne sono ≥ soglia e non
 * abbiamo già allertato di recente (throttle), restituisce emit=true e registra
 * il timestamp di invio. NON invia nulla di per sé — l'invio (push + signal) è
 * responsabilità del chiamante, che ha accesso al DB.
 */
export function evaluateCrashBackoffAlert(): CrashBackoffAlertDecision {
  const now = Date.now();
  const recent = readTimestamps().filter((t) => now - t < CRASH_WINDOW_MS);
  const crashCount = recent.length;
  const windowMinutes = Math.max(1, Math.round(CRASH_WINDOW_MS / 60_000));
  const base: CrashBackoffAlertDecision = {
    emit: false,
    crashCount,
    windowMinutes,
    threshold: CRASH_ALERT_THRESHOLD,
  };
  if (crashCount < CRASH_ALERT_THRESHOLD) return base;

  const lastSent = readAlertSentAt();
  if (lastSent !== null && now - lastSent < CRASH_ALERT_THROTTLE_MS) return base;

  writeAlertSentAt(now);
  return { ...base, emit: true };
}

/**
 * Applica il backoff anti crash-loop (record + blocking sleep) SENZA fare exit:
 * il chiamante chiama process.exit() subito dopo. Punto unico usato sia dagli
 * handler di processo (uncaughtException/unhandledRejection) sia dai punti di
 * exit fatale del boot (migration, drift, Phase 4/5, boot catch), così il
 * contatore crash è condiviso e un DB lento non produce restart ravvicinati da
 * NESSUN percorso di exit del boot.
 */
export function applyCrashBackoff(label: string): void {
  const delay = recordCrashAndBackoff();
  if (delay > 0) {
    console.error(`[CRASH] Backoff anti crash-loop (${label}): attendo ${delay}ms prima dell'exit per distanziare il restart.`);
    sleepSync(delay);
  }
}

/**
 * Blocking sleep sincrono. Usa Atomics.wait su una SharedArrayBuffer: blocca il
 * thread senza busy-loop e funziona anche con l'event loop in stato degradato
 * (caso uncaughtException). ms<=0 → no-op.
 */
export function sleepSync(ms: number): void {
  if (ms <= 0) return;
  try {
    const sab = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(sab, 0, 0, ms);
  } catch {
    /* SharedArrayBuffer non disponibile: meglio non bloccare che crashare */
  }
}
