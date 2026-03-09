import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}

const BIKER_SEARCH_TYPES = ["find_a_friend", "find_a_guest", "hitcher", "hitchhiker"];
const ZAVORRINA_SEARCH_TYPES = ["find_a_biker", "hitchhiker"];

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || undefined;
    const proposalType = req.query.type as string | undefined;
    const filter = req.query.filter as string | undefined;

    let allProposals = await storage.getProposals(status ? { status } : undefined);

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

    const results = await Promise.all(
      allProposals.map(async (proposal) => {
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

    const results = await Promise.all(
      matches.map(async (match) => {
        const proposal1 = await storage.getProposal(match.proposalId1);
        const proposal2 = await storage.getProposal(match.proposalId2);
        const user1 = await storage.getUser(match.userId1);
        const user2 = await storage.getUser(match.userId2);

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

    return res.json(results);
  } catch (error) {
    console.error("Get matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/garage-matches", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const garageMatches = await storage.getMatchesForUser(userId);

    const results = await Promise.all(
      garageMatches.map(async (match) => {
        const biker = await storage.getUser(match.bikerId);
        const zavorrina = await storage.getUser(match.zavarrinaId);
        const bikerMoto = await storage.getUserMotorcycle(match.bikerMotorcycleId);
        const wishlistMoto = await storage.getWishlistMoto(match.wishlistMotoId);

        return {
          ...match,
          bikerNickname: biker?.nickname,
          bikerType: biker?.userType,
          zavarrinaNickname: zavorrina?.nickname,
          zavarrinaType: zavorrina?.userType,
          bikerMoto: bikerMoto ? { brand: bikerMoto.brand, model: bikerMoto.model, motorcycleType: bikerMoto.motorcycleType } : null,
          wishlistMoto: wishlistMoto ? { brand: wishlistMoto.brand, model: wishlistMoto.model, motorcycleType: wishlistMoto.motorcycleType } : null,
        };
      })
    );

    return res.json(results);
  } catch (error) {
    console.error("Get garage matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/garage-matches/:id/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const matchId = req.params.id;
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
    return res.json(updated);
  } catch (error) {
    console.error("Accept garage match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/garage-matches/:id/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const matchId = req.params.id;
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
    return res.json(updated);
  } catch (error) {
    console.error("Reject garage match error:", error);
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

    const updateData: Record<string, unknown> = {};
    if (isUser1) updateData.acceptedByUser1 = true;
    if (isUser2) updateData.acceptedByUser2 = true;

    const newAcceptedByUser1 = isUser1 ? true : match.acceptedByUser1;
    const newAcceptedByUser2 = isUser2 ? true : match.acceptedByUser2;

    if (newAcceptedByUser1 && newAcceptedByUser2) {
      updateData.status = "accepted";

      const proposal1 = await storage.getProposal(match.proposalId1);
      const proposal2 = await storage.getProposal(match.proposalId2);
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

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id as string;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: "Proposta non trovata" });
    }

    const participants = await storage.getProposalParticipants(proposal.id);
    const creator = await storage.getUser(proposal.userId);

    const participantDetails = await Promise.all(
      participants.map(async (p) => {
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
      stops, maxParticipants,
    } = req.body;

    if (!proposalType || !title) {
      return res.status(400).json({ message: "Tipo e titolo sono obbligatori" });
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
    });

    await storage.addProposalParticipant({
      proposalId: proposal.id,
      userId,
    });

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

    const allowedFields = [
      "title", "description", "departureLatitude", "departureLongitude", "departureAddress",
      "destinationAddress", "destinationLatitude", "destinationLongitude",
      "scheduledAt", "departureTimeFrom", "departureTimeTo", "returnDeadline",
      "searchRadius", "motorcycleId", "wishlistMotoId", "anyMotoOk",
      "stops", "maxParticipants", "status",
    ];
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    const dateFields = ["scheduledAt", "departureTimeFrom", "departureTimeTo", "returnDeadline"];
    for (const f of dateFields) {
      if (updateData[f]) updateData[f] = new Date(updateData[f] as string);
    }

    if (updateData.departureTimeTo) {
      updateData.expiresAt = new Date((updateData.departureTimeTo as Date).getTime() + 2 * 60 * 60 * 1000);
    }

    const updated = await storage.updateProposal(proposalId, updateData as any);
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
    await storage.deleteProposal(proposalId);
    return res.json({ message: "Proposta eliminata" });
  } catch (error) {
    console.error("Delete proposal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
