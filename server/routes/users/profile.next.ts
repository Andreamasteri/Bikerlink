/**
 * profile.next.ts — file successore di profile.ts
 *
 * Contiene handler spostati da profile.ts per tenere il file principale
 * sotto la soglia di 450 righe.
 *
 * Convenzione di utilizzo:
 *   - Aggiungere qui SOLO codice nuovo (non spostare codice esistente da profile.ts).
 *   - Esportare dal file e importare in profile.ts (o nel router principale) quanto necessario.
 *   - Aggiornare questo commento man mano che il file cresce.
 */

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { pushTokenSchema } from "@shared/validators";
import { requireAuth } from "../../lib/auth-middleware";
import { sendSuccess, sendError } from "../../lib/api-response";

const router = Router();

router.put("/me/match-seen", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    await storage.updateUser(userId, { lastSeenMatchAt: new Date() });
    return sendSuccess(res);
  } catch (error) {
    console.error("Match seen update error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/me/push-token", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsedPt = pushTokenSchema.safeParse(req.body ?? {});
    if (!parsedPt.success) return sendError(res, 400, parsedPt.error.issues[0].message);
    const { token } = parsedPt.data;
    if (token === null || token === undefined || token === "") {
      await storage.updateUser(userId, { expoPushToken: null });
      return sendSuccess(res, { cleared: true });
    }
    const isValidToken = typeof token === "string" &&
      (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));
    if (!isValidToken) {
      return sendError(res, 400, "Token Expo push non valido");
    }
    await storage.updateUser(userId, { expoPushToken: token });
    return sendSuccess(res);
  } catch (error) {
    console.error("Push token update error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
