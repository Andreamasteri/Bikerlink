-- ============================================================================
-- NAPALM — Wipe totale degli utenti e di tutti i dati collegati
-- ============================================================================
-- Task #2801 — "Backup totale, napalm DB e redeploy"
--
-- ⚠️  FILE INERTE / DRAFT — NON è in migrations/, quindi NON viene eseguito né
--     al restart di DEV né al deploy. Per ATTIVARLO vedi .local/napalm/README.md
--     (va copiato in migrations/0064_napalm_wipe_all_users.sql SOLO al "go" finale).
--
-- ⚠️  IRREVERSIBILE. Eseguire SOLO dopo aver verificato il backup:
--       - DEV : .local/backups/dev_<TS>.dump            (pg_dump -Fc, ripristinabile)
--       - PROD: .local/backups/prod_<TS>/*.jsonl         (export read-only, 124.774 righe)
--
-- DOPO il napalm, l'auto-seed al boot ricrea SOLO gli account essenziali
-- (se le env password sono presenti): admin, moderatore, AppleReviewer,
-- GooglePlayReviewer, BikerLink_Official.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SEZIONE A — CORE: azzera users + tutte le 88 tabelle che dipendono da users
-- (chiusura FK calcolata: TRUNCATE ... CASCADE le svuota tutte in un colpo).
-- RESTART IDENTITY azzera anche le sequence.
-- ----------------------------------------------------------------------------
TRUNCATE TABLE users RESTART IDENTITY CASCADE;

--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- SEZIONE B — OPZIONALE: telemetria / tabelle orfane NON coperte da CASCADE.
-- Sono log operativi e assegnazioni tag; svuotarle per una ripartenza pulita.
-- Se vuoi conservare lo storico operativo, COMMENTA questa sezione.
-- (NON tocca config: app_settings, tags, tag_categories, translation_keys,
--  easter_eggs, match_rules, match_thresholds, moderation_thresholds,
--  spatial_ref_sys, schema_migrations — quelle restano.)
-- ----------------------------------------------------------------------------
TRUNCATE TABLE
  session,
  server_restarts,
  system_signals,
  system_health_snapshot,
  ai_events,
  ai_watchdog_log,
  ai_decisions,
  ai_conflicts,
  ai_messages,
  ai_conversations,
  db_integrity_violations,
  db_integrity_runs,
  entity_tags,
  phone_sharing_tracker,
  embeddings
RESTART IDENTITY;
