import { storage } from "../storage";
import { withDbRetry } from "../db";
import { withBgDbSlot, isBgDbLimiterDropError } from "../lib/bg-db-limiter";
import { dedupWarn } from "../lib/dedup-logger";
import { runMatching, runWishlistMatching, getLastProposalMatchingStats, getLastWishlistMatchingStats } from "./run-matching";
import { runBikerBikerMatching, runBikerBikerTypeStyleMatching } from "./run-biker";
import { runClubBrandMatching } from "./run-clubs";
import { runMusicMatchBikerZavorrina, runGpsBasedMatching, runEventMatching, runBikerZavorrinaTypeStyleMatching } from "./run-extra";
import { runBikerZavorrinaBase } from "./run-biker-zav-base";
import { runMusicAffinityMatching } from "./run-music-affinity";
import { runExtractRouteCellsJob } from "./jobs/extract-route-cells";
import { runRouteSimilarityMatching } from "./run-route-similarity";
import { runPlannedRouteAffinity } from "./run-planned-route-affinity";
import { enrichBikerMatchBreakdowns } from "./enrich-breakdowns";
import { runDistanceMatching, runRouteTypeZoneMatching } from "./run-distance";
import { runProposalToProfileMatching } from "./run-profile";
import { PhaseRecorder } from "./perf-metrics";
import { schedulerLogger } from "../lib/logger";
import { prettyMs, memoryRssPretty } from "../lib/format";
import { withMatchingLock, forceUnlockMatchingLock, getMatchingLockStatus } from "../cache/matching-lock";
import {
  recordMatchingCycle,
  recordMatchesCreated,
  recordCycleError,
  recordCycleDrop,
  setMatchingLockState,
} from "./metrics";
import { captureMatchingError } from "../sentry";
import { addMatchLog } from "./match-log-buffer";
import { runCleanup, withCycleTimeout, getMatchingCycleTimeoutMs, CycleTimeoutError } from "./scheduler.helpers";
import { canRunCycleNow, isPoolSaturatedSync } from "./coordinator";

export { getMatchingLockStatus };

const MATCH_DEBOUNCE_MS = 10_000;

// Zombie-cycle recovery (Task #4798): `cycleInFlight` è una guardia in-process
// che blocca i tick sovrapposti. Se l'IIFE del ciclo non si risolve mai (una
// fase appesa, una promise che non rigetta), resterebbe true per sempre e ogni
// tick successivo verrebbe saltato come "already_running" finché il processo non
// riparte — esattamente lo stallo da centinaia di minuti osservato di notte.
// Il lock distribuito (dragonfly/memory) ha già un TTL di 5min, ma questo booleano
// no. Se cycleInFlight è true da oltre CYCLE_STALE_MS lo consideriamo zombie e
// lo resettiamo (a quel punto il lock sottostante è certamente scaduto), così il
// tick può ripartire da solo.
const CYCLE_STALE_MS = 10 * 60 * 1000;

let cycleInFlight = false;
let lastMatchingStart: number | null = null;
// Task #5316 — "skipped" distingue un ciclo posticipato dal bg-db-limiter
// (DB managed sotto pressione, valvola di sfogo attesa) da un vero errore
// applicativo del ciclo, così il watchdog non genera falsi allarmi high/critical.
let lastCycleOutcome: "ok" | "error" | "skipped" | null = null;
let lastCycleMeta: {
  completedAt: string;
  durationMs: number;
  zavorrinaMatchesNew: number;
  bikerBikerMatchesNew: number;
} | null = null;

export function getLastMatchingCycleMeta() {
  return lastCycleMeta;
}

export function getLastCycleOutcome(): "ok" | "error" | "skipped" | null {
  return lastCycleOutcome;
}

