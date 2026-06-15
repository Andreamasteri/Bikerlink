import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { diagnosticReports } from "@shared/db";

const router = Router();

router.post("/report", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
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

    const allowed = ["auto", "admin", "user"];
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

    return res.json({ id: report?.id, ok: true });
  } catch (err) {
    console.error("[diagnostic/report] POST error:", err);
    return res.status(500).json({ message: "Errore salvataggio report" });
  }
});

export default router;
