CREATE TABLE IF NOT EXISTS "proposal_profile_matches" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" varchar(36) NOT NULL,
	"biker_id" varchar(36) NOT NULL,
	"zavorrina_id" varchar(36) NOT NULL,
	"distance_km" double precision,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_profile_matches_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "proposal_profile_matches_biker_id_users_id_fk" FOREIGN KEY ("biker_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "proposal_profile_matches_zavorrina_id_users_id_fk" FOREIGN KEY ("zavorrina_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "ppm_biker_id_idx" ON "proposal_profile_matches" ("biker_id");
CREATE INDEX IF NOT EXISTS "ppm_zavorrina_id_idx" ON "proposal_profile_matches" ("zavorrina_id");
CREATE INDEX IF NOT EXISTS "ppm_proposal_id_idx" ON "proposal_profile_matches" ("proposal_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ppm_proposal_zavorrina_unique_idx" ON "proposal_profile_matches" ("proposal_id","zavorrina_id");
