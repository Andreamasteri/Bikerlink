-- Causa reale dell'ultimo fallimento di registrazione del push token, persistita
-- dal client (PushTokenRegistrar) per renderla visibile nel diagnostic in-app
-- senza accesso ai log. NULL = nessun errore noto / token registrato.
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token_error VARCHAR(48);
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token_error_detail TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token_error_platform VARCHAR(16);
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token_error_at TIMESTAMP;
