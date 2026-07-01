import { Router, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { storage } from "../../storage";
import { db } from "../../db";
import { pushTokens, bowieTerminalTokens } from "@shared/db";
import { requireAuth } from "../../lib/auth-middleware";
import { sendSuccess, sendError } from "../../lib/api-response";

const router = Router();

// App che registrano un push token. "main" = app BikerLink principale (mantiene
// invariato il comportamento storico su users.expoPushToken); qualsiasi altro
// valore (es. "bowie" per la Bowie Terminal) NON tocca users.expoPushToken così
// le due app smettono di rubarsi le notifiche a vicenda (Task #5273).
const MAIN_APP_ID = "main";
const VALID_APP_IDS = new Set([MAIN_APP_ID, "bowie"]);
const VALID_PUSH_PLATFORMS = new Set(["android", "ios", "web"]);

function normalizeAppId(raw: unknown): string {
  return typeof raw === "string" && VALID_APP_IDS.has(raw) ? raw : MAIN_APP_ID;
}

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
    const { token, appId: rawAppId, deviceId: rawDeviceId, platform: rawPlatform } =
      req.body as {
        token?: string;
        appId?: string;
        deviceId?: string;
        platform?: string;
      };

    const appId = normalizeAppId(rawAppId);
    const isMainApp = appId === MAIN_APP_ID;
    const deviceId =
      typeof rawDeviceId === "string" && rawDeviceId.length > 0
        ? rawDeviceId.slice(0, 128)
        : null;
    const platform =
      typeof rawPlatform === "string" && VALID_PUSH_PLATFORMS.has(rawPlatform)
        ? rawPlatform
        : null;

    // ── Clear ─────────────────────────────────────────────────────────────
    if (token === "" || token == null) {
      // Rimuove SOLO i token di questa app; le altre app restano intatte.
      await db.delete(pushTokens).where(
        and(eq(pushTokens.userId, userId), eq(pushTokens.appId, appId)),
      );
      // Il comportamento storico dell'app principale è invariato: continua a
      // svuotare anche lo slot legacy users.expoPushToken.
      if (isMainApp) {
        await storage.updateUser(userId, { expoPushToken: null });
      }
      return res.json({ success: true, cleared: true });
    }

    if (!EXPO_TOKEN_REGEX.test(token)) {
      return sendError(res, 400, "Token Expo non valido");
    }

    // ── Upsert nella tabella per-app (chiave naturale: il token Expo) ──────
    await db
      .insert(pushTokens)
      .values({ userId, appId, deviceId, token, platform })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { userId, appId, deviceId, platform, updatedAt: new Date() },
      });

    // Solo l'app principale scrive lo slot legacy users.expoPushToken, così i
    // ~15 sender esistenti (match, chat, moderazione, job) restano invariati.
    // Le altre app (es. bowie) NON lo toccano più → niente più furto di push.
    if (isMainApp) {
      await storage.updateUser(userId, {
        expoPushToken: token,
        pushTokenError: null,
        pushTokenErrorDetail: null,
        pushTokenErrorPlatform: null,
        pushTokenErrorAt: null,
      });
    }

    return sendSuccess(res, { success: true });
  } catch (error) {
    console.error("PUT /me/push-token error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

// Task #5228 — Registrazione token push per-dispositivo del client "Bowie
// Terminal" (APK standalone). Upsert per device_id: rinnova token + last_active_at
// e "resuscita" un device precedentemente revocato. Separato da /me/push-token
// (users.expoPushToken) così il monitor admin può elencare/revocare i singoli
// device senza toccare il token di consegna principale dell'utente.
router.put("/me/bowie-terminal-token", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { deviceId, token } = req.body as { deviceId?: string; token?: string };

    if (!deviceId || typeof deviceId !== "string" || deviceId.length > 128) {
      return sendError(res, 400, "deviceId mancante o non valido");
    }
    if (!token || !EXPO_TOKEN_REGEX.test(token)) {
      return sendError(res, 400, "Token Expo non valido");
    }

    await db
      .insert(bowieTerminalTokens)
      .values({ deviceId, userId, pushToken: token })
      .onConflictDoUpdate({
        target: bowieTerminalTokens.deviceId,
        set: {
          userId,
          pushToken: token,
          lastActiveAt: sql`now()`,
          revokedAt: null,
        },
      });

    return sendSuccess(res, { success: true });
  } catch (error) {
    console.error("PUT /me/bowie-terminal-token error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
