CREATE TABLE "direct_match_requests" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" varchar(36) NOT NULL,
	"receiver_id" varchar(36) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "direct_match_requests" ADD CONSTRAINT "direct_match_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "direct_match_requests" ADD CONSTRAINT "direct_match_requests_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "direct_match_requests_unique_idx" ON "direct_match_requests" USING btree ("sender_id","receiver_id");
--> statement-breakpoint
CREATE INDEX "direct_match_requests_receiver_idx" ON "direct_match_requests" USING btree ("receiver_id");
--> statement-breakpoint
CREATE INDEX "direct_match_requests_sender_idx" ON "direct_match_requests" USING btree ("sender_id");
