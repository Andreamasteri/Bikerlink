-- Migration 0063: Aggiunge colonna is_system alla tabella users
-- Task #2794 ha aggiunto il campo in shared/db/users.ts e applicato via db:push
-- su dev, ma non ha creato una migration file per la produzione.
-- Questa migration allinea lo schema di prod aggiungendo la colonna mancante.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- Marca BikerLink_Official come account di sistema se già esiste
UPDATE users SET is_system = true WHERE nickname = 'BikerLink_Official';
