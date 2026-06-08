CREATE INDEX IF NOT EXISTS "user_profiles_geom_gist_idx" ON "user_profiles" USING GIST ("geom");
