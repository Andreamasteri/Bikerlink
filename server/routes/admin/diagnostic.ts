import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { sendError } from "../../lib/api-response";
import { diagnosticReports, diagnosticQueue } from "@shared/db";
import { users } from "@shared/db";
import { and, desc, eq, gte, gt, ilike, isNull, lt, lte, or, sql } from "drizzle-orm";
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
    const appVersion = typeof req.query.appVersion === "string" && req.query.appVersion ? req.query.appVersion : undefined;
    const userId = typeof req.query.userId === "string" && req.query.userId ? req.query.userId.trim() : undefined;
    const nickname = typeof req.query.nickname === "string" && req.query.nickname ? req.query.nickname.trim() : undefined;
    const platform = typeof req.query.platform === "string" && req.query.platform ? req.query.platform.trim() : undefined;
    const dateFrom = typeof req.query.dateFrom === "string" && req.query.dateFrom ? req.query.dateFrom.trim() : undefined;
    const dateTo = typeof req.query.dateTo === "string" && req.query.dateTo ? req.query.dateTo.trim() : undefined;

    const conditions = [];

    if (onlyFailed) {
      conditions.push(sql`(${diagnosticReports.summary}->>'failed')::int > 0`);
    }
    if (onlyRemote) {
      conditions.push(eq(diagnosticReports.triggeredBy, "admin"));
    }
    if (appVersion) {
      conditions.push(eq(diagnosticReports.appVersion, appVersion));
    }
    if (userId) {
      conditions.push(eq(diagnosticReports.userId, userId));
    }
    if (platform) {
      conditions.push(eq(diagnosticReports.platform, platform));
    }
    if (nickname) {
      conditions.push(ilike(users.nickname, `%${nickname}%`));
    }
    if (dateFrom) {
      try {
        const from = new Date(dateFrom);
        if (!isNaN(from.getTime())) {
          conditions.push(gte(diagnosticReports.runAt, from));
        }
      } catch {/* invalid date — ignore */}
    }
    if (dateTo) {
      try {
        const to = new Date(dateTo);
        if (!isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          conditions.push(lte(diagnosticReports.runAt, to));
        }
      } catch {/* invalid date — ignore */}
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countRows] = await Promise.all([
      db.select({
        id: diagnosticReports.id,
        userId: diagnosticReports.userId,
        triggeredBy: diagnosticReports.triggeredBy,
        appVersion: diagnosticReports.appVersion,
        platform: diagnosticReports.platform,
        deviceModel: diagnosticReports.deviceModel,
        runAt: diagnosticReports.runAt,
        sentryEventId: diagnosticReports.sentryEventId,
        summary: diagnosticReports.summary,
        results: diagnosticReports.results,
        nickname: users.nickname,
      })
        .from(diagnosticReports)
        .leftJoin(users, eq(diagnosticReports.userId, users.id))
        .where(where)
        .orderBy(desc(diagnosticReports.runAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(diagnosticReports)
        .leftJoin(users, eq(diagnosticReports.userId, users.id))
        .where(where),
    ]);

    const total = countRows[0]?.count ?? 0;

    return res.json({ reports: rows, total, page, limit });
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

router.post("/diagnostic/request", async (req: Request, res: Response) => {
  try {
    const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : null;
    if (!userId) return sendError(res, 400, "userId obbligatorio");

    const user = await storage.getUser(userId);
    if (!user) return sendError(res, 404, "Utente non trovato");

    const existing = await db.select({ id: diagnosticQueue.id })
      .from(diagnosticQueue)
      .where(
        and(
          eq(diagnosticQueue.userId, userId),
          isNull(diagnosticQueue.executedAt),
          gt(diagnosticQueue.expiresAt, new Date()),
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return sendError(res, 409, "Esiste già un comando pendente per questo utente");
    }

    const adminId = (req as Request & { currentUser?: { id: string } }).currentUser?.id;
    await db.insert(diagnosticQueue).values({
      userId,
      commandedBy: adminId ?? null,
      showBanner: false,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return res.json({ ok: true, message: "Comando in coda — l'app lo eseguirà al prossimo polling" });
  } catch (err) {
    console.error("[admin/diagnostic/request] POST error:", err);
    return sendError(res, 500, "Errore creazione comando");
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