// ─── Task #5316 — retry rapido per cleanup_delete_expired ───────────────────
// Se questa fase viene droppata dal bg-db-limiter (kill-switch/coda), NON
// aspettiamo il prossimo giro naturale del ciclo (poteva essere un'ora dopo):
// ritentiamo a breve termine, così le proposte scadute non restano sporche a
// lungo durante episodi di instabilità DB prolungata. Un solo timer alla
// volta (no accumulo se il drop si ripete più volte nello stesso giro).
const CLEANUP_EXPIRED_RETRY_DELAY_MS = 90_000;
let cleanupExpiredRetryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleCleanupExpiredRetry(): void {
  if (cleanupExpiredRetryTimer) return;
  cleanupExpiredRetryTimer = setTimeout(() => {
    cleanupExpiredRetryTimer = null;
    withBgDbSlot(() => withDbRetry(() => storage.deleteExpiredProposals()))
      .then((deleted) => {
        if (deleted > 0) {
          schedulerLogger.info({ deleted }, "Eliminate proposte scadute (retry post kill-switch)");
          addMatchLog("INFO", "cleanup_delete_expired", `Retry riuscito — eliminate ${deleted} proposte scadute rimaste in sospeso`);
        }
      })
      .catch((err) => {
        if (isBgDbLimiterDropError(err)) {
          addMatchLog("WARN", "cleanup_delete_expired", "Retry posticipato di nuovo — DB managed ancora sotto pressione, riprovo al prossimo ciclo naturale");
          void recordCycleDrop("cleanup_delete_expired_retry");
        } else {
          schedulerLogger.error({ err }, "Retry cleanup_delete_expired fallito");
          addMatchLog("ERROR", "cleanup_delete_expired", `Retry fallito: ${err instanceof Error ? err.message : String(err)}`);
          void recordCycleError("cleanup_delete_expired_retry");
        }
      });
  }, CLEANUP_EXPIRED_RETRY_DELAY_MS);
  cleanupExpiredRetryTimer.unref?.();
}

export function getMatchingLockState() {
  return {
    isRunning: cycleInFlight,
    lastStartAt: lastMatchingStart,
    lastStartIso: lastMatchingStart ? new Date(lastMatchingStart).toISOString() : null,
    elapsedMs: lastMatchingStart ? Date.now() - lastMatchingStart : null,
  };
}

export function forceUnlockMatching(): { wasRunning: boolean; lastStartAt: number | null } {
  const wasRunning = cycleInFlight;
  const lastStartAt = lastMatchingStart;
  cycleInFlight = false;
  lastMatchingStart = null;
  forceUnlockMatchingLock();
  console.warn(`[Matching] forceUnlockMatching invocato — wasRunning=${wasRunning}, lastStartAt=${lastStartAt}`);
  return { wasRunning, lastStartAt };
}

// ─── Scheduler heartbeat (Task #4798) ───────────────────────────────────────
//
// `lastRunAt` viene scritto SOLO al completamento di un ciclo riuscito, quindi
// quando i cicli vengono saltati (pool saturo) o falliscono, il collector vede
// `scheduler.last_run_min_ago` crescere all'infinito e non distingue "scheduler
// morto" da "scheduler vivo che salta legittimamente". Il heartbeat registra
// che il LOOP è vivo a ogni tick, qualunque sia l'esito, così un salto
// intenzionale non è più indistinguibile da uno stallo.
let lastHeartbeatPersistAt = 0;
const HEARTBEAT_PERSIST_THROTTLE_MS = 30_000;

// Dedup per il WARN "heartbeat persist failed": quando DragonflyDB è offline il
// bg-db-limiter può droppare la scrittura heartbeat ad ogni tick (~1min). Senza
// throttle questo WARN inonda il log degli eventi admin e nasconde problemi reali
// di Postgres. Si riemette al massimo una volta ogni 10 minuti.
let lastHeartbeatWarnAt = 0;
const HEARTBEAT_WARN_COOLDOWN_MS = 10 * 60 * 1_000; // 10 minuti

// Dedup per il WARN "matching_scheduler_state persist failed": stesso problema —
// quando DragonflyDB è offline, il persist post-ciclo viene droppato ad ogni
// ciclo riuscito. Si riemette al massimo una volta ogni 10 minuti.
let lastCycleStatePersistWarnAt = 0;
const CYCLE_STATE_PERSIST_WARN_COOLDOWN_MS = 10 * 60 * 1_000; // 10 minuti

