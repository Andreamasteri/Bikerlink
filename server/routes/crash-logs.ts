import { sendError } from "../lib/api-response";
import { Router, type Request, type Response, type RequestHandler } from "express";
import { db } from "../db";
import { appCrashLogs, users } from "@shared/db";
import { crashLogsSchema } from "@shared/validators";
import { eq, desc, and, gte, lte, count, sql } from "drizzle-orm";
import { storage } from "../storage";
import { registerCrashAnalyticsRoutes } from "./crash-logs-analytics";

const MAX_BATCH = 50;
const MAX_STR = 2000;
const MAX_STACK = 5000;

function trunc(s: unknown, max: number): string {
  const str = String(s ?? "");
  return str.length > max ? str.slice(0, max) : str;
}

const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.session.userId) {
    sendError(res, 401, "Non autenticato");
    return;
  }
  storage
    .getUser(req.session.userId)
    .then((user) => {
      if (!user || user.role !== "admin") {
        sendError(res, 403, "Accesso non autorizzato");
        return;
      }
      next();
    })
    .catch((err) => {
      console.error("[crash-logs] requireAdmin db error:", err);
      sendError(res, 500, "Errore interno");
    });
};

interface CrashLogEntryInput {
  sessionId?: unknown;
  crashType?: unknown;
  appVersion?: unknown;
  platform?: unknown;
  osVersion?: unknown;
  deviceModel?: unknown;
  deviceBrand?: unknown;
  totalMemoryMB?: unknown;
  errorMessage?: unknown;
  stackTrace?: unknown;
  sessionStartedAt?: unknown;
  sessionEndedAt?: unknown;
}

export const publicRouter = Router();

publicRouter.post("/", (req: Request, res: Response): void => {
  if (!req.session.userId) {
    sendError(res, 401, "Non autenticato");
    return;
  }

  const parsed = crashLogsSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.issues[0].message);
    return;
  }

  const userId = req.session.userId;
  const batch = (parsed.data.logs as CrashLogEntryInput[]).slice(0, MAX_BATCH);

  const validCrashTypes = ["crash_system", "crash_js", "clean_close", "restart_loop"] as const;
  type ValidCrashType = typeof validCrashTypes[number];

  const rows = batch.map((entry) => {
    const rawMemory = entry.totalMemoryMB;
    let totalMemoryMb: number | null = null;
    if (typeof rawMemory === "number" && rawMemory > 0 && rawMemory < 1_000_000) {
      totalMemoryMb = Math.round(rawMemory);
    }
    return {
      userId,
      sessionId: trunc(entry.sessionId ?? "", 64) || "unknown",
      crashType: validCrashTypes.includes(entry.crashType as ValidCrashType)
        ? (entry.crashType as string)
        : "crash_system",
      appVersion: entry.appVersion ? trunc(entry.appVersion, 32) : null,
      platform: entry.platform ? trunc(entry.platform, 16) : null,
      osVersion: entry.osVersion ? trunc(entry.osVersion, 50) : null,
      deviceModel: entry.deviceModel ? trunc(entry.deviceModel, 100) : null,
      deviceBrand: entry.deviceBrand ? trunc(entry.deviceBrand, 100) : null,
      totalMemoryMb,
      errorMessage: entry.errorMessage ? trunc(entry.errorMessage, MAX_STR) : null,
      stackTrace: entry.stackTrace ? trunc(entry.stackTrace, MAX_STACK) : null,
      sessionStartedAt: entry.sessionStartedAt ? new Date(String(entry.sessionStartedAt)) : null,
      sessionEndedAt: entry.sessionEndedAt ? new Date(String(entry.sessionEndedAt)) : null,
    };
  });

  db.insert(appCrashLogs)
    .values(rows)
    .onConflictDoNothing()
    .then(() => {
      res.json({ received: rows.length });
    })
    .catch((err) => {
      console.error("[crash-logs] insert error:", err);
      sendError(res, 500, "Errore interno");
    });
});

export const adminRouter = Router();

registerCrashAnalyticsRoutes(adminRouter, requireAdmin);

