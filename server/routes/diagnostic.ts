import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { diagnosticReports, diagnosticQueue } from "@shared/db";
import { sendError } from "../lib/api-response";
import { and, eq, gt, isNull } from "drizzle-orm";

const router = Router();

router.post("/report", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return sendError(res, 401, "Non autenticato");
    }
    const {
      triggeredBy = "user",
      appVersion,
      platform,
      deviceModel,
      sentryEventId,
      summary,
      results,
    } = req.body as {
      triggeredBy?: string;
      appVersion?: string;
      platform?: string;
      deviceModel?: string;
      sentryEventId?: string;
      summary?: unknown;
      results?: unknown;
    };

    const allowed = ["auto", "admin", "remote", "user"];
    const safeTriggeredBy = allowed.includes(triggeredBy) ? triggeredBy : "user";

    const [report] = await db.insert(diagnosticReports).values({
      userId: req.session.userId,
      triggeredBy: safeTriggeredBy,
      appVersion: appVersion ? String(appVersion).substring(0, 50) : null,
      platform: platform ? String(platform).substring(0, 20) : null,
      deviceModel: deviceModel ? String(deviceModel).substring(0, 100) : null,
      sentryEventId: sentryEventId ? String(sentryEventId).substring(0, 100) : null,
      summary: summary as Record<string, unknown> ?? null,
      results: results as Record<string, unknown>[] ?? null,
    }).returning({ id: diagnosticReports.id });

    if (safeTriggeredBy === "remote") {
      try {
        await db.update(diagnosticQueue)
          .set({ executedAt: new Date() })
          .where(
            and(
              eq(diagnosticQueue.userId, req.session.userId),
              isNull(diagnosticQueue.executedAt),
              gt(diagnosticQueue.expiresAt, new Date()),
            )
          );
      } catch {
        // best-effort: don't fail the report save
      }
    }

    return res.json({ id: report?.id, ok: true });
  } catch (err) {
    console.error("[diagnostic/report] POST error:", err);
    return sendError(res, 500, "Errore salvataggio report");
  }
});

router.get("/pending", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return sendError(res, 401, "Non autenticato");
    }
    const rows = await db.select({ id: diagnosticQueue.id })
      .from(diagnosticQueue)
      .where(
        and(
          eq(diagnosticQueue.userId, req.session.userId),
          isNull(diagnosticQueue.executedAt),
          gt(diagnosticQueue.expiresAt, new Date()),
        )
      )
      .limit(1);

    return res.json({ pending: rows.length > 0 });
  } catch (err) {
    console.error("[diagnostic/pending] GET error:", err);
    return sendError(res, 500, "Errore verifica comando");
  }
});

export default router;
