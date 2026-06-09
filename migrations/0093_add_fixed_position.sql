ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "fixed_position_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "fixed_position_lat" double precision;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "fixed_position_lng" double precision;
