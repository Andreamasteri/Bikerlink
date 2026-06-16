import { storage } from "../storage";
import { bootJobQueue } from "../lib/boot-job-queue";
import { runMatching, runWishlistMatching, getLastProposalMatchingStats, getLastWishlistMatchingStats } from "./run-matching";
import { runBikerBikerMatching, runBikerBikerTypeStyleMatching } from "./run-biker";
import { runClubBrandMatching } from "./run-clubs";
import { runMusicMatchBikerZavorrina, runGpsBasedMatching, runEventMatching, runBikerZavorrinaTypeStyleMatching } from "./run-extra";
import { runBikerZavorrinaBase } from "./run-biker-zav-base";
import { runMusicAffinityMatching } from "./run-music-affinity";
import { runMusicEmbeddingsBackfill } from "./jobs/backfill-music-embeddings";
import { runExtractRouteCellsJob } from "./jobs/extract-route-cells";
import { runWeeklyRecapJob } from "./jobs/weekly-recap";
import { Cron } from "croner";
import { runDetectNegativePatternsJob } from "./jobs/detect-negative-patterns";
import { runRouteSimilarityMatching } from "./run-route-similarity";
import { runPlannedRouteAffinity } from "./run-planned-route-affinity";
import { runBioAffinityMatching } from "./run-bio-affinity";
import { runTelemetryAffinityMatching } from "./run-telemetry-affinity";
import { enrichBikerMatchBreakdowns } from "./enrich-breakdowns";
import { aggregateTelemetryProfiles } from "../jobs/aggregate-telemetry-profiles";
import { runDistanceMatching, runRouteTypeZoneMatching } from "./run-distance";
import { runProposalToProfileMatching } from "./run-profile";
import { recomputeAllUserMatchProfiles } from "./recompute-profiles";
import { PhaseRecorder } from "./perf-metrics";
import { schedulerLogger, matchingLogger } from "../lib/logger";
import { prettyMs, memoryRssPretty } from "../lib/format";
import { withMatchingLock, forceUnlockMatchingLock, getMatchingLockStatus } from "../cache/matching-lock";
import {
  recordMatchingCycle,
  recordMatchesCreated,
  recordCycleError,
  setMatchingLockState,
} from "./metrics";
import { captureMatchingError } from "../sentry";
import { addMatchLog, hookPinoLogger } from "./match-log-buffer";
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

