import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { requireAuth } from "../../lib/auth-middleware";
import { sendSuccess, sendError } from "../../lib/api-response";

const router = Router();

const VALID_PUSH_TOKEN_CAUSES = new Set([
  "PERMESSI_NEGATI",
  "TOKEN_NON_OTTENUTO",
  "SERVIZIO_NON_DISPONIBILE",
  "PROGETTO_NON_CONFIGURATO",
  "ERRORE_RETE",
  "ERRORE_SCONOSCIUTO",
]);

const EXPO_TOKEN_REGEX = /^Expo(nent)?PushToken\[.+\]$/;

router.put("/me/push-token-error", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { cause, detail, platform } = req.body as {
      cause?: string;
      detail?: string;
      platform?: string;
    };

    if (!cause || !VALID_PUSH_TOKEN_CAUSES.has(cause)) {
      return sendError(res, 400, "Causa push token non riconosciuta");
    }

    await storage.updateUser(userId, {
      pushTokenError: cause,
      pushTokenErrorDetail: detail ?? null,
      pushTokenErrorPlatform: platform ?? null,
      pushTokenErrorAt: new Date(),
    });

    return sendSuccess(res, { success: true });
  } catch (error) {
    console.error("PUT /me/push-token-error error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/me/push-token", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { token } = req.body as { token?: string };

    if (token === "" || token == null) {
      await storage.updateUser(userId, { expoPushToken: null });
      return res.json({ success: true, cleared: true });
    }

    if (!EXPO_TOKEN_REGEX.test(token)) {
      return sendError(res, 400, "Token Expo non valido");
    }

    await storage.updateUser(userId, {
      expoPushToken: token,
      pushTokenError: null,
      pushTokenErrorDetail: null,
      pushTokenErrorPlatform: null,
      pushTokenErrorAt: null,
    });

    return sendSuccess(res, { success: true });
  } catch (error) {
    console.error("PUT /me/push-token error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
