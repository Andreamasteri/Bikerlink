import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}

const createReportSchema = z.object({
  reportedUserId: z.string().min(1, "ID utente segnalato obbligatorio"),
  reason: z.string().min(1, "Motivo obbligatorio").max(100),
  description: z.string().optional(),
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const { reportedUserId, reason, description } = parsed.data;

    if (reportedUserId === userId) {
      return res.status(400).json({ message: "Non puoi segnalare te stesso" });
    }

    const reportedUser = await storage.getUser(reportedUserId);
    if (!reportedUser) {
      return res.status(404).json({ message: "Utente segnalato non trovato" });
    }

    const report = await storage.createReport({
      reporterId: userId,
      reportedUserId,
      reason,
      description,
    });

    return res.status(201).json(report);
  } catch (error) {
    console.error("Create report error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const user = await storage.getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return res.status(403).json({ message: "Accesso non autorizzato" });
    }

    const status = req.query.status as string | undefined;
    const reportsList = await storage.getReports(status);
    return res.json(reportsList);
  } catch (error) {
    console.error("Get reports error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
