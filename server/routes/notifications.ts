import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { notifications } from "@shared/db";
import { eq } from "drizzle-orm";
import { requireUserId } from "../lib/auth-middleware";
import { sendSuccess, sendError } from "../lib/api-response";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const notificationsList = await storage.getNotifications(userId);
    return res.json(notificationsList);
  } catch (error) {
    console.error("Get notifications error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/all", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const deleted = await db
      .delete(notifications)
      .where(eq(notifications.userId, userId))
      .returning({ id: notifications.id });

    console.log(`[notifications] DELETE /all user=${userId} deleted=${deleted.length}`);
    return sendSuccess(res, { deleted: deleted.length });
  } catch (error) {
    console.error("Delete all notifications error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = req.params.id as string;

    const notificationsList = await storage.getNotifications(userId);
    const notification = notificationsList.find((n) => n.id === id);
    if (!notification) {
      return sendError(res, 404, "Notifica non trovata");
    }

    await db.delete(notifications).where(eq(notifications.id, id));
    return sendSuccess(res, { deleted: 1 });
  } catch (error) {
    console.error("Delete notification error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/:id/read", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = req.params.id as string;

    const notificationsList = await storage.getNotifications(userId);
    const notification = notificationsList.find((n) => n.id === id);
    if (!notification) {
      return sendError(res, 404, "Notifica non trovata");
    }

    await storage.markNotificationRead(id);
    return sendSuccess(res, undefined, "Notifica segnata come letta");
  } catch (error) {
    console.error("Mark notification read error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
