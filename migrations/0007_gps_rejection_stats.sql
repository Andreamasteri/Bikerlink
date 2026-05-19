CREATE TABLE IF NOT EXISTS "gps_rejection_stats" (
	"user_id" varchar(36) NOT NULL,
	"device_id" varchar(128) DEFAULT 'unknown' NOT NULL,
	"platform" varchar(20),
	"rejection_count" integer DEFAULT 0 NOT NULL,
	"last_ota_number" integer,
	"last_rejected_payload" text,
	"last_rejected_at" timestamp DEFAULT now() NOT NULL,
	"last_source" varchar(20),
	CONSTRAINT "gps_rejection_stats_pk" PRIMARY KEY ("user_id","device_id"),
	CONSTRAINT "gps_rejection_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gps_rejection_stats_count_idx" ON "gps_rejection_stats" ("rejection_count");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gps_rejection_stats_at_idx" ON "gps_rejection_stats" ("last_rejected_at");
