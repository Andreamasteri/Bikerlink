-- Add last_heartbeat_at for per-session crash detection (idempotent)
DO $$
BEGIN
  IF to_regclass('user_sessions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'user_sessions' AND column_name = 'last_heartbeat_at'
     ) THEN
    ALTER TABLE user_sessions ADD COLUMN last_heartbeat_at TIMESTAMP;
  END IF;
END $$;

-- Add CHECK constraint on exit_type if not already present (idempotent)
DO $$
BEGIN
  IF to_regclass('user_sessions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'user_sessions_exit_type_chk'
         AND conrelid = 'user_sessions'::regclass
     ) THEN
    ALTER TABLE user_sessions
      ADD CONSTRAINT user_sessions_exit_type_chk
      CHECK (exit_type IN ('background', 'logout', 'crash'));
  END IF;
END $$;
