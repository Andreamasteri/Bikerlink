import { storage } from "../storage";
import { withDbRetry } from "../db";
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
  setMatchingLockState,
} from "./metrics";
import { captureMatchingError } from "../sentry";
import { addMatchLog } from "./match-log-buffer";
import { runCleanup, withCycleTimeout, getMatchingCycleTimeoutMs, CycleTimeoutError } from "./scheduler.helpers";

export { getMatchingLockStatus };

const MATCH_DEBOUNCE_MS = 10_000;

let cycleInFlight = false;
let lastMatchingStart: number | null = null;
let lastCycleOutcome: "ok" | "error" | null = null;
let lastCycleMeta: {
  completedAt: string;
  durationMs: number;
  zavorrinaMatchesNew: number;
  bikerBikerMatchesNew: number;
} | null = null;

export function getLastMatchingCycleMeta() {
  return lastCycleMeta;
}

export function getLastCycleOutcome(): "ok" | "error" | null {
  return lastCycleOutcome;
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

export function triggerMatchingRun(): { started: boolean; reason?: string } {
  if (cycleInFlight) {
    return { started: false, reason: "already_running" };
  }
  if (lastMatchingStart && Date.now() - lastMatchingStart < MATCH_DEBOUNCE_MS) {
    const ago = Math.floor((Date.now() - lastMatchingStart) / 1000);
    return { started: false, reason: `debounced — last run ${ago}s ago` };
  }
  cycleInFlight = true;
  lastMatchingStart = Date.now();
  const owner = `${process.pid}@${new Date().toISOString()}`;

  (async () => {
    const cycleStartedAt = Date.now();
    let cycleStatus: "ok" | "error" = "ok";
    try {
    const lockOutcome = await withMatchingLock(owner, async () => {
    void setMatchingLockState(true);
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
        const deleted = await recorder.time("cleanup_delete_expired", () => storage.deleteExpiredProposals());
        if (deleted > 0) schedulerLogger.info({ deleted }, "Eliminate proposte scadute");
      } catch (err) {
        schedulerLogger.error({ err }, "Errore eliminazione proposte scadute");
        addMatchLog("ERROR", "cleanup_delete_expired", `Errore eliminazione proposte scadute: ${err instanceof Error ? err.message : String(err)}`);
      }

      const autoMatchSetting = await withDbRetry(() => storage.getAppSetting("auto_matching_enabled"));
      const autoMatchEnabled = autoMatchSetting?.value !== "false";

      if (autoMatchEnabled) {
        const cycleTimeoutMs = await getMatchingCycleTimeoutMs();

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
          } else {
            console.error("[Matching] RouteAffinity matching error (non-blocking):", err);
            addMatchLog("ERROR", "route_affinity", `Route affinity errore: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        try {
          const enrichResult = await withCycleTimeout("enrich_breakdowns", cycleTimeoutMs, () => enrichBikerMatchBreakdowns());
          const enrichTotal = enrichResult.bbMusicUpdated + enrichResult.bbTelemetryUpdated
            + enrichResult.bzMusicUpdated + enrichResult.bzTelemetryUpdated;
          const enrichCleared = enrichResult.bbMusicCleared + enrichResult.bbTelemetryCleared
            + enrichResult.bzMusicCleared + enrichResult.bzTelemetryCleared;
          if (enrichTotal > 0 || enrichCleared > 0) {
            schedulerLogger.info(enrichResult, "score_breakdown enriched with affinity scores");
            addMatchLog("INFO", "enrich_breakdowns",
              `Breakdown — scritto bb musica:${enrichResult.bbMusicUpdated} stile:${enrichResult.bbTelemetryUpdated} bz musica:${enrichResult.bzMusicUpdated} stile:${enrichResult.bzTelemetryUpdated} | rimosso bb musica:${enrichResult.bbMusicCleared} stile:${enrichResult.bbTelemetryCleared} bz musica:${enrichResult.bzMusicCleared} stile:${enrichResult.bzTelemetryCleared}`);
          }
        } catch (err) {
          if (err instanceof CycleTimeoutError) {
            schedulerLogger.warn(
              { phase: err.cycleName, elapsedMs: err.elapsedMs, timeoutMs: cycleTimeoutMs },
              "phase timed out — aborted, continuing",
            );
            addMatchLog("WARN", err.cycleName, `Fase "${err.cycleName}" interrotta per timeout dopo ${err.elapsedMs}ms (limite ${cycleTimeoutMs}ms) — proseguo`);
            void recordCycleError(`${err.cycleName}_timeout`);
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

      storage.getAppSetting("matching_scheduler_state")
        .then((existing) => {
          const prev = (existing?.valueJson as Record<string, unknown>) ?? {};
          return storage.upsertAppSetting("matching_scheduler_state", undefined, {
            ...prev,
            lastRunAt: cycleMetric.completedAt,
            lastRunDurationMs: cycleMetric.durationMs,
          });
        })
        .catch((err) => schedulerLogger.warn({ err }, "matching_scheduler_state persist failed (non-blocking)"));

      lastCycleOutcome = "ok";
      addMatchLog("INFO", "cycle_complete", `Ciclo completato — ${totalMatches} match totali — ${prettyMs(cycleMetric.durationMs)} — ${memoryRssPretty()}`);
      schedulerLogger.info(
        { duration: prettyMs(cycleMetric.durationMs), totalMatches, rss: memoryRssPretty() },
        "Ciclo on-demand completato"
      );
    } catch (err) {
      schedulerLogger.error({ err }, "Errore nel ciclo on-demand");
      recorder.finish(totalMatches);
      cycleStatus = "error";
      lastCycleOutcome = "error";
      void recordCycleError("cycle_root");
      void captureMatchingError(err, { trigger: "on-demand", phase: "cycle_root" }).then((eid) => {
        addMatchLog("ERROR", "cycle_root", `Errore ciclo: ${err instanceof Error ? err.message : String(err)}`, undefined, eid);
      });
    }
    });
    if (!lockOutcome.acquired) {
      schedulerLogger.warn({ reason: lockOutcome.reason }, "Ciclo skippato — lock già attivo");
      addMatchLog("WARN", "lock", `Ciclo skippato — lock già attivo: ${lockOutcome.reason ?? ""}`);
    }
    } catch (err) {
      schedulerLogger.error({ err }, "Errore non gestito attorno a withMatchingLock");
      cycleStatus = "error";
      lastCycleOutcome = "error";
      void recordCycleError("lock_wrapper");
      void captureMatchingError(err, { trigger: "on-demand", phase: "lock_wrapper" }).then((eid) => {
        addMatchLog("ERROR", "lock_wrapper", `Errore withMatchingLock: ${err instanceof Error ? err.message : String(err)}`, undefined, eid);
      });
    } finally {
      void recordMatchingCycle(cycleStatus, Date.now() - cycleStartedAt);
      void setMatchingLockState(false);
      cycleInFlight = false;
    }
  })();
  return { started: true };
}
