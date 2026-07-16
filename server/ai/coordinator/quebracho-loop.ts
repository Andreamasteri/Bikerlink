// Task #5 (Quebracho a) — Loop seriale continuo di Quebracho.
//
// Quebracho gira come UN SOLO loop seriale: un job alla volta, mai in parallelo,
// con una pausa fra un giro e l'altro. Ogni giro itera i job registrati con un
// callback `run` e, per ciascuno che è "dovuto", chiede il permesso al gate unico
// `canRunJob` prima di eseguirlo. Un job che fallisce non ferma il giro.
//
// In questa fase (Task #5) NON viene cablato alcun loop reale (→ Task #9): la
// registry può essere vuota di callback `run` e il giro diventa un no-op leggero.
// L'infrastruttura è comunque attiva e osservabile.

import { listJobs, markRunStart, markRunSuccess, markRunFailure, resetJobToIdle } from "./job-registry";
import { canRunJob, isQuebrachoUnreachable, _setQuebrachoReachableCache } from "./job-gate";
import { dedupWarn } from "../../lib/dedup-logger";

// Soglie zombie: dopo quanto tempo in stato "running" un job è considerato bloccato.
// Job giornalieri (intervalMs ≥ 4h) → 2h; tutti gli altri → 30 min.
const ZOMBIE_THRESHOLD_FREQUENT_MS = 30 * 60_000;   // 30 min
const ZOMBIE_THRESHOLD_DAILY_MS    = 2 * 60 * 60_000; // 2h
const DAILY_JOB_INTERVAL_THRESHOLD_MS = 4 * 60 * 60_000; // 4h

function zombieThresholdFor(intervalMs: number | undefined): number {
  return (intervalMs !== undefined && intervalMs >= DAILY_JOB_INTERVAL_THRESHOLD_MS)
    ? ZOMBIE_THRESHOLD_DAILY_MS
    : ZOMBIE_THRESHOLD_FREQUENT_MS;
}

const ROUND_PAUSE_MS = Math.max(
  5_000,
  Number(process.env.QUEBRACHO_LOOP_ROUND_PAUSE_MS) || 60_000,
);
const JOB_PAUSE_MS = Math.max(
  0,
  Number(process.env.QUEBRACHO_LOOP_JOB_PAUSE_MS) || 250,
);

let loopActive = false;
let stopRequested = false;
let roundInFlight = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastRoundAt = 0;
let roundCount = 0;

export function isQuebrachoLoopRunning(): boolean {
  return loopActive;
}

