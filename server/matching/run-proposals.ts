import { storage } from "../storage";
import { db } from "../db";
import { proposalZoneNotifications, users, userProfiles, type Proposal } from "@shared/db";
import { and, eq, isNotNull, gt, inArray, sql } from "drizzle-orm";
import it from "../../lib/i18n/it";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";
import { 
  loadMatchPreferencesMap, 
  bothPrefsEnabled, 
  getActiveClubMembershipKeys,
  clubScopeAllows,
  loadMatchingDisabledSet,
} from "./filters";
import { areCompatible, getAllSearchTypes } from "./scoring";

export async function runProposalMatchingForUser(userId: string): Promise<number> {
  try {
    const matchingDisabledSet = await loadMatchingDisabledSet();
    if (matchingDisabledSet.has(userId)) return 0;

    const allActiveProposals = await storage.getActiveProposalsWithLocation();
    const myActiveProposals = allActiveProposals.filter(p => p.userId === userId);
    if (myActiveProposals.length === 0) return 0;

    const otherActiveProposals = allActiveProposals.filter(p => p.userId !== userId && !matchingDisabledSet.has(p.userId));
    if (otherActiveProposals.length === 0) return 0;

    const existingKeys = await storage.getAllExistingProposalMatchKeys();
    const clubUserIds = [...new Set(allActiveProposals.filter(p => !!p.clubId).map(p => p.userId))];
    const clubIds = [...new Set(allActiveProposals.filter(p => !!p.clubId).map(p => p.clubId as string))];
    const membershipKeys = await getActiveClubMembershipKeys(clubUserIds, clubIds);
    const proposalPrefsMap = await loadMatchPreferencesMap();

    let matchCount = 0;

    for (const p1 of myActiveProposals) {
      for (const p2 of otherActiveProposals) {
        if (!areCompatible(p1, p2)) continue;

        const isBikerBikerProposal =
          ((p1 as { authorUserType?: string }).authorUserType ?? "biker") === "biker" &&
          ((p2 as { authorUserType?: string }).authorUserType ?? "biker") === "biker";
        if (isBikerBikerProposal) {
          if (!bothPrefsEnabled(proposalPrefsMap, p1.userId, p2.userId, "bikerBikerDistance")) continue;
        } else {
          if (!bothPrefsEnabled(proposalPrefsMap, p1.userId, p2.userId, "bikerZavarrinaDistance")) continue;
        }

        if (!clubScopeAllows(p1, p2, membershipKeys)) continue;
        if (existingKeys.has(`${p1.id}:${p2.id}`)) continue;

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
        } catch (notifErr) {
          console.error("[ProposalMatchingForUser] Notification error:", notifErr);
        }
        await dispatchMatchNotification({
          table: "proposal_matches",
          matchId: newMatch.id,
          userIds: [p1.userId, p2.userId],
          priority: classifyMatch({ isFreshProposal: true }),
        });
      }
    }
    return matchCount;
  } catch (err) {
    console.error("[ProposalMatchingForUser] error:", err);
    return 0;
  }
}

export async function runProposalZoneNotifications(proposal: Proposal): Promise<void> {
  try {
    if (!proposal.departureLatitude || !proposal.departureLongitude) return;

    const searchRadius = proposal.searchRadius || 50;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let targetUserTypes: string[];
    const explicitTargets = Array.isArray(proposal.targetUserTypes)
      ? (proposal.targetUserTypes as string[])
      : null;

    if (explicitTargets && explicitTargets.length > 0) {
      targetUserTypes = explicitTargets;
    } else {
      const allTypes = getAllSearchTypes(proposal);
      if (allTypes.length > 0) {
        const merged = new Set<string>();
        for (const t of allTypes) {
          if (t === "find_a_friend") {
            merged.add("biker"); merged.add("coppia");
          } else if (t === "find_a_biker" || t === "hitchhiker") {
            merged.add("biker"); merged.add("coppia");
          } else if (t === "find_a_guest" || t === "hitcher") {
            merged.add("zavorrina"); merged.add("coppia");
          } else {
            merged.add("biker"); merged.add("zavorrina"); merged.add("coppia");
          }
        }
        targetUserTypes = [...merged];
      } else {
        targetUserTypes = ["biker", "zavorrina", "coppia"];
      }
    }

    // Task #2510: PostGIS ST_DWithin sull'indice GIST `user_profiles.geom`
    // sostituisce il loop Haversine in JS — il DB filtra in millisecondi
    // anche con milioni di profili.
    const radiusMeters = searchRadius * 1000;
    const lon = proposal.departureLongitude!;
    const lat = proposal.departureLatitude!;
    const candidateRows = await db
      .select({
        userId: userProfiles.userId,
        userType: users.userType,
        role: users.role,
      })
      .from(userProfiles)
      .innerJoin(users, eq(userProfiles.userId, users.id))
      .where(
        and(
          isNotNull(userProfiles.latitude),
          isNotNull(userProfiles.longitude),
          gt(userProfiles.coordinatesUpdatedAt, sevenDaysAgo),
          eq(users.status, "active"),
          sql`${userProfiles.geom} IS NOT NULL`,
          sql`ST_DWithin(${userProfiles.geom}, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${radiusMeters})`,
          inArray(users.userType, targetUserTypes),
        )
      );

    const proposalDisabledSet = await loadMatchingDisabledSet();
    if (proposalDisabledSet.has(proposal.userId)) return;

    const candidateIds = candidateRows
      .filter((u) => u.userId !== proposal.userId && u.role !== "admin" && !proposalDisabledSet.has(u.userId))
      .map((u) => u.userId);

    if (candidateIds.length === 0) return;

    const alreadyNotified = await db
      .select({ userId: proposalZoneNotifications.userId })
      .from(proposalZoneNotifications)
      .where(eq(proposalZoneNotifications.proposalId, proposal.id));
    const alreadyNotifiedSet = new Set(alreadyNotified.map((n) => n.userId));

    const finalTargetIds = candidateIds.filter((id) => !alreadyNotifiedSet.has(id));
    if (finalTargetIds.length === 0) return;

    console.log(`[ProposalZoneNotifications] sending to ${finalTargetIds.length} users for proposal ${proposal.id}`);

    const title = it["push.proposalZone.title"] ?? "Nuova proposta in zona! 🏍️";
    const body = it["push.proposalZone.body"] ?? "Un biker ha creato una proposta di viaggio vicino a te.";

    for (const targetId of finalTargetIds) {
      await storage.createNotification({
        userId: targetId,
        title,
        body,
        notificationType: "proposal_zone",
        referenceType: "proposal",
        referenceId: proposal.id,
      });
      await db.insert(proposalZoneNotifications).values({
        proposalId: proposal.id,
        userId: targetId,
      });
    }

    const { sendZoneProposalPushNotifications } = await import("../push-notifications");
    sendZoneProposalPushNotifications(finalTargetIds);

  } catch (error) {
    console.error("[ProposalZoneNotifications] error:", error);
  }
}
