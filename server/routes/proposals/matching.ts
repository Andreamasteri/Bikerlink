import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { motoClubMembers, proposalZoneNotifications } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { haversineKm } from "../../geo";
import { isSystemAccount } from "../../lib/system-account-filter";
import { runMatchingForUser, runProposalMatchingForUser } from "../../matching-engine";
import { allLimited, matchEnrichmentSemaphore, SemaphoreQueueFullError } from "../../lib/concurrency";
import { sendZoneMatchedPushNotifications } from "../../push-notifications";

const router = Router();

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
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

router.get("/matches", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matches = await storage.getProposalMatches(userId);

    const userMemberships = await db
      .select({ clubId: motoClubMembers.clubId })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")));
    const memberClubIds = new Set(userMemberships.map((m) => m.clubId));

    const results = await allLimited(
      matches.map((match) => async () => {
        const proposal1 = await storage.getProposal(match.proposalId1);
        const proposal2 = await storage.getProposal(match.proposalId2);

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
        const userId = req.session.userId as string;
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
    });
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
    const userId = req.session.userId as string;
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
    const userId = req.session.userId as string;
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
    const userId = req.session.userId as string;
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

    const proposal1 = await storage.getProposal(match.proposalId1);
    const proposal2 = await storage.getProposal(match.proposalId2);
    if (proposal1?.clubId && !(await isActiveClubMember(userId, proposal1.clubId))) {
      return res.status(403).json({ message: "Non sei più membro del club di questa proposta" });
    }
    if (proposal2?.clubId && !(await isActiveClubMember(userId, proposal2.clubId))) {
      return res.status(403).json({ message: "Non sei più membro del club di questa proposta" });
    }
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
              notificationType: "proposal_match",
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
    const userId = req.session.userId as string;
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
        const userId = req.session.userId as string;
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
              biker1Nickname: biker1?.nickname,
              biker2Nickname: biker2?.nickname,
              biker1Type: biker1?.userType,
              biker2Type: biker2?.userType,
              otherLat,
              otherLng,
              distanceKm,
              distanceFlag,
              myLat,
              myLng,
            };
          })
        );

        return res.json(results.filter(Boolean));
      } catch (error) {
        console.error("Get biker matches error:", error);
        return res.status(500).json({ message: "Errore interno del server" });
      }
    });
  } catch (err) {
    if (err instanceof SemaphoreQueueFullError) {
      res.setHeader("Retry-After", "3");
      return res.status(503).json({ message: "Server occupato, riprova più tardi" });
    }
    console.error("Get biker matches outer error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/biker-matches/:id/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id;
    const match = await storage.getBikerBikerMatch(matchId);
    if (!match) return res.status(404).json({ message: "Match non trovato" });
    if (match.biker1Id !== userId && match.biker2Id !== userId) return res.status(403).json({ message: "Non autorizzato" });
    if (match.status !== "new") return res.status(400).json({ message: "Match già gestito" });
    const updated = await storage.updateBikerBikerMatch(matchId, { status: "accepted" });
    return res.json(updated);
  } catch (error) {
    console.error("Accept biker match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/biker-matches/:id/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id;
    const match = await storage.getBikerBikerMatch(matchId);
    if (!match) return res.status(404).json({ message: "Match non trovato" });
    if (match.biker1Id !== userId && match.biker2Id !== userId) return res.status(403).json({ message: "Non autorizzato" });
    if (match.status !== "new") return res.status(400).json({ message: "Match già gestito" });
    const updated = await storage.updateBikerBikerMatch(matchId, { status: "rejected" });
    return res.json(updated);
  } catch (error) {
    console.error("Reject biker match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/trigger-matching", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    runMatchingForUser(userId).catch(err => console.error("Matching error:", err));
    runProposalMatchingForUser(userId).catch(err => console.error("Proposal matching error:", err));
    return res.json({ success: true, message: "Matching triggered" });
  } catch (error) {
    console.error("Trigger matching error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/garage-matches/:matchId", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const ok = await storage.resetGarageMatchToNew(req.params.matchId, userId);
    if (!ok) return res.status(404).json({ message: "Match non trovato o non autorizzato" });
    return res.json({ deleted: true });
  } catch (error) {
    console.error("Reset garage match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
