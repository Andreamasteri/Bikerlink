import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { storage } from "../storage";

export const proposalsRouter = Router();

proposalsRouter.post("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { type, description, departureLocation, departureTime, departureLat, departureLng, motorcycleId, maxPickupDistanceKm } = req.body;

    if (!type || !description) {
      return res.status(400).json({ message: "Tipo e descrizione obbligatori" });
    }

    const proposal = await storage.createProposal({
      userId: user.id,
      type,
      description,
      departureLocation,
      departureTime: departureTime ? new Date(departureTime) : undefined,
      departureLat,
      departureLng,
      motorcycleId: motorcycleId || null,
      maxPickupDistanceKm: maxPickupDistanceKm || null,
    } as any);

    const conv = await storage.createConversation("group", proposal.id);
    await storage.addParticipant(conv.id, user.id);

    res.status(201).json({ proposal, conversationId: conv.id });
  } catch (err) {
    res.status(500).json({ message: "Errore nella creazione proposta" });
  }
});

proposalsRouter.get("/", requireAuth, async (req, res) => {
  try {
    const proposals = await storage.getProposals();
    res.json({
      proposals: proposals.map(p => {
        const { passwordHash: _, ...safeUser } = p.user;
        return { ...p.proposal, user: safeUser };
      })
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento proposte" });
  }
});

proposalsRouter.get("/:id", requireAuth, async (req, res) => {
  try {
    const result = await storage.getProposal(req.params.id);
    if (!result) return res.status(404).json({ message: "Proposta non trovata" });
    const { passwordHash: _, ...safeUser } = result.user;
    res.json({ ...result.proposal, user: safeUser });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento proposta" });
  }
});

proposalsRouter.put("/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const existing = await storage.getProposal(req.params.id);
    if (!existing) return res.status(404).json({ message: "Proposta non trovata" });
    if (existing.proposal.userId !== user.id) return res.status(403).json({ message: "Non autorizzato" });

    const updated = await storage.updateProposal(req.params.id, req.body);
    res.json({ proposal: updated });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'aggiornamento proposta" });
  }
});

proposalsRouter.delete("/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const existing = await storage.getProposal(req.params.id);
    if (!existing) return res.status(404).json({ message: "Proposta non trovata" });
    if (existing.proposal.userId !== user.id && user.role !== "admin") {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    await storage.deleteProposal(req.params.id);
    res.json({ message: "Proposta disattivata" });
  } catch (err) {
    res.status(500).json({ message: "Errore nella cancellazione proposta" });
  }
});

proposalsRouter.post("/:id/join", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const proposalId = req.params.id;

    let conv = await storage.getGroupConversationForProposal(proposalId);
    if (!conv) {
      conv = await storage.createConversation("group", proposalId);
    }

    await storage.addParticipant(conv.id, user.id);
    res.json({ conversationId: conv.id });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'iscrizione alla proposta" });
  }
});
