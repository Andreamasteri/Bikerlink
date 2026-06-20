-- Task #4589 — Map-matching resiliente e ri-processabile.
--
-- Estende ride_telemetry con uno stato di match esplicito per-campione (allineato
-- per-sessione dal job) che distingue tre esiti, oltre al "pending" iniziale:
--   pending     — mai processato (default)
--   retry       — fallimento transitorio (es. GraphHopper irraggiungibile): va ritentato
--   matched     — matchato con successo sui segmenti OSM
--   unmatchable — fallimento permanente per il motore attuale (<2 punti GPS o
--                 nessun segmento restituito); NON ritentato in automatico ma
--                 ri-accodabile da un'azione admin quando la copertura migliora.
--
-- match_attempts          — contatore tentativi (cap nel job per evitare loop infiniti)
-- last_match_attempt_at   — timestamp ultimo tentativo (backoff lato job)
--
-- La colonna legacy `matched` viene mantenuta e resta sincronizzata
-- (matched = true solo quando match_status = 'matched') per compatibilità.

ALTER TABLE ride_telemetry ADD COLUMN IF NOT EXISTS match_status VARCHAR(12) NOT NULL DEFAULT 'pending';
ALTER TABLE ride_telemetry ADD COLUMN IF NOT EXISTS match_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ride_telemetry ADD COLUMN IF NOT EXISTS last_match_attempt_at TIMESTAMPTZ;

-- Backfill dello stato dai record esistenti: chi era già matched=true diventa
-- 'matched', il resto resta 'pending'. Senza questo backfill i campioni già
-- aggregati verrebbero ri-processati → doppio conteggio in segment_telemetry.
UPDATE ride_telemetry SET match_status = 'matched' WHERE matched = true AND match_status <> 'matched';

-- Indice per la selezione del batch (filtra per stato, esclude matched/unmatchable).
CREATE INDEX IF NOT EXISTS ride_telemetry_match_status_idx ON ride_telemetry (match_status);
