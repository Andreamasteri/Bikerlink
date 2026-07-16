// Task #5 (Quebracho a) — Gate unico `canRunJob(name)`.
//
// Un SOLO punto di decisione, costruito SOPRA l'infrastruttura già esistente:
//   • pause layer AI  (index.part2.ts: isAiPaused/pauseAi/resumeAi),
//   • policy engine    (policy-engine.ts: evaluateEvent → ALLOW/BLOCK/DELAY/NOTIFY),
//   • registry job     (job-registry.ts: direttive per-job + throttle),
//   • salute runtime   (bg-db-limiter pool + ThinkCentre online),
//   • kill-switch globale del coordinatore (AppSetting).
//
// Contratto: `canRunJob` NON lancia MAI e NON blocca MAI un job "per sempre".
// Quando Quebracho è irraggiungibile, le pause che ha emesso LUI vengono ignorate
// (fallback deterministico); restano invece rispettate le pause manuali admin e
// il kill-switch. Il gate non ferma un job per errori interni: fail-open.

import { storage } from "../../storage";
import { isPoolHealthy } from "../../db";
import { isThinkCentreOffline } from "../../lib/thinkcentre-offline";
import { isQuebrachoReachable } from "../../lib/quebracho-client";
import { isOllamaReachable } from "../../lib/ollama-client";
import { dedupWarn } from "../../lib/dedup-logger";
import { isAiPaused } from "./index.part2";
import { evaluateEvent } from "./policy-engine";
import {
  ensureJob,
  getJob,
  listJobs,
  setDirective,
  setPendingForce,
  type JobDirective,
  type DirectiveIssuer,
  type JobEntry,
} from "./job-registry";

const KILL_SWITCH_KEY = "coordinator_kill_switch";

/** Cache sync dello stato kill-switch/reachability per la view di /api/health. */
let _killSwitchCached = false;
let _quebrachoReachableCached: boolean | null = null;

export type JobGateSource =
  | "deterministic"
  | "quebracho"
  | "horus"
  | "admin_manual"
  | "killswitch"
  | "policy"
  | "throttle"
  | "health";

export interface JobGateDecision {
  allowed: boolean;
  jobName: string;
  reason: string;
  source: JobGateSource;
  /** true se un force one-shot ha scavalcato una pausa. */
  forced: boolean;
}

function allow(jobName: string, reason: string, source: JobGateSource = "deterministic", forced = false): JobGateDecision {
  return { allowed: true, jobName, reason, source, forced };
}
function deny(jobName: string, reason: string, source: JobGateSource): JobGateDecision {
  return { allowed: false, jobName, reason, source, forced: false };
}

// ── Kill-switch globale del coordinatore ─────────────────────────────────────

export async function isCoordinatorKillSwitchActive(): Promise<boolean> {
  try {
    const s = await storage.getAppSetting(KILL_SWITCH_KEY);
    _killSwitchCached = s?.value === "true";
    return _killSwitchCached;
  } catch (err) {
    // Non sappiamo lo stato: fail-open (un job non deve restare bloccato per un
    // blip DB). Il kill-switch admin è raro; se attivo verrà riletto al prossimo giro.
    dedupWarn("coordinator-killswitch", `[coordinator] lettura kill-switch fallita: ${String(err)}`);
    return false;
  }
}

export async function setCoordinatorKillSwitch(active: boolean): Promise<void> {
  await storage.upsertAppSetting(KILL_SWITCH_KEY, active ? "true" : "false");
  _killSwitchCached = active;
}

// ── Fallback: Quebracho raggiungibile? ───────────────────────────────────────

/**
 * true quando NON possiamo contare su Quebracho (spento o TC offline). In questo
 * caso le pause emesse da Quebracho vengono ignorate dal gate.
 */
export async function isQuebrachoUnreachable(): Promise<boolean> {
  try {
    if (await isThinkCentreOffline()) {
      _quebrachoReachableCached = false;
      return true;
    }
    const reachable = await isQuebrachoReachable();
    _quebrachoReachableCached = reachable;
    return !reachable;
  } catch {
    _quebrachoReachableCached = false;
    return true; // in dubbio, degrada in modo deterministico
  }
}

/** Cache sync dello stato di raggiungibilità di Horus (per la view admin). */
let _horusReachableCached: boolean | null = null;

/**
 * true quando NON possiamo contare su Horus (TC offline o il suo Ollama
 * self-hosted irraggiungibile). In questo caso le pause emesse da Horus
 * vengono ignorate dal gate — stesso contratto di fallback di Quebracho.
 */
export async function isHorusUnreachable(): Promise<boolean> {
  try {
    if (await isThinkCentreOffline()) {
      _horusReachableCached = false;
      return true;
    }
    const reachable = await isOllamaReachable("horus");
    _horusReachableCached = reachable;
    return !reachable;
  } catch {
    _horusReachableCached = false;
    return true; // in dubbio, degrada in modo deterministico
  }
}

