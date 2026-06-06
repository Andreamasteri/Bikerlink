import { storage } from "../storage";
import { runMatching, runWishlistMatching, getLastProposalMatchingStats, getLastWishlistMatchingStats } from "./run-matching";
import { runBikerBikerMatching, runBikerBikerTypeStyleMatching } from "./run-biker";
import { runClubBrandMatching } from "./run-clubs";
import { runMusicMatchBikerZavarrina, runGpsBasedMatching, runEventMatching, runBikerZavarrinaTypeStyleMatching } from "./run-extra";
import { runMusicAffinityMatching } from "./run-music-affinity";
import { runMusicEmbeddingsBackfill } from "./jobs/backfill-music-embeddings";
import { runExtractRouteCellsJob } from "./jobs/extract-route-cells";
import { runWeeklyRecapJob } from "./jobs/weekly-recap";
import { Cron } from "croner";
import { runDetectNegativePatternsJob } from "./jobs/detect-negative-patterns";
import { runRouteSimilarityMatching } from "./run-route-similarity";
import { runBioAffinityMatching } from "./run-bio-affinity";
import { runTelemetryAffinityMatching } from "./run-telemetry-affinity";
import { aggregateTelemetryProfiles } from "../jobs/aggregate-telemetry-profiles";
import { runDistanceMatching, runRouteTypeZoneMatching } from "./run-distance";
import { runProposalToProfileMatching } from "./run-profile";
import { recomputeAllUserMatchProfiles } from "./recompute-profiles";
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
import {
  runCleanup,
  pruneStaleProposalProfileMatches,
  pruneOldZoneNotifications,
  runFakeZavorrineRotation,
  lastUserMatchingAt,
  triggerProposalProfileMatchingForZavorrina,
  triggerProposalCreatedMatching,
  triggerMatchingForUser,
} from "./scheduler.helpers";

export { triggerProposalProfileMatchingForZavorrina, triggerProposalCreatedMatching, triggerMatchingForUser };

const MATCH_DEBOUNCE_MS = 10_000;

let cycleInFlight = false;
let lastMatchingStart: number | null = null;
let lastCycleMeta: {
  completedAt: string;
  durationMs: number;
  zavarrinaMatchesNew: number;
  bikerBikerMatchesNew: number;
} | null = null;

export function getLastMatchingCycleMeta() {
  return lastCycleMeta;
}

/**
 * Lightweight legacy shape (for /admin/matching/lock-state). Use
 * getMatchingLockStatus() (re-exported) for the full Redis-aware view.
 */
export function getMatchingLockState() {
  return {
    isRunning: cycleInFlight,
    lastStartAt: lastMatchingStart,
    lastStartIso: lastMatchingStart ? new Date(lastMatchingStart).toISOString() : null,
    elapsedMs: lastMatchingStart ? Date.now() - lastMatchingStart : null,
  };
}

