import { db } from "../db";
import { storage } from "../storage";
import { proposals, proposalZoneNotifications, proposalProfileMatches, type Proposal } from "@shared/db";
import { eq, sql, lt } from "drizzle-orm";
import { runMatching, runWishlistMatching } from "./run-matching";
import { runBikerBikerMatching, runBikerBikerTypeStyleMatching } from "./run-biker";
import { runClubBrandMatching } from "./run-clubs";
import { runMusicMatchBikerZavarrina, runGpsBasedMatching, runEventMatching, runBikerZavarrinaTypeStyleMatching } from "./run-extra";
import { runExtractRouteCellsJob } from "./jobs/extract-route-cells";
import { runRouteSimilarityMatching } from "./run-route-similarity";
import { runDistanceMatching, runRouteTypeZoneMatching } from "./run-distance";
import { runProposalToProfileMatching } from "./run-profile";
import { runProposalZoneNotifications, runProposalMatchingForUser } from "./run-proposals";
import { runMatchingForUser } from "./run-user";

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
    const cycleStart = Date.now();
    console.log("[Matching] Ciclo on-demand avviato");

    try {
      const expired = await runCleanup();
      if (expired > 0) console.log(`[Matching] Scadute ${expired} proposte`);

      try {
        const deleted = await storage.deleteExpiredProposals();
        if (deleted > 0) console.log(`[Matching] Eliminate ${deleted} proposte scadute`);
      } catch (err) {
        console.error("[Matching] Errore eliminazione proposte scadute:", err);
      }

      const autoMatchSetting = await storage.getAppSetting("auto_matching_enabled");
      const autoMatchEnabled = autoMatchSetting?.value !== "false";

      let garageMatches = 0;
      let bikerBikerMatchCount = 0;

      if (autoMatchEnabled) {
        const matches = await runMatching();
        if (matches > 0) console.log(`[Matching] Found ${matches} new proposal matches`);

        garageMatches = await runWishlistMatching();
        if (garageMatches > 0) console.log(`[Matching] Found ${garageMatches} new garage matches`);

        bikerBikerMatchCount = await runBikerBikerMatching();
        if (bikerBikerMatchCount > 0) console.log(`[Matching] Found ${bikerBikerMatchCount} new biker-biker matches`);

        try {
          const typeStyleCount = await runBikerBikerTypeStyleMatching();
          if (typeStyleCount > 0) console.log(`[Matching] Found ${typeStyleCount} new type-style matches`);
        } catch (err) {
          console.error("[Matching] TypeStyle matching error (non-blocking):", err);
        }

        try {
          await runClubBrandMatching();
        } catch (err) {
          console.error("[Matching] ClubBrand matching error (non-blocking):", err);
        }

        try {
          await runMusicMatchBikerZavarrina();
        } catch (err) {
          console.error("[Matching] MusicBikerZav matching error (non-blocking):", err);
        }

        try {
          await runGpsBasedMatching();
        } catch (err) {
          console.error("[Matching] GpsBased matching error (non-blocking):", err);
        }

        try {
          await runEventMatching();
        } catch (err) {
          console.error("[Matching] Event matching error (non-blocking):", err);
        }

        try {
          const zavTypeStyleCount = await runBikerZavarrinaTypeStyleMatching();
          if (zavTypeStyleCount > 0) console.log(`[Matching] Found ${zavTypeStyleCount} new zav type-style matches`);
        } catch (err) {
          console.error("[Matching] ZavTypeStyle matching error (non-blocking):", err);
        }

        try {
          const distCount = await runDistanceMatching();
          if (distCount > 0) console.log(`[Matching] Found ${distCount} new distance matches`);
        } catch (err) {
          console.error("[Matching] Distance matching error (non-blocking):", err);
        }

        try {
          const zoneCount = await runRouteTypeZoneMatching();
          if (zoneCount > 0) console.log(`[Matching] Found ${zoneCount} new route-zone matches`);
        } catch (err) {
          console.error("[Matching] RouteTypeZone matching error (non-blocking):", err);
        }

        try {
          const ppCount = await runProposalToProfileMatching();
          if (ppCount > 0) console.log(`[Matching] Found ${ppCount} new proposal-profile matches`);
        } catch (err) {
          console.error("[Matching] ProposalProfile matching error (non-blocking):", err);
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
        console.log("[Matching] Auto matching disabilitato dall'admin, skip");
      }

      const cycleDuration = Date.now() - cycleStart;
      lastCycleMeta = {
        completedAt: new Date().toISOString(),
        durationMs: cycleDuration,
        zavarrinaMatchesNew: garageMatches,
        bikerBikerMatchesNew: bikerBikerMatchCount,
      };

      console.log(`[Matching] Ciclo on-demand completato in ${(cycleDuration / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error("[Matching] Errore nel ciclo on-demand:", err);
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
}

export function stopMatchingEngine(): void {
  for (const timer of _engineTimers) {
    clearInterval(timer);
  }
  _engineTimers.length = 0;
  console.log("[Matching] Engine fermato");
}
