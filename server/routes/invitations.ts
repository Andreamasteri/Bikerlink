import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

router.post("/generate", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const { maxUses, expiresAt } = req.body;

    const code = "BL-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).substr(2, 5).toUpperCase();

    const invitation = await storage.createInvitationCode({
      code,
      createdBy: req.session.userId,
      maxUses: maxUses || 1,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    return res.status(201).json(invitation);
  } catch (error) {
    console.error("Invitation generate error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const codes = await storage.getInvitationCodes();
    return res.json(codes);
  } catch (error) {
    console.error("Invitation list error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/placeholders", async (_req: Request, res: Response) => {
  return res.json({
    comingSoon: [
      {
        id: "paypal_donations",
        name: "Donazioni PayPal",
        description: "Supporta BikerLink con una donazione via PayPal",
        status: "planned",
        enabled: false,
      },
      {
        id: "foodtracker",
        name: "Integrazione Foodtracker",
        description: "Trova ristoranti e soste lungo il percorso",
        status: "planned",
        enabled: false,
      },
      {
        id: "google_drive_backup",
        name: "Backup Google Drive",
        description: "Salva i tuoi percorsi e foto su Google Drive",
        status: "planned",
        enabled: false,
      },
    ],
  });
});

export default router;
