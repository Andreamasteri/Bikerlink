CREATE TABLE IF NOT EXISTS "route_voice_notes" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" varchar(36) NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "route_voice_notes" ADD CONSTRAINT "route_voice_notes_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "route_voice_notes_route_id_idx" ON "route_voice_notes" ("route_id");
