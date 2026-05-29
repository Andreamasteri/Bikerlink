-- Migration 0062: Ripristino utenti reali da backup produzione + pulizia finti dev
  -- Exported: 2026-05-29T00:12 — 26 utenti reali
  -- Eseguita automaticamente da migrate.ts al deploy
  --
  -- Contesto: un "Copy dev to production" ha sovrascritto la produzione con 5001
  -- utenti finti di sviluppo (is_fake=true) e ha cancellato i 26 utenti reali.
  -- Questa migration:
  --   0) Cancella TUTTI i finti (is_fake=true). Le FK verso users hanno
  --      84 ON DELETE CASCADE + 17 ON DELETE SET NULL, quindi i dati figli
  --      collegati ai finti vengono rimossi/azzerati automaticamente.
  --   1) Reinserisce i 26 utenti reali (+ profili, moto, rotte) con ON CONFLICT
  --      idempotente. Gli account di sistema (admin, moderatore, reviewer,
  --      ecc., già is_fake=false) NON vengono toccati dal DELETE.

  -- ── -1. INDICI FK PRE-DELETE ─────────────────────────────────────────
  -- Senza indici Postgres fa seq-scan di ogni tabella figlia per ogni utente
  -- (cascade/set-null): 5000 finti × N tabelle = milioni di confronti → timeout.
  -- CREATE INDEX IF NOT EXISTS è idempotente: sicuro anche se già esiste.
  -- Ogni statement è separato perché migrate.ts usa SAVEPOINT per ognuno.
