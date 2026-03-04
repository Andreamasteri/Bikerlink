import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const notificationsList = await storage.getNotifications(userId);
    return res.json(notificationsList);
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/:id/read", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;

    const notificationsList = await storage.getNotifications(userId);
    const notification = notificationsList.find((n) => n.id === id);
    if (!notification) {
      return res.status(404).json({ message: "Notifica non trovata" });
    }

    await storage.markNotificationRead(id);
    return res.json({ message: "Notifica segnata come letta" });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
