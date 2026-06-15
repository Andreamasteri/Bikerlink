-- Task #4091 — Tabella pipeline_flow_events per il monitor flussi pipeline.
-- Traccia checkpoint ingresso/uscita per ogni pipeline; retention 48h via hole-detector.
CREATE TABLE IF NOT EXISTS pipeline_flow_events (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline VARCHAR(60) NOT NULL,
  trace_id VARCHAR(32) NOT NULL,
  checkpoint VARCHAR(80) NOT NULL,
  ts TIMESTAMP NOT NULL DEFAULT now(),
  meta_json JSONB,
  resolved BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS pipeline_flow_events_pipeline_idx ON pipeline_flow_events(pipeline);
CREATE INDEX IF NOT EXISTS pipeline_flow_events_trace_id_idx ON pipeline_flow_events(trace_id);
CREATE INDEX IF NOT EXISTS pipeline_flow_events_ts_idx ON pipeline_flow_events(ts);
CREATE INDEX IF NOT EXISTS pipeline_flow_events_resolved_idx ON pipeline_flow_events(resolved, ts);
