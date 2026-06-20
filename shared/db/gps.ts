import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  real,
  bigint,
  serial,
  pgEnum,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const coordinateHistory = pgTable("coordinate_history", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  slot: integer("slot").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("coordinate_history_user_id_idx").on(table.userId),
  index("coordinate_history_created_at_idx").on(table.createdAt),
]);

export const arcadeGameEnum = pgEnum("arcade_game", [
  "endless_biker",
  "traffic_racer",
  "wheelie",
  "tetris",
  "space_invaders",
]);

export const arcadeScores = pgTable("arcade_scores", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  game: arcadeGameEnum("game").notNull(),
  score: integer("score").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("arcade_scores_user_game_idx").on(table.userId, table.game),
]);

export const gpsErrors = pgTable("gps_errors", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "cascade" }),
  routeId: varchar("route_id", { length: 36 }),
  platform: varchar("platform", { length: 20 }),
  osVersion: varchar("os_version", { length: 50 }),
  context: varchar("context", { length: 200 }),
  errorMessage: text("error_message"),
  stackTrace: text("stack_trace"),
  speedKmh: doublePrecision("speed_kmh"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("gps_errors_user_id_idx").on(table.userId),
  index("gps_errors_created_at_idx").on(table.createdAt),
]);

export const gpsRejectionStats = pgTable("gps_rejection_stats", {
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceId: varchar("device_id", { length: 128 }).notNull().default("unknown"),
  platform: varchar("platform", { length: 20 }),
  rejectionCount: integer("rejection_count").notNull().default(0),
  lastRejectedPayload: text("last_rejected_payload"),
  lastRejectedAt: timestamp("last_rejected_at").notNull().defaultNow(),
  lastSource: varchar("last_source", { length: 20 }),
}, (table) => [
  primaryKey({ columns: [table.userId, table.deviceId], name: "gps_rejection_stats_pk" }),
  index("gps_rejection_stats_count_idx").on(table.rejectionCount),
  index("gps_rejection_stats_at_idx").on(table.lastRejectedAt),
]);

export const rideTelemetry = pgTable("ride_telemetry", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id", { length: 36 }).notNull(),
  sessionType: varchar("session_type", { length: 10 }).notNull().default("ride"),
  lapName: varchar("lap_name", { length: 60 }),
  ts: bigint("ts", { mode: "number" }).notNull(),
  lat: doublePrecision("lat"),
  lon: doublePrecision("lon"),
  speedKmh: real("speed_kmh"),
  leanAngle: real("lean_angle"),
  gforceX: real("gforce_x"),
  gforceY: real("gforce_y"),
  gforceZ: real("gforce_z"),
  heading: real("heading"),
  altitudeM: real("altitude_m"),
  matched: boolean("matched").notNull().default(false),
  // Stato di re-processabilità del map-matching (Task #4589):
  //   pending | retry | matched | unmatchable
  // `matched` (legacy) resta sincronizzato: true solo quando matchStatus = 'matched'.
  matchStatus: varchar("match_status", { length: 12 }).notNull().default("pending"),
  matchAttempts: integer("match_attempts").notNull().default(0),
  lastMatchAttemptAt: timestamp("last_match_attempt_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("ride_telemetry_user_id_idx").on(table.userId),
  index("ride_telemetry_session_id_idx").on(table.sessionId),
  index("ride_telemetry_ts_idx").on(table.ts),
  index("ride_telemetry_match_status_idx").on(table.matchStatus),
]);

export const segmentTelemetry = pgTable("segment_telemetry", {
  osmWayId: bigint("osm_way_id", { mode: "number" }).primaryKey(),
  avgLeanAngle: doublePrecision("avg_lean_angle"),
  maxLeanAngle: doublePrecision("max_lean_angle"),
  avgGforce: doublePrecision("avg_gforce"),
  sampleCount: integer("sample_count").notNull().default(0),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  curvyScore: doublePrecision("curvy_score"),
}, (table) => [
  index("segment_telemetry_curvy_score_idx").on(table.curvyScore),
]);

/**
 * Task #3393 — Telemetry Affinity: profilo aggregato per-utente.
 *
 * Alimentato da `ride_telemetry` (solo session_type != 'ideal_lap') dal job
 * `aggregate-telemetry-profiles.ts`. Cattura il "carattere di guida" dell'utente
 * in statistiche aggregate + bucket discreti usati dal matcher telemetry-affinity.
 * `dataQuality` (= totalSessions) è il gate per la soglia minima (≥5 sessioni).
 */
export const userTelemetryProfile = pgTable("user_telemetry_profile", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  totalSessions: integer("total_sessions").notNull().default(0),
  totalKm: doublePrecision("total_km").notNull().default(0),
  avgSpeedKmh: doublePrecision("avg_speed_kmh").notNull().default(0),
  p75SpeedKmh: doublePrecision("p75_speed_kmh").notNull().default(0),
  avgLeanAngle: doublePrecision("avg_lean_angle").notNull().default(0),
  maxLeanAvg: doublePrecision("max_lean_avg").notNull().default(0),
  avgDurationMin: doublePrecision("avg_duration_min").notNull().default(0),
  fractionMorning: doublePrecision("fraction_morning").notNull().default(0),
  fractionEvening: doublePrecision("fraction_evening").notNull().default(0),
  speedBucket: varchar("speed_bucket", { length: 10 }).notNull().default("medium"),
  leanBucket: varchar("lean_bucket", { length: 10 }).notNull().default("touring"),
  durationBucket: varchar("duration_bucket", { length: 10 }).notNull().default("medium"),
  dataQuality: integer("data_quality").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("user_telemetry_profile_data_quality_idx").on(table.dataQuality),
  index("user_telemetry_profile_buckets_idx").on(table.speedBucket, table.leanBucket),
]);

export type UserTelemetryProfile = typeof userTelemetryProfile.$inferSelect;
export type InsertUserTelemetryProfile = typeof userTelemetryProfile.$inferInsert;

export type CoordinateHistory = typeof coordinateHistory.$inferSelect;
export type InsertCoordinateHistory = typeof coordinateHistory.$inferInsert;
export type ArcadeScore = typeof arcadeScores.$inferSelect;
export type InsertArcadeScore = typeof arcadeScores.$inferInsert;
export type GpsError = typeof gpsErrors.$inferSelect;
export type InsertGpsError = typeof gpsErrors.$inferInsert;
export type GpsRejectionStat = typeof gpsRejectionStats.$inferSelect;
export type InsertGpsRejectionStat = typeof gpsRejectionStats.$inferInsert;
export type RideTelemetry = typeof rideTelemetry.$inferSelect;
export type InsertRideTelemetry = typeof rideTelemetry.$inferInsert;
export type SegmentTelemetry = typeof segmentTelemetry.$inferSelect;
export type InsertSegmentTelemetry = typeof segmentTelemetry.$inferInsert;
