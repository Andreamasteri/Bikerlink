-- Task #5326 — Analisi continua autonoma di Horus (dual-write DB + logs/*.md).
--
-- ai_analysis_runs: metadati di ogni ciclo (chi, quando, quanti artifact, esito).
-- ai_analysis_artifacts: contenuto vero degli artifact prodotti (report, insight),
-- con specchio file in logs/horus-analysis-*.md e retention via expires_at.
CREATE TABLE IF NOT EXISTS "ai_analysis_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "persona" varchar(16) NOT NULL DEFAULT 'horus',
  "trigger" varchar(16) NOT NULL DEFAULT 'schedule',
  "fingerprint" varchar(64),
  "status" varchar(16) NOT NULL DEFAULT 'completed',
  "duration_ms" integer,
  "artifact_count" integer NOT NULL DEFAULT 0,
  "model_id" varchar(100),
  "summary" text,
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
DROP INDEX IF EXISTS "ai_analysis_runs_created_at_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_analysis_runs_created_at_idx" ON "ai_analysis_runs" ("created_at" DESC);
--> statement-breakpoint
DROP INDEX IF EXISTS "ai_analysis_runs_persona_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_analysis_runs_persona_idx" ON "ai_analysis_runs" ("persona", "created_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_analysis_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "ai_analysis_runs"("id") ON DELETE CASCADE,
  "kind" varchar(24) NOT NULL,
  "title" varchar(200) NOT NULL,
  "content" text NOT NULL,
  "sensitivity" varchar(16) NOT NULL DEFAULT 'internal',
  "shared_with" jsonb DEFAULT '[]'::jsonb,
  "mirror_path" text,
  "content_hash" varchar(64),
  "expires_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_analysis_artifacts_run_id_idx" ON "ai_analysis_artifacts" ("run_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "ai_analysis_artifacts_kind_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_analysis_artifacts_kind_idx" ON "ai_analysis_artifacts" ("kind", "created_at" DESC);
--> statement-breakpoint
DROP INDEX IF EXISTS "ai_analysis_artifacts_expires_at_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_analysis_artifacts_expires_at_idx" ON "ai_analysis_artifacts" ("expires_at") WHERE "expires_at" IS NOT NULL;
