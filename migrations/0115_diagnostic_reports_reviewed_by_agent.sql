-- Add reviewedByAgent: timestamp the agent last reviewed a diagnostic report.
-- NULL = not yet seen by the agent.
ALTER TABLE diagnostic_reports ADD COLUMN IF NOT EXISTS reviewed_by_agent TIMESTAMP;
