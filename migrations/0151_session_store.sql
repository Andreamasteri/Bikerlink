-- PostgreSQL session store required by connect-pg-simple.
-- Kept in the numbered migration stream so a fresh Neon branch bootstraps
-- login sessions without smoke-test-only DDL. Existing deployments are safe:
-- all statements are idempotent.
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
