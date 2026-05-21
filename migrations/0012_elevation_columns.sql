ALTER TABLE "planned_routes" ADD COLUMN IF NOT EXISTS "elevation_profile" jsonb;
ALTER TABLE "planned_routes" ADD COLUMN IF NOT EXISTS "elevation_gain_m" integer;
ALTER TABLE "planned_routes" ADD COLUMN IF NOT EXISTS "altitude_min_m" integer;
ALTER TABLE "planned_routes" ADD COLUMN IF NOT EXISTS "altitude_max_m" integer;
