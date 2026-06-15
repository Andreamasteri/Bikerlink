import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { motoClubMembers } from "@shared/db";
import { and, eq } from "drizzle-orm";

import { requireAuth } from "../../lib/auth-middleware";
import { sendSuccess, sendError } from "../../lib/api-response";

const router = Router();

router.get("/:id/participants", requireAuth, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id as string;
    const userId = req.session.userId as string;

    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return sendError(res, 404, "Proposta non trovata");
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
        return sendError(res, 403, "Non sei membro attivo di questo club");
      }
    }

    const participants = await storage.getProposalParticipants(proposalId);
    return res.json(participants);
  } catch (error) {
    console.error("Get participants error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/:id/participants", requireAuth, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id as string;
    const userId = req.session.userId as string;

    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return sendError(res, 404, "Proposta non trovata");
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
        return sendError(res, 403, "Non sei membro attivo di questo club");
      }
    }

    const participants = await storage.getProposalParticipants(proposalId);
    if (participants.some((p) => p.userId === userId)) {
      return sendError(res, 400, "Sei già un partecipante");
    }

    const participant = await storage.addProposalParticipant({
      proposalId,
      userId,
    } as import("@shared/db").InsertProposalParticipant);

    return res.json(participant);
  } catch (error) {
    console.error("Join proposal error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/:id/participants", requireAuth, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id as string;
    const userId = req.session.userId as string;

    const participants = await storage.getProposalParticipants(proposalId);
    const participant = participants.find((p) => p.userId === userId);

    if (!participant) {
      return sendError(res, 404, "Non sei un partecipante di questa proposta");
    }

    await storage.removeProposalParticipant(participant.id);
    return sendSuccess(res, undefined, "Partecipazione rimossa");
  } catch (error) {
    console.error("Leave proposal error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
