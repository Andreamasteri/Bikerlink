import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { motoClubMembers } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { triggerProposalCreatedMatching } from "../../matching-engine";
import { allLimited } from "../../lib/concurrency";

import { requireAuth } from "../../lib/auth-middleware";
import { sendSuccess, sendError } from "../../lib/api-response";

const router = Router();

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
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const proposalData = {
      ...req.body,
      userId,
      status: "open",
    };

    if (proposalData.clubId) {
      const [membership] = await db
        .select({ userId: motoClubMembers.userId })
        .from(motoClubMembers)
        .where(and(
          eq(motoClubMembers.clubId, proposalData.clubId),
          eq(motoClubMembers.userId, userId),
          eq(motoClubMembers.status, "active"),
        ))
        .limit(1);
      if (!membership) {
        return sendError(res, 403, "Puoi creare proposte solo per club di cui sei membro attivo");
      }
    }

    const proposal = await storage.createProposal(proposalData);

    if (!proposal.userId || proposal.departureLatitude == null || proposal.departureLongitude == null) {
      console.warn(`[ProposalCreated] Proposta ${proposal.id} manca di userId/departureLatitude/departureLongitude — matching potrebbe non trovare utenti vicini`);
    }
    triggerProposalCreatedMatching(proposal);

    return res.json(proposal);
  } catch (error) {
    console.error("Create proposal error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id as string;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return sendError(res, 404, "Proposta non trovata");
    }

    const userId = req.session.userId!;
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
        return sendError(res, 403, "Questa proposta è riservata ai membri del club");
      }
    }

    const participants = await storage.getProposalParticipants(proposal.id);
    const creator = await storage.getUser(proposal.userId);

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
      participantCount: participants.length,
      participants,
      motoInfo,
    });
  } catch (error) {
    console.error("Get proposal error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id as string;
    const userId = req.session.userId!;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return sendError(res, 404, "Proposta non trovata");
    }
    if (proposal.userId !== userId) {
      return sendError(res, 403, "Solo il creatore può modificare questa proposta");
    }
    const updated = await storage.updateProposal(proposalId, req.body);
    return res.json(updated);
  } catch (error) {
    console.error("Update proposal error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id as string;
    const userId = req.session.userId!;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return sendError(res, 404, "Proposta non trovata");
    }
    if (proposal.userId !== userId) {
      return sendError(res, 403, "Solo il creatore può eliminare questa proposta");
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
        return sendError(res, 403, "Non sei più membro attivo del club");
      }
    }
    await storage.deleteProposal(proposalId);
    return sendSuccess(res, undefined, "Proposta eliminata");
  } catch (error) {
    console.error("Delete proposal error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
