import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { db } from "../db";
import { deviceMetrics, appCrashLogs } from "@shared/db";
import { sql, eq, and } from "drizzle-orm";
import { sendError } from "../lib/api-response";

const router = Router();

const deviceMetricsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 2,
  keyGenerator: (req) => {
    const userId = req.session?.userId;
    const sessionId = (req.body as { sessionId?: string })?.sessionId;
    return userId ? `${userId}:${sessionId ?? ""}` : req.ip ?? "unknown";
  },
  message: { message: "Rate limit: 1 invio ogni 60s" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.session?.userId,
});

router.post(
  "/device",
  deviceMetricsLimiter,
  async (req: Request, res: Response) => {
    const userId = req.session?.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");

    try {
      const body = req.body as {
        sessionId?: string;
        platform?: string;
        memoryUsedMb?: number;
        memoryTotalMb?: number;
        batteryLevel?: number;
        batteryState?: string;
        appUptimeSeconds?: number;
        abnormalRestarts?: number;
      };

      const sessionId =
        typeof body.sessionId === "string" && body.sessionId
          ? body.sessionId.substring(0, 64)
          : "unknown";

      const batteryLevel =
        typeof body.batteryLevel === "number"
          ? Math.max(0, Math.min(100, Math.round(body.batteryLevel)))
          : null;

      await db.insert(deviceMetrics).values({
        userId,
        sessionId,
        platform:
          typeof body.platform === "string"
            ? body.platform.substring(0, 16)
            : null,
        memoryUsedMb:
          typeof body.memoryUsedMb === "number" && body.memoryUsedMb > 0
            ? Math.round(body.memoryUsedMb)
            : null,
        memoryTotalMb:
          typeof body.memoryTotalMb === "number" && body.memoryTotalMb > 0
            ? Math.round(body.memoryTotalMb)
            : null,
        batteryLevel,
        batteryState:
          typeof body.batteryState === "string"
            ? body.batteryState.substring(0, 20)
            : null,
        appUptimeSeconds:
          typeof body.appUptimeSeconds === "number"
            ? Math.round(body.appUptimeSeconds)
            : null,
      });

      const abnormalRestarts =
        typeof body.abnormalRestarts === "number" && body.abnormalRestarts > 0
          ? Math.floor(body.abnormalRestarts)
          : 0;

      if (abnormalRestarts >= 3) {
        const existing = await db
          .select({ id: appCrashLogs.id })
          .from(appCrashLogs)
          .where(
            and(
              eq(appCrashLogs.userId, userId),
              eq(appCrashLogs.sessionId, sessionId),
              eq(appCrashLogs.crashType, "restart_loop")
            )
          )
          .limit(1);

        if (existing.length === 0) {
          await db.insert(appCrashLogs)
            .values({
              userId,
              sessionId,
              crashType: "restart_loop",
              platform:
                typeof body.platform === "string"
                  ? body.platform.substring(0, 16)
                  : null,
              errorMessage: `Rilevati ${abnormalRestarts} riavvii anomali consecutivi in questa sessione`,
            })
            .catch((err) => {
              console.error("[metrics/device] restart_loop insert error:", err);
            });
        }
      }

      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      db.delete(deviceMetrics)
        .where(sql`recorded_at < ${cutoff}`)
        .catch(() => {});

      return res.json({ ok: true });
    } catch (err) {
      console.error("[metrics/device] error:", err);
      return sendError(res, 500, "Errore salvataggio metriche");
    }
  }
);

export default router;