// Tap both loggers so every info/warn/error line automatically lands in the
// in-memory ring buffer (not only the explicit addMatchLog() call-sites).
hookPinoLogger(schedulerLogger, "scheduler");
hookPinoLogger(matchingLogger, "matching");

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
        if (matches > 0) {
          schedulerLogger.info({ matches, ...propStats }, "new proposal matches");
          addMatchLog("INFO", "proposal_matching", `Proposte: ${matches} match — candidati: ${propStats.candidatesPre ?? "?"}→${propStats.candidatesPost ?? "?"}`);
        }

        garageMatches = await recorder.time("wishlist_matching", () => runWishlistMatching());
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

        bikerBikerMatchCount = await recorder.time("biker_biker_matching", () => runBikerBikerMatching());
        totalMatches += bikerBikerMatchCount;
        if (bikerBikerMatchCount > 0) {
          schedulerLogger.info({ bikerBikerMatchCount }, "new biker-biker matches");
          addMatchLog("INFO", "biker_biker_matching", `Biker↔Biker: ${bikerBikerMatchCount} match`);
        }
        // Task #2527 — metriche Prometheus per match creati per fase.
        void recordMatchesCreated("proposal", matches);
        void recordMatchesCreated("garage", garageMatches);
        void recordMatchesCreated("biker_biker", bikerBikerMatchCount);

        const safePhases: Array<[string, () => Promise<number | void>]> = [
          ["biker_biker_type_style", runBikerBikerTypeStyleMatching],
          ["club_brand", runClubBrandMatching],
          ["music_biker_zav", runMusicMatchBikerZavorrina],
          // Task #2516 — match per affinità musicale combinata (K=10/user).
          ["music_affinity", runMusicAffinityMatching],
          ["gps_based", runGpsBasedMatching],
          ["event_matching", runEventMatching],
          // Task #3917 — Biker↔Zav base (intento ruolo, nessun requisito moto/wishlist)
          ["biker_zav_base", runBikerZavorrinaBase],
          ["biker_zav_type_style", runBikerZavorrinaTypeStyleMatching],
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
              addMatchLog("INFO", name, `${name.replace(/_/g, " ")}: ${count} match`);
              // Task #2527 — metrica match creati per matcher/fase.
              void recordMatchesCreated(name, count);
            }
          } catch (err) {
            schedulerLogger.error({ err, phase: name }, "phase failed (non-blocking)");
            void captureMatchingError(err, { phase: name, trigger: "on-demand" }).then((eid) => {
              addMatchLog("ERROR", name, `Fase fallita: ${err instanceof Error ? err.message : String(err)}`, undefined, eid);
            });
            void recordCycleError(name);
          }
        }

        try {
          const fpResult = await runExtractRouteCellsJob();
          if (fpResult.usersProcessed > 0) {
            console.log(`[Matching] Route fingerprint aggiornata: ${fpResult.usersProcessed} utenti, ${fpResult.cellsTotal} celle`);
            addMatchLog("INFO", "route_cells", `Route fingerprint: ${fpResult.usersProcessed} utenti, ${fpResult.cellsTotal} celle`);
          }
          const raCount = await runRouteSimilarityMatching();
          if (raCount > 0) {
            console.log(`[Matching] Found ${raCount} new route-affinity matches`);
            addMatchLog("INFO", "route_similarity", `Route affinity: ${raCount} match`);
          }
          const priResult = await runPlannedRouteAffinity();
          if (priResult.invitesCreated > 0) {
            console.log(`[Matching] Planned route invites: ${priResult.invitesCreated} nuovi inviti su ${priResult.routesProcessed} route`);
            addMatchLog("INFO", "planned_route_invite", `Planned route invite: ${priResult.invitesCreated} inviti su ${priResult.routesProcessed} route`);
            void recordMatchesCreated("planned_route_invite", priResult.invitesCreated);
          }
        } catch (err) {
          console.error("[Matching] RouteAffinity matching error (non-blocking):", err);
          addMatchLog("ERROR", "route_affinity", `Route affinity errore: ${err instanceof Error ? err.message : String(err)}`);
        }

        try {
          const enrichResult = await enrichBikerMatchBreakdowns();
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
          console.error("[Matching] EnrichBreakdowns error (non-blocking):", err);
          addMatchLog("ERROR", "enrich_breakdowns", `Errore arricchimento breakdown: ${err instanceof Error ? err.message : String(err)}`);
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

  // Task #2516 — backfill embedding `music_taste` (one-shot per day, best-effort).
  // Guarded by AppSetting `music_backfill_last_ran_at`: skipped if < 23h ago.
  // Runs via bootJobQueue to avoid DB pool contention with other heavy boot jobs.
  bootJobQueue.register("MusicEmbeddingsBackfill", async () => {
    const lastRanSetting = await storage.getAppSetting("music_backfill_last_ran_at");
    const lastRanAt = lastRanSetting?.value ? parseInt(lastRanSetting.value, 10) : 0;
    const TWENTY_THREE_HOURS_MS = 23 * 60 * 60 * 1000;
    if (Number.isFinite(lastRanAt) && Date.now() - lastRanAt < TWENTY_THREE_HOURS_MS) {
      const elapsedH = ((Date.now() - lastRanAt) / 3_600_000).toFixed(1);
      console.log(`[Matching] MusicEmbeddings backfill skipped — last ran ${elapsedH}h ago (<23h)`);
      return;
    }
    const result = await runMusicEmbeddingsBackfill();
    await storage.upsertAppSetting("music_backfill_last_ran_at", String(Date.now()));
    console.log(
      `[Matching] MusicEmbeddings backfill done — scanned=${result.scanned}` +
      ` generated=${result.generated} cached=${result.cached} skipped=${result.skipped} errors=${result.errors}`,
    );
  });

  // Delay di 3 min: la lettura di fake_users_enabled non è urgente al boot e la
  // contesa sul pool DB nei primi minuti causa timeout sporadici in produzione.
  setTimeout(async () => {
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
  }, 3 * 60_000);

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
    addMatchLog("INFO", "archive_stale", "Archiviazione match stale avviata");
    try {
      const afterSetting = await storage.getAppSetting("match_archive_after_days");
      const afterDays = afterSetting?.value ? Math.max(1, parseInt(afterSetting.value, 10)) : 30;
      const [bz, bb, pp, pm] = await Promise.all([
        storage.archiveStaleBikerZavorrinaMatches(afterDays),
        storage.archiveStaleBikerBikerMatches(afterDays),
        storage.archiveStaleProposalProfileMatches(afterDays),
        storage.archiveStaleProposalMatches(afterDays),
      ]);
      const total = bz + bb + pp + pm;
      if (total > 0) {
        console.log(`[Archive] Archiviati ${total} match 'new'/'pending' più vecchi di ${afterDays}gg (bz=${bz}, bb=${bb}, pp=${pp}, pm=${pm})`);
        addMatchLog("INFO", "archive_stale", `Archiviati ${total} match stale — bz=${bz}, bb=${bb}, pp=${pp}, pm=${pm} (soglia ${afterDays}gg)`);
      } else {
        addMatchLog("INFO", "archive_stale", `Archiviazione completata — nessun match stale da archiviare (soglia ${afterDays}gg)`);
      }
    } catch (err) {
      console.error("[Archive] Errore archiviazione match stale:", err);
      addMatchLog("ERROR", "archive_stale", `Errore archiviazione match stale: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  addMatchLog("INFO", "archive_stale", "Prima archiviazione programmata tra 3 minuti");
  setTimeout(runArchiveStaleMatches, 3 * 60 * 1000);
  _engineTimers.push(setInterval(runArchiveStaleMatches, 24 * 60 * 60 * 1000));
  console.log("[Matching] Archiviazione giornaliera match 'new' stale avviata");

  // Weekly recap: ogni lunedì alle 9:00 Europe/Rome (DST gestito da croner)
  if (process.env.DISABLE_WEEKLY_RECAP_JOB !== "1") {
    try {
      const cron = new Cron(
        "0 9 * * 1",
        { timezone: "Europe/Rome", protect: true, name: "weekly-recap" },
        async () => {
          addMatchLog("INFO", "weekly_recap", "Weekly recap avviato (lun 09:00 Europe/Rome)");
          try {
            console.log("[WeeklyRecap] Trigger schedulato (lun 09:00 Europe/Rome)");
            const r = await runWeeklyRecapJob();
            addMatchLog("INFO", "weekly_recap", `Weekly recap completato — utenti: ${r.usersProcessed}, recap: ${r.recapsCreated}, push: ${r.pushSent}`);
          } catch (err) {
            console.error("[WeeklyRecap] Errore esecuzione schedulata:", err);
            addMatchLog("ERROR", "weekly_recap", `Errore weekly recap: ${err instanceof Error ? err.message : String(err)}`);
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
    addMatchLog("INFO", "neg_pattern", "Rilevamento pattern negativi avviato (startup)");
    runDetectNegativePatternsJob()
      .then((r) => {
        if (r.suggestionsInserted > 0) {
          console.log(`[NegPattern] ${r.suggestionsInserted} suggerimenti inseriti su ${r.usersProcessed} utenti`);
        }
        addMatchLog("INFO", "neg_pattern", `Pattern negativi (startup): ${r.suggestionsInserted} suggerimenti / ${r.usersProcessed} utenti analizzati`);
      })
      .catch((err) => {
        console.error("[NegPattern] startup run failed:", err);
        addMatchLog("ERROR", "neg_pattern", `Errore rilevamento pattern negativi (startup): ${err instanceof Error ? err.message : String(err)}`);
      });
  }, 10 * 60 * 1000);
  _engineTimers.push(setInterval(() => {
    addMatchLog("INFO", "neg_pattern", "Rilevamento pattern negativi avviato (giornaliero)");
    runDetectNegativePatternsJob()
      .then((r) => {
        if (r.suggestionsInserted > 0) {
          console.log(`[NegPattern] daily: ${r.suggestionsInserted} suggerimenti inseriti su ${r.usersProcessed} utenti`);
        }
        addMatchLog("INFO", "neg_pattern", `Pattern negativi (giornaliero): ${r.suggestionsInserted} suggerimenti / ${r.usersProcessed} utenti analizzati`);
      })
      .catch((err) => {
        console.error("[NegPattern] daily run failed:", err);
        addMatchLog("ERROR", "neg_pattern", `Errore rilevamento pattern negativi (giornaliero): ${err instanceof Error ? err.message : String(err)}`);
      });
  }, 24 * 60 * 60 * 1000));
  console.log("[Matching] Daily negative-pattern detection scheduled");

  // Daily recompute of per-user match feedback profiles (24h interval).
  // Runs once shortly after startup, then every 24 hours.
  setTimeout(() => {
    addMatchLog("INFO", "profile_recompute", "Ricalcolo profili utente avviato (startup)");
    recomputeAllUserMatchProfiles()
      .then(() => {
        addMatchLog("INFO", "profile_recompute", "Ricalcolo profili utente completato (startup)");
      })
      .catch((err) => {
        console.error("[ProfileRecompute] startup run failed:", err);
        addMatchLog("ERROR", "profile_recompute", `Errore ricalcolo profili utente (startup): ${err instanceof Error ? err.message : String(err)}`);
      });
  }, 5 * 60 * 1000);
  _engineTimers.push(setInterval(() => {
    addMatchLog("INFO", "profile_recompute", "Ricalcolo profili utente avviato (giornaliero)");
    recomputeAllUserMatchProfiles()
      .then(() => {
        addMatchLog("INFO", "profile_recompute", "Ricalcolo profili utente completato (giornaliero)");
      })
      .catch((err) => {
        console.error("[ProfileRecompute] daily run failed:", err);
        addMatchLog("ERROR", "profile_recompute", `Errore ricalcolo profili utente (giornaliero): ${err instanceof Error ? err.message : String(err)}`);
      });
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
  // Registered in bootJobQueue to avoid overlapping with other heavy boot jobs.
  bootJobQueue.register("BioAffinityMatching", runBioAffinitySafe);
  _engineTimers.push(setInterval(runBioAffinitySafe, 30 * 60 * 1000));
  console.log("[Matching] BioAffinity matcher schedulato (30 min)");

  // Task #3393 — Telemetry Affinity: aggregazione profili + matcher giornaliero.
  // L'aggregazione (ride_telemetry → user_telemetry_profile + embedding) precede
  // sempre il matcher così i match usano dati freschi. Bassa frequenza (24h):
  // lo stile di guida evolve lentamente ed è costoso (embeddings).
  const runTelemetryAffinitySafe = async () => {
    addMatchLog("INFO", "telemetry_affinity", "TelemetryAffinity avviato");
    try {
      const profiles = await aggregateTelemetryProfiles();
      if (profiles > 0) {
        console.log(`[Matching] TelemetryAffinity: ${profiles} profili aggregati`);
      }
      const count = await runTelemetryAffinityMatching();
      if (count > 0) {
        console.log(`[Matching] TelemetryAffinity ciclo: ${count} nuovi match`);
      }
      addMatchLog("INFO", "telemetry_affinity", `TelemetryAffinity completato: ${profiles} profili aggregati, ${count} nuovi match`);
      const enrichResult = await enrichBikerMatchBreakdowns();
      const enrichTotal = enrichResult.bbTelemetryUpdated + enrichResult.bzTelemetryUpdated;
      const enrichCleared = enrichResult.bbTelemetryCleared + enrichResult.bzTelemetryCleared;
      if (enrichTotal > 0 || enrichCleared > 0) {
        addMatchLog("INFO", "enrich_breakdowns",
          `Breakdown stile_guida post-telemetry — scritto bb:${enrichResult.bbTelemetryUpdated} bz:${enrichResult.bzTelemetryUpdated} | rimosso bb:${enrichResult.bbTelemetryCleared} bz:${enrichResult.bzTelemetryCleared}`);
      }
    } catch (err) {
      console.error("[Matching] TelemetryAffinity ciclo errore:", err);
      addMatchLog("ERROR", "telemetry_affinity", `Errore TelemetryAffinity: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  // Registered in bootJobQueue to avoid overlapping with other heavy boot jobs.
  bootJobQueue.register("TelemetryAffinityMatching", runTelemetryAffinitySafe);
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
