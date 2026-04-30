import { Router, type Request, type Response, type RequestHandler } from "express";
import { db } from "../db";
import { appCrashLogs, users } from "@shared/schema";
import { eq, desc, and, gte, lte, inArray, count, sql } from "drizzle-orm";
import { storage } from "../storage";

const MAX_BATCH = 50;
const MAX_STR = 2000;
const MAX_STACK = 5000;

function trunc(s: unknown, max: number): string {
  const str = String(s ?? "");
  return str.length > max ? str.slice(0, max) : str;
}

const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return;
  }
  storage
    .getUser(req.session.userId)
    .then((user) => {
      if (!user || user.role !== "admin") {
        res.status(403).json({ message: "Accesso non autorizzato" });
        return;
      }
      next();
    })
    .catch((err) => {
      console.error("[crash-logs] requireAdmin db error:", err);
      res.status(500).json({ message: "Errore interno" });
    });
};

interface CrashLogEntryInput {
  sessionId?: unknown;
  crashType?: unknown;
  appVersion?: unknown;
  platform?: unknown;
  osVersion?: unknown;
  deviceModel?: unknown;
  errorMessage?: unknown;
  stackTrace?: unknown;
  sessionStartedAt?: unknown;
  sessionEndedAt?: unknown;
}

export const publicRouter = Router();

publicRouter.post("/", (req: Request, res: Response): void => {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return;
  }

  const { logs } = req.body as { logs?: unknown };
  if (!Array.isArray(logs) || logs.length === 0) {
    res.status(400).json({ message: "logs deve essere un array non vuoto" });
    return;
  }

  const userId = req.session.userId;
  const batch = (logs as CrashLogEntryInput[]).slice(0, MAX_BATCH);

  const validCrashTypes = ["crash_system", "crash_js", "clean_close"] as const;
  type ValidCrashType = typeof validCrashTypes[number];

  const rows = batch.map((entry) => ({
    userId,
    sessionId: trunc(entry.sessionId ?? "", 64) || "unknown",
    crashType: validCrashTypes.includes(entry.crashType as ValidCrashType)
      ? (entry.crashType as string)
      : "crash_system",
    appVersion: entry.appVersion ? trunc(entry.appVersion, 32) : null,
    platform: entry.platform ? trunc(entry.platform, 16) : null,
    osVersion: entry.osVersion ? trunc(entry.osVersion, 50) : null,
    deviceModel: entry.deviceModel ? trunc(entry.deviceModel, 100) : null,
    errorMessage: entry.errorMessage ? trunc(entry.errorMessage, MAX_STR) : null,
    stackTrace: entry.stackTrace ? trunc(entry.stackTrace, MAX_STACK) : null,
    sessionStartedAt: entry.sessionStartedAt ? new Date(String(entry.sessionStartedAt)) : null,
    sessionEndedAt: entry.sessionEndedAt ? new Date(String(entry.sessionEndedAt)) : null,
  }));

  db.insert(appCrashLogs)
    .values(rows)
    .then(() => {
      res.json({ received: rows.length });
    })
    .catch((err) => {
      console.error("[crash-logs] insert error:", err);
      res.status(500).json({ message: "Errore interno" });
    });
});

export const adminRouter = Router();

adminRouter.get("/", requireAdmin, (req: Request, res: Response): void => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
  const offset = (page - 1) * limit;

  const { userId: filterUserId, crashType, dateFrom, dateTo, appVersion } = req.query as Record<string, string>;

  const where = and(
    inArray(appCrashLogs.crashType, ["crash_system", "crash_js"]),
    filterUserId ? eq(appCrashLogs.userId, filterUserId) : undefined,
    crashType === "crash_system" || crashType === "crash_js"
      ? eq(appCrashLogs.crashType, crashType)
      : undefined,
    dateFrom ? gte(appCrashLogs.reportedAt, new Date(dateFrom)) : undefined,
    dateTo ? lte(appCrashLogs.reportedAt, new Date(dateTo)) : undefined,
    appVersion ? eq(appCrashLogs.appVersion, appVersion) : undefined,
  );

  Promise.all([
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
        stackTrace: appCrashLogs.stackTrace,
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
    db.select({ count: count() }).from(appCrashLogs).where(where),
    db
      .select({
        platform: appCrashLogs.platform,
        deviceModel: appCrashLogs.deviceModel,
        total: count(),
      })
      .from(appCrashLogs)
      .where(where)
      .groupBy(appCrashLogs.platform, appCrashLogs.deviceModel)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
  ])
    .then(([rows, countRows, deviceRows]) => {
      res.json({
        logs: rows,
        total: countRows[0]?.count ?? 0,
        page,
        limit,
        deviceStats: deviceRows,
      });
    })
    .catch((err) => {
      console.error("[crash-logs admin] query error:", err);
      res.status(500).json({ message: "Errore interno" });
    });
});
