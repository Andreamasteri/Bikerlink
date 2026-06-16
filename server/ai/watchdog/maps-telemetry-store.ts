// Task #2686 — Helpers persistenza eventi telemetria mappe + aggregati per
// collector. Retention 7 giorni allineato a system_signals.
import { db } from "../../db";
import { mapsTelemetryEvents } from "@shared/db";
import { gte, lt, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";

const RETENTION_DAYS = 7;
const log = logger.child({ scope: "maps-watchdog" });

export const MAPS_EVENT_TYPES = [
  "map_init", "map_init_failed", "map_ready", "map_destroy",
  "webview_crash",
  "render_frame", "render_slow",
  "tile_load_error", "tile_load_ok",
  "style_load_error",
  "gps_acquire", "gps_lost", "gps_degraded", "gps_low_accuracy",
  "routing_request", "routing_success", "routing_failed", "routing_fallback",
  "matching_request", "matching_success", "matching_failed",
  "interaction_pan", "interaction_zoom",
] as const;
export type MapsEventType = typeof MAPS_EVENT_TYPES[number];

export interface MapsTelemetryEventInput {
  userId?: string | null;
  event: MapsEventType;
  renderer?: string | null;
  component?: string | null;
  engine?: string | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  details?: Record<string, unknown> | null;
}

const MAX_DETAILS_BYTES = 2048;

function sanitizeDetails(d?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!d) return null;
  try {
    const json = JSON.stringify(d);
    if (json.length <= MAX_DETAILS_BYTES) return d;
    return { __truncated: true, original_size: json.length };
  } catch {
    return { __unserializable: true };
  }
}

export async function recordMapsTelemetryBatch(
  events: MapsTelemetryEventInput[],
): Promise<{ inserted: number }> {
  if (!events.length) return { inserted: 0 };
  const rows = events
    .filter((e) => MAPS_EVENT_TYPES.includes(e.event))
    .map((e) => ({
      userId: e.userId ?? null,
      event: e.event,
      renderer: e.renderer?.slice(0, 30) ?? null,
      component: e.component?.slice(0, 60) ?? null,
      engine: e.engine?.slice(0, 30) ?? null,
      durationMs: e.durationMs != null && Number.isFinite(e.durationMs) ? Math.round(e.durationMs) : null,
      errorMessage: e.errorMessage?.slice(0, 500) ?? null,
      platform: e.platform?.slice(0, 20) ?? null,
      appVersion: e.appVersion?.slice(0, 30) ?? null,
      details: sanitizeDetails(e.details) as object | null,
    }));
  if (!rows.length) return { inserted: 0 };
  try {
    await db.insert(mapsTelemetryEvents).values(rows);
    return { inserted: rows.length };
  } catch (err) {
    log.warn({ err: (err as Error).message }, "insert maps telemetry batch failed");
    return { inserted: 0 };
  }
}

export interface MapsAggregateWindow {
  windowMs: number;
  total: number;
  byEvent: Record<string, number>;
  byEventRenderer: Record<string, Record<string, number>>;
  byEngineFailure: Record<string, number>;
  avgRenderMs: number | null;
  totalRenderSamples: number;
  uniqueUsers: number;
  topErrors: Array<{ message: string; count: number }>;
}

export interface MapsSummaryCounts {
  mapInit: number;
  mapInitFailed: number;
  webviewCrash: number;
  tileLoadError: number;
  routingFailed: number;
  gpsLost: number;
}

export interface MapsSummaryTelemetry {
  windowMs: number;
  counts: MapsSummaryCounts;
  renderCount: number;
  renderAvgMs: number;
}

export async function getMapsSummaryTelemetry(
  windowMs: number = 5 * 60_000,
): Promise<MapsSummaryTelemetry> {
  const agg = await aggregateMapsTelemetry(windowMs);
  const c = agg.byEvent;
  return {
    windowMs,
    counts: {
      mapInit: (c.map_init ?? 0) + (c.map_ready ?? 0),
      mapInitFailed: c.map_init_failed ?? 0,
      webviewCrash: c.webview_crash ?? 0,
      tileLoadError: c.tile_load_error ?? 0,
      routingFailed: c.routing_failed ?? 0,
      gpsLost: (c.gps_lost ?? 0) + (c.gps_degraded ?? 0) + (c.gps_low_accuracy ?? 0),
    },
    renderCount: agg.totalRenderSamples,
    renderAvgMs: agg.avgRenderMs ?? 0,
  };
}

