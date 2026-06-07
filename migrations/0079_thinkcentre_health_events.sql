CREATE TABLE IF NOT EXISTS thinkcentre_health_events (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  service_key VARCHAR(30),
  transition_from VARCHAR(20) NOT NULL,
  transition_to VARCHAR(20) NOT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS thinkcentre_health_events_occurred_at_idx ON thinkcentre_health_events (occurred_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS thinkcentre_health_events_service_key_idx ON thinkcentre_health_events (service_key);
