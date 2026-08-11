import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db, withDbRetry } from "../../db";
import { motoClubMembers, proposalParticipants, users, userMotorcycles, type UserMotorcycle } from "@shared/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { triggerProposalCreatedMatching } from "../../matching-engine";

import { requireAuth } from "../../lib/auth-middleware";
import { sendSuccess, sendError } from "../../lib/api-response";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || undefined;
    const proposalType = req.query.type as string | undefined;
    const filter = req.query.filter as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || "50", 10), 100);
    const page = Math.max(parseInt((req.query.page as string) || "1", 10), 1);

    const userId = req.session.userId!;
    let allProposals = await storage.getProposals(status ? { status } : undefined);

    const userMemberships = await withDbRetry(() => db.select({ clubId: motoClubMembers.clubId })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active"))));
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

    const total = allProposals.length;
    const offset = (page - 1) * limit;
    const paginated = allProposals.slice(offset, offset + limit);

    const proposalIds = paginated.map(p => p.id);
    const uniqueUserIds = [...new Set(paginated.map(p => p.userId))];
    const motoUserIds = [...new Set(paginated.filter(p => p.motorcycleId).map(p => p.userId))];

    const [participantCountRows, creatorRows, motorcycleRows] = await Promise.all([
      proposalIds.length > 0
        ? withDbRetry(() => db.select({
            proposalId: proposalParticipants.proposalId,
            count: sql<number>`count(*)::int`,
          })
          .from(proposalParticipants)
          .where(inArray(proposalParticipants.proposalId, proposalIds))
          .groupBy(proposalParticipants.proposalId))
        : Promise.resolve([] as { proposalId: string; count: number }[]),
      uniqueUserIds.length > 0
        ? withDbRetry(() => db.select().from(users).where(inArray(users.id, uniqueUserIds)))
        : Promise.resolve([] as (typeof users.$inferSelect)[]),
      motoUserIds.length > 0
        ? withDbRetry(() => db.select().from(userMotorcycles).where(inArray(userMotorcycles.userId, motoUserIds)))
        : Promise.resolve([] as UserMotorcycle[]),
    ]);

    const participantCountMap = new Map(participantCountRows.map(r => [r.proposalId, r.count]));
    const creatorMap = new Map(creatorRows.map(u => [u.id, u]));
    const motorcyclesByUser = new Map<string, UserMotorcycle[]>();
    for (const moto of motorcycleRows) {
      if (!motorcyclesByUser.has(moto.userId)) motorcyclesByUser.set(moto.userId, []);
      motorcyclesByUser.get(moto.userId)!.push(moto);
    }

    const results = paginated.map((proposal) => {
      const creator = creatorMap.get(proposal.userId);
      let motoInfo = null;
      if (proposal.motorcycleId) {
        const userMotos = motorcyclesByUser.get(proposal.userId) ?? [];
        const moto = userMotos.find(m => m.id === proposal.motorcycleId);
        if (moto) motoInfo = { brand: moto.brand, model: moto.model, motorcycleType: moto.motorcycleType, ridingStyle: moto.ridingStyle };
      }
      return {
        ...proposal,
        creatorNickname: creator?.nickname ?? "Sconosciuto",
        creatorUserType: creator?.userType,
        participantCount: participantCountMap.get(proposal.id) ?? 0,
        motoInfo,
      };
    });

    return res.json({ data: results, total, page, limit });
  } catch (error) {
    console.error("Get proposals error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const isFiniteCoordinate = (value: unknown): value is number =>
      typeof value === "number" && Number.isFinite(value);
    const searchTypes = Array.isArray(body.searchTypes) ? body.searchTypes : [];
    const requiresDestination =
      body.extendToDestination === true ||
      body.searchType === "hitchhiker" ||
      searchTypes.includes("hitchhiker");

    if (!isFiniteCoordinate(body.departureLatitude) || !isFiniteCoordinate(body.departureLongitude)) {
      return sendError(res, 400, "Coordinate di partenza mancanti o non valide");
    }
    if (
      requiresDestination &&
      (!isFiniteCoordinate(body.destinationLatitude) || !isFiniteCoordinate(body.destinationLongitude))
    ) {
      return sendError(res, 400, "Coordinate di destinazione mancanti o non valide");
    }

    const proposalData = {
      ...body,
      userId,
      status: "open",
    } as Parameters<typeof storage.createProposal>[0];

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
      const [membership] = await withDbRetry(() => db
        .select({ userId: motoClubMembers.userId })
        .from(motoClubMembers)
        .where(and(
          eq(motoClubMembers.clubId, proposal.clubId!),
          eq(motoClubMembers.userId, userId),
          eq(motoClubMembers.status, "active"),
        ))
        .limit(1));
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
