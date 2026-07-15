import { storage } from "../storage";
import { withDbRetry } from "../db";
import { withBgDbSlot, isBgDbLimiterDropError } from "../lib/bg-db-limiter";
import { dedupWarn } from "../lib/dedup-logger";
import { bootJobQueue } from "../lib/boot-job-queue";
import { runMusicEmbeddingsBackfill } from "./jobs/backfill-music-embeddings";
import { runWeeklyRecapJob } from "./jobs/weekly-recap";
import { Cron } from "croner";
import { runDetectNegativePatternsJob } from "./jobs/detect-negative-patterns";
import { runBioAffinityMatching } from "./run-bio-affinity";
import { runTelemetryAffinityMatching } from "./run-telemetry-affinity";
import { enrichBikerMatchBreakdowns } from "./enrich-breakdowns";
import { aggregateTelemetryProfiles } from "../jobs/aggregate-telemetry-profiles";
import { recomputeDrCorrectionGlobal } from "../jobs/dr-correction-global";
import { runCleanup, pruneStaleProposalProfileMatches, pruneOldZoneNotifications, stopFakeZavorrineRotation, lastUserMatchingAt, withCycleTimeout, getMatchingCycleTimeoutMs, CycleTimeoutError } from "./scheduler.helpers";
import { recomputeAllUserMatchProfiles } from "./recompute-profiles";
import { addMatchLog } from "./match-log-buffer";
import { recordCycleError, recordCycleDrop } from "./metrics";
import { triggerMatchingRun } from "./scheduler.cycle";
import { withJobGate } from "../ai/coordinator/gated-job";

// Task #9 (Quebracho b, "Group D") — questi loop del motore di matching sono
// GIÀ soggetti al Matching Coordinator (canRunCycleNow, per-issuer
// admin/horus/quebracho — vedi ./coordinator.ts) per la decisione FINE
// "può girare un ciclo di matching adesso?". withJobGate qui aggiunge SOLO il
// gate GROSSOLANO di Quebracho a livello di job-registry (visibilità/pausa
// on-off dal pannello admin, coerente con gli altri ~26+ loop), senza
// duplicare né sostituire la logica del coordinator.

const _engineTimers: ReturnType<typeof setInterval>[] = [];
const _engineCrons: Cron[] = [];

