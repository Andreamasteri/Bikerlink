CREATE TABLE IF NOT EXISTS "media_library" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::varchar NOT NULL,
	"type" varchar(10) DEFAULT 'pdf' NOT NULL,
	"title_it" varchar(300) NOT NULL,
	"title_en" varchar(300) NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_library_type_idx" ON "media_library" ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_library_sort_idx" ON "media_library" ("sort_order");