export async function aggregateMapsTelemetry(windowMs: number = 5 * 60_000): Promise<MapsAggregateWindow> {
  const since = new Date(Date.now() - windowMs);
  const empty: MapsAggregateWindow = {
    windowMs, total: 0, byEvent: {}, byEventRenderer: {},
    byEngineFailure: {}, avgRenderMs: null, totalRenderSamples: 0,
    uniqueUsers: 0, topErrors: [],
  };
  try {
    const rows = await db.select({
      event: mapsTelemetryEvents.event,
      renderer: mapsTelemetryEvents.renderer,
      engine: mapsTelemetryEvents.engine,
      durationMs: mapsTelemetryEvents.durationMs,
      userId: mapsTelemetryEvents.userId,
      errorMessage: mapsTelemetryEvents.errorMessage,
    }).from(mapsTelemetryEvents).where(gte(mapsTelemetryEvents.createdAt, since));
    if (rows.length === 0) return empty;
    const byEvent: Record<string, number> = {};
    const byEventRenderer: Record<string, Record<string, number>> = {};
    const byEngineFailure: Record<string, number> = {};
    const errors = new Map<string, number>();
    const users = new Set<string>();
    let renderSum = 0;
    let renderCount = 0;
    for (const r of rows) {
      byEvent[r.event] = (byEvent[r.event] ?? 0) + 1;
      const rend = r.renderer ?? "unknown";
      byEventRenderer[r.event] = byEventRenderer[r.event] ?? {};
      byEventRenderer[r.event][rend] = (byEventRenderer[r.event][rend] ?? 0) + 1;
      if (r.event === "routing_failed" && r.engine) {
        byEngineFailure[r.engine] = (byEngineFailure[r.engine] ?? 0) + 1;
      }
      if (r.event === "render_slow" && r.durationMs != null) {
        renderSum += r.durationMs;
        renderCount++;
      }
      if (r.userId) users.add(r.userId);
      if (r.errorMessage) {
        const key = r.errorMessage.slice(0, 120);
        errors.set(key, (errors.get(key) ?? 0) + 1);
      }
    }
    const topErrors = Array.from(errors.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([message, count]) => ({ message, count }));
    return {
      windowMs, total: rows.length, byEvent, byEventRenderer,
      byEngineFailure,
      avgRenderMs: renderCount > 0 ? Math.round(renderSum / renderCount) : null,
      totalRenderSamples: renderCount,
      uniqueUsers: users.size,
      topErrors,
    };
  } catch (err) {
    log.warn({ err: (err as Error).message }, "aggregate maps telemetry failed");
    return empty;
  }
}

export async function cleanupMapsTelemetry(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const out = await db.delete(mapsTelemetryEvents)
      .where(lt(mapsTelemetryEvents.createdAt, cutoff))
      .returning({ id: mapsTelemetryEvents.id });
    return out.length;
  } catch (err) {
    log.warn({ err: (err as Error).message }, "cleanup maps telemetry failed");
    return 0;
  }
}

// Conta eventi recenti per evento (24h) — usato per UI sparkline buckets.
// eventType e appVersion sono filtri opzionali per drill-down per tipo/versione.
export async function getMapsTelemetryBuckets(
  hours: number = 24,
  bucketMinutes: number = 60,
  eventType?: string,
  appVersion?: string,
): Promise<Array<{ bucketStart: string; at: string; events: number; total: number; errors: number }>> {
  try {
    const since = new Date(Date.now() - hours * 60 * 60_000);
    const eventFilter = eventType ? sql` AND event = ${eventType}` : sql``;
    const versionFilter = appVersion ? sql` AND app_version = ${appVersion}` : sql``;
    const rows = await db.execute<{ bucket: Date; total: string; errors: string }>(sql`
      SELECT
        date_trunc('hour', created_at) AS bucket,
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE event IN ('tile_load_error','webview_crash','routing_failed','map_init_failed','gps_lost'))::text AS errors
      FROM maps_telemetry_events
      WHERE created_at >= ${since}${eventFilter}${versionFilter}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);
    return ((rows as { rows?: Array<{ bucket: Date; total: string; errors: string }> }).rows ?? []).map((r) => {
      const iso = r.bucket instanceof Date ? r.bucket.toISOString() : String(r.bucket);
      const total = Number(r.total);
      const errors = Number(r.errors);
      return { bucketStart: iso, at: iso, total, events: total, errors };
    });
  } catch (err) {
    log.warn({ err: (err as Error).message, bucketMinutes }, "buckets query failed");
    return [];
  }
}

// Versioni app distinte nelle ultime 48h — usato per il picker filtro UI.
export async function getDistinctAppVersions(hours: number = 48): Promise<string[]> {
  try {
    const since = new Date(Date.now() - hours * 60 * 60_000);
    const rows = await db.selectDistinct({ appVersion: mapsTelemetryEvents.appVersion })
      .from(mapsTelemetryEvents)
      .where(gte(mapsTelemetryEvents.createdAt, since));
    return rows
      .map((r) => r.appVersion)
      .filter((v): v is string => v !== null && v !== "")
      .sort();
  } catch (err) {
    log.warn({ err: (err as Error).message }, "distinct app versions query failed");
    return [];
  }
}
