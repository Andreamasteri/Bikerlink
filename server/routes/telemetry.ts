import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { rideTelemetry } from "@shared/schema";

const router = Router();

const TARGET_KM = parseFloat(process.env.TELEMETRY_TARGET_KM ?? "1000");

function requireAuth(req: Request, res: Response): string | null {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return userId;
}

router.post("/batch", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const { session_id, session_type, samples } = req.body as {
      session_id?: string;
      session_type?: string;
      samples?: unknown[];
    };

    if (!session_id || typeof session_id !== "string") {
      return res.status(400).json({ message: "session_id obbligatorio" });
    }

    const validSessionTypes = ["ride", "trip", "free", "ideal_lap"];
    const resolvedType = validSessionTypes.includes(session_type ?? "") ? session_type! : "ride";

    if (!Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({ message: "samples[] obbligatorio e non vuoto" });
    }

    type RawSample = {
      ts?: unknown;
      lat?: unknown;
      lon?: unknown;
      speed_kmh?: unknown;
      lean_angle?: unknown;
      gforce_x?: unknown;
      gforce_y?: unknown;
      gforce_z?: unknown;
      heading?: unknown;
      altitude_m?: unknown;
    };

    const rows: typeof rideTelemetry.$inferInsert[] = [];
    for (const s of samples as RawSample[]) {
      const ts = typeof s.ts === "number" ? s.ts : Number(s.ts);
      const lat = typeof s.lat === "number" ? s.lat : Number(s.lat);
      const lon = typeof s.lon === "number" ? s.lon : Number(s.lon);

      if (!Number.isFinite(ts) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      rows.push({
        userId,
        sessionId: session_id,
        sessionType: resolvedType as "ride" | "trip" | "free",
        ts: BigInt(Math.round(ts)),
        lat,
        lon,
        speedKmh: s.speed_kmh != null && Number.isFinite(Number(s.speed_kmh)) ? Number(s.speed_kmh) : null,
        leanAngle: s.lean_angle != null && Number.isFinite(Number(s.lean_angle)) ? Number(s.lean_angle) : null,
        gforceX: s.gforce_x != null && Number.isFinite(Number(s.gforce_x)) ? Number(s.gforce_x) : null,
        gforceY: s.gforce_y != null && Number.isFinite(Number(s.gforce_y)) ? Number(s.gforce_y) : null,
        gforceZ: s.gforce_z != null && Number.isFinite(Number(s.gforce_z)) ? Number(s.gforce_z) : null,
        heading: s.heading != null && Number.isFinite(Number(s.heading)) ? Number(s.heading) : null,
        altitudeM: s.altitude_m != null && Number.isFinite(Number(s.altitude_m)) ? Number(s.altitude_m) : null,
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({ message: "Nessun campione valido (ts, lat, lon obbligatori per ogni campione)" });
    }

    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(rideTelemetry).values(rows.slice(i, i + CHUNK));
    }

    return res.status(200).json({ inserted: rows.length, session_id });
  } catch (err) {
    console.error("[telemetry/batch] error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/stats", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const statsResult = await db.execute(sql`
      SELECT
        COUNT(*) AS sample_count,
        COUNT(DISTINCT session_id) AS session_count
      FROM ride_telemetry
      WHERE user_id = ${userId}
        AND session_type NOT IN ('ideal_lap')
    `);

    const row = statsResult.rows[0] as { sample_count: string; session_count: string } | undefined;
    const sampleCount = parseInt(row?.sample_count ?? "0", 10);
    const sessionCount = parseInt(row?.session_count ?? "0", 10);

    const kmResult = await db.execute(sql`
      WITH ordered AS (
        SELECT
          session_id,
          lat,
          lon,
          ts,
          LAG(lat) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lat,
          LAG(lon) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lon
        FROM ride_telemetry
        WHERE user_id = ${userId}
          AND session_type NOT IN ('ideal_lap')
      ),
      distances AS (
        SELECT
          2 * 6371 * ASIN(
            SQRT(
              POWER(SIN(RADIANS(lat - prev_lat) / 2), 2)
              + COS(RADIANS(prev_lat)) * COS(RADIANS(lat))
              * POWER(SIN(RADIANS(lon - prev_lon) / 2), 2)
            )
          ) AS dist_km
        FROM ordered
        WHERE prev_lat IS NOT NULL AND prev_lon IS NOT NULL
          AND ABS(lat - prev_lat) < 0.5
          AND ABS(lon - prev_lon) < 0.5
      )
      SELECT COALESCE(SUM(dist_km), 0) AS km_collected
      FROM distances
    `);

    const kmRow = kmResult.rows[0] as { km_collected: string } | undefined;
    const kmCollected = Math.round(parseFloat(kmRow?.km_collected ?? "0") * 10) / 10;
    const progressPct = Math.min(100, Math.round((kmCollected / TARGET_KM) * 100));

    return res.json({
      km_collected: kmCollected,
      sample_count: sampleCount,
      session_count: sessionCount,
      progress_pct: progressPct,
      target_km: TARGET_KM,
    });
  } catch (err) {
    console.error("[telemetry/stats] error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/ideal-laps", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const result = await db.execute(sql`
      SELECT
        session_id,
        MIN(ts) AS started_at_ms,
        COUNT(*) AS sample_count,
        MAX(speed_kmh) AS max_speed_kmh,
        MAX(ABS(lean_angle)) AS max_lean_deg,
        MAX(
          SQRT(
            COALESCE(gforce_x, 0) * COALESCE(gforce_x, 0)
            + COALESCE(gforce_y, 0) * COALESCE(gforce_y, 0)
            + COALESCE(gforce_z, 0) * COALESCE(gforce_z, 0)
          )
        ) AS max_gforce
      FROM ride_telemetry
      WHERE user_id = ${userId}
        AND session_type = 'ideal_lap'
      GROUP BY session_id
      ORDER BY MIN(ts) DESC
    `);

    type LapRow = {
      session_id: string;
      started_at_ms: string;
      sample_count: string;
      max_speed_kmh: string | null;
      max_lean_deg: string | null;
      max_gforce: string | null;
    };

    const laps = (result.rows as LapRow[]).map((r, idx) => ({
      sessionId: r.session_id,
      startedAt: new Date(Number(r.started_at_ms)).toISOString(),
      sampleCount: parseInt(r.sample_count, 10),
      maxSpeedKmh: r.max_speed_kmh != null ? Math.round(parseFloat(r.max_speed_kmh) * 10) / 10 : null,
      maxLeanDeg: r.max_lean_deg != null ? Math.round(parseFloat(r.max_lean_deg) * 10) / 10 : null,
      maxGforce: r.max_gforce != null ? Math.round(parseFloat(r.max_gforce) * 100) / 100 : null,
      lapNumber: (result.rows as LapRow[]).length - idx,
    }));

    return res.json({ laps });
  } catch (err) {
    console.error("[telemetry/ideal-laps] error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/ideal-laps/:sessionId", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { sessionId } = req.params;
  if (!sessionId) return res.status(400).json({ message: "sessionId obbligatorio" });

  try {
    await db.execute(sql`
      DELETE FROM ride_telemetry
      WHERE user_id = ${userId}
        AND session_id = ${sessionId}
        AND session_type = 'ideal_lap'
    `);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[telemetry/ideal-laps DELETE] error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/reset", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const result = await db.execute(sql`
      DELETE FROM ride_telemetry
      WHERE user_id = ${userId}
        AND session_type NOT IN ('ideal_lap')
    `);

    const deleted = result.rowCount ?? 0;
    return res.json({ deleted });
  } catch (err) {
    console.error("[telemetry/reset] error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
