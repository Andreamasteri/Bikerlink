import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { storage } from "../storage";

export const feedbackRouter = Router();

feedbackRouter.post("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { type, title, description, priority, screenshotUrl } = req.body;

    if (!type || !title || !description) {
      return res.status(400).json({ message: "Tipo, titolo e descrizione sono obbligatori" });
    }

    if (!["bug", "richiesta_funzionalita"].includes(type)) {
      return res.status(400).json({ message: "Tipo non valido" });
    }

    if (priority && !["bassa", "media", "alta"].includes(priority)) {
      return res.status(400).json({ message: "Priorità non valida" });
    }

    const ticket = await storage.createFeedbackTicket({
      userId: user.id,
      type,
      title,
      description,
      priority: priority || "media",
      screenshotUrl,
    });

    res.status(201).json({ ticket, message: "Segnalazione inviata con successo" });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'invio della segnalazione" });
  }
});

feedbackRouter.get("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const tickets = await storage.getFeedbackTicketsByUser(user.id);
    res.json({ tickets });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento delle segnalazioni" });
  }
});

feedbackRouter.get("/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const result = await storage.getFeedbackTicketById(req.params.id);
    if (!result) return res.status(404).json({ message: "Segnalazione non trovata" });
    if (result.ticket.userId !== user.id) return res.status(403).json({ message: "Non autorizzato" });
    res.json({ ticket: result.ticket, user: { ...result.user, passwordHash: undefined } });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento della segnalazione" });
  }
});
