-- Task #5322 — Job operativi sulla VM Google "dragonfly" (solo admin).
--
-- Traccia il ciclo di vita delle operazioni VPS avviate da un admin in chat via
-- Bowie/Horus (server/ai/assistant/vps-ops.ts → scripts/gce/gce.py). I job lunghi
-- partono asincroni (nohup distaccato sul VPS): un poller in Phase 5 raccoglie
-- l'esito e lo recapita all'admin. Nessun secret è mai persistito qui.
CREATE TABLE IF NOT EXISTS "ai_vps_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_user_id" varchar NOT NULL,
  "kind" varchar(16) NOT NULL DEFAULT 'job',
  "command" text NOT NULL,
  "label" varchar(120),
  "status" varchar(16) NOT NULL DEFAULT 'running',
  "results_path" text,
  "exit_code" integer,
  "result_summary" text,
  "error_message" text,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "finished_at" timestamp,
  "notified_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_vps_jobs_status_idx" ON "ai_vps_jobs" ("status", "started_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_vps_jobs_admin_idx" ON "ai_vps_jobs" ("admin_user_id", "started_at" DESC);
