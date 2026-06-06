-- Migration 0073: Fix strutturale DB Matching
-- Aggiunge colonne notifica a bio/route_affinity_matches,
-- FK planned_route_invites.route_id, UNIQUE su proposal_matches,
-- backfill match_preferences per utenti esistenti.

-- 1. bio_affinity_matches: aggiungi notification_priority e notified_at
ALTER TABLE bio_affinity_matches
  ADD COLUMN IF NOT EXISTS notification_priority varchar(10) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS notified_at timestamp NULL;

-- 2. route_affinity_matches: aggiungi notification_priority, notified_at, archived_at
ALTER TABLE route_affinity_matches
  ADD COLUMN IF NOT EXISTS notification_priority varchar(10) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS notified_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamp NULL;

-- 3. Indice su bio_affinity_matches per pending notifications
CREATE INDEX IF NOT EXISTS bio_affinity_notif_pending_idx
  ON bio_affinity_matches (notification_priority, notified_at);

-- 4. Indice su route_affinity_matches per pending notifications
CREATE INDEX IF NOT EXISTS route_affinity_notif_pending_idx
  ON route_affinity_matches (notification_priority, notified_at);

-- 5. Indice archived_at su route_affinity_matches
CREATE INDEX IF NOT EXISTS route_affinity_archived_at_idx
  ON route_affinity_matches (archived_at);

-- 6. FK planned_route_invites.route_id -> planned_routes.id ON DELETE CASCADE
-- Prima verifica che non esista già
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'planned_route_invites_route_id_fk'
      AND table_name = 'planned_route_invites'
  ) THEN
    ALTER TABLE planned_route_invites
      ADD CONSTRAINT planned_route_invites_route_id_fk
      FOREIGN KEY (route_id)
      REFERENCES planned_routes(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 7. UNIQUE index simmetrico su proposal_matches
CREATE UNIQUE INDEX IF NOT EXISTS proposal_matches_symmetric_unique_idx
  ON proposal_matches (
    LEAST(proposal_id_1, proposal_id_2),
    GREATEST(proposal_id_1, proposal_id_2)
  );

-- 8. Backfill match_preferences per utenti senza riga
INSERT INTO match_preferences (user_id)
  SELECT id FROM users
  WHERE id NOT IN (SELECT user_id FROM match_preferences)
ON CONFLICT DO NOTHING;
