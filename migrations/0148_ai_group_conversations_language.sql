-- Task #130 — Lingua dell'utente presente alla tavola rotonda di gruppo.
--
-- Persistita sulla conversazione così che la ripresa (resume) rigeneri i turni
-- nella stessa lingua con cui la conversazione è stata avviata. Default 'it'
-- (lingua sorgente dell'app): le conversazioni legacy restano in italiano,
-- coerentemente col comportamento storico.
ALTER TABLE "ai_group_conversations" ADD COLUMN IF NOT EXISTS "language" varchar(8) NOT NULL DEFAULT 'it';
