// Registry dei job di background del coordinator (Horus).
//
// Fonte di verità LIVE = mappa in-memory (zero latenza per il gate `canRunJob`).
// La tabella `ai_coordinator_jobs` è solo uno specchio persistente per far
// sopravvivere pause/throttle/contatori ai restart. Le scritture su DB sono
// best-effort (via bg-db-limiter) e non bloccano mai il decision-path.
//
// Questo modulo NON cabla i ~26 loop reali (quello è Task #9): espone solo le
// primitive che il loop seriale di Horus e il gate consumano.

import { db } from "../../db";
import { withBgDbSlot, isBgDbLimiterDropError } from "../../lib/bg-db-limiter";
import { aiCoordinatorJobs } from "@shared/db";
import { dedupWarn } from "../../lib/dedup-logger";

export type JobRunState = "idle" | "running" | "paused" | "throttled" | "disabled";
export type PauseSource = "admin_manual" | "horus" | "killswitch" | "deterministic";
// "horus" — Horus può emettere direttive (pause) in autonomia; il gate le ignora
// se Horus (Ollama self-hosted) è irraggiungibile, così una pausa bloccata non
// può mai sopravvivere a un outage dell'emittente (fallback deterministico).
export type DirectiveIssuer = "admin_manual" | "horus";

export interface JobDirective {
  kind: "pause" | "throttle";
  reason: string;
  issuedBy: DirectiveIssuer;
  issuedAt: string;
  /** Solo per kind="throttle": intervallo minimo forzato fra due run (ms). */
  throttleMs?: number;
}

/** Definizione con cui un job si registra nel coordinatore. */
export interface JobRegistration {
  /** Intervallo nominale desiderato fra due esecuzioni (ms). */
  intervalMs?: number;
  /** Callback eseguito dal loop seriale (opzionale: i job "gate-only" non ce l'hanno). */
  run?: () => Promise<void> | void;
  /** true se il job è critico (non va mai sospeso automaticamente in fallback). */
  critical?: boolean;
}

export interface JobEntry {
  name: string;
  intervalMs?: number;
  run?: () => Promise<void> | void;
  critical: boolean;
  // ── Stato live ──────────────────────────────────────────────────────────
  state: JobRunState;
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  nextRunAt: number | null;
  directive: JobDirective | null;
  /** Sorgente/motivo della pausa corrente (informativo per snapshot/health). */
  pauseSource: PauseSource | null;
  pauseReason: string | null;
  /** Force one-shot: la prossima decisione del gate consente l'esecuzione. */
  pendingForce: boolean;
  runCount: number;
  successCount: number;
  failureCount: number;
}

const registry = new Map<string, JobEntry>();

function freshEntry(name: string, reg?: JobRegistration): JobEntry {
  return {
    name,
    intervalMs: reg?.intervalMs,
    run: reg?.run,
    critical: reg?.critical ?? false,
    state: "idle",
    lastRunAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastError: null,
    nextRunAt: null,
    directive: null,
    pauseSource: null,
    pauseReason: null,
    pendingForce: false,
    runCount: 0,
    successCount: 0,
    failureCount: 0,
  };
}

/**
 * Registra (o aggiorna la definizione di) un job. Idempotente: se il job esiste
 * già ne preserva lo stato live e i contatori, aggiornando solo run/interval.
 */
export function registerJob(name: string, reg?: JobRegistration): JobEntry {
  const existing = registry.get(name);
  if (existing) {
    if (reg?.intervalMs !== undefined) existing.intervalMs = reg.intervalMs;
    if (reg?.run !== undefined) existing.run = reg.run;
    if (reg?.critical !== undefined) existing.critical = reg.critical;
    return existing;
  }
  const entry = freshEntry(name, reg);
  registry.set(name, entry);
  void persistJob(entry);
  return entry;
}

/** Restituisce (creando lazy se assente) l'entry di un job. */
export function ensureJob(name: string): JobEntry {
  return registry.get(name) ?? registerJob(name);
}

export function getJob(name: string): JobEntry | undefined {
  return registry.get(name);
}

export function listJobs(): JobEntry[] {
  return Array.from(registry.values());
}

// ── Transizioni di stato/esecuzione ─────────────────────────────────────────

