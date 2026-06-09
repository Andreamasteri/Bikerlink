-- Rimuove le righe di cooldown Anthropic orfane dalla tabella app_settings.
-- Il provider Anthropic è stato rimosso dal codice; i dati di cooldown
-- persistiti dal sistema di quota non vengono più letti ma sono dati spazzatura.
DELETE FROM app_settings WHERE key = 'ai_provider_cooldown_anthropic';
