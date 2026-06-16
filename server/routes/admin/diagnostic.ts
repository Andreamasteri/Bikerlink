import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { sendError } from "../../lib/api-response";
import { diagnosticReports, diagnosticQueue } from "@shared/db";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { storage } from "../../storage";
import { sendDiagnosticCommand, getOnlineUsers } from "../../diagnostic-ws";

const router = Router();

router.get("/diagnostic-reports", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const offset = (page - 1) * limit;
    const onlyFailed = req.query.onlyFailed === "true";
    const onlyRemote = req.query.onlyRemote === "true";
    const appVersion = typeof req.query.appVersion === "string" ? req.query.appVersion : undefined;

    const conditions = [];
    if (onlyFailed) {
      conditions.push(sql`(summary->>'failed')::int > 0`);
    }
    if (onlyRemote) {
      conditions.push(eq(diagnosticReports.triggeredBy, "admin"));
    }
    if (appVersion) {
      conditions.push(eq(diagnosticReports.appVersion, appVersion));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countRows] = await Promise.all([
      db.select().from(diagnosticReports)
        .where(where)
        .orderBy(desc(diagnosticReports.runAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(diagnosticReports).where(where),
    ]);

    const total = countRows[0]?.count ?? 0;

    const enriched = await Promise.all(rows.map(async (r) => {
      let nickname = null;
      if (r.userId) {
        try {
          const u = await storage.getUser(r.userId);
          nickname = u?.nickname ?? null;
        } catch {/* noop */}
      }
      return { ...r, nickname };
    }));

    return res.json({ reports: enriched, total, page, limit });
  } catch (err) {
    console.error("[admin/diagnostic-reports] GET error:", err);
    return sendError(res, 500, "Errore lettura report");
  }
});

router.post("/diagnostic-reports/trigger/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as { userId: string };
    const showBanner = req.body?.showBanner === true;

    const user = await storage.getUser(userId);
    if (!user) return sendError(res, 404, "Utente non trovato");

    const delivered = sendDiagnosticCommand(userId, showBanner);

    if (!delivered) {
      // Queue for offline delivery
      await db.insert(diagnosticQueue).values({
        userId,
        commandedBy: (req as Request & { currentUser?: { id: string } }).currentUser?.id,
        showBanner,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).onConflictDoNothing();
      return res.json({ status: "queued", message: "Comando in coda — verrà eseguito alla prossima connessione" });
    }

    return res.json({ status: "sent", message: "Comando inviato" });
  } catch (err) {
    console.error("[admin/diagnostic-reports] trigger error:", err);
    return sendError(res, 500, "Errore invio comando");
  }
});

router.get("/diagnostic-reports/online-users", (_req: Request, res: Response) => {
  try {
    const onlineUsers = getOnlineUsers();
    return res.json({ users: onlineUsers });
  } catch (err) {
    console.error("[admin/diagnostic-reports] online-users error:", err);
    return sendError(res, 500, "Errore");
  }
});

router.delete("/diagnostic-reports/cleanup", async (_req: Request, res: Response) => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { rowCount } = await db.delete(diagnosticReports).where(lt(diagnosticReports.runAt, cutoff));
    // Also clean up expired queue entries
    await db.delete(diagnosticQueue).where(
      or(
        lt(diagnosticQueue.expiresAt, new Date()),
        and(isNull(diagnosticQueue.executedAt), gt(diagnosticQueue.createdAt, new Date(0)))
      )
    );
    return res.json({ deleted: rowCount ?? 0 });
  } catch (err) {
    console.error("[admin/diagnostic-reports] cleanup error:", err);
    return sendError(res, 500, "Errore pulizia");
  }
});

export default router;
