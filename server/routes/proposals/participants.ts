import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { motoClubMembers } from "@shared/schema";
import { and, eq } from "drizzle-orm";

import { requireAuth } from "../../lib/auth-middleware";

const router = Router();

router.get("/:id/participants", requireAuth, async (req: Request, res: Response) => {
  try {
    const participants = await storage.getProposalParticipants(req.params.id as string);
    return res.json(participants);
  } catch (error) {
    console.error("Get participants error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/:id/participants", requireAuth, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id as string;
    const userId = req.session.userId as string;

    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: "Proposta non trovata" });
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
        return res.status(403).json({ message: "Non sei membro attivo di questo club" });
      }
    }

    const participants = await storage.getProposalParticipants(proposalId);
    if (participants.some((p) => p.userId === userId)) {
      return res.status(400).json({ message: "Sei già un partecipante" });
    }

    const participant = await storage.addProposalParticipant({
      proposalId,
      userId,
      status: "joined",
    });

    return res.json(participant);
  } catch (error) {
    console.error("Join proposal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/:id/participants", requireAuth, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id as string;
    const userId = req.session.userId as string;

    const participants = await storage.getProposalParticipants(proposalId);
    const participant = participants.find((p) => p.userId === userId);

    if (!participant) {
      return res.status(404).json({ message: "Non sei un partecipante di questa proposta" });
    }

    await storage.removeProposalParticipant(participant.id);
    return res.json({ message: "Partecipazione rimossa" });
  } catch (error) {
    console.error("Leave proposal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
