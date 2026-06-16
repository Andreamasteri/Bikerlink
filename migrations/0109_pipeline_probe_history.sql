-- pipeline_probe_history: storico esiti check per pipeline (sparkline trend 24h)
CREATE TABLE IF NOT EXISTS pipeline_probe_history (
  id          SERIAL PRIMARY KEY,
  pipeline    VARCHAR(60)  NOT NULL,
  overall     VARCHAR(20)  NOT NULL,
  steps       JSONB        NOT NULL,
  duration_ms INTEGER      NOT NULL,
  run_at      TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_probe_history_pipeline_run_at_idx
  ON pipeline_probe_history (pipeline, run_at DESC);
