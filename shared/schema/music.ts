import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  integer,
  timestamp,
  jsonb,
  text,
  serial,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const userMusicTokens = pgTable("user_music_tokens", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  providerUserId: varchar("provider_user_id", { length: 200 }).notNull(),
  displayName: varchar("display_name", { length: 200 }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
  lastSyncAt: timestamp("last_sync_at"),
});

export const userMusicTracks = pgTable("user_music_tracks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lastfmTrackId: varchar("lastfm_track_id", { length: 200 }).notNull(),
  trackName: varchar("track_name", { length: 500 }).notNull(),
  artistId: varchar("artist_id", { length: 200 }).notNull(),
  artistName: varchar("artist_name", { length: 300 }).notNull(),
  albumName: varchar("album_name", { length: 500 }),
  imageUrl: varchar("image_url", { length: 500 }),
  genres: text("genres").array().default([]),
  popularity: integer("popularity").default(0),
  provider: varchar("provider", { length: 20 }).notNull().default("lastfm"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_track_uniq").on(table.userId, table.lastfmTrackId, table.provider),
  index("user_music_tracks_user_idx").on(table.userId),
]);

export const userLastfmSessions = pgTable("user_lastfm_sessions", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  lastfmUsername: varchar("lastfm_username", { length: 200 }).notNull(),
  sessionKey: varchar("session_key", { length: 500 }).notNull(),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
});

export const userPlaylistSnapshots = pgTable("user_playlist_snapshots", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  tracksJson: jsonb("tracks_json").notNull(),
  savedAt: timestamp("saved_at").notNull().defaultNow(),
});

export type UserMusicToken = typeof userMusicTokens.$inferSelect;
export type InsertUserMusicToken = typeof userMusicTokens.$inferInsert;
export type UserMusicTrack = typeof userMusicTracks.$inferSelect;
export type InsertUserMusicTrack = typeof userMusicTracks.$inferInsert;
export type UserLastfmSession = typeof userLastfmSessions.$inferSelect;
export type InsertUserLastfmSession = typeof userLastfmSessions.$inferInsert;
export type UserPlaylistSnapshot = typeof userPlaylistSnapshots.$inferSelect;
export type InsertUserPlaylistSnapshot = typeof userPlaylistSnapshots.$inferInsert;
