import { db } from "../db";
import { storage } from "../storage";
import { proposals, proposalZoneNotifications, proposalProfileMatches, type Proposal } from "@shared/db";
import { eq, sql, lt } from "drizzle-orm";
import { runMatching, runWishlistMatching, getLastProposalMatchingStats, getLastWishlistMatchingStats } from "./run-matching";
import { runBikerBikerMatching, runBikerBikerTypeStyleMatching } from "./run-biker";
import { runClubBrandMatching } from "./run-clubs";
import { runMusicMatchBikerZavarrina, runGpsBasedMatching, runEventMatching, runBikerZavarrinaTypeStyleMatching } from "./run-extra";
import { runExtractRouteCellsJob } from "./jobs/extract-route-cells";
import { runRouteSimilarityMatching } from "./run-route-similarity";
import { runDistanceMatching, runRouteTypeZoneMatching } from "./run-distance";
import { runProposalToProfileMatching } from "./run-profile";
import { runProposalZoneNotifications, runProposalMatchingForUser } from "./run-proposals";
import { runMatchingForUser } from "./run-user";
import { recomputeAllUserMatchProfiles } from "./recompute-profiles";
import { PhaseRecorder } from "./perf-metrics";
import { schedulerLogger } from "../lib/logger";
import { prettyMs, memoryRssPretty } from "../lib/format";

const MATCH_DEBOUNCE_MS = 10_000;

async function runCleanup(): Promise<number> {
  try {
    return await storage.expireOldProposals();
  } catch (error) {
    console.error("Cleanup error:", error);
    return 0;
  }
}

async function pruneStaleProposalProfileMatches(): Promise<number> {
  try {
    const activeProposalIds = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(eq(proposals.status, "active"));
    const activeIds = activeProposalIds.map((r) => r.id);
    if (activeIds.length === 0) {
      const result = await db
        .delete(proposalProfileMatches)
        .returning({ id: proposalProfileMatches.id });
      return result.length;
    }
    const result = await db
      .delete(proposalProfileMatches)
      .where(
        sql`${proposalProfileMatches.proposalId} NOT IN (${sql.join(activeIds.map((id) => sql`${id}`), sql`, `)})`
      )
      .returning({ id: proposalProfileMatches.id });
    return result.length;
  } catch (error) {
    console.error("[Cleanup] Errore pulizia proposal_profile_matches stale:", error);
    return 0;
  }
}

async function pruneOldZoneNotifications(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await db
      .delete(proposalZoneNotifications)
      .where(lt(proposalZoneNotifications.sentAt, cutoff))
      .returning({ id: proposalZoneNotifications.id });
    return result.length;
  } catch (error) {
    console.error("[Cleanup] Errore prune proposal_zone_notifications:", error);
    return 0;
  }
}

async function runFakeZavorrineRotation(): Promise<void> {
  try {
    await storage.toggleFakeZavorrineAvailability();
  } catch (error) {
    console.error("Fake zavorrine rotation error:", error);
  }
}

const lastZavarrinaProfileMatchAt = new Map<string, number>();
const ZAVORRINA_PROFILE_MATCH_DEBOUNCE_MS = 2 * 60 * 1000;

/**
 * Trigger proposal-profile matching when a zavorrina updates her location.
 * Fire-and-forget with debounce to avoid hammering on rapid GPS updates.
 */
export function triggerProposalProfileMatchingForZavorrina(userId: string): void {
  const now = Date.now();
  const last = lastZavarrinaProfileMatchAt.get(userId) ?? 0;
  if (now - last < ZAVORRINA_PROFILE_MATCH_DEBOUNCE_MS) return;
  lastZavarrinaProfileMatchAt.set(userId, now);
  setImmediate(async () => {
    try {
      const count = await runProposalToProfileMatching(undefined, userId);
      if (count > 0) {
        console.log(`[ProposalProfileMatching] ${count} match per zavorrina ${userId}`);
      }
    } catch (err) {
      console.error("[ProposalProfileMatching] Errore zavorrina hook:", err);
    }
  });
}

/**
 * Trigger proposal matching + zone notifications immediately after a new proposal
 * is created. Fire-and-forget — does not block the HTTP response.
 */