export { getMatchingLockStatus };

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
      }

      const autoMatchSetting = await storage.getAppSetting("auto_matching_enabled");
      const autoMatchEnabled = autoMatchSetting?.value !== "false";

      if (autoMatchEnabled) {
        const matches = await recorder.time("proposal_matching", () => runMatching());
        const propStats = getLastProposalMatchingStats();
        recorder.updateLastPhase({
          candidatesPre: propStats.candidatesPre,
          candidatesPost: propStats.candidatesPost,
          matchesCreated: propStats.matchesCreated,
        });
        totalMatches += matches;
        if (matches > 0) schedulerLogger.info({ matches, ...propStats }, "new proposal matches");

        garageMatches = await recorder.time("wishlist_matching", () => runWishlistMatching());
        const wishStats = getLastWishlistMatchingStats();
        recorder.updateLastPhase({
          candidatesPre: wishStats.candidatesPre,
          candidatesPost: wishStats.candidatesPost,
          matchesCreated: wishStats.matchesCreated,
        });
        totalMatches += garageMatches;
        if (garageMatches > 0) schedulerLogger.info({ garageMatches, ...wishStats }, "new garage matches");

        bikerBikerMatchCount = await recorder.time("biker_biker_matching", () => runBikerBikerMatching());
        totalMatches += bikerBikerMatchCount;
        if (bikerBikerMatchCount > 0) schedulerLogger.info({ bikerBikerMatchCount }, "new biker-biker matches");
        // Task #2527 — metriche Prometheus per match creati per fase.
        void recordMatchesCreated("proposal", matches);
        void recordMatchesCreated("garage", garageMatches);
        void recordMatchesCreated("biker_biker", bikerBikerMatchCount);

        const safePhases: Array<[string, () => Promise<number | void>]> = [
          ["biker_biker_type_style", runBikerBikerTypeStyleMatching],
          ["club_brand", runClubBrandMatching],
          ["music_biker_zav", runMusicMatchBikerZavarrina],
          // Task #2516 — match per affinità musicale combinata (K=10/user).
          ["music_affinity", runMusicAffinityMatching],
          ["gps_based", runGpsBasedMatching],
          ["event_matching", runEventMatching],
          ["biker_zav_type_style", runBikerZavarrinaTypeStyleMatching],
          ["distance_matching", runDistanceMatching],
          ["route_type_zone", runRouteTypeZoneMatching],
          ["proposal_to_profile", runProposalToProfileMatching],
        ];

        for (const [name, fn] of safePhases) {
          try {
            const count = await recorder.time(name, async () => (await fn()) ?? 0);
            if (typeof count === "number" && count > 0) {
              totalMatches += count;
              schedulerLogger.info({ phase: name, count }, "phase produced matches");
              // Task #2527 — metrica match creati per matcher/fase.
              void recordMatchesCreated(name, count);
            }
          } catch (err) {
            schedulerLogger.error({ err, phase: name }, "phase failed (non-blocking)");
            // Task #2527 — Sentry + Prometheus per errori di fase.
            void recordCycleError(name);
            void captureMatchingError(err, { phase: name, trigger: "on-demand" });
          }
        }

        try {
          const fpResult = await runExtractRouteCellsJob();
          if (fpResult.usersProcessed > 0) {
            console.log(`[Matching] Route fingerprint aggiornata: ${fpResult.usersProcessed} utenti, ${fpResult.cellsTotal} celle`);
          }
          const raCount = await runRouteSimilarityMatching();
          if (raCount > 0) console.log(`[Matching] Found ${raCount} new route-affinity matches`);
        } catch (err) {
          console.error("[Matching] RouteAffinity matching error (non-blocking):", err);
        }
      } else {
        schedulerLogger.info("Auto matching disabilitato dall'admin, skip");
      }

      const cycleMetric = recorder.finish(totalMatches);
      lastCycleMeta = {
        completedAt: cycleMetric.completedAt,
        durationMs: cycleMetric.durationMs,
        zavarrinaMatchesNew: garageMatches,
        bikerBikerMatchesNew: bikerBikerMatchCount,
      };

      // Persiste lastRunAt sul DB così il watchdog collector può leggerlo.
      // Leggiamo prima lo stato esistente per preservare eventuali altri campi
      // (es. lockedAt) senza sovrascriverli.
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

      schedulerLogger.info(
        { duration: prettyMs(cycleMetric.durationMs), totalMatches, rss: memoryRssPretty() },
        "Ciclo on-demand completato"
      );
    } catch (err) {
      schedulerLogger.error({ err }, "Errore nel ciclo on-demand");
      recorder.finish(totalMatches);
      cycleStatus = "error";
      void recordCycleError("cycle_root");
      void captureMatchingError(err, { trigger: "on-demand", phase: "cycle_root" });
    }
    });
    if (!lockOutcome.acquired) {
      schedulerLogger.warn({ reason: lockOutcome.reason }, "Ciclo skippato — lock già attivo");
    }
    } catch (err) {
      schedulerLogger.error({ err }, "Errore non gestito attorno a withMatchingLock");
      cycleStatus = "error";
      void recordCycleError("lock_wrapper");
      void captureMatchingError(err, { trigger: "on-demand", phase: "lock_wrapper" });
    } finally {
      // Task #2527 — chiusura ciclo: durata + status + lock state per Prometheus.
      void recordMatchingCycle(cycleStatus, Date.now() - cycleStartedAt);
      void setMatchingLockState(false);
      // Guaranteed reset even if withMatchingLock / runtime throws unexpectedly.
      cycleInFlight = false;
    }
  })();
  return { started: true };
}

const _engineTimers: ReturnType<typeof setInterval>[] = [];
const _engineCrons: Cron[] = [];

