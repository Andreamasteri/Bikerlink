import { Router, type Request, type Response } from "express";
import { db, pool } from "../../db";
import { deviceMetrics, resourceSamples, appCrashLogs } from "@shared/db";
import { sql, desc } from "drizzle-orm";
import { storage } from "../../storage";
import { onlineTracker } from "../../online-tracker";
import { sendError } from "../../lib/api-response";

const router = Router();

interface LogTableRow {
  name: string;
  rowCount: number;
  sizeMb: number;
}

const LOG_TABLES = [
  "app_crash_logs",
  "system_events",
  "device_metrics",
  "resource_samples",
  "maps_telemetry_events",
  "gps_errors",
  "gps_rejections",
  "moderator_logs",
  "ai_usage_log",
  "embedding_call_log",
  "ota_boot_events",
  "ota_watchdog_reports",
  "thinkcentre_health_events",
  "ai_watchdog_reports",
  "site_visits",
  "user_sessions",
];

async function getLogTableWeights(): Promise<LogTableRow[]> {
  const results: LogTableRow[] = [];
  for (const tableName of LOG_TABLES) {
    try {
      const client = await pool.connect();
      try {
        const sizeRes = await client.query(
          `SELECT
            (SELECT COUNT(*) FROM "${tableName}") AS row_count,
            pg_total_relation_size('"${tableName}"') AS size_bytes`
        );
        const row = sizeRes.rows[0];
        if (row) {
          results.push({
            name: tableName,
            rowCount: Number(row.row_count ?? 0),
            sizeMb: Math.round(Number(row.size_bytes ?? 0) / 1024 / 1024 * 100) / 100,
          });
        }
      } finally {
        client.release();
      }
    } catch {
      results.push({ name: tableName, rowCount: 0, sizeMb: 0 });
    }
  }
  return results.sort((a, b) => b.sizeMb - a.sizeMb);
}

router.get("/resource-monitor", async (_req: Request, res: Response) => {
  try {
    const [
      graphEnabled,
      deviceAgg,
      crashStats7d,
      crashStats30d,
      logTables,
      dbSizeRow,
      recentSamples,
    ] = await Promise.all([
      storage.getAppSetting("resource_graph_enabled"),
      (async () => {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const client = await pool.connect();
        try {
          const r = await client.query(
            `SELECT
              COUNT(*) AS sample_count,
              ROUND(AVG(CASE WHEN memory_total_mb > 0 THEN memory_used_mb::float / memory_total_mb * 100 ELSE NULL END))::int AS avg_ram_pct,
              ROUND(AVG(battery_level))::int AS avg_battery_pct,
              COUNT(CASE WHEN battery_state = 'charging' THEN 1 END) AS charging_count,
              COUNT(CASE WHEN platform = 'ios' THEN 1 END) AS ios_count,
              COUNT(CASE WHEN platform = 'android' THEN 1 END) AS android_count
            FROM device_metrics
            WHERE recorded_at >= $1`,
            [twoHoursAgo]
          );
          return r.rows[0] ?? {};
        } finally {
          client.release();
        }
      })(),
      (async () => {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const client = await pool.connect();
        try {
          const r = await client.query(
            "SELECT COUNT(*) AS cnt FROM app_crash_logs WHERE reported_at >= $1",
            [sevenDaysAgo]
          );
          return Number((r.rows[0] as { cnt?: string | number })?.cnt ?? 0);
        } finally {
          client.release();
        }
      })(),
      (async () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const client = await pool.connect();
        try {
          const r = await client.query(
            "SELECT COUNT(*) AS cnt FROM app_crash_logs WHERE reported_at >= $1",
            [thirtyDaysAgo]
          );
          return Number((r.rows[0] as { cnt?: string | number })?.cnt ?? 0);
        } finally {
          client.release();
        }
      })(),
      getLogTableWeights(),
      (async () => {
        const client = await pool.connect();
        try {
          const r = await client.query("SELECT pg_database_size(current_database()) AS size_bytes");
          return r.rows[0];
        } finally {
          client.release();
        }
      })(),
      (async () => {
        const graphEnabledSetting = await storage.getAppSetting("resource_graph_enabled");
        const enabled = graphEnabledSetting?.valueJson === true || graphEnabledSetting?.value === "true";
        if (!enabled) return [];
        const windowStart = new Date(Date.now() - 10 * 60 * 1000);
        return db
          .select()
          .from(resourceSamples)
          .where(sql`sampled_at >= ${windowStart}`)
          .orderBy(desc(resourceSamples.sampledAt))
          .limit(120);
      })(),
    ]);

    const isGraphEnabled = graphEnabled?.valueJson === true || graphEnabled?.value === "true";
    const agd = deviceAgg as Record<string, string | number | null>;
    const onlineCount = onlineTracker.countOnlineUsers();
    const mem = process.memoryUsage();

    return res.json({
      backend: {
        uptimeSeconds: Math.floor(process.uptime()),
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        nodeVersion: process.version,
        onlineUsers: onlineCount,
      },
      devices: {
        sampleCount: Number(agd.sample_count ?? 0),
        avgRamPct: agd.avg_ram_pct != null ? Number(agd.avg_ram_pct) : null,
        avgBatteryPct: agd.avg_battery_pct != null ? Number(agd.avg_battery_pct) : null,
        chargingCount: Number(agd.charging_count ?? 0),
        iosCount: Number(agd.ios_count ?? 0),
        androidCount: Number(agd.android_count ?? 0),
      },
      crashes: {
        last7d: crashStats7d,
        last30d: crashStats30d,
      },
      logTables,
      graph: {
        enabled: isGraphEnabled,
        samples: recentSamples.reverse(),
        dbSizeMb: dbSizeRow
          ? Math.round(Number(dbSizeRow.size_bytes) / 1024 / 1024)
          : null,
      },
    });
  } catch (err) {
    console.error("[admin/resource-monitor] error:", err);
    return sendError(res, 500, "Errore lettura metriche risorse");
  }
});

router.post("/resource-monitor/toggle-graph", async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      return sendError(res, 400, "enabled deve essere un booleano");
    }
    await storage.upsertAppSetting("resource_graph_enabled", undefined, enabled);

    const { startResourceGraphSampler, stopResourceGraphSampler } = await import("../../resource-graph-sampler");
    if (enabled) {
      startResourceGraphSampler();
    } else {
      stopResourceGraphSampler();
    }

    return res.json({ enabled });
  } catch (err) {
    console.error("[admin/resource-monitor] toggle error:", err);
    return sendError(res, 500, "Errore aggiornamento toggle grafico");
  }
});

router.get("/resource-monitor/samples/csv", async (_req: Request, res: Response) => {
  try {
    const samples = await db
      .select()
      .from(resourceSamples)
      .orderBy(desc(resourceSamples.sampledAt))
      .limit(1440);

    const header = "sampled_at,avg_ram_pct,avg_battery_pct,online_users,db_size_mb,backend_rss_mb\n";
    const rows = samples
      .reverse()
      .map((s) =>
        [
          s.sampledAt.toISOString(),
          s.avgRamPct ?? "",
          s.avgBatteryPct ?? "",
          s.onlineUsers ?? "",
          s.dbSizeMb ?? "",
          s.backendRssMb ?? "",
        ].join(",")
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="resource_samples_${Date.now()}.csv"`);
    return res.send(header + rows);
  } catch (err) {
    console.error("[admin/resource-monitor] csv error:", err);
    return sendError(res, 500, "Errore export CSV");
  }
});

export default router;
