import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../db";
import { weeklyRecaps } from "@shared/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { sendError } from "../lib/api-response";
import { getWeekStartUtc, runWeeklyRecapJob } from "../matching/jobs/weekly-recap";

const router = Router();

router.get("/current", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const weekStart = getWeekStartUtc();
    const [row] = await withDbRetry(() => db
      .select()
      .from(weeklyRecaps)
      .where(sql`${weeklyRecaps.userId} = ${userId} AND ${weeklyRecaps.weekStart} = ${weekStart.toISOString()}`)
      .limit(1));
    if (!row) {
      return res.json({ recap: null, weekStart: weekStart.toISOString() });
    }
    // marca opened una volta sola
    if (!row.openedAt) {
      await db
        .update(weeklyRecaps)
        .set({ openedAt: new Date() })
        .where(eq(weeklyRecaps.id, row.id));
    }
    return res.json({ recap: row, weekStart: weekStart.toISOString() });
  } catch (error) {
    console.error("[Recap] GET /current error:", error);
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/history", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "8"), 10) || 8, 1), 24);
    const rows = await withDbRetry(() => db
      .select()
      .from(weeklyRecaps)
      .where(eq(weeklyRecaps.userId, userId))
      .orderBy(desc(weeklyRecaps.weekStart))
      .limit(limit));
    return res.json({ recaps: rows });
  } catch (error) {
    console.error("[Recap] GET /history error:", error);
    return sendError(res, 500, "Errore interno");
  }
});

router.post("/track-click", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const recapId = String((req.body as { recapId?: string })?.recapId ?? "");
    if (!recapId) return sendError(res, 400, "recapId mancante");
    await db
      .update(weeklyRecaps)
      .set({ matchClickedAt: new Date() })
      .where(sql`${weeklyRecaps.id} = ${recapId} AND ${weeklyRecaps.userId} = ${userId} AND ${weeklyRecaps.matchClickedAt} IS NULL`);
    return res.json({ success: true });
  } catch (error) {
    console.error("[Recap] track-click error:", error);
    return sendError(res, 500, "Errore interno");
  }
});

// Admin: forza la generazione del recap settimanale (utile per debug)
router.post("/admin/run", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { storage } = await import("../storage");
    const user = await storage.getUser(userId);
    if (user?.role !== "admin") return sendError(res, 403, "Solo admin");
    const result = await runWeeklyRecapJob();
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("[Recap] admin/run error:", error);
    return sendError(res, 500, "Errore interno");
  }
});

// Admin: statistiche engagement degli ultimi N giorni
router.get("/admin/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { storage } = await import("../storage");
    const user = await storage.getUser(userId);
    if (user?.role !== "admin") return sendError(res, 403, "Solo admin");
    const days = Math.min(Math.max(parseInt(String(req.query.days ?? "28"), 10) || 28, 7), 180);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await withDbRetry(() => db.execute<{
      total: number;
      push_sent: number;
      opened: number;
      clicked: number;
    }>(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE push_sent_at IS NOT NULL)::int AS push_sent,
        COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened,
        COUNT(*) FILTER (WHERE match_clicked_at IS NOT NULL)::int AS clicked
      FROM ${weeklyRecaps}
      WHERE created_at >= ${cutoff.toISOString()}
    `));
    const s = rows.rows?.[0] ?? { total: 0, push_sent: 0, opened: 0, clicked: 0 };
    const openRate = s.push_sent > 0 ? Math.round((s.opened / s.push_sent) * 1000) / 10 : 0;
    const clickRate = s.opened > 0 ? Math.round((s.clicked / s.opened) * 1000) / 10 : 0;
    return res.json({
      days,
      total: s.total,
      pushSent: s.push_sent,
      opened: s.opened,
      clicked: s.clicked,
      openRatePct: openRate,
      clickRatePct: clickRate,
    });
  } catch (error) {
    console.error("[Recap] admin/stats error:", error);
    return sendError(res, 500, "Errore interno");
  }
});

export default router;
