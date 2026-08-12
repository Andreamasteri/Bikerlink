import { db, pool, withDbRetry } from "./db";
import { deviceMetrics, resourceSamples } from "@shared/db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import { onlineTracker } from "./online-tracker";
import { withBgDbSlot } from "./lib/bg-db-limiter";
import { withJobGate } from "./ai/coordinator/gated-job";

let _samplerTimer: ReturnType<typeof setInterval> | null = null;
let _purgeTimer: ReturnType<typeof setInterval> | null = null;
let _samplerEnabled = false;
// Il grafico non richiede campioni sub-secondo: un default di 60s evita che
// ogni processo generi migliaia di INSERT al giorno. In dev/candidate si può
// abbassare fino a 30s per una prova mirata, senza tornare al flood da 10s.
const configuredSampleInterval = Number.parseInt(process.env.RESOURCE_GRAPH_SAMPLE_INTERVAL_MS ?? "", 10);
const SAMPLE_INTERVAL_MS = Number.isFinite(configuredSampleInterval)
  ? Math.min(5 * 60_000, Math.max(30_000, configuredSampleInterval))
  : 60_000;
const RETENTION_HOURS = 24;
const GRAPH_SETTING_CACHE_MS = 60_000;
let graphSettingCache: { enabled: boolean; expiresAt: number } | null = null;

async function isGraphEnabled(): Promise<boolean> {
  const now = Date.now();
  if (graphSettingCache && graphSettingCache.expiresAt > now) return graphSettingCache.enabled;
  try {
    const setting = await storage.getAppSetting("resource_graph_enabled");
    const enabled = setting?.valueJson === true || setting?.value === "true";
    graphSettingCache = { enabled, expiresAt: now + GRAPH_SETTING_CACHE_MS };
    return enabled;
  } catch {
    // Cache the disabled result briefly so a DB outage does not become a
    // read-amplification loop on app_settings.
    graphSettingCache = { enabled: false, expiresAt: now + GRAPH_SETTING_CACHE_MS };
    return false;
  }
}

async function takeSample(): Promise<void> {
  try {
    const enabled = await isGraphEnabled();
    if (!enabled) return;

    const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const onlineCount = onlineTracker.countOnlineUsers();

    // Job ricorrente ogni 10s: passa dal budget connessioni dei job in background
    // (non può mai saturare il pool da solo) e ritenta i blip transitori invece di
    // emettere rumore a ogni tick quando il DB è momentaneamente irraggiungibile.
    await withBgDbSlot(() =>
      withDbRetry(async () => {
        let dbSizeMb: number | null = null;
        let avgRamPct: number | null = null;
        let avgBatteryPct: number | null = null;
        let avgIosRamPct: number | null = null;
        let avgAndroidRamPct: number | null = null;

        const client = await pool.connect();
        try {
          // statement_timeout esplicito (Task #5229, step 4): questo job gira
          // ogni 10s. Anche se eredita già il default del pool (5s), lo fissiamo
          // a 4s in modo esplicito così una query lenta (es. pg_database_size su
          // DB grande, o lentezza managed) non tiene la connessione appesa: la
          // query è uccisa e il finally rilascia subito. Ripristino nel finally.
          try {
            await client.query("SET statement_timeout = '4000'");
          } catch {
            /* best-effort */
          }
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
          // Ripristina il default del pool prima del release.
          try {
            await client.query("SET statement_timeout = '5000'");
          } catch {
            /* best-effort */
          }
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
      })
    );
  } catch (err) {
    console.warn("[resource-graph-sampler] sample error:", err instanceof Error ? err.message : err);
  }
}

async function purgeOldData(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);
    await withBgDbSlot(() =>
      withDbRetry(async () => {
        await db.delete(deviceMetrics).where(sql`recorded_at < ${cutoff}`);
        await db.delete(resourceSamples).where(sql`sampled_at < ${cutoff}`);
      })
    );
  } catch (err) {
    console.warn("[resource-graph-sampler] purge error:", err instanceof Error ? err.message : err);
  }
}

export function startResourceGraphSampler(): void {
  if (_samplerTimer) return;
  _samplerEnabled = true;
  const _gatedSample = withJobGate("resource-graph-sampler", async () => {
    if (!_samplerEnabled) return;
    await takeSample();
  });
  _samplerTimer = setInterval(_gatedSample, SAMPLE_INTERVAL_MS);
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
