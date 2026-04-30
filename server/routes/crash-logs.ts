import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { appCrashLogs, users } from "@shared/schema";
import { eq, desc, and, gte, lte, inArray, count } from "drizzle-orm";
import { storage } from "../storage";

const router = Router();

const MAX_BATCH = 50;
const MAX_STR = 2000;
const MAX_STACK = 5000;

function trunc(s: unknown, max: number): string {
  const str = String(s ?? "");
  return str.length > max ? str.slice(0, max) : str;
}

async function requireAdmin(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== "admin") return res.status(403).json({ message: "Accesso non autorizzato" });
  next();
}

router.post("/", async (req: Request, res: Response) => {
  if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });

  const { logs } = req.body as { logs?: unknown[] };
  if (!Array.isArray(logs) || logs.length === 0) {
    return res.status(400).json({ message: "logs deve essere un array non vuoto" });
  }

  const userId = req.session.userId;
  const batch = logs.slice(0, MAX_BATCH);

  const rows = batch.map((entry: any) => ({
    userId,
    sessionId: trunc(entry.sessionId ?? "", 64) || "unknown",
    crashType: ["crash_system", "crash_js", "clean_close"].includes(entry.crashType)
      ? entry.crashType as string
      : "crash_system",
    appVersion: entry.appVersion ? trunc(entry.appVersion, 32) : null,
    platform: entry.platform ? trunc(entry.platform, 16) : null,
    osVersion: entry.osVersion ? trunc(entry.osVersion, 50) : null,
    deviceModel: entry.deviceModel ? trunc(entry.deviceModel, 100) : null,
    errorMessage: entry.errorMessage ? trunc(entry.errorMessage, MAX_STR) : null,
    stackTrace: entry.stackTrace ? trunc(entry.stackTrace, MAX_STACK) : null,
    sessionStartedAt: entry.sessionStartedAt ? new Date(entry.sessionStartedAt) : null,
    sessionEndedAt: entry.sessionEndedAt ? new Date(entry.sessionEndedAt) : null,
  }));

  try {
    await db.insert(appCrashLogs).values(rows);
    return res.json({ received: rows.length });
  } catch (err) {
    console.error("[crash-logs] insert error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/admin", requireAdmin as any, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
  const offset = (page - 1) * limit;

  const { userId: filterUserId, crashType, dateFrom, dateTo, appVersion } = req.query as Record<string, string>;

  const conditions = [
    inArray(appCrashLogs.crashType, ["crash_system", "crash_js"]),
  ] as ReturnType<typeof eq>[];

  if (filterUserId) conditions.push(eq(appCrashLogs.userId, filterUserId));
  if (crashType && ["crash_system", "crash_js"].includes(crashType)) {
    conditions.push(eq(appCrashLogs.crashType, crashType));
  }
  if (dateFrom) conditions.push(gte(appCrashLogs.reportedAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(appCrashLogs.reportedAt, new Date(dateTo)));
  if (appVersion) conditions.push(eq(appCrashLogs.appVersion, appVersion));

  const where = and(...conditions);

  try {
    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: appCrashLogs.id,
          userId: appCrashLogs.userId,
          sessionId: appCrashLogs.sessionId,
          crashType: appCrashLogs.crashType,
          appVersion: appCrashLogs.appVersion,
          platform: appCrashLogs.platform,
          osVersion: appCrashLogs.osVersion,
          deviceModel: appCrashLogs.deviceModel,
          errorMessage: appCrashLogs.errorMessage,
          sessionStartedAt: appCrashLogs.sessionStartedAt,
          sessionEndedAt: appCrashLogs.sessionEndedAt,
          reportedAt: appCrashLogs.reportedAt,
          nickname: users.nickname,
          avatarUrl: users.avatarUrl,
        })
        .from(appCrashLogs)
        .leftJoin(users, eq(appCrashLogs.userId, users.id))
        .where(where)
        .orderBy(desc(appCrashLogs.reportedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(appCrashLogs)
        .where(where),
    ]);

    return res.json({
      logs: rows,
      total: countRows[0]?.count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("[crash-logs admin] query error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

export default router;
