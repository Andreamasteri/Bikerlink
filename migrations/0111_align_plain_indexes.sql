CREATE INDEX IF NOT EXISTS match_zero_snapshots_created_idx ON match_zero_snapshots (created_at);
CREATE INDEX IF NOT EXISTS ai_messages_content_trgm_idx ON ai_messages USING gin (content gin_trgm_ops);
