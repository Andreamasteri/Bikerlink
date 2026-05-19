CREATE TABLE "planned_routes" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"waypoints" jsonb DEFAULT '[]'::jsonb,
	"polyline" text,
	"distance_km" double precision DEFAULT 0,
	"duration_minutes" integer DEFAULT 0,
	"biker_score" double precision DEFAULT 0,
	"style" varchar(20) DEFAULT 'curvy' NOT NULL,
	"visibility" varchar(20) DEFAULT 'public' NOT NULL,
	"is_multi_day" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_weather_cache" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" varchar(36) NOT NULL,
	"departure_time" timestamp NOT NULL,
	"weather_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planned_routes" ADD CONSTRAINT "planned_routes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "route_weather_cache" ADD CONSTRAINT "route_weather_cache_route_id_planned_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."planned_routes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "planned_routes_user_id_idx" ON "planned_routes" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "planned_routes_visibility_idx" ON "planned_routes" USING btree ("visibility");
--> statement-breakpoint
CREATE INDEX "route_weather_cache_route_id_idx" ON "route_weather_cache" USING btree ("route_id");