export function triggerProposalCreatedMatching(proposal: Proposal): void {
  setImmediate(async () => {
    try {
      const matchCount = await runProposalMatchingForUser(proposal.userId);
      if (matchCount > 0) {
        console.log(`[ProposalCreated] ${matchCount} match trovati per proposta ${proposal.id}`);
      }
    } catch (err) {
      console.error("[ProposalCreated] Errore matching immediato:", err);
    }
    try {
      await runProposalToProfileMatching(proposal.id);
    } catch (err) {
      console.error("[ProposalCreated] Errore proposal-profile matching:", err);
    }
    try {
      await runProposalZoneNotifications(proposal);
    } catch (err) {
      console.error("[ProposalCreated] Errore zone notifications:", err);
    }
  });
}

const lastUserMatchingAt = new Map<string, number>();
const USER_MATCH_DEBOUNCE_MS = 2 * 60 * 1000;

export function triggerMatchingForUser(userId: string): void {
  const now = Date.now();
  const last = lastUserMatchingAt.get(userId) ?? 0;
  if (now - last < USER_MATCH_DEBOUNCE_MS) return;
  lastUserMatchingAt.set(userId, now);
  (async () => {
    try {
      const { bikerBiker, zavarrina } = await runMatchingForUser(userId);
      if (bikerBiker > 0 || zavarrina > 0) {
        console.log(`[MatchingForUser] completato per ${userId}: ${bikerBiker} bb + ${zavarrina} zav`);
      }
    } catch (err) {
      console.error("[MatchingForUser] errore background:", err);
    }
  })();
}

let isMatchingRunning = false;
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

export function getMatchingLockState() {
  return {
    isRunning: isMatchingRunning,
    lastStartAt: lastMatchingStart,
    lastStartIso: lastMatchingStart ? new Date(lastMatchingStart).toISOString() : null,
    elapsedMs: lastMatchingStart ? Date.now() - lastMatchingStart : null,
  };
}

export function forceUnlockMatching(): { wasRunning: boolean; lastStartAt: number | null } {
  const wasRunning = isMatchingRunning;
  const lastStartAt = lastMatchingStart;
  isMatchingRunning = false;
  lastMatchingStart = null;
  console.warn(`[Matching] forceUnlockMatching invocato — wasRunning=${wasRunning}, lastStartAt=${lastStartAt}`);
  return { wasRunning, lastStartAt };
}

export function triggerMatchingRun(): { started: boolean; reason?: string } {
  if (isMatchingRunning) {
    return { started: false, reason: "already_running" };
  }
  if (lastMatchingStart && Date.now() - lastMatchingStart < MATCH_DEBOUNCE_MS) {
    const ago = Math.floor((Date.now() - lastMatchingStart) / 1000);
    return { started: false, reason: `debounced — last run ${ago}s ago` };
  }
  isMatchingRunning = true;
  lastMatchingStart = Date.now();

  (async () => {
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

        const safePhases: Array<[string, () => Promise<number | void>]> = [
          ["biker_biker_type_style", runBikerBikerTypeStyleMatching],
          ["club_brand", runClubBrandMatching],
          ["music_biker_zav", runMusicMatchBikerZavarrina],
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
            }
          } catch (err) {
            schedulerLogger.error({ err, phase: name }, "phase failed (non-blocking)");
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

      schedulerLogger.info(
        { duration: prettyMs(cycleMetric.durationMs), totalMatches, rss: memoryRssPretty() },
        "Ciclo on-demand completato"
      );
    } catch (err) {
      schedulerLogger.error({ err }, "Errore nel ciclo on-demand");
      recorder.finish(totalMatches);
    } finally {
      isMatchingRunning = false;
    }
  })();
  return { started: true };
}

const _engineTimers: ReturnType<typeof setInterval>[] = [];

export function startMatchingEngine(): void {
  console.log("[Matching] Engine avviato — modalità on-demand (trigger da login utente)");

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
}

export function stopMatchingEngine(): void {
  for (const timer of _engineTimers) {
    clearInterval(timer);
  }
  _engineTimers.length = 0;
  console.log("[Matching] Engine fermato");
}
