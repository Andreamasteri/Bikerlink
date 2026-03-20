ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "privacy_accepted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "consent_accepted_at" timestamp;
