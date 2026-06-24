// Boot log persistente in memoria — registra ogni fase/step dell'avvio
// con timestamp assoluto e offset dall'avvio. Esporto via /api/admin/boot-log.

export interface BootLogEntry {
  ts: number;
  elapsed_ms: number;
  phase: string;
  msg: string;
  ok: boolean | null;
}

const PROCESS_START_MS = Date.now();
const entries: BootLogEntry[] = [];

/** Aggiunge una voce al boot log. ok=null = in progress, true = ok, false = errore. */
export function addBootLog(phase: string, msg: string, ok: boolean | null = null): void {
  entries.push({
    ts: Date.now(),
    elapsed_ms: Date.now() - PROCESS_START_MS,
    phase,
    msg,
    ok,
  });
}

/** Shortcut per ok=true. */
export function bootOk(phase: string, msg: string): void {
  addBootLog(phase, msg, true);
}

/** Shortcut per ok=false (errore). */
export function bootErr(phase: string, msg: string): void {
  addBootLog(phase, msg, false);
}

/** Ritorna le voci in ordine cronologico (read-only). */
export function getBootLog(): readonly BootLogEntry[] {
  return entries;
}

export function getBootSummary() {
  const first = entries[0];
  const last = entries[entries.length - 1];
  const complete = entries.some((e) => e.phase === "READY");
  const hasError = entries.some((e) => e.ok === false);
  return {
    complete,
    hasError,
    totalEntries: entries.length,
    startTs: first?.ts ?? null,
    lastTs: last?.ts ?? null,
    totalElapsedMs: first && last ? last.ts - first.ts : null,
  };
}
