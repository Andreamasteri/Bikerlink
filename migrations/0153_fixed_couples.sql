CREATE TABLE IF NOT EXISTS fixed_couples (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  biker_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zavorrina_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'pending',
  responded_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fixed_couples_biker_idx ON fixed_couples (biker_id);
CREATE INDEX IF NOT EXISTS fixed_couples_zavorrina_idx ON fixed_couples (zavorrina_id);
CREATE UNIQUE INDEX IF NOT EXISTS fixed_couples_open_pair_uq ON fixed_couples (biker_id, zavorrina_id) WHERE status IN ('pending', 'active');