CREATE TABLE IF NOT EXISTS "user_blocks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_id" varchar(36) NOT NULL,
	"blocked_id" varchar(36) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_unique" UNIQUE("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_blocks_blocker_idx" ON "user_blocks" ("blocker_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_blocks_blocked_idx" ON "user_blocks" ("blocked_id");
