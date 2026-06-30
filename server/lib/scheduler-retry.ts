// Scheduler retry & attempt-tracking helper.
//
// I job notturni (map-matching alle 02:00, vacuum alle 03:00) eseguono una
// query/connessione DB "iniziale" che, se fallisce, fa abortire l'intero giro.
// Sotto pressione (DB lento → kill-switch del bg-db-limiter, coda piena,
// timeout transitorio) quella prima acquisizione può fallire e il giro salta
// in silenzio per giorni — è esattamente il guasto osservato (il map-matching
// non aggiornava `map_matching_last_run` da 9 giorni).
//
// Questo modulo fornisce:
//   - `isRetryableSchedulerError`: classifica come ritentabili sia gli errori DB
//     transitori (timeout/disconnessione, via `isTransientDbError`) sia i rigetti
//     del bg-db-limiter (kill-switch slow / coda overflow / coda timeout), che
//     `withDbRetry` NON ritenta perché non sono errori pg.
//   - `withSchedulerRetry`: backoff esponenziale + jitter sull'operazione passata.
//     Va avvolto SOLO attorno a operazioni idempotenti (la query di discovery del
//     map-matching, l'apertura connessione del vacuum) per non duplicare lavoro.
//   - `recordJobAttempt` / `readJobAttempt`: persistono un "ultimo tentativo"
//     (timestamp + esito + n. retry + errore troncato) separato dall'"ultimo
//     successo", così un fallimento è sempre visibile anche quando finisce nel
//     catch esterno del giro.

import { isTransientDbError } from "../db";
import {
  BgDbSlowKillSwitchError,
  BgDbQueueOverflowError,
  BgDbQueueTimeoutError,
} from "./bg-db-limiter";
import { storage } from "../storage";

const RETRYABLE_BG_ERROR_NAMES = new Set([
  "BgDbSlowKillSwitchError",
  "BgDbQueueOverflowError",
  "BgDbQueueTimeoutError",
]);

/**
 * True se l'errore è transitorio e ha senso ritentarlo per un job schedulato:
 * errori DB transitori (timeout/disconnessione) + rigetti del bg-db-limiter
 * (kill-switch slow, coda overflow/timeout). Questi ultimi sono valvole di
 * sfogo temporanee: al retry, dopo un breve backoff, il DB potrebbe essersi
 * scaricato e l'acquisizione riuscire.
 */
export function isRetryableSchedulerError(err: unknown): boolean {
  if (
    err instanceof BgDbSlowKillSwitchError ||
    err instanceof BgDbQueueOverflowError ||
    err instanceof BgDbQueueTimeoutError
  ) {
    return true;
  }
  const name = typeof err === "object" && err ? (err as { name?: unknown }).name : undefined;
  if (typeof name === "string" && RETRYABLE_BG_ERROR_NAMES.has(name)) return true;
  return isTransientDbError(err);
}

function envInt(key: string, fallback: number): number {
  const v = Number.parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export interface SchedulerRetryOptions {
  /** Numero MASSIMO di tentativi totali (default env SCHEDULER_RETRY_MAX_ATTEMPTS o 3). */
  maxAttempts?: number;
  /** Backoff iniziale in ms (default env SCHEDULER_RETRY_BASE_MS o 2000). */
  baseDelayMs?: number;
  /** Cap massimo del backoff in ms (default env SCHEDULER_RETRY_MAX_MS o 30000). */
  maxDelayMs?: number;
  /** Etichetta per i log (es. "map-matching discovery"). */
  label?: string;
  /** Invocato prima di ogni attesa di retry (per tracciare il conteggio retry). */
  onRetry?: (attempt: number, err: unknown, delayMs: number) => void;
}

/**
 * Esegue `fn` ritentando con backoff esponenziale + jitter SOLO sugli errori
 * classificati ritentabili da `isRetryableSchedulerError`. Gli errori non
 * ritentabili (applicativi, bug, ecc.) vengono propagati subito.
 *
 * IMPORTANTE: avvolgere solo operazioni IDEMPOTENTI — un retry ri-esegue `fn`
 * dall'inizio. Usare per la query di discovery del map-matching (sola lettura)
 * e per l'apertura connessione+VACUUM (idempotente), non per il loop di scrittura
 * per-sessione (che ha già la sua gestione retry/exhausted per-record).
 */
export async function withSchedulerRetry<T>(
  fn: () => Promise<T>,
  opts: SchedulerRetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? envInt("SCHEDULER_RETRY_MAX_ATTEMPTS", 3);
  const baseDelayMs = opts.baseDelayMs ?? envInt("SCHEDULER_RETRY_BASE_MS", 2000);
  const maxDelayMs = opts.maxDelayMs ?? envInt("SCHEDULER_RETRY_MAX_MS", 30_000);
  const label = opts.label ?? "scheduler job";

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (!isRetryableSchedulerError(err) || attempt >= maxAttempts) throw err;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = Math.round(backoff * (0.5 + Math.random())); // ±50% jitter
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[SCHEDULER-RETRY] ${label}: tentativo ${attempt}/${maxAttempts} fallito (${msg.slice(0, 120)}) — retry tra ${delay}ms`,
      );
      opts.onRetry?.(attempt, err, delay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export interface JobAttempt {
  /** Timestamp ISO del tentativo (successo o fallimento). */
  ts: string;
  /** true = il giro è andato a buon fine; false = è fallito (catch esterno). */
  ok: boolean;
  /** Numero di retry effettuati sull'operazione iniziale prima dell'esito. */
  retries: number;
  /** Messaggio d'errore troncato se ok=false, altrimenti null. */
  error: string | null;
}

const MAX_ERROR_LEN = 300;

/**
 * Persiste l'"ultimo tentativo" di un job in un AppSetting dedicato (separato
 * dal timestamp dell'"ultimo successo"). Scritto SEMPRE, anche su fallimento,
 * così un giro andato male resta visibile in admin/watchdog. Best-effort: un
 * errore di scrittura non deve mai propagare nel giro chiamante.
 */
export async function recordJobAttempt(
  key: string,
  outcome: { ok: boolean; retries: number; error?: unknown },
): Promise<void> {
  const attempt: JobAttempt = {
    ts: new Date().toISOString(),
    ok: outcome.ok,
    retries: outcome.retries,
    error:
      outcome.error == null
        ? null
        : (outcome.error instanceof Error ? outcome.error.message : String(outcome.error)).slice(0, MAX_ERROR_LEN),
  };
  try {
    await storage.upsertAppSetting(key, JSON.stringify(attempt));
  } catch (err) {
    console.warn(`[SCHEDULER-RETRY] impossibile salvare l'ultimo tentativo (${key}):`, err);
  }
}

/** Legge l'"ultimo tentativo" di un job, o null se assente/illeggibile. */
export async function readJobAttempt(key: string): Promise<JobAttempt | null> {
  try {
    const setting = await storage.getAppSetting(key);
    if (!setting?.value) return null;
    const parsed = JSON.parse(setting.value) as Partial<JobAttempt>;
    if (parsed && typeof parsed.ts === "string" && typeof parsed.ok === "boolean") {
      return {
        ts: parsed.ts,
        ok: parsed.ok,
        retries: typeof parsed.retries === "number" ? parsed.retries : 0,
        error: typeof parsed.error === "string" ? parsed.error : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}
