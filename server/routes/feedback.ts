import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const { ticketType, subject, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ message: "Oggetto e messaggio sono obbligatori" });
    }

    const ticket = await storage.createFeedbackTicket({
      userId: req.session.userId,
      ticketType: ticketType || "feedback",
      subject,
      message,
    });

    return res.status(201).json(ticket);
  } catch (error) {
    console.error("Feedback create error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const tickets = await storage.getFeedbackTickets();
    return res.json(tickets);
  } catch (error) {
    console.error("Feedback list error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