CREATE INDEX IF NOT EXISTS idx_fk_ab_assignments_user_id ON ab_assignments (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_ab_events_user_id ON ab_events (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_ad_clicks_user_id ON ad_clicks (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_app_crash_logs_user_id ON app_crash_logs (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_arcade_scores_user_id ON arcade_scores (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_biker_biker_matches_biker1_id ON biker_biker_matches (biker1_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_biker_biker_matches_biker2_id ON biker_biker_matches (biker2_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_biker_zavorrina_matches_biker_id ON biker_zavorrina_matches (biker_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_biker_zavorrina_matches_zavorrina_id ON biker_zavorrina_matches (zavorrina_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_bio_affinity_matches_user_a_id ON bio_affinity_matches (user_a_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_bio_affinity_matches_user_b_id ON bio_affinity_matches (user_b_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_collected_easter_eggs_user_id ON collected_easter_eggs (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_conversation_participants_user_id ON conversation_participants (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_coordinate_history_user_id ON coordinate_history (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_custom_routes_user_id ON custom_routes (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_daily_push_counts_user_id ON daily_push_counts (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_daily_vote_counts_user_id ON daily_vote_counts (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_direct_match_requests_receiver_id ON direct_match_requests (receiver_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_direct_match_requests_sender_id ON direct_match_requests (sender_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_email_verification_tokens_user_id ON email_verification_tokens (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_event_participants_user_id ON event_participants (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_events_creator_id ON events (creator_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_fake_user_interactions_fake_user_id ON fake_user_interactions (fake_user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_fake_user_interactions_real_user_id ON fake_user_interactions (real_user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_feedback_tickets_user_id ON feedback_tickets (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_gps_errors_user_id ON gps_errors (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_gps_rejection_stats_user_id ON gps_rejection_stats (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_invitation_codes_created_by ON invitation_codes (created_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_invitation_codes_used_by ON invitation_codes (used_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_match_feedback_other_user_id ON match_feedback (other_user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_match_feedback_user_id ON match_feedback (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_match_negative_preferences_user_id ON match_negative_preferences (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_match_notification_deliveries_user_id ON match_notification_deliveries (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_match_preferences_user_id ON match_preferences (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_messages_sender_id ON messages (sender_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_moderator_logs_moderator_id ON moderator_logs (moderator_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_moto_club_invites_user_id ON moto_club_invites (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_moto_club_members_user_id ON moto_club_members (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_moto_club_requests_requested_by ON moto_club_requests (requested_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_moto_club_requests_reviewed_by ON moto_club_requests (reviewed_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_moto_clubs_created_by ON moto_clubs (created_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_moto_clubs_proposed_by ON moto_clubs (proposed_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_music_affinity_matches_user_a_id ON music_affinity_matches (user_a_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_music_affinity_matches_user_b_id ON music_affinity_matches (user_b_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_notifications_user_id ON notifications (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_ota_assistant_runs_admin_id ON ota_assistant_runs (admin_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_ota_boot_events_user_id ON ota_boot_events (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_ota_releases_approved_by ON ota_releases (approved_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_ota_releases_rejected_by ON ota_releases (rejected_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_ota_watchdog_reports_triggered_by ON ota_watchdog_reports (triggered_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_password_reset_tokens_user_id ON password_reset_tokens (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_pending_auto_suggestions_user_id ON pending_auto_suggestions (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_photo_contest_entries_user_id ON photo_contest_entries (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_photo_votes_user_id ON photo_votes (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_photo_winners_user_id ON photo_winners (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_planned_route_invites_owner_id ON planned_route_invites (owner_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_planned_route_invites_suggested_user_id ON planned_route_invites (suggested_user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_planned_routes_user_id ON planned_routes (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_proposal_matches_user_id_1 ON proposal_matches (user_id_1);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_proposal_matches_user_id_2 ON proposal_matches (user_id_2);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_proposal_participants_user_id ON proposal_participants (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_proposal_profile_matches_biker_id ON proposal_profile_matches (biker_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_proposal_profile_matches_zavorrina_id ON proposal_profile_matches (zavorrina_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_proposal_zone_notifications_user_id ON proposal_zone_notifications (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_proposals_user_id ON proposals (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_reports_reported_user_id ON reports (reported_user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_reports_reporter_id ON reports (reporter_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_reports_resolved_by ON reports (resolved_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_ride_telemetry_user_id ON ride_telemetry (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_road_hazard_comments_user_id ON road_hazard_comments (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_road_hazard_confirms_user_id ON road_hazard_confirms (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_road_hazards_user_id ON road_hazards (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_route_affinity_matches_user_a_id ON route_affinity_matches (user_a_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_route_affinity_matches_user_b_id ON route_affinity_matches (user_b_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_routes_user_id ON routes (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_shared_playlists_from_user_id ON shared_playlists (from_user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_shared_playlists_to_user_id ON shared_playlists (to_user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_site_visits_user_id ON site_visits (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_sos_requests_helper_id ON sos_requests (helper_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_sos_requests_requester_id ON sos_requests (requester_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_sprint_results_user_id ON sprint_results (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_blocks_blocked_id ON user_blocks (blocked_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_blocks_blocker_id ON user_blocks (blocker_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_curvy_profile_user_id ON user_curvy_profile (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_devices_user_id ON user_devices (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_favorites_favorite_user_id ON user_favorites (favorite_user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_favorites_user_id ON user_favorites (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_lastfm_sessions_user_id ON user_lastfm_sessions (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_match_profile_user_id ON user_match_profile (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_motorcycles_user_id ON user_motorcycles (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_music_tokens_user_id ON user_music_tokens (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_music_tracks_user_id ON user_music_tracks (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_photos_user_id ON user_photos (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_playlist_snapshots_user_id ON user_playlist_snapshots (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_profiles_user_id ON user_profiles (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_route_fingerprints_user_id ON user_route_fingerprints (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_user_time_profile_user_id ON user_time_profile (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_verification_codes_user_id ON verification_codes (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_weekly_recaps_user_id ON weekly_recaps (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_workshop_contacts_user_id ON workshop_contacts (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fk_zavorrina_wishlists_user_id ON zavorrina_wishlists (user_id);
--> statement-breakpoint

  -- ── 0. PULIZIA UTENTI FINTI DEV ─────────────────────────────────────
DELETE FROM users WHERE is_fake = true;
--> statement-breakpoint

  -- ── 1. UTENTI REALI ────────────────────────────────────────────────
INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('63d14222-e80f-481a-a2be-7784e7a397a4', 'admin', 'admin@bikerlink.it', NULL, '$2b$12$XtFDhyMMG0pg0fSJQnFjsujnpeXUl4dPk6OCuL9.KZZqrlGjbDR8.', 'biker', 'admin', 'active', NULL, 'Veneto', 'IT', NULL, true, false, true, false, true, '2026-03-04 10:20:07.753873', '2026-05-28 11:32:04.583', NULL, 'unknown', 'unknown', false, true, NULL, true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('b6dbaa06-5090-4246-96a7-9109220fac78', 'moderatore', 'mod@bikerlink.it', NULL, '$2b$12$eFYiz68bsSGqL5opQZbuletXohAQETzdpMI0VUJogFzHOYeBrdZla', 'biker', 'moderator', 'active', NULL, NULL, 'IT', NULL, true, false, true, false, true, '2026-03-04 10:20:08.108991', '2026-03-28 20:03:38.145', NULL, NULL, NULL, true, false, NULL, true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('fa14cdd1-5652-4ad5-a838-0d304f34a963', 'ssrft1777375726', 'ssrftest_1777375726@example.com', NULL, '$2b$12$CP3x26m0KiR6cw/m/dqRE.l0AfeXbzbEyk7xQUzDVD74L/2J0KzoS', 'biker', 'user', 'active', NULL, NULL, NULL, NULL, true, true, true, false, false, '2026-04-28 11:28:46.613823', '2026-04-28 11:30:16.199', NULL, NULL, NULL, false, true, '2026-04-28 11:28:46.612', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('8737773b-79c8-4b10-aeb2-51fa75114986', 'la Nina', 'elisa.vnl@gmail.com', NULL, '$2b$12$acmXkPJ.n8RQh0TNfbQWZ.0dL2EvIKdLe9tsDxCngkwXarJlLM/1G', 'biker', 'user', 'active', '1982', NULL, 'IT', NULL, true, true, true, false, false, '2026-04-29 05:19:38.052015', '2026-05-20 14:01:00.767', NULL, 'android', '3.3.0', false, true, NULL, true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('3911de14-cded-41ab-a68e-811128330970', 'Dane', 'sibani.dane@gmail.com', NULL, '$2b$12$O.hq.ynaq7z6fF7.jpnxjOy/1upP0foGeOYEhusUHamC5zrUnQfie', 'zavorrina', 'user', 'active', '1990', 'Emilia-Romagna', 'IT', NULL, true, true, true, false, false, '2026-04-29 05:26:36.840105', '2026-05-01 20:40:56.003', NULL, 'android', '3.3.0', false, true, NULL, true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('1007965c-b0f6-48aa-a414-6a40370abc48', 'Rossocroce', 'rommellrossocroce@gmail.com', NULL, '$2b$12$NUbA0Ljx8aWwXq4ypHY9FODkGsCFyZWsRcbl8Dn5cOz8xcbtXAVf2', 'biker', 'user', 'active', '1972', 'Emilia-Romagna', 'IT', NULL, true, true, true, false, false, '2026-04-29 20:29:14.692558', '2026-05-26 22:15:57.176', NULL, 'android', '3.4.0', false, true, '2026-04-29 20:29:14.674', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('57745d2c-ce48-4e8b-9b25-246850aa48c8', 'peo79', 'pbordin79@gmail.com', NULL, '$2b$12$2iYd2jRiUjWazbrzVK.Gbe7w5j4hxUZI5WRDcyA/K2Qtuv3Uacq6K', 'biker', 'user', 'active', '1979', 'Friuli Venezia Giulia', 'IT', NULL, true, true, true, false, false, '2026-04-29 23:51:52.241654', '2026-05-28 17:54:47.376', NULL, 'android', '3.3.0', false, true, '2026-04-29 23:51:52.222', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('62c2024e-0e87-4a53-a118-21952146e395', 'mendo', 'andreagranara@gmail.com', NULL, '$2b$12$ab/vyqR.9D2hdmaFsE0gaeF.noRTz8mWvIQUSPtCDEyrrX6wXfVf.', 'biker', 'user', 'active', '1981', 'Veneto', 'IT', NULL, true, true, true, false, false, '2026-04-30 01:03:55.386402', '2026-05-29 00:06:14.336', NULL, 'android', '53.1.10', false, true, '2026-04-30 01:03:55.368', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('0cf64dfb-58c6-4c32-852b-21a66b42d8e2', 'eros', 'erosdv@gmail.com', NULL, '$2b$12$/n3qaZ60INzchSD5lqu0ieHIZyigwV1rZjpfM7teb1jZapOzVsRqS', 'zavorrina', 'user', 'active', NULL, NULL, 'IT', NULL, true, true, true, false, false, '2026-04-30 09:51:34.206373', '2026-05-02 14:03:04.298', NULL, 'android', '3.3.0', false, true, '2026-04-30 09:51:34.19', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('14668fd4-e070-468c-b658-3eb70500a21a', 'Gaia', 'akashisenju181@gmail.com', NULL, '$2b$12$9vMjhHKR4qtEQBY6cNndlebFJ2UPxX6mtdKsnBcwAkMk6CiSNhM2C', 'zavorrina', 'user', 'active', '2008', NULL, 'IT', NULL, true, true, true, false, false, '2026-04-30 18:29:14.603832', '2026-04-30 18:35:53.479', NULL, 'android', '3.3.0', false, true, '2026-04-30 18:29:14.587', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('7a0c97de-4c3e-4f8e-b6bb-51bd1a82b7b3', 'zia', 'xieziyao9905@gmail.com', NULL, '$2b$12$scFPVpnnlve97qyvwFKyQ.KCH9FDcnI1wdy9cWtuv7rxh1thyYGKq', 'zavorrina', 'user', 'active', '2005', 'Veneto', 'IT', NULL, false, true, false, false, true, '2026-05-01 11:23:16.525576', '2026-05-26 11:10:31.124', NULL, 'android', '3.3.0', false, true, '2026-05-01 11:23:16.509', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('e2d20408-6e11-4055-82f4-90e8596f9f45', 'victor', 'vitrinocetre@gmail.com', NULL, '$2b$12$PLAGytdwkkb92XioIhHTou1jg20KSemHPe48XFfeEKW4rClPFuo7u', 'zavorrina', 'user', 'active', '1994', 'Quito (Pichincha)', 'EC', NULL, true, true, true, false, true, '2026-05-04 19:21:11.739513', '2026-05-24 14:18:33.556', NULL, 'android', '3.3.0', false, true, '2026-05-04 19:21:11.723', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('27d6078d-3f9c-45e2-b902-9dd4bc8ba633', 'Carlitos', 'de.hip.hop@live.com', NULL, '$2b$12$HZNI99JHuyIyvmTd.OL66u6LB2hM..sd3Bmn4yGj1lNLaYvx3k53W', 'zavorrina', 'user', 'active', '1992', 'Quito (Pichincha)', 'EC', NULL, true, true, true, false, true, '2026-05-05 21:23:55.36769', '2026-05-06 00:28:08.383', NULL, 'android', '3.3.0', false, true, '2026-05-05 21:23:55.349', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('0a87279f-9e78-4d26-b65d-ae0223068886', 'Reef', 'mahitereef2608@gmail.com', NULL, '$2b$12$viMnFcHMs/Wa2Qw/E2L58OZzH5cQCR1amaTwQQ8pAqf13cuBQPuKi', 'zavorrina', 'user', 'active', '1998', 'Esmeraldas', 'EC', NULL, true, true, true, false, true, '2026-05-06 01:32:25.285125', '2026-05-06 04:30:56.81', NULL, 'android', '3.3.0', false, true, '2026-05-06 01:32:25.267', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('53df3ad3-87ac-41b7-9757-a8f057aa3410', 'mike', 'migues_25@hotmail.com', NULL, '$2b$12$rankmwxzIetjvSIisxnIE.6Wtk5m8u9GRU3EH79McqueIyjGGq.Um', 'zavorrina', 'user', 'active', '1987', 'Quito (Pichincha)', 'EC', NULL, true, true, true, false, true, '2026-05-06 04:33:57.855632', '2026-05-06 22:11:11.632', NULL, 'android', '3.3.0', false, true, '2026-05-06 04:33:57.838', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('935a0b0a-8b42-4496-b6e0-e175da31679a', 'eve', 'evelindav97@gmail.com', NULL, '$2b$12$Or2H12nTJony/BOiOAdw1e1JbR9tTw1CMLF9woo31bPTHKSRCIFZ.', 'zavorrina', 'user', 'active', '1997', 'Quito (Pichincha)', 'EC', NULL, true, true, true, false, true, '2026-05-07 03:34:56.436246', '2026-05-07 03:38:57.178', NULL, 'android', '3.3.0', false, true, '2026-05-07 03:34:56.42', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('587cf6df-3127-480b-8f74-6d350d837437', 'LaBikerPasticiona', 'tatjanashkembi@gmail.com', NULL, '$2b$12$Ql3q67Lt2aeJW3j.PTxf0eSTLcI/KKefe4Krd0V0VI8LOq.YgUvVG', 'biker', 'user', 'active', '1981', 'Veneto', 'IT', NULL, true, true, true, false, true, '2026-05-07 05:24:56.709213', '2026-05-27 19:28:27.833', NULL, 'unknown', 'unknown', false, true, '2026-05-07 05:24:56.692', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('1fecd15c-1be9-4192-a5e2-e21b8ae2ca12', 'Isa', 'cynthia.isa.cg@gmail.com', NULL, '$2b$12$.4an0AKgTuKQD0PcPpoI5ecnfqERd81O1JUZLd8L3pjbD6oZqd5Mq', 'zavorrina', 'user', 'active', '1996', 'Quito (Pichincha)', 'EC', NULL, true, true, true, false, true, '2026-05-07 14:51:15.959554', '2026-05-07 23:59:07.065', NULL, 'android', '3.3.0', false, true, '2026-05-07 14:51:15.943', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('11c935cd-a140-4239-85e6-81aac3e1fbef', 'Darwin', 'estalinnarvaez@gmail.com', NULL, '$2b$12$tR5oHJIqYMhawStH4dEike/fqB24AntfSXxX0h2p7JG0F5.uMPE.S', 'zavorrina', 'user', 'active', NULL, NULL, 'IT', NULL, true, true, true, false, true, '2026-05-07 23:46:17.571841', '2026-05-08 19:59:24.844', NULL, 'android', '3.3.0', false, true, '2026-05-07 23:46:17.555', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('887b6b4a-04c9-41c8-9cca-dcde5c61182d', 'capo', 'raulgrefa83@gmail.com', NULL, '$2b$12$vhWv1edPPW3ITTOrZsMgn./GDjwUNG71wSZ9ktbkameaiCuUV60ea', 'biker', 'user', 'active', '1983', 'Quito (Pichincha)', 'EC', NULL, true, true, true, false, true, '2026-05-08 00:50:27.117055', '2026-05-08 07:11:13.318', NULL, 'android', '3.3.0', false, true, '2026-05-08 00:50:27.101', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('40690eee-8b31-409d-b462-da7e653f4072', 'la bala', 'milerval1991.91@gmail.com', NULL, '$2b$12$iDTaMafJj.ZQVa7ZAdAoWe2CYagdxAb8t/OBM6/OKOYcDN9NQCXxO', 'biker', 'user', 'active', '1991', 'Quito (Pichincha)', 'EC', NULL, true, true, true, false, true, '2026-05-08 20:51:37.280444', '2026-05-08 21:08:26.543', NULL, 'android', '3.3.0', false, true, '2026-05-08 20:51:37.264', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('c8efba0d-2abc-426a-a3ef-5cf03cd57fd6', 'Rubencho', 'rubencalvachi@gmail.com', NULL, '$2b$12$cJa38U3t6pNIr1AIIvdsHO0GDgI9k3/X8ZcY8Y.34BLKcPerYT46O', 'biker', 'user', 'active', '1981', 'Guayaquil (Guayas)', 'EC', NULL, true, true, true, false, true, '2026-05-12 22:29:27.63581', '2026-05-14 15:35:56.071', NULL, 'android', '3.3.0', false, true, '2026-05-12 22:29:27.62', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('92ff03b0-4b84-4a5e-a415-25d91939156c', 'naky', 'juancarlosnacarino1@gmail.com', NULL, '$2b$12$kJbULpkm3if6qWnVdc7buuKH0kU/4rJTDQWkBd9fo/DeuANn9jkhm', 'biker', 'user', 'active', '1979', 'Andalucía', 'ES', NULL, true, true, true, false, true, '2026-05-14 16:22:25.15197', '2026-05-14 16:24:38.017', NULL, 'android', '3.3.0', false, true, '2026-05-14 16:22:25.136', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('0b8547dd-ace6-4527-b832-10da477fae10', 'Leonardo', 'leonardocomelato@gmail.com', NULL, '$2b$12$699Nbfl3pAKQ/F7twcMUT.mJKljRfca00brTnAzXRZaySjyhOQqzm', 'biker', 'user', 'active', '2007', NULL, NULL, NULL, true, true, true, false, true, '2026-05-19 17:24:18.129641', '2026-05-19 17:24:18.129641', NULL, NULL, NULL, false, true, '2026-05-19 17:24:18.113', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('bfbe851d-6975-431e-8de9-d61c8ad675dd', 'AppleReviewer', 'applereview@bikerlink.it', NULL, '$2b$12$JZciVB6CX/6BK6yL3F7j8eg7aLxbyUHteFzsX5Jn4ZLdWufmRNreO', 'biker', 'user', 'active', '1990', 'Toscana', 'IT', NULL, true, true, true, false, false, '2026-05-23 07:49:06.04465', NULL, NULL, NULL, NULL, false, true, '2026-05-23 07:49:06.043', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO users (id, nickname, email, phone, password, user_type, role, status, birth_year, region, country, avatar_url, eula_accepted, privacy_accepted, email_verified, is_fake, is_primal, created_at, last_login_at, expo_push_token, last_platform, last_app_version, ghost_mode, auto_join_clubs, consent_accepted_at, floating_widget_enabled) VALUES ('38b74171-6875-4250-bce6-1531cd63c9db', 'GooglePlayReviewer', 'googlereview@bikerlink.it', NULL, '$2b$12$UPLU4v75/RZ6kGj0AZfKre/KxtyTXwaaL/oKqtZJOT4EfANkkc.SW', 'biker', 'user', 'active', '1991', 'Toscana', 'IT', NULL, true, true, true, false, false, '2026-05-23 07:49:06.321973', NULL, NULL, NULL, NULL, false, true, '2026-05-23 07:49:06.321', true)
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname, email = EXCLUDED.email,
    password = EXCLUDED.password, role = EXCLUDED.role,
    status = EXCLUDED.status, is_fake = EXCLUDED.is_fake,
    last_login_at = EXCLUDED.last_login_at;


-- ── 2. PROFILI ─────────────────────────────────────────────────────
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('5634d5d8-8dff-42d7-8c39-820a70208ce3', '0a87279f-9e78-4d26-b65d-ae0223068886', true, '-1.3965958', '-78.4221138', '50', NULL, '0', '0', '0', '2026-05-06 04:31:02.775', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-06 04:31:02.775', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('f507d38d-bedd-4402-9b3d-ee18c70f50b1', '0b8547dd-ace6-4527-b832-10da477fae10', false, NULL, NULL, '50', NULL, '0', '0', '0', '2026-05-19 17:24:18.2198', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', NULL, 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('e4c32c88-dbf1-4b98-8165-7c369562f256', '0cf64dfb-58c6-4c32-852b-21a66b42d8e2', true, '45.4462085', '12.1607252', '50', NULL, '0', '0', '0', '2026-05-02 14:03:29.996', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-02 14:03:29.996', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('f512211c-1ae8-4e46-a08d-fe588b01a568', '1007965c-b0f6-48aa-a414-6a40370abc48', true, '45.3362678', '11.4246805', '50', NULL, '0', '1', '0', '2026-05-26 22:16:23.881', 'both', NULL, 'carto_dark', false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-26 22:10:01.423', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('aa0de941-a5e7-43a0-af89-fd70ed8ed870', '11c935cd-a140-4239-85e6-81aac3e1fbef', true, '-0.9805433840764962', '-77.66106282058149', '50', NULL, '0', '0', '0', '2026-05-08 19:59:46.785', 'both', NULL, NULL, false, false, true, '13', false, NULL, NULL, NULL, NULL, '2', '2026-05-08 19:59:46.785', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('5f776d5e-ccb7-4023-a20e-b077ec9605ae', '14668fd4-e070-468c-b658-3eb70500a21a', true, '45.4930429', '12.2379601', '50', NULL, '0', '0', '0', '2026-04-30 18:34:05.952', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-04-30 18:30:13.416', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('b68b139d-fc63-4e81-9e03-39e02c476de8', '1fecd15c-1be9-4192-a5e2-e21b8ae2ca12', true, '-0.9962061', '-77.8122228', '50', NULL, '0', '0', '0', '2026-05-07 23:59:47.9', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-07 23:59:47.9', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('caca3e74-8cd7-474d-8c77-12966f27834c', '27d6078d-3f9c-45e2-b902-9dd4bc8ba633', true, '-1.3996292', '-78.4204808', '50', NULL, '0', '0', '0', '2026-05-06 00:28:36.719', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-06 00:28:36.719', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('db4fbf82-0a2e-43cc-81d6-52e9ac4b41dd', '38b74171-6875-4250-bce6-1531cd63c9db', true, '43.7696', '11.2558', '50', 'Account di test per la review di Google Play. Motociclista appassionato con anni di esperienza sulle strade toscane.', '0', '0', '0', '2026-05-23 07:49:06.325572', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', NULL, 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, NULL, '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('16fe0e2d-2d4e-4ec7-8aaf-59f429639979', '3911de14-cded-41ab-a68e-811128330970', false, '45.4925621', '10.2811604', '50', NULL, '0', '0', '0', '2026-05-01 20:42:08.334', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-01 20:42:08.334', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('be4d7dce-8b88-4250-a34c-a8c40998310c', '40690eee-8b31-409d-b462-da7e653f4072', true, '-0.9937681', '-77.8143313', '50', NULL, '0', '0', '0', '2026-05-08 21:11:32.98', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-08 21:11:32.98', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('9aed7709-0973-475f-9a01-98ed2b7a0a75', '53df3ad3-87ac-41b7-9757-a8f057aa3410', true, '-1.3967165', '-78.4222436', '50', NULL, '0', '0', '0', '2026-05-06 19:55:22.226', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-06 19:55:22.226', 'bestForNavigation', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('23536dd1-51ca-48f7-9087-6d879c94f0ba', '57745d2c-ce48-4e8b-9b25-246850aa48c8', false, '45.9642268', '12.7105623', '50', NULL, '0', '0', '0', '2026-05-28 17:54:52.766', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-28 17:54:49.461', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('3a494ed5-4aaa-4091-8455-10b8c000e4cc', '587cf6df-3127-480b-8f74-6d350d837437', true, '45.3362664', '11.4246852', '50', NULL, '44.33484778272879', '2', '0', '2026-05-27 19:28:33.452', 'bikers', NULL, 'carto_light', false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-27 19:28:33.452', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('694624dc-c8d0-40b2-872b-dc8d02cb7d64', '62c2024e-0e87-4a53-a118-21952146e395', true, '45.4346764', '12.1980948', '50', 'So, where''s the party?', '10.537714638421496', '4', '0', '2026-05-29 00:06:16.258', 'both', NULL, 'carto_dark', false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-29 00:06:16.258', 'bestForNavigation', NULL, false, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": false, "clubs": false, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('6bd2c564-968c-4eb8-8e85-4aa4ef4413c9', '63d14222-e80f-481a-a2be-7784e7a397a4', true, '45.43480759584636', '12.19793204107701', '50', NULL, '0', '0', '0', '2026-05-24 21:36:42.488', 'both', NULL, 'carto_light', false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', NULL, 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, NULL, '{"chat": true, "matches": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('556af3e2-9a7a-4bff-94b6-b8b5bbc901bb', '7a0c97de-4c3e-4f8e-b6bb-51bd1a82b7b3', false, '45.5588411185814', '12.233066130032016', '50', NULL, '0', '0', '0', '2026-05-26 11:10:44.967', 'both', NULL, 'esri_gray', false, false, false, '1', true, '45.561266274673656', '12.231806742472381', '45.5588411185814', '12.233066130032016', '2', '2026-05-26 11:10:22.003', 'lowest', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('0aaa7d8f-17f2-4c06-8a92-29ab5eea6dec', '8737773b-79c8-4b10-aeb2-51fa75114986', false, '45.4092283', '11.5422711', '50', NULL, '0.1134817050012593', '1', '0', '2026-05-20 14:17:39.224', 'both', NULL, 'carto_light', false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-20 14:01:02.021', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('cc46c284-4a45-4a23-bc25-11a681ca2413', '887b6b4a-04c9-41c8-9cca-dcde5c61182d', true, '-1.0096549210813817', '-77.89702522389615', '50', NULL, '0', '0', '0', '2026-05-08 07:11:25.161', 'both', NULL, NULL, false, false, true, '11', false, NULL, NULL, NULL, NULL, '2', '2026-05-08 07:11:25.161', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('5575a231-da05-471b-9103-e67d13bd1713', '92ff03b0-4b84-4a5e-a415-25d91939156c', true, '-1.8815898', '-80.7346802', '50', NULL, '0', '0', '0', '2026-05-14 16:28:19.263', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-14 16:28:19.263', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('d33c09a9-d70a-41d7-8aaf-8815c8473234', '935a0b0a-8b42-4496-b6e0-e175da31679a', true, '-0.9991458', '-77.8122347', '50', NULL, '0', '0', '0', '2026-05-07 03:35:47.299', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-07 03:35:01.612', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('267f47ed-5449-4cd5-a262-1da788270dd0', 'b6dbaa06-5090-4246-96a7-9109220fac78', true, '41.87061653926491', '12.598515455775559', '50', NULL, '0', '0', '0', '2026-03-28 20:03:38.184', 'zavorrina', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', NULL, 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, NULL, '{"chat": true, "matches": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('d06d2a9a-1359-48d1-8353-b256bb0655cc', 'bfbe851d-6975-431e-8de9-d61c8ad675dd', true, '43.7696', '11.2558', '50', 'Account di test per la review di Apple. Motociclista appassionato con anni di esperienza sulle strade toscane.', '0', '0', '0', '2026-05-23 07:49:06.049645', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', NULL, 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, NULL, '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('632a219c-cd53-4c24-ae8a-657b2c071261', 'c8efba0d-2abc-426a-a3ef-5cf03cd57fd6', false, '-1.8266863', '-80.7531352', '50', NULL, '0', '0', '0', '2026-05-14 15:34:08.027', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-14 15:34:08.027', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('f4365e7c-0c50-4d8b-a029-084b1dad1747', 'e2d20408-6e11-4055-82f4-90e8596f9f45', true, '-1.4026944', '-78.2997531', '50', NULL, '0', '0', '0', '2026-05-24 14:18:33.62', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', '2026-05-24 14:16:51.404', 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, '{"biker": true, "clubs": true, "events": true, "zavorrina": true}', '{"chat": true, "eventi": true, "matches": true, "motoclub": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_profiles (id, user_id, is_available, latitude, longitude, max_pickup_distance, bio, total_km, total_rides, easter_eggs_collected, updated_at, search_preference, admin_override_until, preferred_map_style, email_chat_notifications, hide_from_map, position_fuzz, position_fuzz_km, fake_home_enabled, home_latitude, home_longitude, fake_home_latitude, fake_home_longitude, fake_home_radius, coordinates_updated_at, gps_precision, units_preference, offline_position_randomize, fake_work_enabled, work_latitude, work_longitude, fake_work_latitude, fake_work_longitude, fake_work_radius, fake_whatever_enabled, whatever_latitude, whatever_longitude, fake_whatever_latitude, fake_whatever_longitude, fake_whatever_radius, last_offline_lat, last_offline_lng, map_filters, notification_preferences, push_notifications_enabled, hide_online_status, hide_last_seen, hide_distance, music_taste_text) VALUES ('9b492479-fee7-4336-9020-c53c99a6960d', 'fa14cdd1-5652-4ad5-a838-0d304f34a963', true, NULL, NULL, '50', NULL, '0', '0', '0', '2026-04-28 11:30:16.206', 'both', NULL, NULL, false, false, false, '1', false, NULL, NULL, NULL, NULL, '2', NULL, 'balanced', NULL, true, false, NULL, NULL, NULL, NULL, '2', false, NULL, NULL, NULL, NULL, '2', NULL, NULL, NULL, '{"chat": true, "matches": true, "zoneProposals": true}', true, false, false, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;

-- ── 3. MOTO ────────────────────────────────────────────────────────
INSERT INTO user_motorcycles (id, user_id, brand, model, year, displacement, motorcycle_type, riding_style, photo_url, created_at, is_for_sale, sale_description, is_default, moto_description) VALUES ('2aac2abf-06f1-47a7-a405-eb0ab1b2f13f', '63d14222-e80f-481a-a2be-7784e7a397a4', 'BMW Motorrad', 'R 1200 GS Adventure', NULL, NULL, 'touring', 'allegra', NULL, '2026-03-26 21:19:10.609964', false, NULL, false, NULL)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO user_motorcycles (id, user_id, brand, model, year, displacement, motorcycle_type, riding_style, photo_url, created_at, is_for_sale, sale_description, is_default, moto_description) VALUES ('70610d7c-4f26-4aaa-92f5-5940bd036fcb', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Suzuki', 'GSF Bandit', NULL, '1200', 'sportiva', 'allegra', NULL, '2026-03-26 21:19:31.916874', false, NULL, true, NULL)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO user_motorcycles (id, user_id, brand, model, year, displacement, motorcycle_type, riding_style, photo_url, created_at, is_for_sale, sale_description, is_default, moto_description) VALUES ('b5a226dd-749d-4819-a619-1a7747e8526e', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Ducati', 'Panigale 959', NULL, NULL, 'supersportiva', 'mozzafiato', NULL, '2026-03-26 21:20:13.399197', false, NULL, false, NULL)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO user_motorcycles (id, user_id, brand, model, year, displacement, motorcycle_type, riding_style, photo_url, created_at, is_for_sale, sale_description, is_default, moto_description) VALUES ('1737b93d-29e1-46dd-8e7a-b443d82cc4e0', 'bfbe851d-6975-431e-8de9-d61c8ad675dd', 'Ducati', 'Monster 937', '2022', '937', NULL, NULL, NULL, '2026-05-23 07:49:06.053799', false, NULL, false, NULL)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO user_motorcycles (id, user_id, brand, model, year, displacement, motorcycle_type, riding_style, photo_url, created_at, is_for_sale, sale_description, is_default, moto_description) VALUES ('ac08b3d9-5f2b-4a44-b738-21c169ccd83c', '38b74171-6875-4250-bce6-1531cd63c9db', 'BMW', 'R 1250 GS', '2023', '1254', NULL, NULL, NULL, '2026-05-23 07:49:06.328971', false, NULL, false, NULL)
  ON CONFLICT (id) DO NOTHING;

-- ── 4. ROTTE CUSTOM ────────────────────────────────────────────────
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('81865dd7-5a9f-484c-a4b4-e5eda18fdfeb', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Circuito del Chianti', 'Percorso generato dallo stress test', '103', true, '2026-03-16 12:36:30.562503', '2026-03-16 12:36:30.722', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('02da78a1-1fcd-4a47-84c0-7db15d8bafba', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Costiera Amalfitana in moto', 'Percorso generato dallo stress test', '158', true, '2026-03-16 12:46:06.802326', '2026-03-16 12:46:06.884', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('d904be29-8326-4cae-b059-4e8c030dbec1', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Grande Raccordo Motard', 'Percorso generato dallo stress test', '158', true, '2026-03-16 12:48:11.387764', '2026-03-16 12:48:11.464', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('6ba82efa-dc7b-4d2f-a2b3-30dd1aae2603', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Stelvio classico', 'Percorso generato dallo stress test', '29', true, '2026-03-16 15:43:25.299395', '2026-03-16 15:43:25.383', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('a9850c19-b7f6-43ba-beda-febbe1276719', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Lago di Bracciano loop', 'Percorso generato dallo stress test', '146', true, '2026-03-16 15:45:31.592971', '2026-03-16 15:45:31.663', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('4aba8637-d131-44c6-bc0e-c32b4d954c60', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Circuito del Chianti', 'Percorso generato dallo stress test', '60', true, '2026-03-16 15:46:24.858937', '2026-03-16 15:46:25.125', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('b2bd85ca-dd58-49f6-93a6-aa98a3ff5070', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Grande Raccordo Motard', 'Percorso generato dallo stress test', '92', true, '2026-03-16 15:49:08.281018', '2026-03-16 15:49:08.352', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('54eec405-1fb1-40e7-a0df-610f7a95249b', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Giro dei Colli Albani', 'Percorso generato dallo stress test', '200', true, '2026-03-16 15:51:07.079186', '2026-03-16 15:51:07.146', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('74a09ffd-b243-44d9-9702-7ba312a1ee79', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Costiera Amalfitana in moto', 'Percorso generato dallo stress test', '73', true, '2026-03-16 15:53:12.465051', '2026-03-16 15:53:12.537', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('4fb09c5e-5a6f-4cde-a362-1a065ab39b11', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Circuito del Chianti', 'Percorso generato dallo stress test', '26', true, '2026-03-16 15:55:17.935005', '2026-03-16 15:55:18.166', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('c9193deb-ea37-444a-80fd-b35fd05a24a4', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Giro dei Colli Albani', 'Percorso generato dallo stress test', '75', true, '2026-03-16 15:56:38.857215', '2026-03-16 15:56:38.941', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('7669739c-c902-4830-8e06-0949614a7ee4', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Lago di Bracciano loop', 'Percorso generato dallo stress test', '33', true, '2026-03-16 16:04:26.669072', '2026-03-16 16:04:26.738', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('6326839b-8893-4c31-8946-e45f3fc462e9', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Roma-Napoli scenic', 'Percorso generato dallo stress test', '215', true, '2026-03-16 16:05:21.079943', '2026-03-16 16:05:21.148', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('a1379034-5da5-461a-bdfd-41c20e9c7212', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Sardegna coast-to-coast', 'Percorso generato dallo stress test', '101', true, '2026-03-16 16:05:53.892094', '2026-03-16 16:05:53.971', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('8b254866-0608-4c17-87a1-05959a737d49', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Costiera Amalfitana in moto', 'Percorso generato dallo stress test', '69', true, '2026-03-16 16:08:11.284811', '2026-03-16 16:08:11.354', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('69603a5b-06fa-498f-b3b9-d8ef656d9688', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Lago di Bracciano loop', 'Percorso generato dallo stress test', '134', true, '2026-03-16 16:09:31.118803', '2026-03-16 16:09:31.212', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('6b9c436e-3811-4b8d-aaab-5b21bc8d7f49', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Grande Raccordo Motard', 'Percorso generato dallo stress test', '191', true, '2026-03-16 16:12:12.018108', '2026-03-16 16:12:12.127', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('aecb728f-c56d-477f-8057-477f58cdb040', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Costiera Amalfitana in moto', 'Percorso generato dallo stress test', '197', true, '2026-03-16 16:13:40.916568', '2026-03-16 16:13:41', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('d9535027-fa52-46ad-bffe-f768954bb638', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Roma-Napoli scenic', 'Percorso generato dallo stress test', '181', true, '2026-03-16 16:17:12.736583', '2026-03-16 16:17:12.825', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('b527792f-6d97-449a-bbdd-5469dd16e1f0', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Sardegna coast-to-coast', 'Percorso generato dallo stress test', '169', true, '2026-03-16 16:19:59.386896', '2026-03-16 16:19:59.474', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('fae40c23-6a33-4a43-af05-003de2bc452c', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Lago di Bracciano loop', 'Percorso generato dallo stress test', '99', true, '2026-03-16 16:21:36.716385', '2026-03-16 16:21:36.787', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('e353d302-245c-4266-8ce0-e161d9e48a0f', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Lago di Bracciano loop', 'Percorso generato dallo stress test', '49', true, '2026-03-16 16:25:01.098819', '2026-03-16 16:25:01.183', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('69bd9400-7727-4267-86fb-5dc04354c694', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Grande Raccordo Motard', 'Percorso generato dallo stress test', '140', true, '2026-03-16 16:25:35.739547', '2026-03-16 16:25:35.841', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('d4e8cc2e-28b4-4960-8e1e-00d958ff7118', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Lago di Bracciano loop', 'Percorso generato dallo stress test', '118', true, '2026-03-16 16:27:00.7214', '2026-03-16 16:27:00.811', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('69f48f25-0386-4904-a79e-48e51456527b', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Sardegna coast-to-coast', 'Percorso generato dallo stress test', '103', true, '2026-03-16 16:27:49.679019', '2026-03-16 16:27:49.792', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('850e77e2-07df-419f-a4da-4378183a5cdc', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Grande Raccordo Motard', 'Percorso generato dallo stress test', '68', true, '2026-03-16 16:29:38.726032', '2026-03-16 16:29:38.795', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('26b366d3-2e73-4fa9-b73a-1f8b98e2d49d', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Appennino Tosco-Emiliano', 'Percorso generato dallo stress test', '165', true, '2026-03-16 16:33:03.030402', '2026-03-16 16:33:03.106', 'public')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO custom_routes (id, user_id, title, description, total_distance_km, is_public, created_at, updated_at, visibility) VALUES ('226d04e0-58d9-4ee4-b242-fc7055677922', '63d14222-e80f-481a-a2be-7784e7a397a4', 'Appennino Tosco-Emiliano', 'Percorso generato dallo stress test', '167', true, '2026-03-16 16:34:36.515158', '2026-03-16 16:34:36.692', 'public')
  ON CONFLICT (id) DO NOTHING;

-- ── 5. WAYPOINTS ───────────────────────────────────────────────────
-- Nessun waypoint reale nel backup (custom_route_waypoints vuota per queste
-- rotte). La INSERT generata dall'export era malformata e qui rimossa.
