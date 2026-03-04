import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || undefined;
    const proposalType = req.query.type as string | undefined;

    let allProposals = await storage.getProposals(status ? { status } : undefined);

    if (proposalType) {
      allProposals = allProposals.filter((p) => p.proposalType === proposalType);
    }

    const results = await Promise.all(
      allProposals.map(async (proposal) => {
        const participants = await storage.getProposalParticipants(proposal.id);
        const creator = await storage.getUser(proposal.userId);
        const creatorName = creator?.nickname ?? "Sconosciuto";
        return {
          ...proposal,
          creatorNickname: creatorName,
          creatorUserType: creator?.userType,
          participantCount: participants.length,
        };
      })
    );

    return res.json(results);
  } catch (error) {
    console.error("Get proposals error:", error);
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

    return res.json({
      ...proposal,
      creatorNickname: creator?.nickname ?? "Sconosciuto",
      creatorUserType: creator?.userType,
      creatorAvatarUrl: creator?.avatarUrl,
      participants: participantDetails,
    });
  } catch (error) {
    console.error("Get proposal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { proposalType, title, description, departureLatitude, departureLongitude, departureAddress, scheduledAt, maxParticipants } = req.body;

    if (!proposalType || !title) {
      return res.status(400).json({ message: "Tipo e titolo sono obbligatori" });
    }

    const validTypes = ["giro", "raduno", "con_zavorrina", "richiesta"];
    if (!validTypes.includes(proposalType)) {
      return res.status(400).json({ message: "Tipo di proposta non valido" });
    }

    const proposal = await storage.createProposal({
      userId,
      proposalType,
      title,
      description,
      departureLatitude: departureLatitude ?? null,
      departureLongitude: departureLongitude ?? null,
      departureAddress: departureAddress ?? null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      maxParticipants: maxParticipants ?? null,
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

    const allowedFields = ["title", "description", "departureLatitude", "departureLongitude", "departureAddress", "scheduledAt", "maxParticipants", "status"];
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (updateData.scheduledAt) {
      updateData.scheduledAt = new Date(updateData.scheduledAt as string);
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

export default router;
