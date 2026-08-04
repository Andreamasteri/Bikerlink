-- migrate:no-transaction
--
-- 0152 — Reconcile Dev-originated indexes and constraints
--
-- Dev is the schema source of truth. Candidate and Production already have
-- the same migration ledger (186 entries) but are missing these structural
-- objects. All statements are idempotent; no rows are updated or deleted.
-- Indexes are built concurrently to minimize write blocking.

-- Candidate and Production currently carry a non-unique legacy index with this
-- name, while Dev enforces uniqueness on (hazard_id, user_id). The preflight
-- audit found the table empty in both target environments, so rebuilding it
-- concurrently is safe and makes the Dev invariant explicit.
DROP INDEX CONCURRENTLY IF EXISTS public.road_hazard_confirms_unique_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY road_hazard_confirms_unique_idx
  ON public.road_hazard_confirms USING btree (hazard_id, user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_ab_assignments_user_id ON public.ab_assignments USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_ab_events_user_id ON public.ab_events USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_arcade_scores_user_id ON public.arcade_scores USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_collected_easter_eggs_user_id ON public.collected_easter_eggs USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_daily_push_counts_user_id ON public.daily_push_counts USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_daily_vote_counts_user_id ON public.daily_vote_counts USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_email_verification_tokens_user_id ON public.email_verification_tokens USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_feedback_tickets_user_id ON public.feedback_tickets USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_gps_rejection_stats_user_id ON public.gps_rejection_stats USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_invitation_codes_created_by ON public.invitation_codes USING btree (created_by);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_invitation_codes_used_by ON public.invitation_codes USING btree (used_by);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_match_feedback_other_user_id ON public.match_feedback USING btree (other_user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_match_feedback_user_id ON public.match_feedback USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_match_notification_deliveries_user_id ON public.match_notification_deliveries USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_moto_club_requests_requested_by ON public.moto_club_requests USING btree (requested_by);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_moto_club_requests_reviewed_by ON public.moto_club_requests USING btree (reviewed_by);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_moto_clubs_created_by ON public.moto_clubs USING btree (created_by);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_moto_clubs_proposed_by ON public.moto_clubs USING btree (proposed_by);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_ota_releases_approved_by ON public.ota_releases USING btree (approved_by);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_ota_releases_rejected_by ON public.ota_releases USING btree (rejected_by);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_ota_watchdog_reports_triggered_by ON public.ota_watchdog_reports USING btree (triggered_by);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_photo_votes_user_id ON public.photo_votes USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_photo_winners_user_id ON public.photo_winners USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_planned_route_invites_owner_id ON public.planned_route_invites USING btree (owner_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_proposal_participants_user_id ON public.proposal_participants USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_proposal_zone_notifications_user_id ON public.proposal_zone_notifications USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_reports_resolved_by ON public.reports USING btree (resolved_by);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_road_hazard_comments_user_id ON public.road_hazard_comments USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_road_hazard_confirms_user_id ON public.road_hazard_confirms USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_sos_requests_helper_id ON public.sos_requests USING btree (helper_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_user_curvy_profile_user_id ON public.user_curvy_profile USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_user_favorites_favorite_user_id ON public.user_favorites USING btree (favorite_user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_user_lastfm_sessions_user_id ON public.user_lastfm_sessions USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_user_match_profile_user_id ON public.user_match_profile USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_user_music_tokens_user_id ON public.user_music_tokens USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_user_playlist_snapshots_user_id ON public.user_playlist_snapshots USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_verification_codes_user_id ON public.verification_codes USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_weekly_recaps_user_id ON public.weekly_recaps USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_workshop_contacts_user_id ON public.workshop_contacts USING btree (user_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fk_zavorrina_wishlists_user_id ON public.zavorrina_wishlists USING btree (user_id);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.maps_quota'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.maps_quota
      ADD CONSTRAINT maps_quota_pkey PRIMARY KEY (provider_id, year_month);
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.route_weather_cache'::regclass
      AND conname = 'route_weather_cache_route_id_planned_routes_id_fk'
  ) THEN
    ALTER TABLE public.route_weather_cache
      ADD CONSTRAINT route_weather_cache_route_id_planned_routes_id_fk
      FOREIGN KEY (route_id) REFERENCES public.planned_routes(id) ON DELETE CASCADE;
  END IF;
END
$$;