export function startMatchingEngine(): void {
  console.log("[Matching] Engine avviato — modalità on-demand (trigger da login utente)");

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

  // NOTE: Fake zavorrine availability rotation is NOT started here anymore.
  // It is part of the unified "attività stregatti" toggle and its lifecycle
  // is owned by server/fake-activity.ts (start/stop with its own timer handle),
  // initialised at boot by initFakeActivityOnBoot(). This avoids a ghost 5-min
  // timer running whenever the matching engine is up.

  const gatedHourlyTick = withJobGate("matching-hourly-tick", async () => {
    console.log("[Matching] Ciclo automatico orario avviato");
    const result = triggerMatchingRun();
    if (!result.started) {
      console.log(`[Matching] Ciclo automatico saltato: ${result.reason}`);
    }
  });
  _engineTimers.push(setInterval(() => {
    gatedHourlyTick().catch((err) => console.error("[Matching] Errore imprevisto nel ciclo automatico orario:", err));
  }, 60 * 60 * 1000));
  console.log("[Matching] Ciclo di matching automatico orario avviato");

  const runArchiveStaleMatches = async () => {
    addMatchLog("INFO", "archive_stale", "Archiviazione match stale avviata");
    try {
      const { bz, bb, pp, pm, afterDays } = await withDbRetry(async () => {
        const afterSetting = await storage.getAppSetting("match_archive_after_days");
        const days = afterSetting?.value ? Math.max(1, parseInt(afterSetting.value, 10)) : 30;
        // Pool budget (Task #5323): archiviazioni in sequenza, non con
        // Promise.all — 4 UPDATE simultanee aprivano 4 connessioni del pool
        // insieme (burst non budgettato che contribuisce ai picchi di "waiting").
        const bz = await storage.archiveStaleBikerZavorrinaMatches(days);
        const bb = await storage.archiveStaleBikerBikerMatches(days);
        const pp = await storage.archiveStaleProposalProfileMatches(days);
        const pm = await storage.archiveStaleProposalMatches(days);
        return { bz, bb, pp, pm, afterDays: days };
      });
      const total = bz + bb + pp + pm;
      if (total > 0) {
        console.log(`[Archive] Archiviati ${total} match 'new'/'pending' più vecchi di ${afterDays}gg (bz=${bz}, bb=${bb}, pp=${pp}, pm=${pm})`);
        addMatchLog("INFO", "archive_stale", `Archiviati ${total} match stale — bz=${bz}, bb=${bb}, pp=${pp}, pm=${pm} (soglia ${afterDays}gg)`);
      } else {
        addMatchLog("INFO", "archive_stale", `Archiviazione completata — nessun match stale da archiviare (soglia ${afterDays}gg)`);
      }
    } catch (err) {
      dedupWarn("matching/archive-stale", "errore archiviazione match stale (non-fatal)", err);
      addMatchLog("ERROR", "archive_stale", `Errore archiviazione match stale: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const gatedArchiveStale = withJobGate("matching-archive-stale", runArchiveStaleMatches);
  addMatchLog("INFO", "archive_stale", "Prima archiviazione programmata tra 3 minuti");
  setTimeout(gatedArchiveStale, 3 * 60 * 1000);
  _engineTimers.push(setInterval(gatedArchiveStale, 24 * 60 * 60 * 1000));
  console.log("[Matching] Archiviazione giornaliera match 'new' stale avviata");

  if (process.env.DISABLE_WEEKLY_RECAP_JOB !== "1") {
    try {
      const gatedWeeklyRecap = withJobGate("matching-weekly-recap", async () => {
        addMatchLog("INFO", "weekly_recap", "Weekly recap avviato (lun 09:00 Europe/Rome)");
        try {
          console.log("[WeeklyRecap] Trigger schedulato (lun 09:00 Europe/Rome)");
          const r = await runWeeklyRecapJob();
          addMatchLog("INFO", "weekly_recap", `Weekly recap completato — utenti: ${r.usersProcessed}, recap: ${r.recapsCreated}, push: ${r.pushSent}`);
        } catch (err) {
          console.error("[WeeklyRecap] Errore esecuzione schedulata:", err);
          addMatchLog("ERROR", "weekly_recap", `Errore weekly recap: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
      const cron = new Cron(
        "0 9 * * 1",
        { timezone: "Europe/Rome", protect: true, name: "weekly-recap" },
        gatedWeeklyRecap,
      );
      _engineCrons.push(cron);
      const nextRun = cron.nextRun();
      console.log(`[Matching] Weekly recap schedulato — prossima esecuzione: ${nextRun?.toISOString() ?? "n/d"}`);
    } catch (err) {
      console.error("[Matching] Errore schedulazione weekly recap:", err);
    }
  } else {
    console.log("[Matching] Weekly recap disabilitato (DISABLE_WEEKLY_RECAP_JOB=1)");
  }

  const gatedHourlyCleanup = withJobGate("matching-hourly-cleanup", async () => {
    try {
      const { expired, deleted, prunedZoneNotifs, prunedStaleMatches } = await withDbRetry(async () => {
        const expired = await runCleanup();
        const deleted = await storage.deleteExpiredProposals();
        const prunedZoneNotifs = await pruneOldZoneNotifications();
        const prunedStaleMatches = await pruneStaleProposalProfileMatches();
        return { expired, deleted, prunedZoneNotifs, prunedStaleMatches };
      });
      if (expired > 0) console.log(`[Cleanup] Scadute ${expired} proposte`);
      if (deleted > 0) console.log(`[Cleanup] Eliminate ${deleted} proposte scadute`);
      if (prunedZoneNotifs > 0) console.log(`[Cleanup] Eliminate ${prunedZoneNotifs} zone notifications più vecchie di 30 giorni`);
      if (prunedStaleMatches > 0) console.log(`[Cleanup] Eliminate ${prunedStaleMatches} proposal-profile matches di proposte non attive`);
    } catch (err) {
      dedupWarn("matching/hourly-cleanup", "errore pulizia oraria (non-fatal)", err);
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
  });
  _engineTimers.push(setInterval(() => { void gatedHourlyCleanup(); }, 60 * 60 * 1000));
  console.log("[Matching] Cleanup orario proposte scadute avviato");

  const gatedNegPatternStartup = withJobGate("matching-daily-negative-pattern", async () => {
    addMatchLog("INFO", "neg_pattern", "Rilevamento pattern negativi avviato (startup)");
    try {
      const r = await runDetectNegativePatternsJob();
      if (r.suggestionsInserted > 0) {
        console.log(`[NegPattern] ${r.suggestionsInserted} suggerimenti inseriti su ${r.usersProcessed} utenti`);
      }
      addMatchLog("INFO", "neg_pattern", `Pattern negativi (startup): ${r.suggestionsInserted} suggerimenti / ${r.usersProcessed} utenti analizzati`);
    } catch (err) {
      console.error("[NegPattern] startup run failed:", err);
      addMatchLog("ERROR", "neg_pattern", `Errore rilevamento pattern negativi (startup): ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  setTimeout(() => { void gatedNegPatternStartup(); }, 10 * 60 * 1000);
  const gatedNegPatternDaily = withJobGate("matching-daily-negative-pattern", async () => {
    addMatchLog("INFO", "neg_pattern", "Rilevamento pattern negativi avviato (giornaliero)");
    try {
      const r = await runDetectNegativePatternsJob();
      if (r.suggestionsInserted > 0) {
        console.log(`[NegPattern] daily: ${r.suggestionsInserted} suggerimenti inseriti su ${r.usersProcessed} utenti`);
      }
      addMatchLog("INFO", "neg_pattern", `Pattern negativi (giornaliero): ${r.suggestionsInserted} suggerimenti / ${r.usersProcessed} utenti analizzati`);
    } catch (err) {
      console.error("[NegPattern] daily run failed:", err);
      addMatchLog("ERROR", "neg_pattern", `Errore rilevamento pattern negativi (giornaliero): ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  _engineTimers.push(setInterval(() => { void gatedNegPatternDaily(); }, 24 * 60 * 60 * 1000));
  console.log("[Matching] Daily negative-pattern detection scheduled");

  const gatedTrustStartup = withJobGate("matching-daily-trust-recompute", async () => {
    try {
      const { recomputeAllTrustScores } = await import("../services/reportingService");
      const r = await withDbRetry(() => recomputeAllTrustScores());
      if (r.updated > 0) console.log(`[Reports] trust score startup: ${r.updated} report aggiornati`);
    } catch (err) {
      dedupWarn("reports/trust-startup", "trust recompute startup failed (non-fatal)", err);
    }
  });
  setTimeout(() => { void gatedTrustStartup(); }, 7 * 60 * 1000);
  const gatedTrustDaily = withJobGate("matching-daily-trust-recompute", async () => {
    try {
      const { recomputeAllTrustScores } = await import("../services/reportingService");
      const r = await withDbRetry(() => recomputeAllTrustScores());
      if (r.updated > 0) console.log(`[Reports] daily trust score: ${r.updated} report aggiornati`);
    } catch (err) {
      dedupWarn("reports/trust-daily", "daily trust recompute failed (non-fatal)", err);
    }
  });
  _engineTimers.push(setInterval(() => { void gatedTrustDaily(); }, 24 * 60 * 60 * 1000));
  console.log("[Matching] Daily reporter trust-score recompute scheduled");

  const gatedProfileRecomputeStartup = withJobGate("matching-daily-profile-recompute", async () => {
    addMatchLog("INFO", "profile_recompute", "Ricalcolo profili utente avviato (startup)");
    try {
      await withBgDbSlot(() => withDbRetry(() => recomputeAllUserMatchProfiles()));
      addMatchLog("INFO", "profile_recompute", "Ricalcolo profili utente completato (startup)");
    } catch (err) {
      dedupWarn("matching/profile-recompute-startup", "errore ricalcolo profili utente (non-fatal)", err);
      addMatchLog("ERROR", "profile_recompute", `Errore ricalcolo profili utente (startup): ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  setTimeout(() => { void gatedProfileRecomputeStartup(); }, 5 * 60 * 1000);
  const gatedProfileRecomputeDaily = withJobGate("matching-daily-profile-recompute", async () => {
    addMatchLog("INFO", "profile_recompute", "Ricalcolo profili utente avviato (giornaliero)");
    try {
      await withBgDbSlot(() => withDbRetry(() => recomputeAllUserMatchProfiles()));
      addMatchLog("INFO", "profile_recompute", "Ricalcolo profili utente completato (giornaliero)");
    } catch (err) {
      dedupWarn("matching/profile-recompute-daily", "errore ricalcolo profili utente (non-fatal)", err);
      addMatchLog("ERROR", "profile_recompute", `Errore ricalcolo profili utente (giornaliero): ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  _engineTimers.push(setInterval(() => { void gatedProfileRecomputeDaily(); }, 24 * 60 * 60 * 1000));
  console.log("[Matching] Daily user-match-profile recompute scheduled");

  const runBioAffinitySafe = async () => {
    const timeoutMs = await getMatchingCycleTimeoutMs();
    try {
      const count = await withCycleTimeout("bio_affinity", timeoutMs, () => runBioAffinityMatching());
      if (count > 0) {
        console.log(`[Matching] BioAffinity ciclo: ${count} nuovi match`);
      }
    } catch (err) {
      if (err instanceof CycleTimeoutError) {
        console.warn(`[Matching] BioAffinity ciclo interrotto per timeout dopo ${err.elapsedMs}ms (limite ${timeoutMs}ms)`);
        addMatchLog("WARN", "bio_affinity", `BioAffinity interrotto per timeout dopo ${err.elapsedMs}ms (limite ${timeoutMs}ms)`);
        void recordCycleError("bio_affinity_timeout");
      } else if (isBgDbLimiterDropError(err)) {
        console.warn("[Matching] BioAffinity posticipato — bg-db-limiter attivo (pool sotto pressione), riparte al prossimo tick");
        addMatchLog("WARN", "bio_affinity", `BioAffinity posticipato — DB managed sotto pressione, riparte al prossimo tick: ${err instanceof Error ? err.message : String(err)}`);
        void recordCycleDrop("bio_affinity");
      } else {
        console.error("[Matching] BioAffinity ciclo errore:", err);
      }
    }
  };
  const gatedBioAffinity = withJobGate("matching-bio-affinity", runBioAffinitySafe);
  bootJobQueue.register("BioAffinityMatching", gatedBioAffinity);
  _engineTimers.push(setInterval(() => { void gatedBioAffinity(); }, 30 * 60 * 1000));
  console.log("[Matching] BioAffinity matcher schedulato (30 min)");

  const runTelemetryAffinitySafe = async () => {
    addMatchLog("INFO", "telemetry_affinity", "TelemetryAffinity avviato");
    const timeoutMs = await getMatchingCycleTimeoutMs();
    try {
      const profiles = await withCycleTimeout("telemetry_aggregate", timeoutMs, () => aggregateTelemetryProfiles());
      if (profiles > 0) {
        console.log(`[Matching] TelemetryAffinity: ${profiles} profili aggregati`);
      }
      const count = await withCycleTimeout("telemetry_affinity", timeoutMs, () => runTelemetryAffinityMatching());
      if (count > 0) {
        console.log(`[Matching] TelemetryAffinity ciclo: ${count} nuovi match`);
      }
      addMatchLog("INFO", "telemetry_affinity", `TelemetryAffinity completato: ${profiles} profili aggregati, ${count} nuovi match`);
      const enrichResult = await withCycleTimeout("enrich_breakdowns", timeoutMs, () => enrichBikerMatchBreakdowns());
      const enrichTotal = enrichResult.bbUpdated + enrichResult.bzUpdated;
      const enrichCleared = enrichResult.bbCleared + enrichResult.bzCleared;
      if (enrichTotal > 0 || enrichCleared > 0) {
        addMatchLog("INFO", "enrich_breakdowns",
          `Breakdown post-telemetry — scritto bb:${enrichResult.bbUpdated} bz:${enrichResult.bzUpdated} | rimosso bb:${enrichResult.bbCleared} bz:${enrichResult.bzCleared}`);
      }
    } catch (err) {
      if (err instanceof CycleTimeoutError) {
        console.warn(`[Matching] TelemetryAffinity "${err.cycleName}" interrotto per timeout dopo ${err.elapsedMs}ms (limite ${timeoutMs}ms)`);
        addMatchLog("WARN", err.cycleName, `Fase "${err.cycleName}" interrotta per timeout dopo ${err.elapsedMs}ms (limite ${timeoutMs}ms)`);
        void recordCycleError(`${err.cycleName}_timeout`);
      } else if (isBgDbLimiterDropError(err)) {
        console.warn("[Matching] TelemetryAffinity posticipato — bg-db-limiter attivo (pool sotto pressione), riparte al prossimo tick");
        addMatchLog("WARN", "telemetry_affinity", `TelemetryAffinity posticipato — DB managed sotto pressione, riparte al prossimo tick: ${err instanceof Error ? err.message : String(err)}`);
        void recordCycleDrop("telemetry_affinity");
      } else {
        console.error("[Matching] TelemetryAffinity ciclo errore:", err);
        addMatchLog("ERROR", "telemetry_affinity", `Errore TelemetryAffinity: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  const gatedTelemetryAffinity = withJobGate("matching-telemetry-affinity", runTelemetryAffinitySafe);
  bootJobQueue.register("TelemetryAffinityMatching", gatedTelemetryAffinity);
  _engineTimers.push(setInterval(() => { void gatedTelemetryAffinity(); }, 24 * 60 * 60 * 1000));
  console.log("[Matching] TelemetryAffinity matcher schedulato (24h)");

  // DR Correction Engine — global cross-user aggregate (Task #47). Per-user models
  // update in real time on ingestion; only the global aggregate is a periodic job.
  const gatedDrCorrectionGlobal = withJobGate("dr-correction-global", async () => {
    try {
      await recomputeDrCorrectionGlobal();
    } catch (err) {
      if (isBgDbLimiterDropError(err)) {
        console.warn("[DrCorrectionGlobal] posticipato — bg-db-limiter attivo, riparte al prossimo tick");
      } else {
        console.error("[DrCorrectionGlobal] ciclo errore:", err);
      }
    }
  });
  bootJobQueue.register("DrCorrectionGlobal", gatedDrCorrectionGlobal);
  _engineTimers.push(setInterval(() => { void gatedDrCorrectionGlobal(); }, 6 * 60 * 60 * 1000));
  console.log("[Matching] DR correction global aggregate schedulato (6h)");
}

export function stopMatchingEngine(): void {
  stopFakeZavorrineRotation();
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