// ── Direttive per-job ────────────────────────────────────────────────────────

export type JobDirectiveKind = "pause" | "resume" | "force" | "throttle";

export interface ApplyDirectiveResult {
  applied: boolean;
  jobName: string;
  kind: JobDirectiveKind;
}

/**
 * Applica una direttiva a un job. `issuedBy` distingue le pause admin (sempre
 * rispettate) da quelle di Quebracho (ignorate in fallback quando è offline).
 */
export async function applyJobDirective(
  jobName: string,
  kind: JobDirectiveKind,
  params: { reason?: string; throttleMs?: number } = {},
  issuedBy: DirectiveIssuer = "admin_manual",
): Promise<ApplyDirectiveResult> {
  ensureJob(jobName);
  const reason = params.reason ?? `${kind} da ${issuedBy}`;
  const source = issuedBy;

  switch (kind) {
    case "pause": {
      const directive: JobDirective = { kind: "pause", reason, issuedBy, issuedAt: new Date().toISOString() };
      setDirective(jobName, directive, source, reason);
      break;
    }
    case "throttle": {
      const directive: JobDirective = {
        kind: "throttle",
        reason,
        issuedBy,
        issuedAt: new Date().toISOString(),
        throttleMs: Math.max(1000, params.throttleMs ?? 60_000),
      };
      setDirective(jobName, directive, source, reason);
      break;
    }
    case "resume": {
      setDirective(jobName, null, null, null);
      break;
    }
    case "force": {
      // One-shot: la prossima decisione consente l'esecuzione anche se in pausa.
      setPendingForce(jobName, true);
      break;
    }
  }
  return { applied: true, jobName, kind };
}

// ── Il gate ──────────────────────────────────────────────────────────────────

/**
 * Decide se un job può girare ADESSO. Non lancia mai. Ordine di valutazione:
 *   1. kill-switch globale admin      → deny (killswitch)
 *   2. salute DB pool (bg-db-limiter) → deny (health)
 *   3. direttiva pause per-job        → admin: deny; quebracho: deny SOLO se
 *                                       Quebracho è raggiungibile (altrimenti
 *                                       fallback: ignora). force one-shot scavalca.
 *   4. throttle per-job / nextRun     → deny (throttle) se non ancora scaduto
 *   5. pause layer AI (isAiPaused)    → deny (quebracho) se Quebracho raggiungibile
 *   6. policy engine BLOCK            → deny (policy)
 *   7. altrimenti                     → allow (deterministic)
 */
export async function canRunJob(name: string): Promise<JobGateDecision> {
  try {
    const e = ensureJob(name);
    const now = Date.now();

    // 1. Kill-switch globale (admin). Sempre rispettato.
    if (await isCoordinatorKillSwitchActive()) {
      return deny(name, "Kill-switch del coordinatore attivo", "killswitch");
    }

    // 2. Salute: pool DB saturo → rimanda (non è una pausa, è protezione runtime).
    //    I job critici NON vengono fermati dalla salute (devono poter girare).
    if (!e.critical && !isPoolHealthy()) {
      return deny(name, "Pool DB non sano: esecuzione rimandata", "health");
    }

    // Fallback: se Quebracho è offline, le sue pause/direttive AI vanno ignorate.
    const quebrachoDown = await isQuebrachoUnreachable();

    // 3. Direttiva pause per-job.
    if (e.directive?.kind === "pause") {
      // force one-shot: consuma e consenti (ma solo dopo kill-switch/salute).
      if (e.pendingForce) {
        setPendingForce(name, false);
        return allow(name, "Force one-shot: pausa scavalcata", "admin_manual", true);
      }
      const byAdmin = e.directive.issuedBy === "admin_manual";
      if (byAdmin) {
        return deny(name, e.directive.reason || "In pausa (admin)", "admin_manual");
      }
      // Pausa emessa da Quebracho o Horus: rispettata solo se il rispettivo
      // backing service è raggiungibile (fallback deterministico altrimenti).
      const issuerDown = e.directive.issuedBy === "horus" ? await isHorusUnreachable() : quebrachoDown;
      if (!issuerDown) {
        return deny(name, e.directive.reason || `In pausa (${e.directive.issuedBy})`, e.directive.issuedBy);
      }
      logFallback(name, `pausa ${e.directive.issuedBy} ignorata (irraggiungibile)`);
      // fall-through: consenti
    }

    // 4. Throttle per-job (direttiva) o nextRun schedulato.
    if (e.directive?.kind === "throttle" && e.lastRunAt !== null) {
      const minGap = e.directive.throttleMs ?? 60_000;
      const throttleIssuerDown = e.directive.issuedBy === "horus" ? await isHorusUnreachable() : quebrachoDown;
      const respect = e.directive.issuedBy === "admin_manual" || !throttleIssuerDown;
      if (respect && now - e.lastRunAt < minGap) {
        return deny(name, `Throttle attivo (${minGap}ms)`, "throttle");
      }
    }
    if (!e.pendingForce && e.nextRunAt !== null && now < e.nextRunAt) {
      return deny(name, "Non ancora schedulato (nextRun futuro)", "throttle");
    }

    // 5. Pause layer AI esistente (globale "*" o della persona quebracho).
    if (!quebrachoDown && (await isAiPaused("quebracho"))) {
      return deny(name, "Layer AI in pausa (quebracho/*)", "quebracho");
    }

    // 6. Policy engine: un evento di run bloccato da una regola BLOCK.
    try {
      const evalResult = evaluateEvent({ aiName: "quebracho", eventType: `job.run:${name}`, payload: {}, severity: "info" });
      if (evalResult.action === "BLOCK") {
        return deny(name, evalResult.message || "Bloccato da policy", "policy");
      }
    } catch {
      /* policy engine non deve mai bloccare il gate: fail-open */
    }

    return allow(name, "Consentito", "deterministic");
  } catch (err) {
    // Non blocchiamo mai un job per un errore interno del gate.
    dedupWarn("coordinator-gate", `[coordinator] gate error per "${name}": ${String(err)}`);
    return allow(name, "Gate error: fail-open", "deterministic");
  }
}

