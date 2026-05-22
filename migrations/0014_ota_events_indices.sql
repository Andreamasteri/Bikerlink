CREATE INDEX IF NOT EXISTS ota_events_phase_idx ON ota_events(phase);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ota_events_release_id_idx ON ota_events(release_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ota_events_created_at_idx ON ota_events(created_at);