export function getQuebrachoLoopStats(): {
  running: boolean;
  roundInFlight: boolean;
  lastRoundAt: number;
  roundCount: number;
  roundPauseMs: number;
} {
  return { running: loopActive, roundInFlight, lastRoundAt, roundCount, roundPauseMs: ROUND_PAUSE_MS };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Esegue UN giro seriale: per ogni job con callback `run`, in ordine, valuta il
 * gate e lo esegue se consentito. Fra un job e l'altro fa una micro-pausa così da
 * non saturare CPU/DB. Restituisce il numero di job effettivamente eseguiti.
 */
export async function runOneRound(): Promise<number> {
  if (roundInFlight) return 0; // mai due giri in parallelo
  roundInFlight = true;
  let executed = 0;
  try {
    // Aggiorna la cache sync di reachability una volta per giro (per /api/health).
    try {
      _setQuebrachoReachableCache(!(await isQuebrachoUnreachable()));
    } catch {
      /* best-effort */
    }

    // ── Rilevatore zombie ────────────────────────────────────────────────────
    // Se un job è rimasto bloccato in "running" (crash senza cleanup, processo
    // precedente non ancora resettato allo startup, ecc.), lo riportiamo a idle
    // con un errore esplicito prima di valutare il gate. Così il gate non lo
    // salta per sempre credendo che sia in esecuzione.
    const now = Date.now();
    const zombieResets: string[] = [];
    for (const job of listJobs()) {
      if (job.state !== "running") continue;
      if (job.lastRunAt === null) continue;
      const threshold = zombieThresholdFor(job.intervalMs);
      const staleSec = Math.round((now - job.lastRunAt) / 1000);
      if (now - job.lastRunAt < threshold) continue;
      const reason = `zombie timeout: running per ${staleSec}s (soglia ${threshold / 60_000}min)`;
      resetJobToIdle(job.name, reason);
      zombieResets.push(job.name);
      dedupWarn(
        `quebracho-zombie:${job.name}`,
        `[quebracho] job zombie resettato: "${job.name}" bloccato in "running" da ${staleSec}s`,
      );
      // Watchdog log (best-effort, non blocca il giro).
      void import("../../ai/watchdog/log").then(({ writeWatchdogLog }) =>
        writeWatchdogLog({
          kind: "coordinator",
          scope: `coordinator.zombie_job`,
          status: "warn",
          summary: `Job zombie resettato: "${job.name}" bloccato in "running" da ${staleSec}s`,
          details: { jobName: job.name, staleSec, thresholdSec: threshold / 1000 },
        }),
      ).catch(() => {/* best-effort */});
    }
    if (zombieResets.length > 0) {
      console.warn(`[quebracho] ${zombieResets.length} job zombie resettati: ${zombieResets.join(", ")}`);
    }

    const jobs = listJobs();
    for (const job of jobs) {
      if (stopRequested) break;
      if (typeof job.run !== "function") continue; // job "gate-only": nessuna esecuzione supervisata

      let decision;
      try {
        decision = await canRunJob(job.name);
      } catch {
        continue; // il gate non lancia mai, ma per sicurezza saltiamo il job
      }
      if (!decision.allowed) continue;

      markRunStart(job.name);
      try {
        await job.run();
        markRunSuccess(job.name);
        executed += 1;
      } catch (err) {
        markRunFailure(job.name, err);
        dedupWarn("quebracho-loop-job", `[quebracho] job "${job.name}" ha fallito: ${String(err)}`);
      }
      if (JOB_PAUSE_MS > 0) await sleep(JOB_PAUSE_MS);
    }
  } finally {
    roundInFlight = false;
    lastRoundAt = Date.now();
    roundCount += 1;
  }
  return executed;
}

async function tick(): Promise<void> {
  if (stopRequested) {
    loopActive = false;
    return;
  }
  try {
    await runOneRound();
  } catch (err) {
    dedupWarn("quebracho-loop", `[quebracho] giro fallito: ${String(err)}`);
  }
  if (stopRequested) {
    loopActive = false;
    return;
  }
  // Pausa fra i giri: setTimeout (non setInterval) così i giri non si sovrappongono.
  timer = setTimeout(() => void tick(), ROUND_PAUSE_MS);
}

/** Avvia il loop seriale continuo. Idempotente. */
export function startQuebrachoLoop(): void {
  if (loopActive) return;
  loopActive = true;
  stopRequested = false;
  // Primo giro dopo una breve attesa (lascia finire il boot).
  timer = setTimeout(() => void tick(), Math.min(ROUND_PAUSE_MS, 10_000));
}

/** Ferma il loop (attende la fine del giro in corso, senza interromperlo a metà). */
export async function stopQuebrachoLoop(): Promise<void> {
  stopRequested = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  // Attendi che l'eventuale giro in corso finisca (max ~5s).
  const deadline = Date.now() + 5_000;
  while (roundInFlight && Date.now() < deadline) {
    await sleep(50);
  }
  loopActive = false;
}

/** Solo test: resetta lo stato del loop. */
export function __resetLoopForTests(): void {
  loopActive = false;
  stopRequested = false;
  roundInFlight = false;
  if (timer) { clearTimeout(timer); timer = null; }
  lastRoundAt = 0;
  roundCount = 0;
}
