ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "gps_precision" varchar(30) DEFAULT 'balanced';
