-- Task #5 (Quebracho a) — Registry persistente dei job del coordinatore Quebracho.
--
-- Una riga per job di background gestito dal gate unico canRunJob(). La fonte di
-- verità "live" resta la mappa in-memory (server/ai/coordinator/job-registry.ts);
-- questa tabella persiste stato/direttive/contatori fra i restart così una pausa
-- (admin o Quebracho) e i throttle sopravvivono al riavvio.
CREATE TABLE IF NOT EXISTS "ai_coordinator_jobs" (
  "name" varchar(120) PRIMARY KEY NOT NULL,
  "state" varchar(24) NOT NULL DEFAULT 'idle',
  "last_run_at" timestamp,
  "last_success_at" timestamp,
  "last_error_at" timestamp,
  "last_error" text,
  "next_run_at" timestamp,
  "pause_source" varchar(24),
  "pause_reason" text,
  "directive" jsonb,
  "run_count" integer NOT NULL DEFAULT 0,
  "success_count" integer NOT NULL DEFAULT 0,
  "failure_count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_coordinator_jobs_state_idx" ON "ai_coordinator_jobs" ("state");
