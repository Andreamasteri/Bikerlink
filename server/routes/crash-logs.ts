import { sendError } from "../lib/api-response";
import { Router, type Request, type Response, type RequestHandler } from "express";
import { db } from "../db";
import { appCrashLogs, users } from "@shared/db";
import { crashLogsSchema } from "@shared/validators";
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

adminRouter.get("/stats", requireAdmin, (req: Request, res: Response): void => {
  const {
    crashType: qCrashType,
    userId: qUserId,
    dateFrom: qDateFrom,
    dateTo: qDateTo,
    appVersion: qAppVersion,
    deviceModel: qDeviceModel,
  } = req.query as Record<string, string>;
  const qDeviceFilter = qDeviceModel?.trim();

  const validStatsTypes = ["crash_system", "crash_js", "restart_loop"];
  const isSingleType = validStatsTypes.includes(qCrashType);

  // Base type filter (unqualified — for single-table queries)
  let statsWhere = isSingleType
    ? sql`crash_type = ${qCrashType}`
    : sql`crash_type IN ('crash_system','crash_js','restart_loop')`;

  // Base type filter qualified with "acl." alias — for the JOIN query
  let aclTypeWhere = isSingleType
    ? sql`acl.crash_type = ${qCrashType}`
    : sql`acl.crash_type IN ('crash_system','crash_js','restart_loop')`;

  // Chain extra conditions onto both
  if (qUserId) {
    statsWhere = sql`${statsWhere} AND user_id = ${qUserId}`;
    aclTypeWhere = sql`${aclTypeWhere} AND acl.user_id = ${qUserId}`;
  }
  if (qDateFrom) {
    const df = new Date(qDateFrom);
    statsWhere = sql`${statsWhere} AND reported_at >= ${df}`;
    aclTypeWhere = sql`${aclTypeWhere} AND acl.reported_at >= ${df}`;
  }
  if (qDateTo) {
    const dt = new Date(qDateTo.length === 10 ? qDateTo + "T23:59:59.999Z" : qDateTo);
    statsWhere = sql`${statsWhere} AND reported_at <= ${dt}`;
    aclTypeWhere = sql`${aclTypeWhere} AND acl.reported_at <= ${dt}`;
  }
  if (qAppVersion) {
    statsWhere = sql`${statsWhere} AND app_version = ${qAppVersion}`;
    aclTypeWhere = sql`${aclTypeWhere} AND acl.app_version = ${qAppVersion}`;
  }
  if (qDeviceFilter) {
    const pat = "%" + qDeviceFilter + "%";
    statsWhere = sql`${statsWhere} AND (device_model ILIKE ${pat} OR device_brand ILIKE ${pat})`;
    aclTypeWhere = sql`${aclTypeWhere} AND (acl.device_model ILIKE ${pat} OR acl.device_brand ILIKE ${pat})`;
  }

  Promise.all([
    // 1. Total by crash type
    db.execute(sql`
      SELECT crash_type, COUNT(*)::int AS cnt
      FROM app_crash_logs
      WHERE ${statsWhere}
      GROUP BY crash_type
    `),
    // 2. Top-3 app versions with per-type breakdown
    db.execute(sql`
      WITH ranked AS (
        SELECT DISTINCT app_version,
          ROW_NUMBER() OVER (ORDER BY
            COALESCE(substring(SPLIT_PART(app_version, '.', 1) FROM '^\d+'), '0')::INTEGER DESC,
            COALESCE(substring(SPLIT_PART(app_version, '.', 2) FROM '^\d+'), '0')::INTEGER DESC,
            COALESCE(substring(SPLIT_PART(app_version, '.', 3) FROM '^\d+'), '0')::INTEGER DESC
          ) AS rn
        FROM app_crash_logs
        WHERE ${statsWhere} AND app_version IS NOT NULL
      )
      SELECT
        r.app_version AS version,
        SUM(CASE WHEN acl.crash_type = 'crash_system'   THEN 1 ELSE 0 END)::int AS crash_system,
        SUM(CASE WHEN acl.crash_type = 'crash_js'       THEN 1 ELSE 0 END)::int AS crash_js,
        SUM(CASE WHEN acl.crash_type = 'restart_loop'   THEN 1 ELSE 0 END)::int AS restart_loop,
        COUNT(*)::int AS total
      FROM ranked r
      JOIN app_crash_logs acl ON acl.app_version = r.app_version
        AND ${aclTypeWhere}
      WHERE r.rn <= 3
      GROUP BY r.app_version
      ORDER BY
        COALESCE(substring(SPLIT_PART(r.app_version, '.', 1) FROM '^\d+'), '0')::INTEGER DESC,
        COALESCE(substring(SPLIT_PART(r.app_version, '.', 2) FROM '^\d+'), '0')::INTEGER DESC,
        COALESCE(substring(SPLIT_PART(r.app_version, '.', 3) FROM '^\d+'), '0')::INTEGER DESC
    `),
    // 3. Daily trend — last 14 days
    db.execute(sql`
      SELECT
        TO_CHAR(reported_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        SUM(CASE WHEN crash_type = 'crash_system'  THEN 1 ELSE 0 END)::int AS crash_system,
        SUM(CASE WHEN crash_type = 'crash_js'      THEN 1 ELSE 0 END)::int AS crash_js,
        SUM(CASE WHEN crash_type = 'restart_loop'  THEN 1 ELSE 0 END)::int AS restart_loop
      FROM app_crash_logs
      WHERE ${statsWhere}
        AND reported_at >= NOW() - INTERVAL '14 days'
      GROUP BY day
      ORDER BY day ASC
    `),
    // 4. Crash-free rate last 24h
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE ${statsWhere}) AS crash_count,
        COUNT(*) AS total_sessions
      FROM app_crash_logs
      WHERE reported_at >= NOW() - INTERVAL '24 hours'
    `),
    // 5. Median RAM of crashing devices (last 30 days)
    db.execute(sql`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_memory_mb) AS ram_median
      FROM app_crash_logs
      WHERE ${statsWhere}
        AND total_memory_mb IS NOT NULL
        AND reported_at >= NOW() - INTERVAL '30 days'
    `),
  ])
    .then(([typeRows, versionRows, trendRows, rateRows, ramRows]) => {
      const byType: Record<string, number> = { crash_system: 0, crash_js: 0, restart_loop: 0 };
      for (const row of typeRows.rows as { crash_type: string; cnt: number }[]) {
        byType[row.crash_type] = row.cnt;
      }

      const rateRow = rateRows.rows[0] as { crash_count: string; total_sessions: string } | undefined;
      const crashCount = Number(rateRow?.crash_count ?? 0);
      const totalSessions = Number(rateRow?.total_sessions ?? 0);
      const crashFreeRate24h: number | null = totalSessions > 0
        ? Math.round(((totalSessions - crashCount) / totalSessions) * 100 * 10) / 10
        : null;

      const ramRow = ramRows.rows[0] as { ram_median: string | null } | undefined;
      const ramMedianCrashMb: number | null = ramRow?.ram_median != null
        ? Math.round(Number(ramRow.ram_median))
        : null;

      res.json({
        byType,
        byVersion: versionRows.rows as { version: string; crash_system: number; crash_js: number; restart_loop: number; total: number }[],
        dailyTrend: trendRows.rows as { day: string; crash_system: number; crash_js: number; restart_loop: number }[],
        crashFreeRate24h,
        ramMedianCrashMb,
      });
    })
    .catch((err) => {
      console.error("[crash-logs stats] query error:", err);
      sendError(res, 500, "Errore interno");
    });
});

adminRouter.get("/restart-loop-summary", requireAdmin, (req: Request, res: Response): void => {
  db.execute(sql`
    SELECT
      acl.user_id                                    AS "userId",
      u.nickname,
      acl.app_version                                AS "appVersion",
      acl.platform,
      COUNT(*)::int                                  AS "sessionCount",
      SUM(
        CAST(
          COALESCE(
            NULLIF(substring(acl.error_message FROM '^[0-9]+'), ''),
            '0'
          ) AS INTEGER
        )
      )::int                                         AS "totalRestarts"
    FROM app_crash_logs acl
    LEFT JOIN users u ON u.id = acl.user_id
    WHERE acl.crash_type = 'restart_loop'
      AND acl.reported_at >= NOW() - INTERVAL '24 hours'
    GROUP BY acl.user_id, u.nickname, acl.app_version, acl.platform
    ORDER BY "totalRestarts" DESC
    LIMIT 10
  `)
    .then((result) => {
      res.json({
        summary: result.rows as {
          userId: string;
          nickname: string | null;
          appVersion: string | null;
          platform: string | null;
          sessionCount: number;
          totalRestarts: number;
        }[],
      });
    })
    .catch((err) => {
      console.error("[crash-logs restart-loop-summary] query error:", err);
      sendError(res, 500, "Errore interno");
    });
});

adminRouter.get("/alerts", requireAdmin, (req: Request, res: Response): void => {
  const threshold = Math.max(1, parseInt(String(req.query.threshold ?? "3"), 10));

  db.execute(sql`
    SELECT
      device_model,
      device_brand,
      COUNT(*)::int AS cnt,
      SUM(CASE WHEN crash_type = 'crash_system' THEN 1 ELSE 0 END)::int AS crash_system,
      SUM(CASE WHEN crash_type = 'crash_js'     THEN 1 ELSE 0 END)::int AS crash_js,
      SUM(CASE WHEN crash_type = 'restart_loop' THEN 1 ELSE 0 END)::int AS restart_loop
    FROM app_crash_logs
    WHERE crash_type IN ('crash_system','crash_js','restart_loop')
      AND reported_at >= NOW() - INTERVAL '24 hours'
      AND device_model IS NOT NULL
    GROUP BY device_model, device_brand
    HAVING COUNT(*) >= ${threshold}
    ORDER BY cnt DESC
    LIMIT 20
  `)
    .then((result) => {
      res.json({
        alerts: result.rows as {
          device_model: string;
          device_brand: string | null;
          cnt: number;
          crash_system: number;
          crash_js: number;
          restart_loop: number;
        }[],
        threshold,
      });
    })
    .catch((err) => {
      console.error("[crash-logs alerts] query error:", err);
      sendError(res, 500, "Errore interno");
    });
});

adminRouter.get("/", requireAdmin, (req: Request, res: Response): void => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
  const offset = (page - 1) * limit;

  const { userId: filterUserId, crashType, dateFrom, dateTo, appVersion, deviceModel } = req.query as Record<string, string>;

  const deviceFilter = deviceModel?.trim();

  const where = and(
    inArray(appCrashLogs.crashType, ["crash_system", "crash_js", "restart_loop"]),
    filterUserId ? eq(appCrashLogs.userId, filterUserId) : undefined,
    crashType === "crash_system" || crashType === "crash_js" || crashType === "restart_loop"
      ? eq(appCrashLogs.crashType, crashType)
      : undefined,
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
    // Top devices by model+platform (existing)
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
    // Top brands aggregation — filter-aware via ORM where
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
      res.json({
        logs: rows,
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