export function startMatchingEngine(): void {
  console.log("[Matching] Engine avviato — modalità on-demand (trigger da login utente)");

  // Task #2516 — backfill embedding `music_taste` (one-shot, best-effort).
  // Eseguito in background con ritardo per non rallentare il boot.
  setTimeout(() => {
    runMusicEmbeddingsBackfill().catch((err) => {
      console.error("[Matching] MusicEmbeddings backfill error (non-blocking):", err);
    });
  }, 30_000);

  (async () => {
    try {
      const fakeUsersSetting = await storage.getAppSetting("fake_users_enabled");
      const fakeUsersEnabled = fakeUsersSetting?.value === "true";
      if (!fakeUsersEnabled) {
        console.log("[Matching] Fake zavorrine rotation skipped (fake users disabled)");
      } else {
        runFakeZavorrineRotation();
        _engineTimers.push(setInterval(runFakeZavorrineRotation, 5 * 60 * 1000));
        console.log("[Matching] Fake zavorrine availability rotation started (5min interval)");
      }
    } catch (err) {
      console.error("[Matching] Error checking fake_users_enabled for rotation — skipped (fake users disabled):", err);
    }
  })();

  _engineTimers.push(setInterval(() => {
    try {
      console.log("[Matching] Ciclo automatico orario avviato");
      const result = triggerMatchingRun();
      if (!result.started) {
        console.log(`[Matching] Ciclo automatico saltato: ${result.reason}`);
      }
    } catch (err) {
      console.error("[Matching] Errore imprevisto nel ciclo automatico orario:", err);
    }
  }, 60 * 60 * 1000));
  console.log("[Matching] Ciclo di matching automatico orario avviato");

  const runArchiveStaleMatches = async () => {
    try {
      const afterSetting = await storage.getAppSetting("match_archive_after_days");
      const afterDays = afterSetting?.value ? Math.max(1, parseInt(afterSetting.value, 10)) : 30;
      const [bz, bb, pp, pm] = await Promise.all([
        storage.archiveStaleBikerZavarrinaMatches(afterDays),
        storage.archiveStaleBikerBikerMatches(afterDays),
        storage.archiveStaleProposalProfileMatches(afterDays),
        storage.archiveStaleProposalMatches(afterDays),
      ]);
      const total = bz + bb + pp + pm;
      if (total > 0) {
        console.log(`[Archive] Archiviati ${total} match 'new'/'pending' più vecchi di ${afterDays}gg (bz=${bz}, bb=${bb}, pp=${pp}, pm=${pm})`);
      }
    } catch (err) {
      console.error("[Archive] Errore archiviazione match stale:", err);
    }
  };
  setImmediate(runArchiveStaleMatches);
  _engineTimers.push(setInterval(runArchiveStaleMatches, 24 * 60 * 60 * 1000));
  console.log("[Matching] Archiviazione giornaliera match 'new' stale avviata");

  // Weekly recap: ogni lunedì alle 9:00 Europe/Rome (DST gestito da croner)
  if (process.env.DISABLE_WEEKLY_RECAP_JOB !== "1") {
    try {
      const cron = new Cron(
        "0 9 * * 1",
        { timezone: "Europe/Rome", protect: true, name: "weekly-recap" },
        async () => {
          try {
            console.log("[WeeklyRecap] Trigger schedulato (lun 09:00 Europe/Rome)");
            await runWeeklyRecapJob();
          } catch (err) {
            console.error("[WeeklyRecap] Errore esecuzione schedulata:", err);
          }
        },
      );
      _engineCrons.push(cron);
      const nextRun = cron.nextRun();
      console.log(
        `[Matching] Weekly recap schedulato — prossima esecuzione: ${nextRun?.toISOString() ?? "n/d"}`,
      );
    } catch (err) {
      console.error("[Matching] Errore schedulazione weekly recap:", err);
    }
  } else {
    console.log("[Matching] Weekly recap disabilitato (DISABLE_WEEKLY_RECAP_JOB=1)");
  }

  _engineTimers.push(setInterval(async () => {
    try {
      const expired = await runCleanup();
      if (expired > 0) console.log(`[Cleanup] Scadute ${expired} proposte`);
      const deleted = await storage.deleteExpiredProposals();
      if (deleted > 0) console.log(`[Cleanup] Eliminate ${deleted} proposte scadute`);
      const prunedZoneNotifs = await pruneOldZoneNotifications();
      if (prunedZoneNotifs > 0) console.log(`[Cleanup] Eliminate ${prunedZoneNotifs} zone notifications più vecchie di 30 giorni`);
      const prunedStaleMatches = await pruneStaleProposalProfileMatches();
      if (prunedStaleMatches > 0) console.log(`[Cleanup] Eliminate ${prunedStaleMatches} proposal-profile matches di proposte non attive`);
    } catch (err) {
      console.error("[Cleanup] Errore pulizia oraria:", err);
    }

    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    let purgati = 0;
    for (const [uid, ts] of lastUserMatchingAt) {
      if (ts < cutoff) { lastUserMatchingAt.delete(uid); purgati++; }
    }

    const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    console.log(
      `[MemDiag] rss=${memMb}MB | lastUserMatchingAt=${lastUserMatchingAt.size} (purgati=${purgati}) | ora=${new Date().toISOString()}`
    );
  }, 60 * 60 * 1000));
  console.log("[Matching] Cleanup orario proposte scadute avviato");

  // Task #2523 — Daily detection of recurring reject patterns →
  // pending_auto_suggestions. Runs ~10 minutes after startup, then every 24h.
  setTimeout(() => {
    runDetectNegativePatternsJob()
      .then((r) => {
        if (r.suggestionsInserted > 0) {
          console.log(`[NegPattern] ${r.suggestionsInserted} suggerimenti inseriti su ${r.usersProcessed} utenti`);
        }
      })
      .catch((err) => console.error("[NegPattern] startup run failed:", err));
  }, 10 * 60 * 1000);
  _engineTimers.push(setInterval(() => {
    runDetectNegativePatternsJob()
      .then((r) => {
        if (r.suggestionsInserted > 0) {
          console.log(`[NegPattern] daily: ${r.suggestionsInserted} suggerimenti inseriti su ${r.usersProcessed} utenti`);
        }
      })
      .catch((err) => console.error("[NegPattern] daily run failed:", err));
  }, 24 * 60 * 60 * 1000));
  console.log("[Matching] Daily negative-pattern detection scheduled");

  // Daily recompute of per-user match feedback profiles (24h interval).
  // Runs once shortly after startup, then every 24 hours.
  setTimeout(() => {
    recomputeAllUserMatchProfiles().catch((err) =>
      console.error("[ProfileRecompute] startup run failed:", err),
    );
  }, 5 * 60 * 1000);
  _engineTimers.push(setInterval(() => {
    recomputeAllUserMatchProfiles().catch((err) =>
      console.error("[ProfileRecompute] daily run failed:", err),
    );
  }, 24 * 60 * 60 * 1000));
  console.log("[Matching] Daily user-match-profile recompute scheduled");

  // Task #2530 — Recompute giornaliero del trust score reporter (snapshot sui
  // report pending). Inizia 7 min dopo il boot, poi ogni 24h.
  setTimeout(() => {
    import("../services/reportingService").then(({ recomputeAllTrustScores }) =>
      recomputeAllTrustScores()
        .then((r) => {
          if (r.updated > 0) console.log(`[Reports] Trust score ricalcolato — ${r.updated} report aggiornati`);
        })
        .catch((err) => console.error("[Reports] trust recompute startup failed:", err)),
    ).catch((err) => console.error("[Reports] trust import failed:", err));
  }, 7 * 60 * 1000);
  _engineTimers.push(setInterval(() => {
    import("../services/reportingService").then(({ recomputeAllTrustScores }) =>
      recomputeAllTrustScores()
        .then((r) => {
          if (r.updated > 0) console.log(`[Reports] daily trust score: ${r.updated} report aggiornati`);
        })
        .catch((err) => console.error("[Reports] daily trust recompute failed:", err)),
    ).catch(() => {});
  }, 24 * 60 * 60 * 1000));
  console.log("[Matching] Daily reporter trust-score recompute scheduled");

  // Task #2515 — Bio Affinity matching: lower frequency (30 min)
  // perché basato su embeddings (più costoso/lento).
  const runBioAffinitySafe = async () => {
    try {
      const count = await runBioAffinityMatching();
      if (count > 0) {
        console.log(`[Matching] BioAffinity ciclo: ${count} nuovi match`);
      }
    } catch (err) {
      console.error("[Matching] BioAffinity ciclo errore:", err);
    }
  };
  setTimeout(() => { runBioAffinitySafe(); }, 2 * 60 * 1000);
  _engineTimers.push(setInterval(runBioAffinitySafe, 30 * 60 * 1000));
  console.log("[Matching] BioAffinity matcher schedulato (30 min)");

  // Task #3393 — Telemetry Affinity: aggregazione profili + matcher giornaliero.
  // L'aggregazione (ride_telemetry → user_telemetry_profile + embedding) precede
  // sempre il matcher così i match usano dati freschi. Bassa frequenza (24h):
  // lo stile di guida evolve lentamente ed è costoso (embeddings).
  const runTelemetryAffinitySafe = async () => {
    try {
      const profiles = await aggregateTelemetryProfiles();
      if (profiles > 0) {
        console.log(`[Matching] TelemetryAffinity: ${profiles} profili aggregati`);
      }
      const count = await runTelemetryAffinityMatching();
      if (count > 0) {
        console.log(`[Matching] TelemetryAffinity ciclo: ${count} nuovi match`);
      }
    } catch (err) {
      console.error("[Matching] TelemetryAffinity ciclo errore:", err);
    }
  };
  setTimeout(() => { runTelemetryAffinitySafe(); }, 5 * 60 * 1000);
  _engineTimers.push(setInterval(runTelemetryAffinitySafe, 24 * 60 * 60 * 1000));
  console.log("[Matching] TelemetryAffinity matcher schedulato (24h)");
}

export function stopMatchingEngine(): void {
  for (const timer of _engineTimers) {
    clearInterval(timer);
  }
  _engineTimers.length = 0;
  for (const c of _engineCrons) {
    try { c.stop(); } catch { /* ignore */ }
  }
  _engineCrons.length = 0;
  console.log("[Matching] Engine fermato");
}
