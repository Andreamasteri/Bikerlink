import { storage } from "../storage";
import it from "../../lib/i18n/it";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";
import { 
  loadMatchPreferencesMap, 
  bothPrefsEnabled, 
  getActiveClubMembershipKeys,
  clubScopeAllows,
  loadMatchingDisabledSet,
  neitherMatchingDisabled,
} from "./filters";
import {
  areCompatible,
} from "./scoring";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { haversineDistance } from "../geo";
import { createUserLoader } from "../lib/user-loader";
import { matchingLogger } from "../lib/logger";
import { addMatchLog } from "./match-log-buffer";
import {
  resetNotificationCycleStats,
  recordNotifSent,
  recordNotifFailed,
  getNotificationCycleStats,
} from "./notification-stats";
import { retryPendingNotifications } from "./retry-pending-notifications";

export type MatchingRunStats = {
  candidatesPre: number;
  candidatesPost: number;
  pairsConsidered: number;
  pairsAfterBbox: number;
  matchesCreated: number;
};

export type CapStatus = {
  cap: number;
  capReached: boolean;
  usersProcessed: number;
  usersSkipped: number;
  skipReasons: {
    capReached: number;
    noCandidate: number;
  };
};

/** Fallback identico al vecchio hardcoded — wishlist era 500. */
const DEFAULT_WISHLIST_CAP = 500;

const lastWishlistCapStatus: CapStatus = {
  cap: DEFAULT_WISHLIST_CAP,
  capReached: false,
  usersProcessed: 0,
  usersSkipped: 0,
  skipReasons: { capReached: 0, noCandidate: 0 },
};

export function getLastWishlistCapStatus(): CapStatus { return lastWishlistCapStatus; }

let lastProposalStats: MatchingRunStats = {
  candidatesPre: 0, candidatesPost: 0, pairsConsidered: 0, pairsAfterBbox: 0, matchesCreated: 0,
};
export function getLastProposalMatchingStats(): MatchingRunStats { return lastProposalStats; }

const lastWishlistStats: MatchingRunStats = {
  candidatesPre: 0, candidatesPost: 0, pairsConsidered: 0, pairsAfterBbox: 0, matchesCreated: 0,
};
export function getLastWishlistMatchingStats(): MatchingRunStats { return lastWishlistStats; }

export { getNotificationCycleStats } from "./notification-stats";

const BBOX_RADIUS_KM = 500;