// Esportato per la copertura di test diretta (Task #4804): verifica che ogni
// path di skip scriva lastTickAt/lastTickResult e rispetti il throttle 30s.
export function recordSchedulerHeartbeat(tickResult: string, opts?: { force?: boolean }): void {
  const now = Date.now();
  // Throttle: triggerMatchingRun può essere invocato on-demand (login/admin)
  // oltre che dal tick orario; evitiamo un upsert per ogni chiamata.
  // `force` bypassa il throttle per gli eventi di recovery (zombie_recovered):
  // sono rari e DEVONO essere registrati, altrimenti un heartbeat di skip
  // emesso <30s prima li farebbe sparire (Task #157).
  if (!opts?.force && now - lastHeartbeatPersistAt < HEARTBEAT_PERSIST_THROTTLE_MS) return;
  lastHeartbeatPersistAt = now;
  const tickAtIso = new Date(now).toISOString();
  withBgDbSlot(() => storage.getAppSetting("matching_scheduler_state"))
    .then((existing) => {
      const prev = (existing?.valueJson as Record<string, unknown>) ?? {};
      // Task #157 — il marker di recovery viene preservato in un campo dedicato:
      // lastTickResult viene sovrascritto dal heartbeat successivo entro pochi
      // secondi, mentre lastZombieRecoveredAt resta visibile al collector.
      const recoveryFields = tickResult === "zombie_recovered"
        ? { lastZombieRecoveredAt: tickAtIso }
        : {};
      return withBgDbSlot(() => storage.upsertAppSetting("matching_scheduler_state", undefined, {
        ...prev,
        lastTickAt: tickAtIso,
        lastTickResult: tickResult,
        ...recoveryFields,
      }));
    })
    .catch((err) => {
      const now = Date.now();
      if (now - lastHeartbeatWarnAt >= HEARTBEAT_WARN_COOLDOWN_MS) {
        lastHeartbeatWarnAt = now;
        schedulerLogger.warn({ err }, "scheduler heartbeat persist failed (non-blocking)");
      }
      // Altrimenti: drop silenzioso — il WARN è già stato emesso nel cooldown corrente.
    });
}

