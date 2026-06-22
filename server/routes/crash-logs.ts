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

// SQL expression that derives a signal type from the errorMessage [resume:X] prefix.
// Used across multiple queries to normalise stored crash_js rows into signal buckets.
const DERIVED_TYPE_EXPR = sql`
  CASE
    WHEN error_message LIKE '[resume:js_thread_freeze]%'     THEN 'js_thread_freeze'
    WHEN error_message LIKE '[resume:gps_flood]%'            THEN 'gps_flood'
    WHEN error_message LIKE '[resume:memory_pressure]%'      THEN 'memory_pressure'
    WHEN error_message LIKE '[resume:native_module_missing]%' THEN 'native_module_missing'
    WHEN error_message LIKE '[resume:appstate_transition]%'  THEN 'appstate_transition'
    ELSE crash_type
  END
`;

// The signal types that are high-frequency but NOT real crashes
const SIGNAL_TYPES_CONTEXT = ["appstate_transition"];
// The signal types treated as diagnostic (shown in panel but excluded from crash-free rate)
const SIGNAL_TYPES_DIAGNOSTIC = [
  "js_thread_freeze",
  "gps_flood",
  "memory_pressure",
  "native_module_missing",
];

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

  // Known crash types + signal types
  const allKnownTypes = ["crash_system", "crash_js", "restart_loop", "js_thread_freeze", "gps_flood", "memory_pressure", "native_module_missing", "appstate_transition"];
  const isSingleKnownType = allKnownTypes.includes(qCrashType);

  // For single signal types: filter by derived expression
  // For real crash types: filter by crash_type column
  // "appstate_transition" is excluded from the main crash filter but can be viewed alone
  const signalTypes = [...SIGNAL_TYPES_DIAGNOSTIC, ...SIGNAL_TYPES_CONTEXT];
  const isSignalType = signalTypes.includes(qCrashType);

  let statsWhere: ReturnType<typeof sql>;
  let aclTypeWhere: ReturnType<typeof sql>;

  if (isSingleKnownType && isSignalType) {
    // Filter by errorMessage prefix for signal types
    const prefix = `[resume:${qCrashType}]%`;
    statsWhere = sql`error_message LIKE ${prefix}`;
    aclTypeWhere = sql`acl.error_message LIKE ${prefix}`;
  } else if (isSingleKnownType) {
    // Real crash type filter — exclude signal rows stored as crash_js.
    // IS NULL OR NOT LIKE: NULL NOT LIKE '...' = NULL (not TRUE).
    statsWhere = sql`crash_type = ${qCrashType} AND (error_message IS NULL OR error_message NOT LIKE '[resume:%]%')`;
    aclTypeWhere = sql`acl.crash_type = ${qCrashType} AND (acl.error_message IS NULL OR acl.error_message NOT LIKE '[resume:%]%')`;
  } else {
    // Default: show all types including signals (exclude clean_close)
    statsWhere = sql`crash_type IN ('crash_system','crash_js','restart_loop') OR error_message LIKE '[resume:%]%'`;
    aclTypeWhere = sql`acl.crash_type IN ('crash_system','crash_js','restart_loop') OR acl.error_message LIKE '[resume:%]%'`;
  }

  if (qUserId) {
    statsWhere = sql`(${statsWhere}) AND user_id = ${qUserId}`;
    aclTypeWhere = sql`(${aclTypeWhere}) AND acl.user_id = ${qUserId}`;
  }
  if (qDateFrom) {
    const df = new Date(qDateFrom);
    statsWhere = sql`(${statsWhere}) AND reported_at >= ${df}`;
    aclTypeWhere = sql`(${aclTypeWhere}) AND acl.reported_at >= ${df}`;
  }
  if (qDateTo) {
    const dt = new Date(qDateTo.length === 10 ? qDateTo + "T23:59:59.999Z" : qDateTo);
    statsWhere = sql`(${statsWhere}) AND reported_at <= ${dt}`;
    aclTypeWhere = sql`(${aclTypeWhere}) AND acl.reported_at <= ${dt}`;
  }
  if (qAppVersion) {
    statsWhere = sql`(${statsWhere}) AND app_version = ${qAppVersion}`;
    aclTypeWhere = sql`(${aclTypeWhere}) AND acl.app_version = ${qAppVersion}`;
  }
  if (qDeviceFilter) {
    const pat = "%" + qDeviceFilter + "%";
    statsWhere = sql`(${statsWhere}) AND (device_model ILIKE ${pat} OR device_brand ILIKE ${pat})`;
    aclTypeWhere = sql`(${aclTypeWhere}) AND (acl.device_model ILIKE ${pat} OR acl.device_brand ILIKE ${pat})`;
  }

  // Separate filter for crash-free rate (excludes signals/context).
  // Use IS NULL OR NOT LIKE — null NOT LIKE '...' returns NULL (falsy), not TRUE.
  const crashFreeWhere = sql`crash_type IN ('crash_system','crash_js','restart_loop')
    AND (error_message IS NULL OR error_message NOT LIKE '[resume:%]%')`;

  Promise.all([
    // 1. Total by derived type (signals extracted from errorMessage)
    db.execute(sql`
      SELECT
        ${DERIVED_TYPE_EXPR} AS derived_type,
        COUNT(*)::int AS cnt
      FROM app_crash_logs
      WHERE (${statsWhere})
      GROUP BY derived_type
    `),
    // 2. Top-3 app versions with per-type breakdown (crash types only, not signals)
    db.execute(sql`
      WITH ranked AS (
        SELECT DISTINCT app_version,
          ROW_NUMBER() OVER (ORDER BY
            COALESCE(substring(SPLIT_PART(app_version, '.', 1) FROM '^\\d+'), '0')::INTEGER DESC,
            COALESCE(substring(SPLIT_PART(app_version, '.', 2) FROM '^\\d+'), '0')::INTEGER DESC,
            COALESCE(substring(SPLIT_PART(app_version, '.', 3) FROM '^\\d+'), '0')::INTEGER DESC
          ) AS rn
        FROM app_crash_logs
        WHERE ${statsWhere} AND app_version IS NOT NULL
      )
      SELECT
        r.app_version AS version,
        SUM(CASE WHEN acl.crash_type = 'crash_system'
          AND (acl.error_message IS NULL OR acl.error_message NOT LIKE '[resume:%]%')
          THEN 1 ELSE 0 END)::int AS crash_system,
        SUM(CASE WHEN acl.crash_type = 'crash_js'
          AND (acl.error_message IS NULL OR acl.error_message NOT LIKE '[resume:%]%')
          THEN 1 ELSE 0 END)::int AS crash_js,
        SUM(CASE WHEN acl.crash_type = 'restart_loop' THEN 1 ELSE 0 END)::int AS restart_loop,
        SUM(CASE WHEN acl.error_message LIKE '[resume:js_thread_freeze]%' THEN 1 ELSE 0 END)::int AS js_thread_freeze,
        SUM(CASE WHEN acl.error_message LIKE '[resume:gps_flood]%' THEN 1 ELSE 0 END)::int AS gps_flood,
        SUM(CASE WHEN acl.error_message LIKE '[resume:memory_pressure]%' THEN 1 ELSE 0 END)::int AS memory_pressure,
        SUM(CASE WHEN acl.error_message LIKE '[resume:native_module_missing]%' THEN 1 ELSE 0 END)::int AS native_module_missing,
        COUNT(*)::int AS total
      FROM ranked r
      JOIN app_crash_logs acl ON acl.app_version = r.app_version
        AND (${aclTypeWhere})
      WHERE r.rn <= 3
      GROUP BY r.app_version
      ORDER BY
        COALESCE(substring(SPLIT_PART(r.app_version, '.', 1) FROM '^\\d+'), '0')::INTEGER DESC,
        COALESCE(substring(SPLIT_PART(r.app_version, '.', 2) FROM '^\\d+'), '0')::INTEGER DESC,
        COALESCE(substring(SPLIT_PART(r.app_version, '.', 3) FROM '^\\d+'), '0')::INTEGER DESC
    `),
    // 3. Daily trend — last 14 days, with signal columns
    db.execute(sql`
      SELECT
        TO_CHAR(reported_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        SUM(CASE WHEN crash_type = 'crash_system'
          AND (error_message IS NULL OR error_message NOT LIKE '[resume:%]%')
          THEN 1 ELSE 0 END)::int AS crash_system,
        SUM(CASE WHEN crash_type = 'crash_js'
          AND (error_message IS NULL OR error_message NOT LIKE '[resume:%]%')
          THEN 1 ELSE 0 END)::int AS crash_js,
        SUM(CASE WHEN crash_type = 'restart_loop' THEN 1 ELSE 0 END)::int AS restart_loop,
        SUM(CASE WHEN error_message LIKE '[resume:js_thread_freeze]%' THEN 1 ELSE 0 END)::int AS js_thread_freeze,
        SUM(CASE WHEN error_message LIKE '[resume:gps_flood]%' THEN 1 ELSE 0 END)::int AS gps_flood,
        SUM(CASE WHEN error_message LIKE '[resume:memory_pressure]%' THEN 1 ELSE 0 END)::int AS memory_pressure,
        SUM(CASE WHEN error_message LIKE '[resume:native_module_missing]%' THEN 1 ELSE 0 END)::int AS native_module_missing
      FROM app_crash_logs
      WHERE (${statsWhere})
        AND reported_at >= NOW() - INTERVAL '14 days'
      GROUP BY day
      ORDER BY day ASC
    `),
    // 4. Crash-free rate last 24h — only real crashes, not signals
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE ${crashFreeWhere}) AS crash_count,
        COUNT(*) AS total_sessions
      FROM app_crash_logs
      WHERE reported_at >= NOW() - INTERVAL '24 hours'
    `),
    // 5. Median RAM of crashing devices (last 30 days)
    db.execute(sql`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_memory_mb) AS ram_median
      FROM app_crash_logs
      WHERE (${statsWhere})
        AND total_memory_mb IS NOT NULL
        AND reported_at >= NOW() - INTERVAL '30 days'
    `),
  ])
    .then(([typeRows, versionRows, trendRows, rateRows, ramRows]) => {
      const byType: Record<string, number> = {
        crash_system: 0,
        crash_js: 0,
        restart_loop: 0,
        js_thread_freeze: 0,
        gps_flood: 0,
        memory_pressure: 0,
        native_module_missing: 0,
        appstate_transition: 0,
      };
      for (const row of typeRows.rows as { derived_type: string; cnt: number }[]) {
        byType[row.derived_type] = (byType[row.derived_type] ?? 0) + row.cnt;
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
        byVersion: versionRows.rows as {
          version: string;
          crash_system: number;
          crash_js: number;
          restart_loop: number;
          js_thread_freeze: number;
          gps_flood: number;
          memory_pressure: number;
          native_module_missing: number;
          total: number;
        }[],
        dailyTrend: trendRows.rows as {
          day: string;
          crash_system: number;
          crash_js: number;
          restart_loop: number;
          js_thread_freeze: number;
          gps_flood: number;
          memory_pressure: number;
          native_module_missing: number;
        }[],
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

// High-frequency signal anomaly summary — groups signals by user/session
// to spot "a mitragliatrice" patterns.
adminRouter.get("/signal-frequency", requireAdmin, (req: Request, res: Response): void => {
  const hours = Math.min(168, Math.max(1, parseInt(String(req.query.hours ?? "24"), 10)));
  const minCount = Math.max(1, parseInt(String(req.query.minCount ?? "3"), 10));

  db.execute(sql`
    SELECT
      ${DERIVED_TYPE_EXPR}                          AS signal_type,
      acl.user_id                                   AS "userId",
      u.nickname,
      acl.session_id                                AS "sessionId",
      acl.app_version                               AS "appVersion",
      acl.platform,
      acl.device_model                              AS "deviceModel",
      COUNT(*)::int                                 AS occurrences,
      MIN(acl.reported_at)                          AS first_seen,
      MAX(acl.reported_at)                          AS last_seen,
      EXTRACT(EPOCH FROM (MAX(acl.reported_at) - MIN(acl.reported_at)))::int AS window_sec
    FROM app_crash_logs acl
    LEFT JOIN users u ON u.id = acl.user_id
    WHERE acl.error_message LIKE '[resume:%]%'
      AND acl.error_message NOT LIKE '[resume:appstate_transition]%'
      AND acl.reported_at >= NOW() - INTERVAL '1 hour' * ${hours}
    GROUP BY signal_type, acl.user_id, u.nickname, acl.session_id, acl.app_version, acl.platform, acl.device_model
    HAVING COUNT(*) >= ${minCount}
    ORDER BY occurrences DESC
    LIMIT 50
  `)
    .then((result) => {
      res.json({
        hours,
        minCount,
        items: result.rows as {
          signal_type: string;
          userId: string;
          nickname: string | null;
          sessionId: string | null;
          appVersion: string | null;
          platform: string | null;
          deviceModel: string | null;
          occurrences: number;
          first_seen: string;
          last_seen: string;
          window_sec: number;
        }[],
      });
    })
    .catch((err) => {
      console.error("[crash-logs signal-frequency] query error:", err);
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
      SUM(CASE WHEN crash_type = 'crash_system'
        AND (error_message IS NULL OR error_message NOT LIKE '[resume:%]%')
        THEN 1 ELSE 0 END)::int AS crash_system,
      SUM(CASE WHEN crash_type = 'crash_js'
        AND (error_message IS NULL OR error_message NOT LIKE '[resume:%]%')
        THEN 1 ELSE 0 END)::int AS crash_js,
      SUM(CASE WHEN crash_type = 'restart_loop' THEN 1 ELSE 0 END)::int AS restart_loop,
      SUM(CASE WHEN error_message LIKE '[resume:js_thread_freeze]%' THEN 1 ELSE 0 END)::int AS js_thread_freeze,
      SUM(CASE WHEN error_message LIKE '[resume:gps_flood]%' THEN 1 ELSE 0 END)::int AS gps_flood,
      SUM(CASE WHEN error_message LIKE '[resume:memory_pressure]%' THEN 1 ELSE 0 END)::int AS memory_pressure,
      SUM(CASE WHEN error_message LIKE '[resume:native_module_missing]%' THEN 1 ELSE 0 END)::int AS native_module_missing
    FROM app_crash_logs
    WHERE (crash_type IN ('crash_system','crash_js','restart_loop') OR error_message LIKE '[resume:%]%')
      AND (error_message IS NULL OR error_message NOT LIKE '[resume:appstate_transition]%')
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
          js_thread_freeze: number;
          gps_flood: number;
          memory_pressure: number;
          native_module_missing: number;
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

  // Signal types use errorMessage prefix matching
  const signalTypes = ["js_thread_freeze", "gps_flood", "memory_pressure", "native_module_missing", "appstate_transition"];
  const isSignalFilter = signalTypes.includes(crashType);
  const realCrashTypes = ["crash_system", "crash_js", "restart_loop"];
  const isRealCrashFilter = realCrashTypes.includes(crashType);

  const where = and(
    // Type filter: either signal prefix or real crash type
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
    // Top devices by model+platform
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
    // Top brands aggregation
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

      // Derive signal type from errorMessage for each row
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
