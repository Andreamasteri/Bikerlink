import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  const userId = "f0008349-79e6-4e9e-a5a8-e96927767fce";
  const start = Date.now();
  try {
    const statsResult = await db.execute(sql`
      SELECT
        COUNT(*) AS sample_count,
        COUNT(DISTINCT session_id) AS session_count,
        COUNT(*) FILTER (WHERE lat IS NULL AND lon IS NULL) AS sensor_only_count
      FROM ride_telemetry
      WHERE user_id = ${userId}
        AND session_type NOT IN ('ideal_lap')
    `);
    console.log("stats ok", statsResult.rows[0], Date.now() - start, "ms");

    const kmResult = await db.execute(sql`
      WITH ordered AS (
        SELECT
          session_id, lat, lon, ts, speed_kmh,
          LAG(lat) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lat,
          LAG(lon) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lon
        FROM ride_telemetry
        WHERE user_id = ${userId}
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
          AND (speed_kmh IS NULL OR speed_kmh >= 20)
      )
      SELECT COALESCE(SUM(dist_km), 0) AS km_collected
      FROM distances
    `);
    console.log("km ok", kmResult.rows[0], Date.now() - start, "ms");
  } catch (err) {
    console.error("ERROR", err);
  }
  process.exit(0);
}
main();
