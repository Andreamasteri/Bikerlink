ALTER TABLE "planned_routes" ADD COLUMN IF NOT EXISTS "navigation_steps" jsonb;