export function markRunStart(name: string): void {
  const e = ensureJob(name);
  e.state = "running";
  e.lastRunAt = Date.now();
  e.runCount += 1;
  void persistJob(e);
}

export function markRunSuccess(name: string): void {
  const e = ensureJob(name);
  const now = Date.now();
  e.lastSuccessAt = now;
  e.successCount += 1;
  e.state = e.directive ? deriveDirectiveState(e) : "idle";
  if (e.intervalMs && e.nextRunAt !== null && e.nextRunAt <= now) {
    e.nextRunAt = now + e.intervalMs;
  } else if (e.intervalMs && e.nextRunAt === null) {
    e.nextRunAt = now + e.intervalMs;
  }
  void persistJob(e);
}

export function markRunFailure(name: string, err: unknown): void {
  const e = ensureJob(name);
  const now = Date.now();
  e.lastErrorAt = now;
  e.lastError = err instanceof Error ? err.message : String(err);
  e.failureCount += 1;
  e.state = e.directive ? deriveDirectiveState(e) : "idle";
  if (e.intervalMs) e.nextRunAt = now + e.intervalMs;
  void persistJob(e);
}

/** Fissa esplicitamente il prossimo istante utile di esecuzione. */
export function setNextRun(name: string, at: number | null): void {
  const e = ensureJob(name);
  e.nextRunAt = at;
  void persistJob(e);
}

function deriveDirectiveState(e: JobEntry): JobRunState {
  if (!e.directive) return "idle";
  return e.directive.kind === "pause" ? "paused" : "throttled";
}

/**
 * Applica (o rimuove con `null`) la direttiva per-job. Aggiorna lo stato live e
 * lo specchio persistente. NON valuta i permessi: è compito del gate.
 */
export function setDirective(
  name: string,
  directive: JobDirective | null,
  pauseSource: PauseSource | null,
  pauseReason: string | null,
): void {
  const e = ensureJob(name);
  e.directive = directive;
  e.pauseSource = pauseSource;
  e.pauseReason = pauseReason;
  if (!directive) {
    e.state = "idle";
    e.pendingForce = false;
  } else {
    e.state = deriveDirectiveState(e);
  }
  void persistJob(e);
}

export function setPendingForce(name: string, value: boolean): void {
  const e = ensureJob(name);
  e.pendingForce = value;
  void persistJob(e);
}

// ── Persistenza best-effort ─────────────────────────────────────────────────
//
// Il registro live resta in memoria. La tabella DB è uno specchio per restart e
// admin, quindi non serve una INSERT/UPSERT per ogni transizione del loop:
// persistere start+success+failure a ogni tick produce solo churn e contesa.
const PERSIST_MIN_INTERVAL_MS = 30_000;
const persistLastAt = new Map<string, number>();
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function persistJob(e: JobEntry): void {
  const now = Date.now();
  const last = persistLastAt.get(e.name) ?? 0;
  if (now - last >= PERSIST_MIN_INTERVAL_MS && !persistTimers.has(e.name)) {
    persistLastAt.set(e.name, now);
    void persistJobNow(e);
    return;
  }
  if (persistTimers.has(e.name)) return;
  const delay = Math.max(0, PERSIST_MIN_INTERVAL_MS - (now - last));
  const timer = setTimeout(() => {
    persistTimers.delete(e.name);
    persistLastAt.set(e.name, Date.now());
    void persistJobNow(e);
  }, delay);
  timer.unref?.();
  persistTimers.set(e.name, timer);
}

async function persistJobNow(e: JobEntry): Promise<void> {
  try {
    await withBgDbSlot(async () => {
      await db
        .insert(aiCoordinatorJobs)
        .values(rowFromEntry(e))
        .onConflictDoUpdate({
          target: aiCoordinatorJobs.name,
          set: { ...rowFromEntry(e), updatedAt: new Date() },
        });
    });
  } catch (err) {
    if (isBgDbLimiterDropError(err)) return; // kill-switch/coda piena: non è un errore reale
    dedupWarn("coordinator-persist", `[coordinator] persist job "${e.name}" fallito: ${String(err)}`);
  }
}