adminRouter.get("/", requireAdmin, (req: Request, res: Response): void => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
  const offset = (page - 1) * limit;

  const { userId: filterUserId, crashType, dateFrom, dateTo, appVersion, deviceModel } = req.query as Record<string, string>;

  const deviceFilter = deviceModel?.trim();

  const signalTypes = ["js_thread_freeze", "gps_flood", "memory_pressure", "native_module_missing", "appstate_transition"];
  const isSignalFilter = signalTypes.includes(crashType);
  const realCrashTypes = ["crash_system", "crash_js", "restart_loop"];
  const isRealCrashFilter = realCrashTypes.includes(crashType);

  const where = and(
    isSignalFilter
      ? sql`${appCrashLogs.errorMessage} LIKE ${`[resume:${crashType}]%`}`
      : isRealCrashFilter
        ? and(
            eq(appCrashLogs.crashType, crashType as "crash_system" | "crash_js" | "restart_loop"),
            sql`(${appCrashLogs.errorMessage} IS NULL OR ${appCrashLogs.errorMessage} NOT LIKE '[resume:%]%')`
          )
        : sql`(${appCrashLogs.crashType} IN ('crash_system','crash_js','restart_loop') OR ${appCrashLogs.errorMessage} LIKE '[resume:%]%')`,
    filterUserId ? eq(appCrashLogs.userId, filterUserId) : undefined,
    dateFrom ? gte(appCrashLogs.reportedAt, new Date(dateFrom)) : undefined,
    dateTo ? lte(appCrashLogs.reportedAt, new Date(dateTo.length === 10 ? dateTo + "T23:59:59.999Z" : dateTo)) : undefined,
    appVersion ? eq(appCrashLogs.appVersion, appVersion) : undefined,
    deviceFilter
      ? sql`(${appCrashLogs.deviceModel} ILIKE ${"%" + deviceFilter + "%"} OR ${appCrashLogs.deviceBrand} ILIKE ${"%" + deviceFilter + "%"})`
      : undefined,
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
        deviceBrand: appCrashLogs.deviceBrand,
        totalMemoryMb: appCrashLogs.totalMemoryMb,
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
        deviceBrand: appCrashLogs.deviceBrand,
        total: count(),
      })
      .from(appCrashLogs)
      .where(where)
      .groupBy(appCrashLogs.platform, appCrashLogs.deviceModel, appCrashLogs.deviceBrand)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
    db.select({
      brand: sql<string>`COALESCE(${appCrashLogs.deviceBrand}, 'Sconosciuto')`,
      total: count(),
    })
    .from(appCrashLogs)
    .where(and(where, sql`(${appCrashLogs.deviceModel} IS NOT NULL OR ${appCrashLogs.deviceBrand} IS NOT NULL)`))
    .groupBy(sql`COALESCE(${appCrashLogs.deviceBrand}, 'Sconosciuto')`)
    .orderBy(desc(sql`count(*)`))
    .limit(10),
  ])
    .then(([rows, countRows, deviceRows, brandRows]) => {
      const totalCount = countRows[0]?.count ?? 0;
      const brandList = brandRows as { brand: string; total: number }[];
      const grandTotal = brandList.reduce((s, b) => s + b.total, 0);

      const logsWithDerived = rows.map((row) => {
        const msg = row.errorMessage ?? "";
        let derivedType: string = row.crashType ?? "crash_system";
        const match = msg.match(/^\[resume:([^\]]+)\]/);
        if (match) derivedType = match[1];
        return { ...row, derivedType };
      });

      res.json({
        logs: logsWithDerived,
        total: totalCount,
        page,
        limit,
        deviceStats: deviceRows,
        brandStats: brandList.map((b) => ({
          brand: b.brand,
          total: b.total,
          pct: grandTotal > 0 ? Math.round((b.total / grandTotal) * 100) : 0,
        })),
      });
    })
    .catch((err) => {
      console.error("[crash-logs admin] query error:", err);
      sendError(res, 500, "Errore interno");
    });
});
