DO $$ BEGIN
    CREATE TYPE "public"."arcade_game" AS ENUM('endless_biker', 'traffic_racer', 'wheelie', 'tetris', 'space_invaders');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "arcade_scores" (
    "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar(36) NOT NULL,
    "game" "arcade_game" NOT NULL,
    "score" integer NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "arcade_scores" ADD CONSTRAINT "arcade_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "arcade_scores_user_game_idx" ON "arcade_scores" USING btree ("user_id","game");
CREATE INDEX IF NOT EXISTS "arcade_scores_game_score_idx" ON "arcade_scores" USING btree ("game","score");
