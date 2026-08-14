import { Router, type Request, type Response } from "express";
import type { PoolClient } from "pg";
import { db, pool, withDbRetry } from "../../db";
import { resourceSamples } from "@shared/db";
import { sql, desc } from "drizzle-orm";
import { storage } from "../../storage";
import { onlineTracker } from "../../online-tracker";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
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
  "ai_watchdog_log",
  "ride_telemetry",
  "telemetry_session_stats",
  "site_visits",
  "user_sessions",
];

// Una SOLA query per tutte le tabelle di log, sul client già acquisito dal
// chiamante. Prima versione: 16 cicli connect/release + 16 COUNT(*) esatti su
// tabelle potenzialmente enormi (ognuno fino a statement_timeout=5s) → un solo
// load del monitor poteva tenere occupate molte connessioni a lungo e saturare
// il pool. Ora usiamo la stima `reltuples` di pg_class (aggiornata da
// ANALYZE/VACUUM): per un monitor di "peso" tabelle la stima è adeguata ed evita
// la scansione completa. GREATEST(...,0) neutralizza il -1 di pg_class quando la
// tabella non è mai stata analizzata.
async function getLogTableWeights(client: PoolClient): Promise<LogTableRow[]> {
  try {
    const res = await client.query<{ name: string; row_count: string; size_bytes: string }>(
      `SELECT c.relname AS name,
              GREATEST(c.reltuples, 0)::bigint AS row_count,
              pg_total_relation_size(c.oid) AS size_bytes
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
      [LOG_TABLES]
    );
    const byName = new Map(res.rows.map((r) => [r.name, r]));
    return LOG_TABLES.map((name) => {
      const row = byName.get(name);
      return {
        name,
        rowCount: row ? Number(row.row_count) : 0,
        sizeMb: row ? Math.round(Number(row.size_bytes) / 1024 / 1024 * 100) / 100 : 0,
      };
    }).sort((a, b) => b.sizeMb - a.sizeMb);
  } catch {
    return LOG_TABLES.map((name) => ({ name, rowCount: 0, sizeMb: 0 }));
  }
}

router.get("/resource-monitor", async (req: Request, res: Response) => {
  const rawWindow = parseInt((req.query.windowMinutes as string) ?? "10", 10);
  const windowMinutes = [10, 30, 60, 360].includes(rawWindow) ? rawWindow : 10;

  try {
    const graphEnabled = await storage.getAppSetting("resource_graph_enabled");
    const isGraphEnabled = graphEnabled?.valueJson === true || graphEnabled?.value === "true";

    // Pagina di monitoraggio interna: tutta la lettura SQL gira su UN solo client
    // dedicato in sequenza, non su 7 client concorrenti come prima. Così un load
    // del monitor occupa al più 1 connessione del pool (più gli slot drizzle
    // transitori), invece di poterne afferrare 7/10 in un colpo e affamare le
    // route utente. Il tutto passa dal budget connessioni dei job in background e
    // ritenta i blip transitori (degrado pulito → 500 solo su errore reale).
    const {
      deviceAgg,
      topDeviceSessions,
      crashStats7d,
      crashStats30d,
      restartLoops7d,
      logTables,
      dbSizeRow,
    } = await withBgDbSlot(() =>
      withDbRetry(async () => {
        const now = Date.now();
        const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

        const client = await pool.connect();
        try {
          const aggRes = await client.query(
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

          const topRes = await client.query(
            `SELECT user_id_anon, platform, memory_used_mb, battery_level, recorded_at
            FROM (
              SELECT DISTINCT ON (user_id)
                SUBSTRING(user_id, 1, 8) AS user_id_anon,
                platform,
                memory_used_mb,
                battery_level,
                recorded_at
              FROM device_metrics
              WHERE recorded_at >= $1
                AND memory_used_mb IS NOT NULL
              ORDER BY user_id, memory_used_mb DESC
            ) sub
            ORDER BY memory_used_mb DESC
            LIMIT 20`,
            [twoHoursAgo]
          );

          // Tre conteggi crash fusi in una sola query (FILTER) invece di 3 round-trip.
          const crashRes = await client.query(
            `SELECT
              COUNT(*) FILTER (WHERE crash_type IN ('crash_system','crash_js') AND reported_at >= $1) AS c7,
              COUNT(*) FILTER (WHERE crash_type IN ('crash_system','crash_js') AND reported_at >= $2) AS c30,
              COUNT(*) FILTER (WHERE crash_type = 'restart_loop' AND reported_at >= $1) AS rl7
            FROM app_crash_logs
            WHERE reported_at >= $2`,
            [sevenDaysAgo, thirtyDaysAgo]
          );
          const crashRow = crashRes.rows[0] as { c7?: string | number; c30?: string | number; rl7?: string | number } | undefined;

          const tables = await getLogTableWeights(client);

          const dbSizeRes = await client.query("SELECT pg_database_size(current_database()) AS size_bytes");

          return {
            deviceAgg: aggRes.rows[0] ?? {},
            topDeviceSessions: topRes.rows as Array<{
              user_id_anon: string;
              platform: string | null;
              memory_used_mb: string | number;
              battery_level: string | number | null;
              recorded_at: string;
            }>,
            crashStats7d: Number(crashRow?.c7 ?? 0),
            crashStats30d: Number(crashRow?.c30 ?? 0),
            restartLoops7d: Number(crashRow?.rl7 ?? 0),
            logTables: tables,
            dbSizeRow: dbSizeRes.rows[0] as { size_bytes?: string | number } | undefined,
          };
        } finally {
          client.release();
        }
      })
    );

    let recentSamples: Array<typeof resourceSamples.$inferSelect> = [];
    if (isGraphEnabled) {
      const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
      const sampleLimit = windowMinutes * 6 + 60;
      recentSamples = await db
        .select()
        .from(resourceSamples)
        .where(sql`sampled_at >= ${windowStart}`)
        .orderBy(desc(resourceSamples.sampledAt))
        .limit(sampleLimit);
    }

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
        topSessions: topDeviceSessions.map((row) => ({
          userIdAnon: row.user_id_anon,
          platform: row.platform ?? "—",
          memoryUsedMb: Number(row.memory_used_mb),
          batteryPct: row.battery_level != null ? Number(row.battery_level) : null,
          recordedAt: row.recorded_at,
        })),
      },
      crashes: {
        last7d: crashStats7d,
        last30d: crashStats30d,
        restartLoops7d,
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

    const header = "sampled_at,avg_ram_pct,avg_ios_ram_pct,avg_android_ram_pct,avg_battery_pct,online_users,db_size_mb,backend_rss_mb\n";
    const rows = samples
      .reverse()
      .map((s) =>
        [
          s.sampledAt.toISOString(),
          s.avgRamPct ?? "",
          s.avgIosRamPct ?? "",
          s.avgAndroidRamPct ?? "",
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
