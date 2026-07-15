-- Task #64 — History compatta per il Database Monitor admin.
-- Una riga per tick dell'aggregator (~60s): carico DB + carico backend Node.
-- Separata da system_signals (7g) e resource_samples (24h): retention 30+ giorni.
-- Indice su sampled_at per range query bucketate e cleanup.
CREATE TABLE IF NOT EXISTS "db_monitor_history" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "sampled_at" timestamp NOT NULL DEFAULT now(),
  "pool_active_pct" integer NOT NULL DEFAULT 0,
  "pool_waiting" integer NOT NULL DEFAULT 0,
  "ping_ms" integer,
  "db_error_count" integer NOT NULL DEFAULT 0,
  "db_restart_count" integer NOT NULL DEFAULT 0,
  "db_overload" boolean NOT NULL DEFAULT false,
  "backend_cpu_pct" integer NOT NULL DEFAULT 0,
  "backend_event_loop_lag_ms" integer NOT NULL DEFAULT 0,
  "backend_rss_mb" integer NOT NULL DEFAULT 0,
  "backend_overload" boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "db_monitor_history_sampled_idx" ON "db_monitor_history" ("sampled_at");
