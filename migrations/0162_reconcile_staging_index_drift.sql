-- Reconcile indexes that can be absent when the migration ledger was advanced
-- from a different schema snapshot (notably the Railway staging database).
-- Every statement is idempotent and is a no-op where the index already exists.

CREATE INDEX IF NOT EXISTS "ai_call_logs_created_at_idx"
  ON "ai_call_logs" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_call_logs_provider_idx"
  ON "ai_call_logs" ("provider", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_call_logs_degraded_idx"
  ON "ai_call_logs" ("degraded")
  WHERE "degraded" = true;
CREATE INDEX IF NOT EXISTS "ai_call_logs_security_blocked_idx"
  ON "ai_call_logs" ("security_blocked")
  WHERE "security_blocked" = true;

CREATE INDEX IF NOT EXISTS "ai_analysis_artifacts_kind_idx"
  ON "ai_analysis_artifacts" ("kind", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_analysis_artifacts_expires_at_idx"
  ON "ai_analysis_artifacts" ("expires_at")
  WHERE "expires_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ai_analysis_runs_created_at_idx"
  ON "ai_analysis_runs" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_analysis_runs_persona_idx"
  ON "ai_analysis_runs" ("persona", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_conversation_turns_user_id_idx"
  ON "ai_conversation_turns" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_conversation_turns_summary_of_idx"
  ON "ai_conversation_turns" ("summary_of")
  WHERE "summary_of" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ai_group_conversations_created_at_idx"
  ON "ai_group_conversations" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_group_conversations_status_idx"
  ON "ai_group_conversations" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_knowledge_gaps_status_idx"
  ON "ai_knowledge_gaps" ("status", "last_seen_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_learned_knowledge_updated_at_idx"
  ON "ai_learned_knowledge" ("updated_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_tool_events_last_occurred_idx"
  ON "ai_tool_events" ("last_occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_vps_jobs_status_idx"
  ON "ai_vps_jobs" ("status", "started_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_vps_jobs_admin_idx"
  ON "ai_vps_jobs" ("admin_user_id", "started_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "businesses_email_lower_uq"
  ON "businesses" (LOWER("email"))
  WHERE "email" IS NOT NULL AND "email" <> '';

CREATE INDEX IF NOT EXISTS "pipeline_probe_history_pipeline_run_at_idx"
  ON "pipeline_probe_history" ("pipeline", "run_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "ppm_biker_zavorrina_active_idx"
  ON "proposal_profile_matches" ("biker_id", "zavorrina_id")
  WHERE "status" = 'new';

CREATE INDEX IF NOT EXISTS "reports_assigned_moderator_idx"
  ON "reports" ("assigned_moderator_id")
  WHERE "assigned_moderator_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "user_privacy_log_user_id_changed_at_idx"
  ON "user_privacy_log" ("user_id", "changed_at" DESC);

CREATE INDEX IF NOT EXISTS "user_sessions_ended_at_idx"
  ON "user_sessions" ("ended_at")
  WHERE "ended_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "workshops_email_lower_uq"
  ON "workshops" (LOWER("email"))
  WHERE "email" IS NOT NULL AND "email" <> '';