export async function runMatching(): Promise<number> {
  resetNotificationCycleStats();

  // Retry notifications for matches that were never notified in the last 24 h
  await retryPendingNotifications();

  try {
    const { proposals: activeProposals, candidatesPre } = await storage.getActiveProposalsWithLocationStats();
    matchingLogger.info({ scope: "proposal", candidatesPost: activeProposals.length, candidatesPre }, "active proposals (admin/fake/ghost esclusi via SQL)");
    lastProposalStats = {
      candidatesPre,
      candidatesPost: activeProposals.length,
      pairsConsidered: 0,
      pairsAfterBbox: 0,
      matchesCreated: 0,
    };
    if (activeProposals.length < 2) return 0;

    // DataLoader: batch-load author user records once per cycle for any
    // downstream code that needs them (avoids N+1 in scoring extensions).
    const userLoader = createUserLoader();
    const userIds = Array.from(new Set(activeProposals.map((p) => p.userId)));
    await userLoader.loadMany(userIds);

    const existingKeys = await storage.getAllExistingProposalMatchKeys();
    const clubProposals = activeProposals.filter((p) => !!p.clubId);
    const clubUserIds = [...new Set(clubProposals.map((p) => p.userId))];
    const clubIds = [...new Set(clubProposals.map((p) => p.clubId as string))];
    const membershipKeys = await getActiveClubMembershipKeys(clubUserIds, clubIds);
    const proposalPrefsMap = await loadMatchPreferencesMap();
    const matchingDisabledSet = await loadMatchingDisabledSet();
    let matchCount = 0;

    const isBikerAuthor = (userType: string | null | undefined) =>
      userType === "biker" || userType === "coppia";

    // SQL-side candidate pair generation: pairs already pre-filtered by
    // status/isFake/ghostMode/role/scheduledAt + bbox at BBOX_RADIUS_KM.
    // JS only consumes the geographically plausible pairs.
    const candidatePairs = await storage.getActiveProposalCandidatePairs(BBOX_RADIUS_KM);
    const proposalsById = new Map(activeProposals.map((p) => [p.id, p] as const));
    const pairsConsidered = activeProposals.length * (activeProposals.length - 1) / 2;
    const pairsAfterBbox = candidatePairs.length;

    for (const { id1, id2 } of candidatePairs) {
      const p1 = proposalsById.get(id1);
      const p2 = proposalsById.get(id2);
      if (!p1 || !p2) continue;
      {
        if (!areCompatible(p1, p2)) continue;

        const isBikerBikerProposal = isBikerAuthor((p1 as { authorUserType?: string | null }).authorUserType)
          && isBikerAuthor((p2 as { authorUserType?: string | null }).authorUserType);
        if (isBikerBikerProposal) {
          if (!bothPrefsEnabled(proposalPrefsMap, p1.userId, p2.userId, "bikerBikerDistance")) continue;
        } else {
          if (!bothPrefsEnabled(proposalPrefsMap, p1.userId, p2.userId, "bikerZavorrinaDistance")) continue;
        }

        if (!clubScopeAllows(p1, p2, membershipKeys)) continue;

        if (!neitherMatchingDisabled(matchingDisabledSet, p1.userId, p2.userId)) continue;

        if (existingKeys.has(`${p1.id}:${p2.id}`)) continue;

        const distanceKm = (
          p1.departureLatitude != null && p1.departureLongitude != null &&
          p2.departureLatitude != null && p2.departureLongitude != null
        ) ? haversineDistance(
          p1.departureLatitude as number, p1.departureLongitude as number,
          p2.departureLatitude as number, p2.departureLongitude as number,
        ) : null;

        const newMatch = await storage.createProposalMatch({
          proposalId1: p1.id,
          proposalId2: p2.id,
          userId1: p1.userId,
          userId2: p2.userId,
          status: "pending",
          acceptedByUser1: false,
          acceptedByUser2: false,
        });

        existingKeys.add(`${p1.id}:${p2.id}`);
        existingKeys.add(`${p2.id}:${p1.id}`);
        matchCount++;

        let notifSentOk = false;
        try {
          const proposalMatchTitle = it["push.proposalMatch.title"] ?? "Hai un nuovo match proposta! 🔥";
          const proposalMatchBody = it["push.proposalMatch.body"] ?? "Una proposta compatibile è stata trovata per il tuo viaggio.";
          await storage.createNotification({
            userId: p1.userId,
            title: proposalMatchTitle,
            body: proposalMatchBody,
            notificationType: "proposal_match",
            referenceType: "proposal_match",
            referenceId: newMatch.id,
          });
          await storage.createNotification({
            userId: p2.userId,
            title: proposalMatchTitle,
            body: proposalMatchBody,
            notificationType: "proposal_match",
            referenceType: "proposal_match",
            referenceId: newMatch.id,
          });
          notifSentOk = true;
          recordNotifSent();
        } catch (notifErr) {
          recordNotifFailed();
          matchingLogger.warn(
            { err: notifErr, match_id: newMatch.id, user_id: p1.userId },
            "ProposalMatching: errore invio notifica match",
          );
          addMatchLog("WARN", "proposal_matching",
            `Notifica fallita match ${newMatch.id}: ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`);
        }

        if (notifSentOk) {
          try {
            await db.execute(sql`
              UPDATE proposal_matches SET notified_at = NOW()
              WHERE id = ${newMatch.id} AND notified_at IS NULL
            `);
          } catch (tsErr) {
            matchingLogger.warn({ err: tsErr, match_id: newMatch.id }, "ProposalMatching: errore aggiornamento notified_at");
          }
        }

        try {
          await dispatchMatchNotification({
            table: "proposal_matches",
            matchId: newMatch.id,
            userIds: [p1.userId, p2.userId],
            priority: classifyMatch({ isFreshProposal: true, distanceKm }),
            distanceKm,
          });
        } catch (dispatchErr) {
          // dispatch is a secondary/priority channel; direct createNotification
          // above already delivered the notification — do NOT count as failed.
          matchingLogger.warn(
            { err: dispatchErr, match_id: newMatch.id },
            "ProposalMatching: errore dispatch notifica push (secondario)",
          );
        }
      }
    }

    const notifStats = getNotificationCycleStats();
    lastProposalStats = {
      candidatesPre,
      candidatesPost: activeProposals.length,
      pairsConsidered,
      pairsAfterBbox,
      matchesCreated: matchCount,
    };
    matchingLogger.info(
      { matchCount, notifications_sent: notifStats.sent, notifications_failed: notifStats.failed, notifications_retried: notifStats.retried },
      "ProposalMatching: ciclo completato",
    );
    return matchCount;
  } catch (error) {
    matchingLogger.error({ err: error }, "Matching engine error");
    return 0;
  }
}

export * from "./run-matching.part2";
