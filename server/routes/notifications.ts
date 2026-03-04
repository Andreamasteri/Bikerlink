import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { storage } from "../storage";

export const notificationsRouter = Router();

notificationsRouter.get("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const notifications = await storage.getUserNotifications(user.id);
    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento notifiche" });
  }
});

notificationsRouter.put("/:id/read", requireAuth, async (req, res) => {
  try {
    await storage.markNotificationRead(req.params.id);
    res.json({ message: "Notifica segnata come letta" });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'aggiornamento notifica" });
  }
});
