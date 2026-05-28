-- Task #2551 — Stato letto/non letto del digest AI moderazione per moderatore.
-- PK composto (moderator_id, digest_id) garantisce idempotenza del mark-read
-- e permette di calcolare unread badge come (digest piu' recente NOT IN read_state).
CREATE TABLE IF NOT EXISTS "digest_read_state" (
  "moderator_id" varchar(36) NOT NULL,
  "digest_id"    varchar(36) NOT NULL,
  "read_at"      timestamp   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "digest_read_state_mod_digest_idx"
  ON "digest_read_state" ("moderator_id", "digest_id");

CREATE INDEX IF NOT EXISTS "digest_read_state_mod_idx"
  ON "digest_read_state" ("moderator_id");
