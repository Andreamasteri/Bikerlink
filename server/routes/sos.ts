import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}

router.use(requireAuth);

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { reason, latitude, longitude } = req.body;

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return res.status(400).json({ message: "Motivo richiesto" });
    }
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({ message: "Posizione GPS richiesta" });
    }

    const sosEnabled = await storage.getAppSetting("sos_enabled");
    if (sosEnabled?.value === "false") {
      return res.status(403).json({ message: "Funzione SOS disabilitata" });
    }

    const existing = await storage.getActiveSosRequestByUser(userId);
    if (existing) {
      return res.status(409).json({ message: "Hai già una richiesta SOS attiva" });
    }

    const sosRequest = await storage.createSosRequest({
      requesterId: userId,
      reason: reason.trim(),
      latitude,
      longitude,
      status: "active",
    });

    return res.status(201).json(sosRequest);
  } catch (error) {
    console.error("SOS create error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/active", async (req: Request, res: Response) => {
  try {
    const sosEnabled = await storage.getAppSetting("sos_enabled");
    if (sosEnabled?.value === "false") {
      return res.json([]);
    }

    const requests = await storage.getActiveSosRequests();
    const enriched = await Promise.all(
      requests.map(async (r) => {
        const requester = await storage.getUser(r.requesterId);
        return {
          ...r,
          requesterNickname: requester?.nickname || "Sconosciuto",
          requesterType: requester?.userType || "biker",
        };
      })
    );
    return res.json(enriched);
  } catch (error) {
    console.error("SOS get active error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/my", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const active = await storage.getActiveSosRequestByUser(userId);
    return res.json(active || null);
  } catch (error) {
    console.error("SOS get my error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/:id/cancel", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const sosRequest = await storage.getSosRequest(req.params.id);

    if (!sosRequest) {
      return res.status(404).json({ message: "Richiesta SOS non trovata" });
    }
    if (sosRequest.requesterId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    if (sosRequest.status !== "active") {
      return res.status(400).json({ message: "Richiesta già chiusa" });
    }

    const updated = await storage.updateSosRequest(sosRequest.id, { status: "cancelled" });
    return res.json(updated);
  } catch (error) {
    console.error("SOS cancel error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/:id/accept", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const sosRequest = await storage.getSosRequest(req.params.id);

    if (!sosRequest) {
      return res.status(404).json({ message: "Richiesta SOS non trovata" });
    }
    if (sosRequest.status !== "active") {
      return res.status(400).json({ message: "Richiesta non più attiva" });
    }
    if (sosRequest.requesterId === userId) {
      return res.status(400).json({ message: "Non puoi accettare la tua stessa richiesta" });
    }

    const conv = await storage.createConversation({
      conversationType: "private",
      title: `SOS: ${sosRequest.reason}`,
      proposalId: null,
    });

    await storage.addConversationParticipant({
      conversationId: conv.id,
      userId: sosRequest.requesterId,
    });
    await storage.addConversationParticipant({
      conversationId: conv.id,
      userId,
    });

    const helper = await storage.getUser(userId);
    await storage.createMessage({
      conversationId: conv.id,
      senderId: userId,
      content: `${helper?.nickname || "Un utente"} ha accettato la tua richiesta SOS: "${sosRequest.reason}". Posizione condivisa.`,
      messageType: "text",
    });

    await storage.createMessage({
      conversationId: conv.id,
      senderId: sosRequest.requesterId,
      content: "📍 La mia posizione SOS",
      messageType: "location",
      latitude: sosRequest.latitude,
      longitude: sosRequest.longitude,
    });

    const updated = await storage.updateSosRequest(sosRequest.id, {
      status: "accepted",
      helperId: userId,
      conversationId: conv.id,
    });

    return res.json({ sosRequest: updated, conversationId: conv.id });
  } catch (error) {
    console.error("SOS accept error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
