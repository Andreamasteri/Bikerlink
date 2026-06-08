-- 0067_db_integrity_cascade_orphan_fix.sql
-- One-shot cleanup: orfani nelle tabelle match + normalizza role/status invalidi.
-- Idempotente: usa NOT EXISTS per rilevare solo orfani reali.
-- I FK CASCADE esistono già dalla baseline; questa migration pulisce i record
-- accumulati prima della loro introduzione (napalm wipe 0064/0065).

-- ============================================================
-- 1. Normalizza role invalidi (case variants + trim)
-- ============================================================
UPDATE users SET role = 'user'        WHERE role IN ('USER','User',' user','user ');
UPDATE users SET role = 'admin'       WHERE role IN ('ADMIN','Admin');
UPDATE users SET role = 'moderator'   WHERE role IN ('MODERATOR','Moderator','mod');
UPDATE users SET role = 'super_admin' WHERE role IN ('SUPER_ADMIN','superadmin','super-admin');

-- ============================================================
-- 2. Normalizza status invalidi (case variants comuni)
-- ============================================================
UPDATE users SET status = 'active'    WHERE status IN ('ACTIVE','Active');
UPDATE users SET status = 'suspended' WHERE status IN ('SUSPENDED','Suspended');
UPDATE users SET status = 'deleted'   WHERE status IN ('DELETED','Deleted');
UPDATE users SET status = 'pending'   WHERE status IN ('PENDING','Pending');

-- ============================================================
-- 3. Elimina orfani da biker_biker_matches
-- ============================================================
DELETE FROM biker_biker_matches
WHERE biker1_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users WHERE id = biker_biker_matches.biker1_id);

DELETE FROM biker_biker_matches
WHERE biker2_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users WHERE id = biker_biker_matches.biker2_id);

-- ============================================================
-- 4. Elimina orfani da biker_zavorrina_matches
-- ============================================================
DELETE FROM biker_zavorrina_matches
WHERE biker_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users WHERE id = biker_zavorrina_matches.biker_id);

DELETE FROM biker_zavorrina_matches
WHERE zavorrina_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users WHERE id = biker_zavorrina_matches.zavorrina_id);

-- ============================================================
-- 5. Elimina sessioni orfane (se la tabella esiste)
-- ============================================================
DO $$
BEGIN
  IF to_regclass('user_sessions') IS NOT NULL THEN
    DELETE FROM user_sessions
    WHERE user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users WHERE id = user_sessions.user_id);
  END IF;
END $$;

-- ============================================================
-- 6. Elimina messaggi chat orfani (se le tabelle esistono)
-- ============================================================
DO $$
BEGIN
  IF to_regclass('chat_messages') IS NOT NULL
     AND to_regclass('chat_conversations') IS NOT NULL THEN
    DELETE FROM chat_messages
    WHERE conversation_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM chat_conversations
        WHERE id = chat_messages.conversation_id
      );
  END IF;
END $$;

-- ============================================================
-- 7. Elimina sos_alerts orfani (se la tabella esiste)
-- ============================================================
DO $$
BEGIN
  IF to_regclass('sos_alerts') IS NOT NULL THEN
    DELETE FROM sos_alerts
    WHERE user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users WHERE id = sos_alerts.user_id);
  END IF;
END $$;
