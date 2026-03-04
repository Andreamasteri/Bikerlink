import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { storage } from "../storage";

export const reportsRouter = Router();

reportsRouter.post("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { reportedUserId, category, description } = req.body;

    if (!reportedUserId || !category || !description) {
      return res.status(400).json({ message: "Dati obbligatori mancanti" });
    }

    if (user.id === reportedUserId) {
      return res.status(400).json({ message: "Non puoi segnalare te stesso" });
    }

    const report = await storage.createReport({
      reporterId: user.id,
      reportedUserId,
      category,
      description,
    });

    res.status(201).json({ report, message: "Segnalazione inviata" });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'invio segnalazione" });
  }
});