export function triggerMatchingRun(): { started: boolean; reason?: string } {
  // Zombie-cycle recovery: se la guardia in-process è bloccata da troppo tempo,
  // l'IIFE del ciclo precedente non si è risolto (fase appesa). Il lock
  // sottostante è ormai scaduto (TTL 5min < CYCLE_STALE_MS), quindi resettiamo
  // così il tick può ripartire invece di saltare per sempre.
  if (cycleInFlight && lastMatchingStart && Date.now() - lastMatchingStart > CYCLE_STALE_MS) {
    const stuckForMin = Math.floor((Date.now() - lastMatchingStart) / 60_000);
    schedulerLogger.warn({ stuckForMin, lastStartAt: lastMatchingStart }, "Ciclo zombie rilevato — reset forzato della guardia in-process");
    addMatchLog("WARN", "lock", `Ciclo zombie rilevato (bloccato da ${stuckForMin} min) — reset forzato, riparto`);
    // Task #157 — heartbeat esplicito PRIMA del reset: così il watchdog
    // (collectScheduler) registra l'evento di recovery e lo distingue da uno
    // scheduler morto che semplicemente non emette heartbeat.
    recordSchedulerHeartbeat("zombie_recovered", { force: true });
    cycleInFlight = false;
    lastMatchingStart = null;
    forceUnlockMatchingLock();
  }
  // Task #5318 — pre-check sincrono di sola sicurezza (evita di acquisire il
  // lock/avviare l'IIFE quando il DB è già saturo): legge il segnale ESCLUSIVAMENTE
  // tramite coordinator.isPoolSaturatedSync(), mai isPoolHealthy() direttamente,
  // così il Matching Coordinator resta l'unica superficie di policy kill-switch.
  // Il gate async canRunCycleNow() dentro il lock ricontrolla lo stesso segnale
  // (finestra di race tollerata: comportamento identico al pre-esistente).
  if (isPoolSaturatedSync()) {
    dedupWarn("matching/pool-saturated", "[Matching] Pool saturo — ciclo saltato (verrà riprovato al prossimo tick)");
    recordSchedulerHeartbeat("skip:pool_saturated");
    return { started: false, reason: "pool_saturated" };
  }
  if (cycleInFlight) {
    recordSchedulerHeartbeat("skip:already_running");
    return { started: false, reason: "already_running" };
  }
  if (lastMatchingStart && Date.now() - lastMatchingStart < MATCH_DEBOUNCE_MS) {
    const ago = Math.floor((Date.now() - lastMatchingStart) / 1000);
    recordSchedulerHeartbeat("skip:debounced");
    return { started: false, reason: `debounced — last run ${ago}s ago` };
  }
  recordSchedulerHeartbeat("started");
  cycleInFlight = true;
  lastMatchingStart = Date.now();
  const owner = `${process.pid}@${new Date().toISOString()}`;

  (async () => {
    const cycleStartedAt = Date.now();
    let cycleStatus: "ok" | "error" | "skipped" = "ok";
    try {
    const lockOutcome = await withMatchingLock(owner, async () => {
    void setMatchingLockState(true);

    // Task #5318 — gate del Matching Coordinator. Le guardie sync sopra
    // (pool_saturated/already_running/debounced) restano invariate: proteggono
    // l'integrità del processo (safety), non la policy. Questo gate aggiuntivo
    // copre SOLO gli stati di policy (pausa Horus / kill-switch) e non altera
    // il comportamento di default quando nessuna direttiva Horus è mai emessa.
    //
    // IMPORTANTE — parità col comportamento deterministico pre-esistente:
    // "stopped" (auto_matching_enabled=false via admin) NON deve saltare
    // l'INTERO ciclo qui — prima di questo modulo, disabilitare l'auto-match
    // saltava SOLO le fasi di matching, lasciando girare comunque la pulizia
    // (cleanup_expire / cleanup_delete_expired). Quel comportamento va
    // preservato: lo stop admin viene applicato più sotto, riusando
    // `coordinatorDecision.state !== "stopped"` al posto di una query separata
    // ad auto_matching_enabled. Solo paused_by_ai/paused_by_killswitch saltano
    // l'intero ciclo qui (comportamento identico al vecchio pre-check
    // sincrono di isPoolHealthy, che avveniva PRIMA di acquisire il lock).
    const coordinatorDecision = await canRunCycleNow();
    if (!coordinatorDecision.allowed && coordinatorDecision.state !== "stopped") {
      cycleStatus = "skipped";
      lastCycleOutcome = "skipped";
      cycleInFlight = false;
      lastMatchingStart = null;
      void setMatchingLockState(false);
      schedulerLogger.warn(
        { state: coordinatorDecision.state, reason: coordinatorDecision.reason, source: coordinatorDecision.source },
        "Ciclo saltato — Matching Coordinator ha negato l'esecuzione",
      );
      addMatchLog(
        "WARN",
        "coordinator",
        `Ciclo saltato — coordinator: ${coordinatorDecision.state} (${coordinatorDecision.reason}, fonte: ${coordinatorDecision.source})`,
      );
      void recordCycleDrop(`coordinator_${coordinatorDecision.state}`);
      return;
    }

    const recorder = new PhaseRecorder("on-demand");
    schedulerLogger.info({ event: "cycle_start", trigger: "on-demand" }, "Ciclo on-demand avviato");
    addMatchLog("INFO", "lock", "Ciclo on-demand avviato — lock acquisito");

    let totalMatches = 0;
    let garageMatches = 0;
    let bikerBikerMatchCount = 0;

    try {
      const expired = await recorder.time("cleanup_expire", () => runCleanup());
      if (expired > 0) schedulerLogger.info({ expired }, "Scadute proposte");

      try {
        const deleted = await recorder.time("cleanup_delete_expired", () => withBgDbSlot(() => withDbRetry(() => storage.deleteExpiredProposals())));
        if (deleted > 0) schedulerLogger.info({ deleted }, "Eliminate proposte scadute");
      } catch (err) {
        if (isBgDbLimiterDropError(err)) {
          schedulerLogger.warn({ err }, "cleanup_delete_expired posticipato — bg-db-limiter kill-switch attivo");
          addMatchLog("WARN", "cleanup_delete_expired", `Pulizia proposte scadute posticipata — DB managed sotto pressione (instabilità connessioni Postgres di Replit, NON il ThinkCentre), riparte a breve: ${err instanceof Error ? err.message : String(err)}`);
          void recordCycleDrop("cleanup_delete_expired");
          scheduleCleanupExpiredRetry();
        } else {
          schedulerLogger.error({ err }, "Errore eliminazione proposte scadute");
          addMatchLog("ERROR", "cleanup_delete_expired", `Errore eliminazione proposte scadute: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Riusa la decisione del coordinator (già interrogata sopra) invece di
      // una query separata ad auto_matching_enabled — stessa fonte di verità,
      // zero query duplicate, e coerente col fatto che "stopped" è derivato
      // ESATTAMENTE da questo AppSetting dentro getCoordinatorState().
      const autoMatchEnabled = coordinatorDecision.state !== "stopped";

      if (autoMatchEnabled) {
        const cycleTimeoutMs = await withBgDbSlot(() => getMatchingCycleTimeoutMs());

        const runCorePhase = async (name: string, fn: () => Promise<number>): Promise<number> => {
          try {
            return await recorder.time(name, () => withCycleTimeout(name, cycleTimeoutMs, fn));
          } catch (err) {
            if (err instanceof CycleTimeoutError) {
              schedulerLogger.warn(
                { phase: name, elapsedMs: err.elapsedMs, timeoutMs: cycleTimeoutMs },
                "phase timed out — aborted, continuing",
              );
              addMatchLog("WARN", name, `Fase "${name}" interrotta per timeout dopo ${err.elapsedMs}ms (limite ${cycleTimeoutMs}ms) — proseguo`);
              void recordCycleError(`${name}_timeout`);
              return 0;
            }
            throw err;
          }
        };

        const matches = await runCorePhase("proposal_matching", () => runMatching());
        const propStats = getLastProposalMatchingStats();
        recorder.updateLastPhase({
          candidatesPre: propStats.candidatesPre,
          candidatesPost: propStats.candidatesPost,
          matchesCreated: propStats.matchesCreated,
        });
        totalMatches += matches;
        if (matches > 0) {
          schedulerLogger.info({ matches, ...propStats }, "new proposal matches");
          addMatchLog("INFO", "proposal_matching", `Proposte: ${matches} match — candidati: ${propStats.candidatesPre ?? "?"}→${propStats.candidatesPost ?? "?"}`);
        }

        garageMatches = await runCorePhase("wishlist_matching", () => runWishlistMatching());
        const wishStats = getLastWishlistMatchingStats();
        recorder.updateLastPhase({
          candidatesPre: wishStats.candidatesPre,
          candidatesPost: wishStats.candidatesPost,
          matchesCreated: wishStats.matchesCreated,
        });
        totalMatches += garageMatches;
        if (garageMatches > 0) {
          schedulerLogger.info({ garageMatches, ...wishStats }, "new garage matches");
          addMatchLog("INFO", "wishlist_matching", `Wishlist/garage: ${garageMatches} match`);
        }

        bikerBikerMatchCount = await runCorePhase("biker_biker_matching", () => runBikerBikerMatching());
        totalMatches += bikerBikerMatchCount;
        if (bikerBikerMatchCount > 0) {
          schedulerLogger.info({ bikerBikerMatchCount }, "new biker-biker matches");
          addMatchLog("INFO", "biker_biker_matching", `Biker↔Biker: ${bikerBikerMatchCount} match`);
        }
        void recordMatchesCreated("proposal", matches);
        void recordMatchesCreated("garage", garageMatches);
        void recordMatchesCreated("biker_biker", bikerBikerMatchCount);

        const safePhases: Array<[string, () => Promise<number | void>]> = [
          ["biker_biker_type_style", runBikerBikerTypeStyleMatching],
          ["club_brand", runClubBrandMatching],
          ["music_biker_zav", runMusicMatchBikerZavorrina],
          ["music_affinity", runMusicAffinityMatching],
          ["gps_based", runGpsBasedMatching],
          ["event_matching", runEventMatching],
          ["biker_zav_base", runBikerZavorrinaBase],
          ["biker_zav_type_style", runBikerZavorrinaTypeStyleMatching],
          ["distance_matching", runDistanceMatching],
          ["route_type_zone", runRouteTypeZoneMatching],
          ["proposal_to_profile", runProposalToProfileMatching],
        ];

        for (const [name, fn] of safePhases) {
          try {
            const count = await recorder.time(name, () => withCycleTimeout(name, cycleTimeoutMs, async () => (await fn()) ?? 0));
            if (typeof count === "number" && count > 0) {
              totalMatches += count;
              schedulerLogger.info({ phase: name, count }, "phase produced matches");
              addMatchLog("INFO", name, `${name.replace(/_/g, " ")}: ${count} match`);
              void recordMatchesCreated(name, count);
            }
          } catch (err) {
            if (err instanceof CycleTimeoutError) {
              schedulerLogger.warn(
                { phase: name, elapsedMs: err.elapsedMs, timeoutMs: cycleTimeoutMs },
                "phase timed out — aborted, continuing",
              );
              addMatchLog("WARN", name, `Fase "${name}" interrotta per timeout dopo ${err.elapsedMs}ms (limite ${cycleTimeoutMs}ms) — proseguo`);
              void recordCycleError(`${name}_timeout`);
              continue;
            }
            if (isBgDbLimiterDropError(err)) {
              schedulerLogger.warn({ err, phase: name }, "fase posticipata — bg-db-limiter kill-switch attivo");
              addMatchLog("WARN", name, `Fase "${name}" posticipata — DB managed sotto pressione (instabilità connessioni Postgres di Replit, NON il ThinkCentre), riparte al prossimo tick: ${err instanceof Error ? err.message : String(err)}`);
              void recordCycleDrop(name);
              continue;
            }
            schedulerLogger.error({ err, phase: name }, "phase failed (non-blocking)");
            void captureMatchingError(err, { phase: name, trigger: "on-demand" }).then((eid) => {
              addMatchLog("ERROR", name, `Fase fallita: ${err instanceof Error ? err.message : String(err)}`, undefined, eid);
            });
            void recordCycleError(name);
          }
        }

        try {
          const fpResult = await withCycleTimeout("route_cells", cycleTimeoutMs, () => runExtractRouteCellsJob());
          if (fpResult.usersProcessed > 0) {
            console.log(`[Matching] Route fingerprint aggiornata: ${fpResult.usersProcessed} utenti, ${fpResult.cellsTotal} celle`);
            addMatchLog("INFO", "route_cells", `Route fingerprint: ${fpResult.usersProcessed} utenti, ${fpResult.cellsTotal} celle`);
          }
          const raCount = await withCycleTimeout("route_similarity", cycleTimeoutMs, () => runRouteSimilarityMatching());
          if (raCount > 0) {
            console.log(`[Matching] Found ${raCount} new route-affinity matches`);
            addMatchLog("INFO", "route_similarity", `Route affinity: ${raCount} match`);
          }
          const priResult = await withCycleTimeout("planned_route_invite", cycleTimeoutMs, () => runPlannedRouteAffinity());
          if (priResult.invitesCreated > 0) {
            console.log(`[Matching] Planned route invites: ${priResult.invitesCreated} nuovi inviti su ${priResult.routesProcessed} route`);
            addMatchLog("INFO", "planned_route_invite", `Planned route invite: ${priResult.invitesCreated} inviti su ${priResult.routesProcessed} route`);
            void recordMatchesCreated("planned_route_invite", priResult.invitesCreated);
          }
        } catch (err) {
          if (err instanceof CycleTimeoutError) {
            schedulerLogger.warn(
              { phase: err.cycleName, elapsedMs: err.elapsedMs, timeoutMs: cycleTimeoutMs },
              "phase timed out — aborted, continuing",
            );
            addMatchLog("WARN", err.cycleName, `Fase "${err.cycleName}" interrotta per timeout dopo ${err.elapsedMs}ms (limite ${cycleTimeoutMs}ms) — proseguo`);
            void recordCycleError(`${err.cycleName}_timeout`);
          } else if (isBgDbLimiterDropError(err)) {
            schedulerLogger.warn({ err }, "route_affinity posticipato — bg-db-limiter kill-switch attivo");
            addMatchLog("WARN", "route_affinity", `Route affinity posticipato — DB managed sotto pressione (instabilità connessioni Postgres di Replit, NON il ThinkCentre), riparte al prossimo tick: ${err instanceof Error ? err.message : String(err)}`);
            void recordCycleDrop("route_affinity");
          } else {
            console.error("[Matching] RouteAffinity matching error (non-blocking):", err);
            addMatchLog("ERROR", "route_affinity", `Route affinity errore: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        try {
          const enrichResult = await withCycleTimeout("enrich_breakdowns", cycleTimeoutMs, () => enrichBikerMatchBreakdowns());
          const enrichTotal = enrichResult.bbUpdated + enrichResult.bzUpdated;
          const enrichCleared = enrichResult.bbCleared + enrichResult.bzCleared;
          if (enrichTotal > 0 || enrichCleared > 0) {
            schedulerLogger.info(enrichResult, "score_breakdown enriched with affinity scores");
            addMatchLog("INFO", "enrich_breakdowns",
              `Breakdown — scritto bb:${enrichResult.bbUpdated} bz:${enrichResult.bzUpdated} | rimosso bb:${enrichResult.bbCleared} bz:${enrichResult.bzCleared}`);
          }
        } catch (err) {
          if (err instanceof CycleTimeoutError) {
            schedulerLogger.warn(
              { phase: err.cycleName, elapsedMs: err.elapsedMs, timeoutMs: cycleTimeoutMs },
              "phase timed out — aborted, continuing",
            );
            addMatchLog("WARN", err.cycleName, `Fase "${err.cycleName}" interrotta per timeout dopo ${err.elapsedMs}ms (limite ${cycleTimeoutMs}ms) — proseguo`);
            void recordCycleError(`${err.cycleName}_timeout`);
          } else if (isBgDbLimiterDropError(err)) {
            schedulerLogger.warn({ err }, "enrich_breakdowns posticipato — bg-db-limiter kill-switch attivo");
            addMatchLog("WARN", "enrich_breakdowns", `Arricchimento breakdown posticipato — DB managed sotto pressione (instabilità connessioni Postgres di Replit, NON il ThinkCentre), riparte al prossimo tick: ${err instanceof Error ? err.message : String(err)}`);
            void recordCycleDrop("enrich_breakdowns");
          } else {
            console.error("[Matching] EnrichBreakdowns error (non-blocking):", err);
            addMatchLog("ERROR", "enrich_breakdowns", `Errore arricchimento breakdown: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } else {
        schedulerLogger.info("Auto matching disabilitato dall'admin, skip");
        addMatchLog("WARN", "auto_match", "Auto matching disabilitato dall'admin — ciclo saltato");
      }

      const cycleMetric = recorder.finish(totalMatches);
      lastCycleMeta = {
        completedAt: cycleMetric.completedAt,
        durationMs: cycleMetric.durationMs,
        zavorrinaMatchesNew: garageMatches,
        bikerBikerMatchesNew: bikerBikerMatchCount,
      };

      withBgDbSlot(() => storage.getAppSetting("matching_scheduler_state"))
        .then((existing) => {
          const prev = (existing?.valueJson as Record<string, unknown>) ?? {};
          return withBgDbSlot(() => storage.upsertAppSetting("matching_scheduler_state", undefined, {
            ...prev,
            lastRunAt: cycleMetric.completedAt,
            lastRunDurationMs: cycleMetric.durationMs,
          }));
        })
        .catch((err) => {
          const now = Date.now();
          if (now - lastCycleStatePersistWarnAt >= CYCLE_STATE_PERSIST_WARN_COOLDOWN_MS) {
            lastCycleStatePersistWarnAt = now;
            schedulerLogger.warn({ err }, "matching_scheduler_state persist failed (non-blocking)");
          }
          // Altrimenti: drop silenzioso — il WARN è già stato emesso nel cooldown corrente.
        });

      lastCycleOutcome = "ok";
      addMatchLog("INFO", "cycle_complete", `Ciclo completato — ${totalMatches} match totali — ${prettyMs(cycleMetric.durationMs)} — ${memoryRssPretty()}`);
      schedulerLogger.info(
        { duration: prettyMs(cycleMetric.durationMs), totalMatches, rss: memoryRssPretty() },
        "Ciclo on-demand completato"
      );
    } catch (err) {
      recorder.finish(totalMatches);
      if (isBgDbLimiterDropError(err)) {
        schedulerLogger.warn({ err }, "Ciclo posticipato — bg-db-limiter kill-switch attivo");
        cycleStatus = "skipped";
        lastCycleOutcome = "skipped";
        void recordCycleDrop("cycle_root");
        addMatchLog("WARN", "cycle_root", `Ciclo posticipato — DB managed sotto pressione (instabilità connessioni Postgres di Replit, NON il ThinkCentre), riparte al prossimo tick: ${err instanceof Error ? err.message : String(err)}`);
      } else {
        schedulerLogger.error({ err }, "Errore nel ciclo on-demand");
        cycleStatus = "error";
        lastCycleOutcome = "error";
        void recordCycleError("cycle_root");
        void captureMatchingError(err, { trigger: "on-demand", phase: "cycle_root" }).then((eid) => {
          addMatchLog("ERROR", "cycle_root", `Errore ciclo: ${err instanceof Error ? err.message : String(err)}`, undefined, eid);
        });
      }
    }
    });
    if (!lockOutcome.acquired) {
      schedulerLogger.warn({ reason: lockOutcome.reason }, "Ciclo skippato — lock già attivo");
      addMatchLog("WARN", "lock", `Ciclo skippato — lock già attivo: ${lockOutcome.reason ?? ""}`);
    }
    } catch (err) {
      if (isBgDbLimiterDropError(err)) {
        schedulerLogger.warn({ err }, "withMatchingLock posticipato — bg-db-limiter kill-switch attivo");
        cycleStatus = "skipped";
        lastCycleOutcome = "skipped";
        void recordCycleDrop("lock_wrapper");
        addMatchLog("WARN", "lock_wrapper", `Ciclo posticipato — DB managed sotto pressione (instabilità connessioni Postgres di Replit, NON il ThinkCentre), riparte al prossimo tick: ${err instanceof Error ? err.message : String(err)}`);
      } else {
        schedulerLogger.error({ err }, "Errore non gestito attorno a withMatchingLock");
        cycleStatus = "error";
        lastCycleOutcome = "error";
        void recordCycleError("lock_wrapper");
        void captureMatchingError(err, { trigger: "on-demand", phase: "lock_wrapper" }).then((eid) => {
          addMatchLog("ERROR", "lock_wrapper", `Errore withMatchingLock: ${err instanceof Error ? err.message : String(err)}`, undefined, eid);
        });
      }
    } finally {
      void recordMatchingCycle(cycleStatus, Date.now() - cycleStartedAt);
      void setMatchingLockState(false);
      cycleInFlight = false;
    }
  })();
  return { started: true };
}
