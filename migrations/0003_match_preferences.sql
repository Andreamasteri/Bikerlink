CREATE TABLE "match_preferences" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"biker_biker_brand" boolean DEFAULT true NOT NULL,
	"biker_zavorrina_brand" boolean DEFAULT true NOT NULL,
	"biker_club_brand" boolean DEFAULT true NOT NULL,
	"zavorrina_club_brand" boolean DEFAULT true NOT NULL,
	"biker_biker_type_style" boolean DEFAULT true NOT NULL,
	"biker_zavorrina_type_style" boolean DEFAULT true NOT NULL,
	"biker_biker_distance" boolean DEFAULT true NOT NULL,
	"biker_zavorrina_distance" boolean DEFAULT true NOT NULL,
	"biker_biker_music" boolean DEFAULT true NOT NULL,
	"biker_zavorrina_music" boolean DEFAULT true NOT NULL,
	"biker_biker_lean_angle" boolean DEFAULT true NOT NULL,
	"biker_biker_route_type_zone" boolean DEFAULT true NOT NULL,
	"biker_zavorrina_route_type_zone" boolean DEFAULT true NOT NULL,
	"biker_biker_avg_speed" boolean DEFAULT true NOT NULL,
	"biker_biker_avg_duration" boolean DEFAULT true NOT NULL,
	"biker_biker_day_time" boolean DEFAULT true NOT NULL,
	"biker_biker_events" boolean DEFAULT true NOT NULL,
	"direct_match" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "match_preferences_user_id_unique" UNIQUE("user_id")
);

ALTER TABLE "match_preferences" ADD CONSTRAINT "match_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "match_preferences_user_id_idx" ON "match_preferences" USING btree ("user_id");
