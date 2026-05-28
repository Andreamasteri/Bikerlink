-- Task #2562 — Auto-resolved violations reconciliation.
-- Add column to track auto-resolved count per run; new violation status 'auto_resolved'.
ALTER TABLE integrity_runs
  ADD COLUMN IF NOT EXISTS auto_resolved INTEGER NOT NULL DEFAULT 0;
