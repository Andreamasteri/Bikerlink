import { sendError } from "../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { generateInvitationSchema } from "@shared/schema";

const router = Router();

router.post("/generate", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return sendError(res, 401, "Non autenticato");
    }

    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") {
      return sendError(res, 403, "Accesso negato");
    }

    const parsed = generateInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }
    const { maxUses, expiresAt } = parsed.data;

    const code = "BL-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).substr(2, 5).toUpperCase();

    const invitation = await storage.createInvitationCode({
      code,
      createdBy: req.session.userId,
      maxUses: maxUses ?? 100,
      expiresAt: expiresAt ?? undefined,
    });

    return res.status(201).json(invitation);
  } catch (error) {
    console.error("Invitation generate error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return sendError(res, 401, "Non autenticato");
    }

    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") {
      return sendError(res, 403, "Accesso negato");
    }

    const codes = await storage.getInvitationCodes();
    return res.json(codes);
  } catch (error) {
    console.error("Invitation list error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/placeholders", async (_req: Request, res: Response) => {
  return res.json({
    comingSoon: [
      {
        id: "paypal_donations",
        name: "Supporto economico",
        description: "Supporta BikerLink con un contributo economico",
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

router.get("/preview/:code", async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    if (!code) return sendError(res, 400, "Codice mancante");

    const invitation = await storage.getInvitationCode(code.toUpperCase());
    if (!invitation || !invitation.isActive) {
      return sendError(res, 404, "Codice non valido");
    }
    if (invitation.currentUses >= invitation.maxUses) {
      return sendError(res, 404, "Codice esaurito");
    }
    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
      return sendError(res, 404, "Codice scaduto");
    }

    return res.json({
      code: invitation.code,
      label: invitation.label ?? null,
      giftMessage: invitation.giftMessage ?? null,
    });
  } catch (error) {
    console.error("Invite preview error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
