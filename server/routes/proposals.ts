import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { motoClubMembers, proposalZoneNotifications } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { isSystemAccount } from "../lib/system-account-filter";
import { runMatchingForUser, runProposalMatchingForUser, triggerProposalCreatedMatching } from "../matching-engine";
import { allLimited, matchEnrichmentSemaphore, SemaphoreQueueFullError } from "../lib/concurrency";
import { sendZoneMatchedPushNotifications } from "../push-notifications";

const router = Router();

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getCoordinatesMaxAgeSec(): Promise<number> {
  const setting = await storage.getAppSetting("coordinates_max_age_seconds");
  const val = setting?.value ? parseInt(setting.value, 10) : NaN;
  return isNaN(val) ? 300 : val;
}

function isCoordOld(updatedAt: Date | null | undefined, maxAgeSec: number): boolean {
  if (!updatedAt) return true;
  return (Date.now() - new Date(updatedAt).getTime()) > maxAgeSec * 1000;
}

const BIKER_SEARCH_TYPES = ["find_a_friend", "find_a_guest", "hitcher", "hitchhiker"];
const ZAVORRINA_SEARCH_TYPES = ["find_a_biker", "hitchhiker"];

/** Returns true only if userId holds an active membership in clubId. */
async function isActiveClubMember(userId: string, clubId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: motoClubMembers.userId })
    .from(motoClubMembers)
    .where(and(
      eq(motoClubMembers.userId, userId),
      eq(motoClubMembers.clubId, clubId),
      eq(motoClubMembers.status, "active"),
    ))
    .limit(1);
  return !!row;
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || undefined;
    const proposalType = req.query.type as string | undefined;
    const filter = req.query.filter as string | undefined;

    const userId = req.session.userId!;
    let allProposals = await storage.getProposals(status ? { status } : undefined);

    const userMemberships = await db.select({ clubId: motoClubMembers.clubId })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")));
    const memberClubIds = new Set(userMemberships.map(m => m.clubId));

    allProposals = allProposals.filter(p => {
      if (!p.clubId) return true;
      return memberClubIds.has(p.clubId);
    });

    if (proposalType) {
      allProposals = allProposals.filter((p) => p.proposalType === proposalType);
    }

    if (filter) {
      const filterMap: Record<string, string[]> = {
        giro: ["find_a_friend"],
        con_zavorrina: ["find_a_guest"],
        passaggio_al_volo: ["hitcher", "hitchhiker"],
        richieste: ["find_a_biker"],
      };
      const allowedTypes = filterMap[filter];
      if (allowedTypes) {
        allProposals = allProposals.filter((p) => p.searchType && allowedTypes.includes(p.searchType));
      }
    }

    const results = await allLimited(
      allProposals.map((proposal) => async () => {
        const participants = await storage.getProposalParticipants(proposal.id);
        const creator = await storage.getUser(proposal.userId);
        const creatorName = creator?.nickname ?? "Sconosciuto";

        let motoInfo = null;
        if (proposal.motorcycleId) {
          const motos = await storage.getUserMotorcycles(proposal.userId);
          const moto = motos.find(m => m.id === proposal.motorcycleId);
          if (moto) motoInfo = { brand: moto.brand, model: moto.model, motorcycleType: moto.motorcycleType, ridingStyle: moto.ridingStyle };
        }

        return {
          ...proposal,
          creatorNickname: creatorName,
          creatorUserType: creator?.userType,
          participantCount: participants.length,
          motoInfo,
        };
      })
    );

    return res.json(results);
  } catch (error) {
    console.error("Get proposals error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/matches", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const matches = await storage.getProposalMatches(userId);

    // Defense-in-depth (Task #1116): il matching engine non filtra per club, quindi
    // un match cross-club (es. proposta pubblica vs proposta club-scoped) potrebbe
    // esporre dettagli completi della proposta club-scoped (clubId, indirizzi,
    // creatorNickname) a un non-membro tramite proposal1/proposal2.
    // Pre-carichiamo le membership attive del caller e filtriamo i match in cui
    // almeno una delle due proposte è in un club di cui non è membro.
    const userMemberships = await db
      .select({ clubId: motoClubMembers.clubId })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")));
    const memberClubIds = new Set(userMemberships.map((m) => m.clubId));

    const results = await allLimited(
      matches.map((match) => async () => {
        const proposal1 = await storage.getProposal(match.proposalId1);
        const proposal2 = await storage.getProposal(match.proposalId2);

        // Filtra match che leakano proposte club-scoped a non-membri.
        if (proposal1?.clubId && !memberClubIds.has(proposal1.clubId)) return null;
        if (proposal2?.clubId && !memberClubIds.has(proposal2.clubId)) return null;

        const user1 = await storage.getUser(match.userId1);
        const user2 = await storage.getUser(match.userId2);

        if (isSystemAccount(user1 ?? {})) return null;
        if (isSystemAccount(user2 ?? {})) return null;

        return {
          ...match,
          proposal1: proposal1 ? { ...proposal1, creatorNickname: user1?.nickname } : null,
          proposal2: proposal2 ? { ...proposal2, creatorNickname: user2?.nickname } : null,
          user1Nickname: user1?.nickname,
          user2Nickname: user2?.nickname,
          user1Type: user1?.userType,
          user2Type: user2?.userType,
        };
      })
    );

    return res.json(results.filter(Boolean));
  } catch (error) {
    console.error("Get matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/garage-matches", requireAuth, async (req: Request, res: Response) => {
  try {
  await matchEnrichmentSemaphore.run(async () => {
  try {
    const userId = req.session.userId!;
    const blockedIds = new Set(await storage.getBlockedUserIds(userId));
    const garageMatches = await storage.getMatchesForUser(userId);

    const countrySetting = await storage.getAppSetting("matching_countries");
    let allowedCountries: string[] = [];
    try { allowedCountries = countrySetting?.value ? JSON.parse(countrySetting.value) : []; } catch { allowedCountries = []; }

    const myProfile = await storage.getUserProfile(userId);
    const myLat = myProfile?.latitude ?? null;
    const myLng = myProfile?.longitude ?? null;
    const myCoordUpdatedAt = myProfile?.coordinatesUpdatedAt ?? null;
    const maxAgeSec = await getCoordinatesMaxAgeSec();

    const filteredMatches = garageMatches.filter((match) => {
      const otherId = match.bikerId === userId ? match.zavarrinaId : match.bikerId;
      return !blockedIds.has(otherId);
    });

    const allUserIds = [...new Set(filteredMatches.flatMap(m => [m.bikerId, m.zavarrinaId]))];
    const otherUserIds = [...new Set(filteredMatches.map(m => m.bikerId === userId ? m.zavarrinaId : m.bikerId))];

    const [bulkUsers, bulkProfiles] = await Promise.all([
      storage.getUsersByIds(allUserIds),
      storage.getUserProfilesByIds(otherUserIds),
    ]);

    const userMap = new Map(bulkUsers.map(u => [u.id, u]));
    const profileMap = new Map(bulkProfiles.map(p => [p.userId, p]));

    const results = await allLimited(
      filteredMatches.map((match) => async () => {
        const biker = userMap.get(match.bikerId);
        const zavorrina = userMap.get(match.zavarrinaId);
        const bikerMoto = await storage.getUserMotorcycle(match.bikerMotorcycleId);
        const wishlistMoto = await storage.getWishlistMoto(match.wishlistMotoId);

        const isBiker = match.bikerId === userId;
        const otherUser = isBiker ? zavorrina : biker;

        if (isSystemAccount(otherUser ?? {})) return null;

        if (allowedCountries.length > 0 && (!otherUser?.country || !allowedCountries.includes(otherUser.country))) {
          return null;
        }

        const otherProfile = otherUser?.id ? profileMap.get(otherUser.id) : undefined;
        const otherLat: number | null = otherProfile?.latitude ?? null;
        const otherLng: number | null = otherProfile?.longitude ?? null;
        const otherCoordUpdatedAt: Date | null = otherProfile?.coordinatesUpdatedAt ?? null;

        let distanceKm: number | null = null;
        let distanceFlag: "ok" | "old_psn" | "no_psn" = "no_psn";
        if (myLat != null && myLng != null && otherLat != null && otherLng != null) {
          const myOld = isCoordOld(myCoordUpdatedAt, maxAgeSec);
          const otherOld = isCoordOld(otherCoordUpdatedAt, maxAgeSec);
          if (myOld || otherOld) {
            distanceFlag = "old_psn";
            distanceKm = null;
          } else {
            distanceKm = Math.round(haversineKm(myLat, myLng, otherLat, otherLng) * 10) / 10;
            distanceFlag = "ok";
          }
        }

        return {
          ...match,
          isSupermatch: match.isSupermatch ?? false,
          bikerNickname: biker?.nickname,
          bikerType: biker?.userType,
          zavarrinaNickname: zavorrina?.nickname,
          zavarrinaType: zavorrina?.userType,
          bikerMoto: bikerMoto ? { brand: bikerMoto.brand, model: bikerMoto.model, motorcycleType: bikerMoto.motorcycleType } : null,
          wishlistMoto: wishlistMoto ? { brand: wishlistMoto.brand, model: wishlistMoto.model, motorcycleType: wishlistMoto.motorcycleType } : null,
          otherLat,
          otherLng,
          distanceKm,
          distanceFlag,
          myLat,
          myLng,
        };
      })
    );

    const enriched = results.filter(Boolean) as NonNullable<(typeof results)[number]>[];

    const bestByUser = new Map<string, typeof enriched[number]>();
    for (const m of enriched) {
      const isBiker = m.bikerId === userId;
      const otherUserId = isBiker ? m.zavarrinaId : m.bikerId;
      const existing = bestByUser.get(otherUserId);
      if (!existing) {
        bestByUser.set(otherUserId, m);
      } else {
        const mIsSuper = m.isSupermatch;
        const exIsSuper = existing.isSupermatch;
        if (mIsSuper && !exIsSuper) {
          bestByUser.set(otherUserId, m);
        } else if (mIsSuper === exIsSuper) {
          const mTime = m.createdAt ? new Date(m.createdAt).getTime() : 0;
          const exTime = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
          if (mTime > exTime) bestByUser.set(otherUserId, m);
        }
      }
    }

    return res.json([...bestByUser.values()]);
  } catch (error) {
    console.error("Get garage matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
  }); // matchEnrichmentSemaphore.run
  } catch (err) {
    if (err instanceof SemaphoreQueueFullError) {
      res.setHeader("Retry-After", "3");
      return res.status(503).json({ message: "Server occupato, riprova più tardi" });
    }
    console.error("Get garage matches outer error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/garage-matches/:id/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const matchId = req.params.id;
    if (!matchId) return res.status(400).json({ message: "ID match mancante" });
    const match = await storage.getGarageMatch(matchId);
    if (!match) {
      return res.status(404).json({ message: "Match non trovato" });
    }
    if (match.bikerId !== userId && match.zavarrinaId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    if (match.status !== "new") {
      return res.status(400).json({ message: "Match già gestito" });
    }
    const updated = await storage.updateGarageMatch(matchId, { status: "accepted" });
    if (!updated) return res.status(500).json({ message: "Aggiornamento match fallito" });
    return res.json(updated);
  } catch (error) {
    console.error("Accept garage match error:", error instanceof Error ? error.message : error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/garage-matches/:id/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const matchId = req.params.id;
    if (!matchId) return res.status(400).json({ message: "ID match mancante" });
    const match = await storage.getGarageMatch(matchId);
    if (!match) {
      return res.status(404).json({ message: "Match non trovato" });
    }
    if (match.bikerId !== userId && match.zavarrinaId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    if (match.status !== "new") {
      return res.status(400).json({ message: "Match già gestito" });
    }
    const updated = await storage.updateGarageMatch(matchId, { status: "rejected" });
    if (!updated) return res.status(500).json({ message: "Aggiornamento match fallito" });
    return res.json(updated);
  } catch (error) {
    console.error("Reject garage match error:", error instanceof Error ? error.message : error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/matches/:id/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const matchId = req.params.id;

    const match = await storage.getProposalMatch(matchId);
    if (!match) {
      return res.status(404).json({ message: "Match non trovato" });
    }
    if (match.status !== "pending") {
      return res.status(400).json({ message: "Match non più in attesa" });
    }

    const isUser1 = match.userId1 === userId;
    const isUser2 = match.userId2 === userId;
    if (!isUser1 && !isUser2) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    // Task #1124 vuln 2: re-check the club boundary at accept time. The
    // matching engine now refuses to create cross-club / non-member matches,
    // but legacy rows from before this fix can still be sitting in
    // proposal_matches. We must not let a former member (or an outsider
    // matched against a club proposal by a buggy past run) flip a pending
    // match to "accepted", because the accepted branch creates a group
    // conversation and enrolls both userIds — that would expose private
    // club ride details and let an outsider start chatting with current
    // members.
    const proposal1 = await storage.getProposal(match.proposalId1);
    const proposal2 = await storage.getProposal(match.proposalId2);
    if (proposal1?.clubId && !(await isActiveClubMember(userId, proposal1.clubId))) {
      return res.status(403).json({ message: "Non sei più membro del club di questa proposta" });
    }
    if (proposal2?.clubId && !(await isActiveClubMember(userId, proposal2.clubId))) {
      return res.status(403).json({ message: "Non sei più membro del club di questa proposta" });
    }
    // Also verify the OTHER side is still a member of the relevant club, so
    // we don't enroll an ex-member into a brand-new conversation just because
    // the caller is still in good standing.
    const otherUserId = isUser1 ? match.userId2 : match.userId1;
    if (proposal1?.clubId && !(await isActiveClubMember(otherUserId, proposal1.clubId))) {
      return res.status(403).json({ message: "L'altra persona non è più membro del club" });
    }
    if (proposal2?.clubId && !(await isActiveClubMember(otherUserId, proposal2.clubId))) {
      return res.status(403).json({ message: "L'altra persona non è più membro del club" });
    }

    const updateData: Record<string, unknown> = {};
    if (isUser1) updateData.acceptedByUser1 = true;
    if (isUser2) updateData.acceptedByUser2 = true;

    const newAcceptedByUser1 = isUser1 ? true : match.acceptedByUser1;
    const newAcceptedByUser2 = isUser2 ? true : match.acceptedByUser2;

    if (newAcceptedByUser1 && newAcceptedByUser2) {
      updateData.status = "accepted";

      const chatTitle = `Match: ${proposal1?.title || "Proposta"} ↔ ${proposal2?.title || "Proposta"}`;

      const conv = await storage.createConversation({
        conversationType: "group",
        title: chatTitle,
        proposalId: match.proposalId1,
      });

      await storage.addConversationParticipant({ conversationId: conv.id, userId: match.userId1 });
      if (match.userId2 !== match.userId1) {
        await storage.addConversationParticipant({ conversationId: conv.id, userId: match.userId2 });
      }

      updateData.conversationId = conv.id;

      if (proposal2?.returnDeadline) {
        const deadline = new Date(proposal2.returnDeadline);
        const timeStr = deadline.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        await storage.createMessage({
          conversationId: conv.id,
          senderId: match.userId2,
          content: `⚠️ Attenzione: vuole rientrare entro le ${timeStr}`,
          messageType: "text",
        });
      }
      if (proposal1?.returnDeadline) {
        const deadline = new Date(proposal1.returnDeadline);
        const timeStr = deadline.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        await storage.createMessage({
          conversationId: conv.id,
          senderId: match.userId1,
          content: `⚠️ Attenzione: vuole rientrare entro le ${timeStr}`,
          messageType: "text",
        });
      }
    }

    const updated = await storage.updateProposalMatch(matchId, updateData as any);

    // After the match is committed, notify zone-proximity observers.
    // This runs only when both users have now accepted (status flipped to "accepted").
    if (newAcceptedByUser1 && newAcceptedByUser2) {
      try {
        const proposalIds = [match.proposalId1, match.proposalId2].filter(Boolean) as string[];
        const matchedUserIds = new Set([match.userId1, match.userId2]);

        const zoneRows = await db
          .select({ userId: proposalZoneNotifications.userId })
          .from(proposalZoneNotifications)
          .where(inArray(proposalZoneNotifications.proposalId, proposalIds));

        const recipientIds = [...new Set(zoneRows.map((r) => r.userId))].filter(
          (uid) => !matchedUserIds.has(uid),
        );

        for (const uid of recipientIds) {
          try {
            await storage.createNotification({
              userId: uid,
              title: "Proposta abbinata! 🏍️",
              body: "La proposta vicina a te ha trovato il suo match — creane una tu!",
              referenceType: "proposal_match",
              referenceId: match.id,
            });
          } catch (notifErr) {
            console.error("[zone-match-notify] Failed to notify user", uid, notifErr);
          }
        }

        sendZoneMatchedPushNotifications(recipientIds).catch((err) => {
          console.error("[zone-match-notify] Push notification error (non-fatal):", err);
        });
      } catch (zoneErr) {
        console.error("[zone-match-notify] Error fetching zone notification recipients:", zoneErr);
      }
    }

    return res.json(updated);
  } catch (error) {
    console.error("Accept match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/matches/:id/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const matchId = req.params.id;

    const match = await storage.getProposalMatch(matchId);
    if (!match) {
      return res.status(404).json({ message: "Match non trovato" });
    }
    if (match.userId1 !== userId && match.userId2 !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const updated = await storage.updateProposalMatch(matchId, { status: "rejected" } as any);
    return res.json(updated);
  } catch (error) {
    console.error("Reject match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/biker-matches", requireAuth, async (req: Request, res: Response) => {
  try {
  await matchEnrichmentSemaphore.run(async () => {
  try {
    const userId = req.session.userId!;
    const blockedIds = new Set(await storage.getBlockedUserIds(userId));
    const bikerMatchesList = await storage.getBikerBikerMatchesForUser(userId);

    const countrySetting = await storage.getAppSetting("matching_countries");
    let allowedCountries: string[] = [];
    try { allowedCountries = countrySetting?.value ? JSON.parse(countrySetting.value) : []; } catch { allowedCountries = []; }

    const myProfile = await storage.getUserProfile(userId);
    const myLat = myProfile?.latitude ?? null;
    const myLng = myProfile?.longitude ?? null;
    const myCoordUpdatedAt = myProfile?.coordinatesUpdatedAt ?? null;
    const maxAgeSec = await getCoordinatesMaxAgeSec();

    const filteredMatches = bikerMatchesList.filter((match) => {
      const otherId = match.biker1Id === userId ? match.biker2Id : match.biker1Id;
      return !blockedIds.has(otherId);
    });

    const allBikerIds = [...new Set(filteredMatches.flatMap(m => [m.biker1Id, m.biker2Id]))];
    const otherBikerIds = [...new Set(filteredMatches.map(m => m.biker1Id === userId ? m.biker2Id : m.biker1Id))];

    const [bulkBikers, bulkBikerProfiles] = await Promise.all([
      storage.getUsersByIds(allBikerIds),
      storage.getUserProfilesByIds(otherBikerIds),
    ]);

    const bikerMap = new Map(bulkBikers.map(u => [u.id, u]));
    const bikerProfileMap = new Map(bulkBikerProfiles.map(p => [p.userId, p]));

    const results = await allLimited(
      filteredMatches.map((match) => async () => {
        const biker1 = bikerMap.get(match.biker1Id);
        const biker2 = bikerMap.get(match.biker2Id);

        const isBiker1 = match.biker1Id === userId;
        const otherBiker = isBiker1 ? biker2 : biker1;

        if (isSystemAccount(otherBiker ?? {})) return null;

        if (allowedCountries.length > 0 && (!otherBiker?.country || !allowedCountries.includes(otherBiker.country))) {
          return null;
        }

        const otherProfile = otherBiker?.id ? bikerProfileMap.get(otherBiker.id) : undefined;
        const otherLat: number | null = otherProfile?.latitude ?? null;
        const otherLng: number | null = otherProfile?.longitude ?? null;
        const otherCoordUpdatedAt: Date | null = otherProfile?.coordinatesUpdatedAt ?? null;

        let distanceKm: number | null = null;
        let distanceFlag: "ok" | "old_psn" | "no_psn" = "no_psn";
        if (myLat != null && myLng != null && otherLat != null && otherLng != null) {
          const myOld = isCoordOld(myCoordUpdatedAt, maxAgeSec);
          const otherOld = isCoordOld(otherCoordUpdatedAt, maxAgeSec);
          if (myOld || otherOld) {
            distanceFlag = "old_psn";
            distanceKm = null;
          } else {
            distanceKm = Math.round(haversineKm(myLat, myLng, otherLat, otherLng) * 10) / 10;
            distanceFlag = "ok";
          }
        }

        return {
          ...match,
          isSupermatch: match.isSupermatch ?? false,
          biker1Nickname: biker1?.nickname,
          biker2Nickname: biker2?.nickname,
          otherLat,
          otherLng,
          distanceKm,
          distanceFlag,
          myLat,
          myLng,
        };
      })
    );

    const enriched = results.filter(Boolean) as NonNullable<(typeof results)[number]>[];

    const bestByUser = new Map<string, typeof enriched[number]>();
    for (const m of enriched) {
      const isBiker1 = m.biker1Id === userId;
      const otherUserId = isBiker1 ? m.biker2Id : m.biker1Id;
      const existing = bestByUser.get(otherUserId);
      if (!existing) {
        bestByUser.set(otherUserId, m);
      } else {
        const mIsSuper = m.isSupermatch;
        const exIsSuper = existing.isSupermatch;
        if (mIsSuper && !exIsSuper) {
          bestByUser.set(otherUserId, m);
        } else if (mIsSuper === exIsSuper) {
          const mTime = m.createdAt ? new Date(m.createdAt).getTime() : 0;
          const exTime = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
          if (mTime > exTime) bestByUser.set(otherUserId, m);
        }
      }
    }

    return res.json([...bestByUser.values()]);
  } catch (error) {
    console.error("Get biker-biker matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
  }); // matchEnrichmentSemaphore.run
  } catch (err) {
    if (err instanceof SemaphoreQueueFullError) {
      res.setHeader("Retry-After", "3");
      return res.status(503).json({ message: "Server occupato, riprova più tardi" });
    }
    console.error("Get biker-biker matches outer error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/biker-matches/:id/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const matchId = req.params.id;
    if (!matchId) return res.status(400).json({ message: "ID match mancante" });
    const match = await storage.getBikerBikerMatch(matchId);
    if (!match) return res.status(404).json({ message: "Match non trovato" });
    if (match.biker1Id !== userId && match.biker2Id !== userId) return res.status(403).json({ message: "Non autorizzato" });
    if (match.status !== "new") return res.status(400).json({ message: "Match già gestito" });
    const updated = await storage.updateBikerBikerMatch(matchId, { status: "accepted" });
    if (!updated) return res.status(500).json({ message: "Aggiornamento match fallito" });
    return res.json(updated);
  } catch (error) {
    console.error("Accept biker-biker match error:", error instanceof Error ? error.message : error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/biker-matches/:id/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const matchId = req.params.id;
    if (!matchId) return res.status(400).json({ message: "ID match mancante" });
    const match = await storage.getBikerBikerMatch(matchId);
    if (!match) return res.status(404).json({ message: "Match non trovato" });
    if (match.biker1Id !== userId && match.biker2Id !== userId) return res.status(403).json({ message: "Non autorizzato" });
    if (match.status !== "new") return res.status(400).json({ message: "Match già gestito" });
    const updated = await storage.updateBikerBikerMatch(matchId, { status: "rejected" });
    if (!updated) return res.status(500).json({ message: "Aggiornamento match fallito" });
    return res.json(updated);
  } catch (error) {
    console.error("Reject biker-biker match error:", error instanceof Error ? error.message : error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/biker-matches/rejected", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const count = await storage.deleteRejectedBikerBikerMatches(userId);
    return res.json({ deleted: count });
  } catch (error) {
    console.error("Delete rejected biker-biker matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/biker-matches/:matchId", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const ok = await storage.resetBikerBikerMatchToNew(req.params.matchId, userId);
    if (!ok) return res.status(404).json({ message: "Match non trovato o non autorizzato" });
    return res.json({ reset: true });
  } catch (error) {
    console.error("Reset biker-biker match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/reset-and-rematch", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const [deletedGarage, deletedBiker, deletedProposal] = await Promise.all([
      storage.deleteNewGarageMatches(userId),
      storage.deleteNewBikerBikerMatches(userId),
      storage.deletePendingProposalMatches(userId),
    ]);
    const totalDeleted = deletedGarage + deletedBiker + deletedProposal;
    console.log(`[ResetAndRematch] user=${userId} deleted: garage=${deletedGarage} biker=${deletedBiker} proposal=${deletedProposal}`);
    const [bikerResult, proposalCount] = await Promise.all([
      runMatchingForUser(userId),
      runProposalMatchingForUser(userId),
    ]);
    const totalCreated = bikerResult.bikerBiker + bikerResult.zavarrina + proposalCount;
    console.log(`[ResetAndRematch] user=${userId} created: bikerBiker=${bikerResult.bikerBiker} zavarrina=${bikerResult.zavarrina} proposal=${proposalCount}`);
    return res.json({
      deleted: { garage: deletedGarage, biker: deletedBiker, proposal: deletedProposal, total: totalDeleted },
      created: { bikerBiker: bikerResult.bikerBiker, zavarrina: bikerResult.zavarrina, proposal: proposalCount, total: totalCreated },
    });
  } catch (error) {
    console.error("Reset and rematch error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const proposalId = req.params.id as string;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: "Proposta non trovata" });
    }

    // Club-scoped proposals are only visible to active members of that club
    if (proposal.clubId) {
      const isMember = await isActiveClubMember(userId, proposal.clubId);
      if (!isMember) return res.status(403).json({ message: "Accesso riservato ai membri del club" });
    }

    const participants = await storage.getProposalParticipants(proposal.id);
    const creator = await storage.getUser(proposal.userId);

    const participantDetails = await allLimited(
      participants.map((p) => async () => {
        const user = await storage.getUser(p.userId);
        return {
          ...p,
          nickname: user?.nickname ?? "Sconosciuto",
          userType: user?.userType,
          avatarUrl: user?.avatarUrl,
        };
      })
    );

    let motoInfo = null;
    if (proposal.motorcycleId) {
      const motos = await storage.getUserMotorcycles(proposal.userId);
      const moto = motos.find(m => m.id === proposal.motorcycleId);
      if (moto) motoInfo = { brand: moto.brand, model: moto.model, motorcycleType: moto.motorcycleType, ridingStyle: moto.ridingStyle };
    }

    return res.json({
      ...proposal,
      creatorNickname: creator?.nickname ?? "Sconosciuto",
      creatorUserType: creator?.userType,
      creatorAvatarUrl: creator?.avatarUrl,
      participants: participantDetails,
      motoInfo,
    });
  } catch (error) {
    console.error("Get proposal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    const {
      proposalType, searchType, title, description,
      searchRadius, motorcycleId, wishlistMotoId, anyMotoOk,
      departureLatitude, departureLongitude, departureAddress,
      destinationAddress, destinationLatitude, destinationLongitude,
      scheduledAt, departureTimeFrom, departureTimeTo, returnDeadline,
      stops, maxParticipants, clubId,
      extendToDestination, destinationSearchRadius,
    } = req.body;

    if (!proposalType || !title) {
      return res.status(400).json({ message: "Tipo e titolo sono obbligatori" });
    }

    // Club-scoped proposals may only be created by active members of that club
    if (clubId) {
      const isMember = await isActiveClubMember(userId, clubId);
      if (!isMember) return res.status(403).json({ message: "Devi essere membro attivo del club per creare questa proposta" });
    }

    if (searchType) {
      const userType = user.userType;
      if ((userType === "biker" || userType === "coppia") && !BIKER_SEARCH_TYPES.includes(searchType)) {
        return res.status(400).json({ message: "Tipo di ricerca non valido per biker/coppia" });
      }
      if (userType === "zavorrina" && !ZAVORRINA_SEARCH_TYPES.includes(searchType)) {
        return res.status(400).json({ message: "Tipo di ricerca non valido per zavorrina" });
      }
    }

    let expiresAt: Date | null = null;
    if (departureTimeTo) {
      expiresAt = new Date(new Date(departureTimeTo).getTime() + 2 * 60 * 60 * 1000);
    }

    const proposal = await storage.createProposal({
      userId,
      proposalType,
      searchType: searchType || null,
      title,
      description: description || null,
      searchRadius: searchRadius || null,
      motorcycleId: motorcycleId || null,
      wishlistMotoId: wishlistMotoId || null,
      anyMotoOk: anyMotoOk || false,
      departureLatitude: departureLatitude ?? null,
      departureLongitude: departureLongitude ?? null,
      departureAddress: departureAddress || null,
      destinationAddress: destinationAddress || null,
      destinationLatitude: destinationLatitude ?? null,
      destinationLongitude: destinationLongitude ?? null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      departureTimeFrom: departureTimeFrom ? new Date(departureTimeFrom) : null,
      departureTimeTo: departureTimeTo ? new Date(departureTimeTo) : null,
      returnDeadline: returnDeadline ? new Date(returnDeadline) : null,
      stops: stops || null,
      maxParticipants: maxParticipants ?? null,
      expiresAt,
      clubId: clubId || null,
      extendToDestination: extendToDestination === true,
      destinationSearchRadius: destinationSearchRadius ?? null,
    });

    await storage.addProposalParticipant({
      proposalId: proposal.id,
      userId,
    });

    triggerProposalCreatedMatching(proposal);

    return res.status(201).json(proposal);
  } catch (error) {
    console.error("Create proposal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const proposalId = req.params.id as string;
    const proposal = await storage.getProposal(proposalId);

    if (!proposal) {
      return res.status(404).json({ message: "Proposta non trovata" });
    }
    if (proposal.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    // Defense-in-depth (Task #1116): allinea PUT alle altre operazioni club-scoped.
    // Se il creator è stato espulso/rimosso dal club dopo aver creato la proposta,
    // la GET /:id e la POST /:id/join già negano accesso a non-membri; senza
    // questa check, il creator espulso resterebbe l'unico in grado di modificare
    // una proposta dentro un club a cui non appartiene più.
    if (proposal.clubId) {
      const isMember = await isActiveClubMember(userId, proposal.clubId);
      if (!isMember) {
        return res.status(403).json({ message: "Devi essere membro attivo del club per modificare questa proposta" });
      }
    }

    const b = req.body;
    const updateData: Record<string, unknown> = {};
    if (b.title !== undefined) updateData.title = b.title;
    if (b.description !== undefined) updateData.description = b.description;
    if (b.departureLatitude !== undefined) updateData.departureLatitude = b.departureLatitude;
    if (b.departureLongitude !== undefined) updateData.departureLongitude = b.departureLongitude;
    if (b.departureAddress !== undefined) updateData.departureAddress = b.departureAddress;
    if (b.destinationAddress !== undefined) updateData.destinationAddress = b.destinationAddress;
    if (b.destinationLatitude !== undefined) updateData.destinationLatitude = b.destinationLatitude;
    if (b.destinationLongitude !== undefined) updateData.destinationLongitude = b.destinationLongitude;
    if (b.scheduledAt !== undefined) updateData.scheduledAt = b.scheduledAt;
    if (b.departureTimeFrom !== undefined) updateData.departureTimeFrom = b.departureTimeFrom;
    if (b.departureTimeTo !== undefined) updateData.departureTimeTo = b.departureTimeTo;
    if (b.returnDeadline !== undefined) updateData.returnDeadline = b.returnDeadline;
    if (b.searchRadius !== undefined) updateData.searchRadius = b.searchRadius;
    if (b.motorcycleId !== undefined) updateData.motorcycleId = b.motorcycleId;
    if (b.wishlistMotoId !== undefined) updateData.wishlistMotoId = b.wishlistMotoId;
    if (b.anyMotoOk !== undefined) updateData.anyMotoOk = b.anyMotoOk;
    if (b.stops !== undefined) updateData.stops = b.stops;
    if (b.maxParticipants !== undefined) updateData.maxParticipants = b.maxParticipants;
    if (b.status !== undefined) updateData.status = b.status;

    // Security: use explicit property access (not dynamic bracket notation) to avoid prototype-pollution vectors
    if (updateData.scheduledAt) updateData.scheduledAt = new Date(updateData.scheduledAt as string);
    if (updateData.departureTimeFrom) updateData.departureTimeFrom = new Date(updateData.departureTimeFrom as string);
    if (updateData.departureTimeTo) updateData.departureTimeTo = new Date(updateData.departureTimeTo as string);
    if (updateData.returnDeadline) updateData.returnDeadline = new Date(updateData.returnDeadline as string);

    if (updateData.departureTimeTo) {
      updateData.expiresAt = new Date((updateData.departureTimeTo as Date).getTime() + 2 * 60 * 60 * 1000);
    }

    const updated = await storage.updateProposal(proposalId, updateData as any);

    // If the proposal was re-activated (status explicitly set to "active" from a
    // non-active state), re-trigger zone matching + push notifications so that
    // nearby users are notified just as they would be for a brand-new proposal.
    if (updateData.status === "active" && proposal.status !== "active" && updated) {
      triggerProposalCreatedMatching(updated);
    }

    return res.json(updated);
  } catch (error) {
    console.error("Update proposal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/:id/join", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const proposalId = req.params.id as string;
    const proposal = await storage.getProposal(proposalId);

    if (!proposal) {
      return res.status(404).json({ message: "Proposta non trovata" });
    }

    if (proposal.status !== "active") {
      return res.status(400).json({ message: "La proposta non è più attiva" });
    }

    // Club-scoped proposals may only be joined by active members of that club
    if (proposal.clubId) {
      const isMember = await isActiveClubMember(userId, proposal.clubId);
      if (!isMember) return res.status(403).json({ message: "Devi essere membro attivo del club per partecipare" });
    }

    const participants = await storage.getProposalParticipants(proposal.id);

    const alreadyJoined = participants.some((p) => p.userId === userId);
    if (alreadyJoined) {
      return res.status(409).json({ message: "Sei già iscritto a questa proposta" });
    }

    if (proposal.maxParticipants && participants.length >= proposal.maxParticipants) {
      return res.status(400).json({ message: "Numero massimo di partecipanti raggiunto" });
    }

    const participant = await storage.addProposalParticipant({
      proposalId: proposal.id,
      userId,
    });

    return res.status(201).json(participant);
  } catch (error) {
    console.error("Join proposal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/matches/rejected", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const count = await storage.deleteRejectedProposalMatches(userId);
    return res.json({ deleted: count });
  } catch (error) {
    console.error("Delete rejected proposal matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/matches/:matchId", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const ok = await storage.deleteProposalMatch(req.params.matchId, userId);
    if (!ok) return res.status(404).json({ message: "Match non trovato o non autorizzato" });
    return res.json({ deleted: true });
  } catch (error) {
    console.error("Delete proposal match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/garage-matches/rejected", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const count = await storage.deleteRejectedGarageMatches(userId);
    return res.json({ deleted: count });
  } catch (error) {
    console.error("Delete rejected garage matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/garage-matches/:matchId", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const ok = await storage.resetGarageMatchToNew(req.params.matchId, userId);
    if (!ok) return res.status(404).json({ message: "Match non trovato o non autorizzato" });
    return res.json({ deleted: true });
  } catch (error) {
    console.error("Reset garage match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id;
    const userId = req.session.userId!;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: "Proposta non trovata" });
    }
    if (proposal.userId !== userId) {
      return res.status(403).json({ message: "Solo il creatore può eliminare questa proposta" });
    }
    if (proposal.clubId) {
      const [membership] = await db
        .select({ userId: motoClubMembers.userId })
        .from(motoClubMembers)
        .where(and(
          eq(motoClubMembers.clubId, proposal.clubId),
          eq(motoClubMembers.userId, userId),
          eq(motoClubMembers.status, "active"),
        ))
        .limit(1);
      if (!membership) {
        return res.status(403).json({ message: "Non sei più membro attivo del club" });
      }
    }
    await storage.deleteProposal(proposalId);
    return res.json({ message: "Proposta eliminata" });
  } catch (error) {
    console.error("Delete proposal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
