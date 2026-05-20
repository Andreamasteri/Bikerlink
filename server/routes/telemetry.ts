import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { rideTelemetry, routes, appSettings } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}

const DEFAULT_TARGET_KM = 400;

async function getTargetKm(): Promise<number> {
  try {
    const rows = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "telemetry_target_km"))
      .limit(1);
    if (rows.length > 0 && rows[0].value) {
      const parsed = parseInt(rows[0].value, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {}
  return DEFAULT_TARGET_KM;
}

interface TelemetrySample {
  timestamp: string;
  lat: number;
  lon: number;
  leanAngle?: number;
  gForceX?: number;
  gForceY?: number;
  gForceZ?: number;
  speedKmh?: number;
}

router.post("/:id/telemetry", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const rideId = req.params.id as string;

    const [route] = await db
      .select({ userId: routes.userId })
      .from(routes)
      .where(eq(routes.id, rideId))
      .limit(1);

    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    if (route.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const { samples } = req.body as { samples: TelemetrySample[] };
    if (!Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({ message: "Nessun campione fornito" });
    }

    const MAX_SAMPLES = 50000;
    const toInsert = samples.slice(0, MAX_SAMPLES);

    const rows = toInsert
      .filter(
        (s) =>
          typeof s.lat === "number" && isFinite(s.lat) &&
          typeof s.lon === "number" && isFinite(s.lon) &&
          typeof s.timestamp === "string"
      )
      .map((s) => ({
        rideId,
        userId,
        timestamp: new Date(s.timestamp),
        lat: s.lat,
        lon: s.lon,
        leanAngle: typeof s.leanAngle === "number" && isFinite(s.leanAngle) ? s.leanAngle : null,
        gForceX: typeof s.gForceX === "number" && isFinite(s.gForceX) ? s.gForceX : null,
        gForceY: typeof s.gForceY === "number" && isFinite(s.gForceY) ? s.gForceY : null,
        gForceZ: typeof s.gForceZ === "number" && isFinite(s.gForceZ) ? s.gForceZ : null,
        speedKmh: typeof s.speedKmh === "number" && isFinite(s.speedKmh) ? s.speedKmh : null,
      }));

    if (rows.length === 0) {
      return res.status(400).json({ message: "Nessun campione valido" });
    }

    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(rideTelemetry).values(rows.slice(i, i + CHUNK));
    }

    return res.json({ inserted: rows.length });
  } catch (error) {
    console.error("POST telemetry error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/me/telemetry-stats", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const targetKm = await getTargetKm();

    const result = await db.execute(
      sql`
        WITH segments AS (
          SELECT
            lat,
            lon,
            LAG(lat)  OVER (PARTITION BY ride_id ORDER BY "timestamp") AS prev_lat,
            LAG(lon)  OVER (PARTITION BY ride_id ORDER BY "timestamp") AS prev_lon
          FROM ride_telemetry
          WHERE user_id = ${userId}
        )
        SELECT COALESCE(SUM(
          6371.0 * 2 * ASIN(SQRT(
            POWER(SIN((RADIANS(lat) - RADIANS(prev_lat)) / 2), 2) +
            COS(RADIANS(prev_lat)) * COS(RADIANS(lat)) *
            POWER(SIN((RADIANS(lon) - RADIANS(prev_lon)) / 2), 2)
          ))
        ), 0) AS km_collected
        FROM segments
        WHERE prev_lat IS NOT NULL
      `
    );

    const row = result.rows[0] as { km_collected: string | number } | undefined;
    const kmCollected = Math.round(parseFloat(String(row?.km_collected ?? "0")) * 10) / 10;
    const progressPct = Math.min(100, Math.round((kmCollected / targetKm) * 100));

    return res.json({
      km_collected: kmCollected,
      progress_pct: progressPct,
      target_km: targetKm,
    });
  } catch (error) {
    console.error("GET telemetry-stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
