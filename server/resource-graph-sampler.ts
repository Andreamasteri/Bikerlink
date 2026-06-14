import { db, pool } from "./db";
import { deviceMetrics, resourceSamples } from "@shared/db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import { onlineTracker } from "./online-tracker";

let _samplerTimer: ReturnType<typeof setInterval> | null = null;
let _purgeTimer: ReturnType<typeof setInterval> | null = null;
let _samplerEnabled = false;
const SAMPLE_INTERVAL_MS = 10_000;
const RETENTION_HOURS = 24;

async function isGraphEnabled(): Promise<boolean> {
  try {
    const setting = await storage.getAppSetting("resource_graph_enabled");
    return setting?.valueJson === true || setting?.value === "true";
  } catch {
    return false;
  }
}

async function takeSample(): Promise<void> {
  try {
    const enabled = await isGraphEnabled();
    if (!enabled) return;

    const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const onlineCount = onlineTracker.countOnlineUsers();

    let dbSizeMb: number | null = null;
    let avgRamPct: number | null = null;
    let avgBatteryPct: number | null = null;
    let avgIosRamPct: number | null = null;
    let avgAndroidRamPct: number | null = null;

    const client = await pool.connect();
    try {
      const sizeRes = await client.query(
        "SELECT pg_database_size(current_database()) AS size_bytes"
      );
      const sizeRow = sizeRes.rows[0] as { size_bytes?: string | number } | undefined;
      if (sizeRow?.size_bytes != null) {
        dbSizeMb = Math.round(Number(sizeRow.size_bytes) / 1024 / 1024);
      }

      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
      const avgRes = await client.query(
        `SELECT
          ROUND(AVG(CASE WHEN memory_total_mb > 0 THEN memory_used_mb::float / memory_total_mb * 100 ELSE NULL END))::int AS avg_ram_pct,
          ROUND(AVG(battery_level))::int AS avg_battery_pct,
          ROUND(AVG(CASE WHEN platform = 'ios' AND memory_total_mb > 0 THEN memory_used_mb::float / memory_total_mb * 100 ELSE NULL END))::int AS avg_ios_ram_pct,
          ROUND(AVG(CASE WHEN platform = 'android' AND memory_total_mb > 0 THEN memory_used_mb::float / memory_total_mb * 100 ELSE NULL END))::int AS avg_android_ram_pct
        FROM device_metrics
        WHERE recorded_at >= $1`,
        [twoMinAgo]
      );
      const avgRow = avgRes.rows[0] as { avg_ram_pct?: number | null; avg_battery_pct?: number | null; avg_ios_ram_pct?: number | null; avg_android_ram_pct?: number | null } | undefined;
      avgRamPct = avgRow?.avg_ram_pct ?? null;
      avgBatteryPct = avgRow?.avg_battery_pct ?? null;
      avgIosRamPct = avgRow?.avg_ios_ram_pct ?? null;
      avgAndroidRamPct = avgRow?.avg_android_ram_pct ?? null;
    } finally {
      client.release();
    }

    await db.insert(resourceSamples).values({
      avgRamPct: avgRamPct != null ? Number(avgRamPct) : null,
      avgBatteryPct: avgBatteryPct != null ? Number(avgBatteryPct) : null,
      avgIosRamPct: avgIosRamPct != null ? Number(avgIosRamPct) : null,
      avgAndroidRamPct: avgAndroidRamPct != null ? Number(avgAndroidRamPct) : null,
      onlineUsers: onlineCount,
      dbSizeMb,
      backendRssMb: rssMb,
    });
  } catch (err) {
    console.warn("[resource-graph-sampler] sample error:", err instanceof Error ? err.message : err);
  }
}

async function purgeOldData(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);
    await db.delete(deviceMetrics).where(sql`recorded_at < ${cutoff}`);
    await db.delete(resourceSamples).where(sql`sampled_at < ${cutoff}`);
  } catch (err) {
    console.warn("[resource-graph-sampler] purge error:", err instanceof Error ? err.message : err);
  }
}

export function startResourceGraphSampler(): void {
  if (_samplerTimer) return;
  _samplerEnabled = true;
  _samplerTimer = setInterval(async () => {
    if (!_samplerEnabled) return;
    await takeSample();
  }, SAMPLE_INTERVAL_MS);
  _samplerTimer.unref();

  if (!_purgeTimer) {
    _purgeTimer = setInterval(() => purgeOldData(), 60 * 60 * 1000);
    _purgeTimer.unref();
    purgeOldData().catch(() => {});
  }
}

export function stopResourceGraphSampler(): void {
  _samplerEnabled = false;
  if (_samplerTimer) {
    clearInterval(_samplerTimer);
    _samplerTimer = null;
  }
}
