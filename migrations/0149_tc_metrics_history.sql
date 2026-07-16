-- Task #354 — Storico metriche ThinkCentre
-- Campioni ogni 60s dal sampler background; retention 7 giorni.
CREATE TABLE IF NOT EXISTS "tc_metrics_history" (
  "id"             serial       PRIMARY KEY NOT NULL,
  "sampled_at"     timestamptz  NOT NULL,
  "online"         boolean      NOT NULL DEFAULT false,
  "cpu_temp_c"     real,
  "gpu_temp_c"     real,
  "gpu_util_pct"   real,
  "vram_used_mb"   integer,
  "vram_total_mb"  integer,
  "load_avg_1"     real,
  "ram_used_pct"   real,
  "net_rx_kbs"     real,
  "net_tx_kbs"     real,
  "disk_read_kbs"  real,
  "disk_write_kbs" real
);

CREATE INDEX IF NOT EXISTS "tc_metrics_history_sampled_idx"
  ON "tc_metrics_history" ("sampled_at");
