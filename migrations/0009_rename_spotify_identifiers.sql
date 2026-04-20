-- Rename legacy Spotify-era table and column to provider-neutral names
-- Table: user_spotify_tokens → user_music_tokens
-- Column: user_music_tracks.spotify_track_id → lastfm_track_id

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_spotify_tokens'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_music_tokens'
  ) THEN
    ALTER TABLE "user_spotify_tokens" RENAME TO "user_music_tokens";
  END IF;
END $$;

--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_music_tracks' AND column_name = 'spotify_track_id'
  ) THEN
    ALTER TABLE "user_music_tracks" RENAME COLUMN "spotify_track_id" TO "lastfm_track_id";
  END IF;
END $$;

--> statement-breakpoint

-- Recreate unique index with new column name (drop old name if still present)
DROP INDEX IF EXISTS "user_track_uniq";

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "user_track_uniq" ON "user_music_tracks" ("user_id", "lastfm_track_id", "provider");

--> statement-breakpoint

-- Normalize legacy snapshot JSON: rename spotifyTrackId key → lastfmTrackId in existing rows
UPDATE "user_playlist_snapshots"
SET tracks_json = (
  SELECT jsonb_agg(
    CASE
      WHEN elem ? 'spotifyTrackId'
      THEN jsonb_set(elem - 'spotifyTrackId', '{lastfmTrackId}', elem->'spotifyTrackId')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(tracks_json) AS elem
)
WHERE tracks_json::text LIKE '%spotifyTrackId%';