function rowFromEntry(e: JobEntry) {
  return {
    name: e.name,
    state: e.state,
    lastRunAt: e.lastRunAt ? new Date(e.lastRunAt) : null,
    lastSuccessAt: e.lastSuccessAt ? new Date(e.lastSuccessAt) : null,
    lastErrorAt: e.lastErrorAt ? new Date(e.lastErrorAt) : null,
    lastError: e.lastError,
    nextRunAt: e.nextRunAt ? new Date(e.nextRunAt) : null,
    pauseSource: e.pauseSource,
    pauseReason: e.pauseReason,
    directive: e.directive ?? null,
    runCount: e.runCount,
    successCount: e.successCount,
    failureCount: e.failureCount,
    updatedAt: new Date(),
  };
}

/**
 * Idrata la registry dal DB al boot (best-effort). Ripristina SOLO le direttive
 * e i contatori persistiti sui job già registrati in memoria; non crea job
 * "fantasma" con `run` mancante che il loop non saprebbe eseguire.
 */
export async function hydrateRegistryFromDb(): Promise<void> {
  try {
    const rows = await withBgDbSlot(() => db.select().from(aiCoordinatorJobs));
    for (const r of rows) {
      const e = registry.get(r.name);
      if (!e) continue; // job non (ancora) registrato in questo processo: skip
      const d = (r.directive as JobDirective | null) ?? null;
      e.directive = d;
      e.pauseSource = (r.pauseSource as PauseSource | null) ?? null;
      e.pauseReason = r.pauseReason ?? null;
      // Task #393 — Ripristina lo stato persistito (incluso "running") così
      // resetRunningJobsOnStartup() può rilevare e resettare i job zombie.
      // Senza questo, hydrateRegistryFromDb azzerava sempre a "idle" e il
      // reset startup era un no-op silenzioso.
      const persistedState = (r.state as JobRunState | null) ?? "idle";
      e.state = d ? deriveDirectiveState(e) : persistedState;
      e.lastRunAt = r.lastRunAt ? r.lastRunAt.getTime() : null;
      e.lastSuccessAt = r.lastSuccessAt ? r.lastSuccessAt.getTime() : null;
      e.lastErrorAt = r.lastErrorAt ? r.lastErrorAt.getTime() : null;
      e.lastError = r.lastError ?? null;
      e.nextRunAt = r.nextRunAt ? r.nextRunAt.getTime() : null;
      e.runCount = r.runCount ?? 0;
      e.successCount = r.successCount ?? 0;
      e.failureCount = r.failureCount ?? 0;
    }
  } catch (err) {
    if (isBgDbLimiterDropError(err)) return;
    dedupWarn("coordinator-hydrate", `[coordinator] hydrate registry fallita: ${String(err)}`);
  }
}

/**
 * Resetta esplicitamente un singolo job a `idle` con un messaggio di errore.
 * Usato dal reset manuale admin e dal rilevatore zombie.
 */
export function resetJobToIdle(name: string, reason: string): void {
  const e = ensureJob(name);
  const now = Date.now();
  e.state = e.directive ? deriveDirectiveState(e) : "idle";
  e.lastErrorAt = now;
  e.lastError = reason;
  e.failureCount += 1;
  void persistJob(e);
}

/**
 * Ripristina a `idle` tutti i job che al momento del boot risultano in stato
 * `running` nel registro in-memory (già idratato dal DB). Questo interrompe il
 * ciclo di perpetuazione degli zombie: un job che ha crashato senza aggiornare
 * il proprio stato non blocca più il loop al giro successivo.
 *
 * Deve essere chiamato DOPO `hydrateRegistryFromDb()` e PRIMA di avviare il
 * loop (startHorusCoordinatorLoop).
 */
export function resetRunningJobsOnStartup(): string[] {
  const reset: string[] = [];
  for (const e of registry.values()) {
    if (e.state !== "running") continue;
    e.state = e.directive ? deriveDirectiveState(e) : "idle";
    e.lastError = "reset on startup: was running at boot";
    e.lastErrorAt = Date.now();
    reset.push(e.name);
    void persistJob(e);
  }
  if (reset.length > 0) {
    dedupWarn(
      "coordinator-startup-reset",
      `[coordinator] startup reset: ${reset.length} job bloccati in "running" riportati a idle: ${reset.join(", ")}`,
    );
  }
  return reset;
}

/** Solo per i test: azzera la registry in-memory. */
export function __resetRegistryForTests(): void {
  registry.clear();
}
