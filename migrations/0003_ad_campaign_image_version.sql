ALTER TABLE "ad_campaigns" ADD COLUMN IF NOT EXISTS "image_version" integer DEFAULT 0 NOT NULL;
