import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { getTelemetryErrorLog } from "../../lib/telemetry-error-log";
import { getAllMapsFlags } from "../../ai/watchdog/maps-kill-switch";
import { mapsTelemetryEvents } from "@shared/db";

const router = Router();

router.get("/telemetry/error-log", (_req: Request, res: Response) => {
  try {
    const entries = getTelemetryErrorLog();
    return res.json({ entries, count: entries.length });
  } catch (err) {
    const cause = err instanceof Error ? ((err.cause as Error | null)?.message ?? "") : "";
    console.error("[admin/telemetry/error-log] error:", err, cause ? `| PG: ${cause}` : "");
    return sendError(res, 500, "Errore lettura log errori");
  }
});

// GET /api/admin/telemetry-health — stato pipeline telemetria in tempo reale.
// Ritorna count 24h + ultimo evento per maps_telemetry_events, device_metrics,
// ota_boot_events e stato kill-switch maps. Admin-only (già gated in admin.ts).
router.get("/telemetry-health", async (_req: Request, res: Response) => {
  try {
    const [rows, flags] = await Promise.all([
      db.execute<{
        maps_count: string;
        maps_last: string | null;
        device_count: string;
        device_last: string | null;
        ota_count: string;
        ota_last: string | null;
        ota_boot_success: string;
      }>(sql`
        SELECT
          (SELECT COUNT(*)::text FROM maps_telemetry_events WHERE created_at >= NOW() - INTERVAL '24 hours') AS maps_count,
          (SELECT REPLACE(MAX(created_at)::text, ' ', 'T') || 'Z' FROM maps_telemetry_events) AS maps_last,
          (SELECT COUNT(*)::text FROM device_metrics WHERE recorded_at >= NOW() - INTERVAL '24 hours') AS device_count,
          (SELECT REPLACE(MAX(recorded_at)::text, ' ', 'T') || 'Z' FROM device_metrics) AS device_last,
          (SELECT COUNT(*)::text FROM ota_boot_events WHERE created_at >= NOW() - INTERVAL '24 hours') AS ota_count,
          (SELECT REPLACE(MAX(created_at)::text, ' ', 'T') || 'Z' FROM ota_boot_events) AS ota_last,
          (SELECT COUNT(*)::text FROM ota_boot_events WHERE event_type = 'boot_success') AS ota_boot_success
      `),
      getAllMapsFlags(),
    ]);

    const r = rows.rows[0];
    return res.json({
      maps: {
        count24h: parseInt(r?.maps_count ?? "0", 10),
        lastEvent: r?.maps_last ?? null,
        killSwitchEnabled: flags.telemetry,
      },
      device: {
        count24h: parseInt(r?.device_count ?? "0", 10),
        lastEvent: r?.device_last ?? null,
      },
      ota: {
        count24h: parseInt(r?.ota_count ?? "0", 10),
        lastEvent: r?.ota_last ?? null,
        bootSuccessTotal: parseInt(r?.ota_boot_success ?? "0", 10),
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/telemetry-health] error:", err);
    return sendError(res, 500, `Errore lettura stato pipeline: ${errMsg}`);
  }
});

// GET /api/admin/telemetry/debug-events — ultimi 20 eventi maps_telemetry_events
// + sommario ride_telemetry (totale campioni + ultimo campione). Admin-only.
router.get("/telemetry/debug-events", async (_req: Request, res: Response) => {
  try {
    const [eventsResult, rideResult] = await Promise.all([
      db.execute<{
        id: string;
        event: string;
        component: string | null;
        platform: string | null;
        app_version: string | null;
        created_at: string;
      }>(sql`
        SELECT id, event, component, platform, app_version, created_at::text
        FROM maps_telemetry_events
        ORDER BY created_at DESC
        LIMIT 20
      `),
      db.execute<{ total: string; last_at: string | null }>(sql`
        SELECT COUNT(*)::text AS total, MAX(created_at)::text AS last_at
        FROM ride_telemetry
      `),
    ]);

    const mapsEvents = eventsResult.rows.map((r) => ({
      id: r.id,
      event: r.event,
      component: r.component ?? null,
      platform: r.platform ?? null,
      appVersion: r.app_version ?? null,
      createdAt: r.created_at,
    }));

    const rideRow = rideResult.rows[0];
    const rideSummary = {
      total: parseInt(rideRow?.total ?? "0", 10),
      lastAt: rideRow?.last_at ?? null,
    };

    return res.json({ mapsEvents, rideSummary });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/telemetry/debug-events] error:", err);
    return sendError(res, 500, `Errore lettura debug events: ${errMsg}`);
  }
});

// POST /api/admin/telemetry/debug-ping — inserisce un evento test tramite
// recordMapsTelemetryBatch e risponde con { inserted, eventId }.
router.post("/telemetry/debug-ping", async (_req: Request, res: Response) => {
  try {
    const { recordMapsTelemetryBatch } = await import("../../ai/watchdog/maps-telemetry-store");
    const result = await recordMapsTelemetryBatch([
      { event: "map_init", component: "admin-debug-ping", platform: "web" },
    ]);
    const inserted = result.inserted > 0;

    let eventId: string | null = null;
    if (inserted) {
      const row = await db.execute<{ id: string }>(sql`
        SELECT id FROM maps_telemetry_events
        WHERE component = 'admin-debug-ping'
        ORDER BY created_at DESC
        LIMIT 1
      `);
      eventId = row.rows[0]?.id ?? null;
    }

    return res.json({ inserted, eventId });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/telemetry/debug-ping] error:", err);
    return sendError(res, 500, `Errore debug ping: ${errMsg}`);
  }
});

// POST /api/admin/telemetry-health/ping — inserisce una riga di test in
// maps_telemetry_events e risponde con il conteggio aggiornato nelle ultime 24h.
// Utile per verificare che la pipeline server→DB funzioni indipendentemente dal client.
router.post("/telemetry-health/ping", async (_req: Request, res: Response) => {
  try {
    await db.insert(mapsTelemetryEvents).values({
      event: "map_init",
      component: "admin_ping",
      platform: "web",
    });

    const countRow = await db.execute<{ cnt: string }>(
      sql`SELECT COUNT(*)::text AS cnt FROM maps_telemetry_events WHERE created_at >= NOW() - INTERVAL '24 hours'`
    );
    const count24h = parseInt(countRow.rows[0]?.cnt ?? "0", 10);
    return res.json({ ok: true, maps_count_24h: count24h });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/telemetry-health/ping] error:", err);
    return sendError(res, 500, `Errore ping telemetria: ${errMsg}`);
  }
});

export default router;