const _fallbackLogTs = new Map<string, number>();
function logFallback(jobName: string, msg: string): void {
  const now = Date.now();
  const last = _fallbackLogTs.get(jobName) ?? 0;
  if (now - last < 5 * 60_000) return; // throttle 5 min per job
  _fallbackLogTs.set(jobName, now);
  dedupWarn("coordinator-fallback", `[coordinator] fallback "${jobName}": ${msg}`);
}

// ── Snapshot sincrono per /api/health e admin ────────────────────────────────

export interface CoordinatorHealthSummary {
  killSwitch: boolean;
  quebrachoReachable: boolean | null;
  jobs: { total: number; running: number; paused: number; throttled: number };
}

/** Vista sincrona (nessun await, nessun throw): sicura nell'hot-path di /api/health. */
export function getCoordinatorHealthSummary(): CoordinatorHealthSummary {
  let running = 0, paused = 0, throttled = 0;
  const jobs = listJobs();
  for (const j of jobs) {
    if (j.state === "running") running += 1;
    else if (j.state === "paused") paused += 1;
    else if (j.state === "throttled") throttled += 1;
  }
  return {
    killSwitch: _killSwitchCached,
    quebrachoReachable: _quebrachoReachableCached,
    jobs: { total: jobs.length, running, paused, throttled },
  };
}

// Soglie zombie (specchio di quebracho-loop.ts) per il badge nello snapshot.
const ZOMBIE_THRESHOLD_FREQUENT_SNAP_MS = 30 * 60_000;
const ZOMBIE_THRESHOLD_DAILY_SNAP_MS    = 2 * 60 * 60_000;
const DAILY_INTERVAL_THRESHOLD_SNAP_MS  = 4 * 60 * 60_000;

function isJobZombie(j: JobEntry): boolean {
  if (j.state !== "running" || j.lastRunAt === null) return false;
  const threshold = (j.intervalMs !== undefined && j.intervalMs >= DAILY_INTERVAL_THRESHOLD_SNAP_MS)
    ? ZOMBIE_THRESHOLD_DAILY_SNAP_MS
    : ZOMBIE_THRESHOLD_FREQUENT_SNAP_MS;
  return Date.now() - j.lastRunAt >= threshold;
}

/** Snapshot dettagliato (per admin/debug). */
export function getCoordinatorJobsSnapshot(): Array<Pick<JobEntry,
  "name" | "state" | "lastRunAt" | "lastSuccessAt" | "lastErrorAt" | "nextRunAt" |
  "pauseSource" | "pauseReason" | "runCount" | "successCount" | "failureCount"> & {
    directive: JobDirective | null;
    /** true se il job è in stato "running" da più del timeout zombie. */
    isZombie: boolean;
  }> {
  return listJobs().map((j) => ({
    name: j.name,
    state: j.state,
    lastRunAt: j.lastRunAt,
    lastSuccessAt: j.lastSuccessAt,
    lastErrorAt: j.lastErrorAt,
    nextRunAt: j.nextRunAt,
    pauseSource: j.pauseSource,
    pauseReason: j.pauseReason,
    runCount: j.runCount,
    successCount: j.successCount,
    failureCount: j.failureCount,
    directive: j.directive,
    isZombie: isJobZombie(j),
  }));
}

/** Aggiorna la cache sync della reachability (chiamato dal loop). */
export function _setQuebrachoReachableCache(value: boolean): void {
  _quebrachoReachableCached = value;
}

/** Solo test: azzera le cache sync. */
export function __resetGateCachesForTests(): void {
  _killSwitchCached = false;
  _quebrachoReachableCached = null;
  _fallbackLogTs.clear();
}

// getJob riesportato per comodità dei consumatori del gate.
export { getJob };
