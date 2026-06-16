// Task #2603 — estratto da server/routes/proposals/matching.ts (mechanical split)
import { Router, type Request, type Response } from "express";
import { storage } from "../../../storage";
import { db } from "../../../db";
import { motoClubMembers, proposalZoneNotifications } from "@shared/db";
import { and, eq, inArray } from "drizzle-orm";
import { isSystemAccount } from "../../../lib/system-account-filter";
import { sendSuccess, sendError } from "../../../lib/api-response";
import { allLimited } from "../../../lib/concurrency";
import { sendZoneMatchedPushNotifications } from "../../../push-notifications";
import { recordMatchFeedbackFireAndForget, featureKeyForKind } from "../../../matching/feedback";
import { requireAuth } from "../../../lib/auth-middleware";

const router = Router();

async function getHalfLifeDays(kind: "generic" | "proposal"): Promise<number | undefined> {
  const key = kind === "proposal"
    ? "match_freshness_halflife_proposal_days"
    : "match_freshness_halflife_generic_days";
  const setting = await storage.getAppSetting(key);
  if (!setting?.value) return undefined;
  const n = Number(setting.value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
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
    const halfLifeDays = await getHalfLifeDays("proposal");
    const matches = await storage.getProposalMatches(userId, { halfLifeDays });

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
    return sendError(res, 500, "Errore interno del server");
  }
});
router.post("/matches/:id/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;

    const match = await storage.getProposalMatch(matchId);
    if (!match) {
      return sendError(res, 404, "Match non trovato");
    }
    if (match.status !== "pending") {
      return sendError(res, 400, "Match non più in attesa");
    }

    const isUser1 = match.userId1 === userId;
    const isUser2 = match.userId2 === userId;
    if (!isUser1 && !isUser2) {
      return sendError(res, 403, "Non autorizzato");
    }

    const proposal1 = await storage.getProposal(match.proposalId1);
    const proposal2 = await storage.getProposal(match.proposalId2);
    if (proposal1?.clubId && !(await isActiveClubMember(userId, proposal1.clubId))) {
      return sendError(res, 403, "Non sei più membro del club di questa proposta");
    }
    if (proposal2?.clubId && !(await isActiveClubMember(userId, proposal2.clubId))) {
      return sendError(res, 403, "Non sei più membro del club di questa proposta");
    }
    const otherUserId = isUser1 ? match.userId2 : match.userId1;
    if (proposal1?.clubId && !(await isActiveClubMember(otherUserId, proposal1.clubId))) {
      return sendError(res, 403, "L'altra persona non è più membro del club");
    }
    if (proposal2?.clubId && !(await isActiveClubMember(otherUserId, proposal2.clubId))) {
      return sendError(res, 403, "L'altra persona non è più membro del club");
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

    const updated = await storage.updateProposalMatch(matchId, updateData);

    recordMatchFeedbackFireAndForget({
      userId,
      otherUserId,
      matchKind: "proposal",
      featureKey: featureKeyForKind("proposal"),
      action: "accept",
      matchRefId: matchId,
    });

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
    return sendError(res, 500, "Errore interno del server");
  }
});
router.post("/matches/:id/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;

    const match = await storage.getProposalMatch(matchId);
    if (!match) {
      return sendError(res, 404, "Match non trovato");
    }
    if (match.userId1 !== userId && match.userId2 !== userId) {
      return sendError(res, 403, "Non autorizzato");
    }

    const updated = await storage.updateProposalMatch(matchId, { status: "rejected" });
    recordMatchFeedbackFireAndForget({
      userId,
      otherUserId: match.userId1 === userId ? match.userId2 : match.userId1,
      matchKind: "proposal",
      featureKey: featureKeyForKind("proposal"),
      action: "reject",
      matchRefId: matchId,
    });
    return res.json(updated);
  } catch (error) {
    console.error("Reject match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});
router.get("/proposal-profile-matches", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const halfLifeDays = await getHalfLifeDays("proposal");
    const matches = await storage.getProposalProfileMatchesForUser(userId, { halfLifeDays });

    const userMemberships = await db
      .select({ clubId: motoClubMembers.clubId })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")));
    const memberClubIds = new Set(userMemberships.map((m) => m.clubId));

    const results = await allLimited(
      matches.map((match) => async () => {
        const proposal = await storage.getProposal(match.proposalId);
        if (proposal?.clubId && !memberClubIds.has(proposal.clubId)) return null;
        const biker = await storage.getUser(match.bikerId);
        const zavorrina = await storage.getUser(match.zavorrinaId);
        if (!biker || !zavorrina) return null;
        if (isSystemAccount(biker ?? {})) return null;
        if (isSystemAccount(zavorrina ?? {})) return null;
        return {
          ...match,
          bikerNickname: biker.nickname,
          zavorrinaNickname: zavorrina.nickname,
          proposal: proposal ? { ...proposal, creatorNickname: biker.nickname } : null,
        };
      })
    );

    return res.json(results.filter(Boolean));
  } catch (error) {
    console.error("Get proposal-profile matches error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});
router.post("/proposal-profile-matches/:id/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;

    const match = await storage.getProposalProfileMatch(matchId);
    if (!match) return sendError(res, 404, "Match non trovato");
    if (match.bikerId !== userId && match.zavorrinaId !== userId) return sendError(res, 403, "Non autorizzato");
    if (match.status !== "new") return sendError(res, 400, "Match già gestito");

    const updated = await storage.updateProposalProfileMatch(matchId, { status: "accepted" });
    recordMatchFeedbackFireAndForget({
      userId,
      otherUserId: match.bikerId === userId ? match.zavorrinaId : match.bikerId,
      matchKind: "propProfile",
      featureKey: featureKeyForKind("propProfile"),
      action: "accept",
      matchRefId: matchId,
    });
    return res.json(updated);
  } catch (error) {
    console.error("Accept proposal-profile match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});
router.post("/proposal-profile-matches/:id/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;

    const match = await storage.getProposalProfileMatch(matchId);
    if (!match) return sendError(res, 404, "Match non trovato");
    if (match.bikerId !== userId && match.zavorrinaId !== userId) return sendError(res, 403, "Non autorizzato");
    if (match.status !== "new") return sendError(res, 400, "Match già gestito");

    const updated = await storage.updateProposalProfileMatch(matchId, { status: "rejected" });
    recordMatchFeedbackFireAndForget({
      userId,
      otherUserId: match.bikerId === userId ? match.zavorrinaId : match.bikerId,
      matchKind: "propProfile",
      featureKey: featureKeyForKind("propProfile"),
      action: "reject",
      matchRefId: matchId,
    });
    return res.json(updated);
  } catch (error) {
    console.error("Reject proposal-profile match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});
router.get("/proposal-profile-matches/archived", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matches = await storage.getProposalProfileMatchesForUser(userId, { includeArchived: true });
    const enriched = await allLimited(
      matches.map((match) => async () => {
        const other = await storage.getUser(
          match.bikerId === userId ? match.zavorrinaId : match.bikerId,
        );
        if (!other || isSystemAccount(other)) return null;
        return {
          ...match,
          otherUserId: other.id,
          otherNickname: other.nickname,
          otherType: other.userType,
        };
      }),
    );
    return res.json(enriched.filter(Boolean));
  } catch (error) {
    console.error("Get archived proposal-profile matches error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});
router.get("/matches/archived", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matches = await storage.getProposalMatches(userId, { includeArchived: true });
    const enriched = await allLimited(
      matches.map((match) => async () => {
        const other = await storage.getUser(match.userId1 === userId ? match.userId2 : match.userId1);
        if (!other || isSystemAccount(other)) return null;
        return {
          ...match,
          otherUserId: other.id,
          otherNickname: other.nickname,
          otherType: other.userType,
        };
      }),
    );
    return res.json(enriched.filter(Boolean));
  } catch (error) {
    console.error("Get archived proposal matches error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});
router.post("/matches/:id/reactivate", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const id = req.params.id as string;
    const ok = await storage.reactivateProposalMatch(id, userId);
    if (!ok) return sendError(res, 404, "Match non trovato o non autorizzato");
    return sendSuccess(res, { reactivated: true });
  } catch (error) {
    console.error("Reactivate proposal match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});
router.post("/proposal-profile-matches/:id/reactivate", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const id = req.params.id as string;
    const ok = await storage.reactivateProposalProfileMatch(id, userId);
    if (!ok) return sendError(res, 404, "Match non trovato o non autorizzato");
    return sendSuccess(res, { reactivated: true });
  } catch (error) {
    console.error("Reactivate proposal-profile match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
