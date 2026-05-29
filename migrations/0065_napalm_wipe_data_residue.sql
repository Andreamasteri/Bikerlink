-- ============================================================================
-- NAPALM #2 — Wipe dei residui di DATI non legati a users
-- ============================================================================
-- Task #2801 — segue 0064_napalm_wipe_all_users.sql
--
-- Il napalm 0064 azzera users + tutte le tabelle con FK a users (88+).
-- Restavano però tabelle di DATI PRE-napalm SENZA FK a users, quindi non
-- coperte dal CASCADE. Questa migration le azzera per ottenere lo "scheletro"
-- vero (DB vuoto da utenti E dati), su richiesta esplicita dell'utente.
--
-- ⚠️  PRESERVA la config necessaria al boot: text_aliases, tags, tag_categories,
--     translation_keys, match_rules, match_thresholds, moderation_thresholds,
--     app_settings, easter_eggs, spatial_ref_sys, schema_migrations.
--
-- CASCADE coinvolge solo figli-dati: ad_clicks, ota_boot_events, workshop_contacts
-- (verificato: zero collisioni con la config preservata).
--
-- NB: integrity_violations/integrity_runs/geo_cell_labels/ai_usage_budget sono
--     diagnostica/cache: si rigenerano durante l'esecuzione dell'app. Azzerarle
--     dà comunque una ripartenza pulita.
-- ============================================================================

TRUNCATE TABLE
  workshops,
  ad_campaigns,
  ab_experiments,
  ota_releases,
  integrity_violations,
  integrity_runs,
  geo_cell_labels,
  ai_usage_budget
RESTART IDENTITY CASCADE;
