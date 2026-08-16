-- Automatic-start sessions are created in an armed state before measurement.
-- Their real started_at is written only by POST /api/routes/:id/start.
ALTER TABLE "routes" ALTER COLUMN "started_at" DROP NOT NULL;
