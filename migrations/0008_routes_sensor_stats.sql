ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "max_tilt_deg" double precision DEFAULT 0;
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "max_acceleration_g" double precision DEFAULT 0;
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "is_sprint" boolean NOT NULL DEFAULT false;
