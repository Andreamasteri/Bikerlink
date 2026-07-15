import { db } from "../db";
import { storage } from "../storage";
import { haversineDistance } from "../geo";
import {
  users,
  userProfiles,
  type Proposal,
} from "@shared/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import it from "../../lib/i18n/it";
import { systemAccountConditions } from "../lib/system-account-filter";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";

/**
 * Proposal-to-Profile matching: for each active find_a_guest / hitcher proposal,
 * find zavorrine whose profile coordinates fall within the proposal's searchRadius
 * and create proposal_profile_matches records (idempotent via unique constraint).
 *
 * @param filterProposalId  when provided, only processes that single proposal
 * @param filterZavorrinaId when provided, only checks proposals near this zavorrina
 */
export async function runProposalToProfileMatching(
  filterProposalId?: string,
  filterZavorrinaId?: string,
): Promise<number> {
  try {
    const GUEST_TYPES = new Set(["find_a_guest", "hitcher"]);

    const { loadMatchingDisabledSet } = await import("./filters");
    const matchingDisabledSet = await loadMatchingDisabledSet();

    let activeProposals: Proposal[] = await storage.getActiveProposalsWithLocation();
    activeProposals = activeProposals.filter(
      (p) => p.searchType && GUEST_TYPES.has(p.searchType)
        && p.departureLatitude != null
        && p.departureLongitude != null
        && !matchingDisabledSet.has(p.userId)
        && !p.clubId
    );

    if (filterProposalId) {
      activeProposals = activeProposals.filter((p) => p.id === filterProposalId);
    }
    if (activeProposals.length === 0) return 0;

    const existingKeys = await storage.getAllExistingProposalProfileMatchKeys();
    const actedUponPairs = await storage.getActedUponBikerZavorrinaPairs();

    const allZavorrine = await db
      .select({
        userId: users.id,
        lat: userProfiles.latitude,
        lng: userProfiles.longitude
      })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(
        and(
          eq(users.status, "active"),
          eq(users.isFake, false),
          eq(users.matchingDisabled, false),
          ...systemAccountConditions(users),
          isNotNull(userProfiles.latitude),
          isNotNull(userProfiles.longitude),
          inArray(users.userType, ["zavorrina", "coppia"]),
        )
      );

    let zavarrine = allZavorrine;
    if (filterZavorrinaId) {
      zavarrine = allZavorrine.filter((z) => z.userId === filterZavorrinaId);
    }
    if (zavarrine.length === 0) return 0;

    let matchCount = 0;

    for (const proposal of activeProposals) {
      const pLat = proposal.departureLatitude!;
      const pLng = proposal.departureLongitude!;
      const radius = proposal.searchRadius ?? 50;

      for (const zav of zavarrine) {
        if (zav.userId === proposal.userId) continue;
        if (zav.lat == null || zav.lng == null) continue;

        const key = `${proposal.id}:${zav.userId}`;
        if (existingKeys.has(key)) continue;

        const pairKey = `${proposal.userId}:${zav.userId}`;
        if (actedUponPairs.has(pairKey)) continue;

        const distKm = haversineDistance(pLat, pLng, zav.lat, zav.lng);
        if (distKm > radius) continue;

        const created = await storage.createProposalProfileMatch({
          proposalId: proposal.id,
          bikerId: proposal.userId,
          zavorrinaId: zav.userId,
          distanceKm: Math.round(distKm * 10) / 10,
          status: "new"
        });

        if (created) {
          existingKeys.add(key);
          matchCount++;
          // Suppress re-notification for matches restored more than once after
          // admin deletion (resetCount > 1). resetCount=0 → first creation (always
          // notify); resetCount=1 → first restore after deletion (1 re-notify
          // allowed); resetCount>1 → already re-notified at least once, suppress.
          const shouldNotify = (created.resetCount ?? 0) <= 1;
          if (shouldNotify) {
            try {
              const title = it["push.proposalMatch.title"] ?? "Hai un nuovo match proposta! 🔥";
              const body = it["push.proposalMatch.body"] ?? "Una proposta compatibile è stata trovata per il tuo viaggio.";
              await storage.createNotification({
                userId: proposal.userId,
                title,
                body,
                notificationType: "proposal_match",
                referenceType: "proposal_profile_match",
                referenceId: created.id
              });
              await storage.createNotification({
                userId: zav.userId,
                title,
                body,
                notificationType: "proposal_match",
                referenceType: "proposal_profile_match",
                referenceId: created.id
              });
            } catch (notifErr) {
              console.error("[ProposalProfileMatching] Error sending notifications:", notifErr);
            }
            await dispatchMatchNotification({
              table: "proposal_profile_matches",
              matchId: created.id,
              userIds: [proposal.userId, zav.userId],
              priority: classifyMatch({ isFreshProposal: true, distanceKm: distKm }),
              distanceKm: distKm,
            });
          } else {
            console.log(`[ProposalProfileMatching] Notifica soppressa per match ripristinato (resetCount=${created.resetCount}): proposalId=${proposal.id} zavorrinaId=${zav.userId}`);
          }
        }
      }
    }

    if (matchCount > 0) {
      console.log(`[ProposalProfileMatching] nuovi match: ${matchCount}`);
    }
    return matchCount;
  } catch (err) {
    console.error("[ProposalProfileMatching] errore:", err);
    return 0;
  }
}
