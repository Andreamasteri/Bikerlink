-- Task #81 — Riepilogo incrementale per-sessione delle distanze di telemetria.
-- Evita la scansione Haversine (window function LAG per sessione) su tutti i
-- campioni ad ogni GET /api/telemetry/stats: i km per sessione sono mantenuti
-- incrementalmente ad ogni POST /api/telemetry/batch e i totali utente si
-- ottengono con SUM/COUNT su poche righe (una per sessione).
CREATE TABLE IF NOT EXISTS "telemetry_session_stats" (
  "user_id" varchar(36) NOT NULL,
  "session_id" varchar(36) NOT NULL,
  "session_type" varchar(10) NOT NULL DEFAULT 'ride',
  "dist_all" double precision NOT NULL DEFAULT 0,
  "dist_speed_filtered" double precision NOT NULL DEFAULT 0,
  "sample_count" integer NOT NULL DEFAULT 0,
  "sensor_only_count" integer NOT NULL DEFAULT 0,
  "last_lat" double precision,
  "last_lon" double precision,
  "last_ts" bigint,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "telemetry_session_stats_pk" PRIMARY KEY ("user_id","session_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_session_stats_user_idx" ON "telemetry_session_stats" ("user_id");
--> statement-breakpoint
-- Backfill una-tantum dai campioni esistenti (oggi ride_telemetry è vuoto, ma
-- così la migrazione resta corretta anche in presenza di storico). Replica
-- ESATTAMENTE la stessa formula/filtri della query Haversine sostituita:
--   dist_all           = SUM delle distanze consecutive (LAG per session ORDER BY ts)
--   dist_speed_filtered = SUM solo dei segmenti con speed_kmh NULL o >= 20
--   last_*             = ultimo campione per ts (àncora per i batch futuri)
--   Tutte le aggregazioni sono partizionate per (user_id, session_id):
--   session_id da solo non identifica una sessione globalmente.
INSERT INTO "telemetry_session_stats"
  ("user_id", "session_id", "session_type", "dist_all", "dist_speed_filtered",
   "sample_count", "sensor_only_count", "last_lat", "last_lon", "last_ts", "updated_at")
SELECT
  m.user_id,
  m.session_id,
  m.session_type,
  COALESCE(d.dist_all, 0),
  COALESCE(d.dist_speed_filtered, 0),
  m.sample_count,
  m.sensor_only_count,
  l.last_lat,
  l.last_lon,
  l.last_ts,
  now()
FROM (
  SELECT
    user_id,
    session_id,
    MAX(session_type) AS session_type,
    COUNT(*) AS sample_count,
    COUNT(*) FILTER (WHERE lat IS NULL AND lon IS NULL) AS sensor_only_count
  FROM ride_telemetry
  GROUP BY user_id, session_id
) m
LEFT JOIN (
  SELECT
    user_id,
    session_id,
    SUM(dist_km) AS dist_all,
    SUM(dist_km) FILTER (WHERE speed_kmh IS NULL OR speed_kmh >= 20) AS dist_speed_filtered
  FROM (
    SELECT
      user_id,
      session_id,
      speed_kmh,
      2 * 6371 * ASIN(
        SQRT(
          POWER(SIN(RADIANS(lat - prev_lat) / 2), 2)
          + COS(RADIANS(prev_lat)) * COS(RADIANS(lat))
          * POWER(SIN(RADIANS(lon - prev_lon) / 2), 2)
        )
      ) AS dist_km
    FROM (
      SELECT
        user_id, session_id, lat, lon, speed_kmh,
        LAG(lat) OVER (PARTITION BY user_id, session_id ORDER BY ts) AS prev_lat,
        LAG(lon) OVER (PARTITION BY user_id, session_id ORDER BY ts) AS prev_lon
      FROM ride_telemetry
    ) ordered
    WHERE prev_lat IS NOT NULL AND prev_lon IS NOT NULL
      AND ABS(lat - prev_lat) < 0.5
      AND ABS(lon - prev_lon) < 0.5
  ) distances
  GROUP BY user_id, session_id
) d ON d.user_id = m.user_id AND d.session_id = m.session_id
LEFT JOIN (
  SELECT user_id, session_id, lat AS last_lat, lon AS last_lon, ts AS last_ts
  FROM (
    SELECT
      user_id, session_id, lat, lon, ts,
      ROW_NUMBER() OVER (PARTITION BY user_id, session_id ORDER BY ts DESC) AS rn
    FROM ride_telemetry
  ) ranked
  WHERE rn = 1
) l ON l.user_id = m.user_id AND l.session_id = m.session_id
ON CONFLICT ("user_id","session_id") DO NOTHING;
