-- Migration 0076: Allinea 3 colonne dichiarate nel registry Drizzle ma mai
-- create da alcuna migration numerata (erano state aggiunte via drizzle-kit push
-- storico). Tutti gli statement sono idempotenti (IF NOT EXISTS).
--
-- Colonne coperte:
--   • pending_auto_suggestions.reject_count   (integer NOT NULL DEFAULT 0)
--   • user_music_tokens.provider_user_id      (varchar(200) NOT NULL)
--   • ai_messages.scopes                      (jsonb)
--
-- Strategia duale per pending_auto_suggestions e ai_messages:
--   (a) CREATE TABLE IF NOT EXISTS completo — copre DB freschi e permette alla
--       guardia schema-drift di verificare le colonne table-qualified.
--   (b) ALTER TABLE ADD COLUMN IF NOT EXISTS esplicito — copre i DB esistenti
--       che hanno già la tabella ma mancano della singola colonna (es. prod
--       allineata via push storico senza la colonna specifica).

-- ─── 1. pending_auto_suggestions ──────────────────────────────────────────────

-- (a) DB freschi: crea la tabella completa inclusa reject_count
CREATE TABLE IF NOT EXISTS pending_auto_suggestions (
  id           varchar(36)  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      varchar(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         varchar(40)  NOT NULL,
  value        jsonb        NOT NULL,
  reject_count integer      NOT NULL DEFAULT 0,
  status       varchar(20)  NOT NULL DEFAULT 'pending',
  created_at   timestamp    NOT NULL DEFAULT now(),
  resolved_at  timestamp
);

CREATE INDEX IF NOT EXISTS pending_auto_suggestions_user_idx
  ON pending_auto_suggestions (user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS pending_auto_suggestions_unique_idx
  ON pending_auto_suggestions (user_id, kind, (value::text));

-- (b) DB esistenti: aggiunge reject_count se mancante (no-op se già presente)
ALTER TABLE pending_auto_suggestions
  ADD COLUMN IF NOT EXISTS reject_count integer NOT NULL DEFAULT 0;

-- ─── 2. ai_messages ───────────────────────────────────────────────────────────

-- (a) DB freschi: crea la tabella completa inclusa scopes
CREATE TABLE IF NOT EXISTS ai_messages (
  id              varchar(36)    PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id varchar(36)    NOT NULL,
  role            varchar(16)    NOT NULL,
  content         text           NOT NULL DEFAULT '',
  scopes          jsonb,
  tool_calls      jsonb,
  entities        jsonb,
  model           varchar(80),
  provider        varchar(30),
  tokens_in       integer        NOT NULL DEFAULT 0,
  tokens_out      integer        NOT NULL DEFAULT 0,
  cost_usd        numeric(12, 6) NOT NULL DEFAULT 0,
  created_at      timestamp      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_messages_conv_idx
  ON ai_messages (conversation_id);

CREATE INDEX IF NOT EXISTS ai_messages_created_idx
  ON ai_messages (created_at);

-- (b) DB esistenti: aggiunge scopes se mancante (no-op se già presente)
ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS scopes jsonb;

-- ─── 3. user_music_tokens.provider_user_id ────────────────────────────────────

-- La colonna è NOT NULL senza default nel registry: si usa un default temporaneo
-- '' per non far fallire l'ADD COLUMN se la tabella ha righe esistenti, poi si
-- rimuove il default per rispettare la definizione ORM.
-- IF NOT EXISTS rende entrambi gli statement no-op se la colonna esiste già.
ALTER TABLE user_music_tokens
  ADD COLUMN IF NOT EXISTS provider_user_id varchar(200) NOT NULL DEFAULT '';

ALTER TABLE user_music_tokens
  ALTER COLUMN provider_user_id DROP DEFAULT;
