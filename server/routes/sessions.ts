import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { userSessions } from "@shared/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { sendSuccess, sendError } from "../lib/api-response";

const router = Router();

router.post("/start", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { deviceModel, platform, appVersion } = req.body as {
      deviceModel?: string;
      platform?: string;
      appVersion?: string;
    };

    const inserted = await db
      .insert(userSessions)
      .values({
        userId,
        startedAt: new Date(),
        deviceModel: deviceModel ?? null,
        platform: platform ?? null,
        appVersion: appVersion ?? null,
      })
      .returning({ id: userSessions.id });

    const sessionId = inserted[0]?.id;
    if (!sessionId) return sendError(res, 500, "Errore creazione sessione");

    return res.json({ sessionId });
  } catch (error) {
    console.error("[sessions/start] error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/end", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { sessionId, exitType } = req.body as {
      sessionId?: string;
      exitType?: string;
    };

    if (!sessionId) return sendError(res, 400, "sessionId mancante");

    const validExitTypes = ["background", "logout", "crash"];
    const resolvedExitType = validExitTypes.includes(exitType ?? "") ? exitType : "background";

    const rows = await db
      .select({ startedAt: userSessions.startedAt })
      .from(userSessions)
      .where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId), isNull(userSessions.endedAt)))
      .limit(1);

    if (rows.length === 0) {
      return sendSuccess(res);
    }

    const startedAt = rows[0].startedAt;
    const endedAt = new Date();
    const durationSeconds = Math.floor((endedAt.getTime() - new Date(startedAt).getTime()) / 1000);

    await db
      .update(userSessions)
      .set({
        endedAt,
        durationSeconds: Math.max(0, durationSeconds),
        exitType: resolvedExitType,
      })
      .where(eq(userSessions.id, sessionId));

    return sendSuccess(res);
  } catch (error) {
    console.error("[sessions/end] error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
