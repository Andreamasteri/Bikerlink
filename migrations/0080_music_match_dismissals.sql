CREATE TABLE IF NOT EXISTS "music_match_dismissals" (
  "id" serial PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "dismissed_user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "dismissed_at" timestamp NOT NULL DEFAULT now(),
  UNIQUE("user_id", "dismissed_user_id")
);

CREATE INDEX IF NOT EXISTS "music_match_dismissals_user_idx" ON "music_match_dismissals"("user_id");
