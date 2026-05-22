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
  pgEnum,
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
  accuracy: doublePrecision("accuracy"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
}, (table) => [
  index("coordinate_history_user_id_idx").on(table.userId),
  index("coordinate_history_recorded_at_idx").on(table.recordedAt),
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
  extras: text("extras"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("arcade_scores_user_game_idx").on(table.userId, table.game),
]);

export const gpsErrors = pgTable("gps_errors", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  errorMessage: text("error_message").notNull(),
  stackTrace: text("stack_trace"),
  otaNumber: integer("ota_number"),
  timestamp: varchar("timestamp", { length: 40 }),
  platform: varchar("platform", { length: 20 }),
  deviceName: varchar("device_name", { length: 100 }),
  osVersion: varchar("os_version", { length: 40 }),
  context: varchar("context", { length: 100 }),
  routeId: varchar("route_id", { length: 36 }),
  speedKmh: doublePrecision("speed_kmh"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("gps_errors_user_id_idx").on(table.userId),
  index("gps_errors_created_at_idx").on(table.createdAt),
]);

export const gpsRejectionStats = pgTable("gps_rejection_stats", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  routeId: varchar("route_id", { length: 36 }),
  rejectionType: varchar("rejection_type", { length: 50 }).notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  speedKmh: doublePrecision("speed_kmh"),
  accelG: doublePrecision("accel_g"),
  tiltDeg: doublePrecision("tilt_deg"),
  rejectedAt: timestamp("rejected_at").notNull().defaultNow(),
}, (table) => [
  index("gps_rejection_stats_user_id_idx").on(table.userId),
  index("gps_rejection_stats_route_id_idx").on(table.routeId),
]);

export const rideTelemetry = pgTable("ride_telemetry", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  routeId: varchar("route_id", { length: 36 }),
  recordedAt: timestamp("recorded_at").notNull(),
  latDeg: doublePrecision("lat_deg"),
  lngDeg: doublePrecision("lng_deg"),
  altM: real("alt_m"),
  speedKmh: real("speed_kmh"),
  accelLateralG: real("accel_lateral_g"),
  accelLongG: real("accel_long_g"),
  accelVertG: real("accel_vert_g"),
  leanDeg: real("lean_deg"),
  headingDeg: real("heading_deg"),
  gpsAccuracyM: real("gps_accuracy_m"),
  sampledAt: timestamp("sampled_at").notNull().defaultNow(),
}, (table) => [
  index("ride_telemetry_user_id_idx").on(table.userId),
  index("ride_telemetry_route_id_idx").on(table.routeId),
  index("ride_telemetry_recorded_at_idx").on(table.recordedAt),
]);

export const segmentTelemetry = pgTable("segment_telemetry", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  routeId: varchar("route_id", { length: 36 }),
  segmentStartAt: timestamp("segment_start_at").notNull(),
  segmentEndAt: timestamp("segment_end_at").notNull(),
  distanceKm: real("distance_km"),
  durationSeconds: integer("duration_seconds"),
  avgSpeedKmh: real("avg_speed_kmh"),
  maxSpeedKmh: real("max_speed_kmh"),
  avgLeanDeg: real("avg_lean_deg"),
  maxLeanDeg: real("max_lean_deg"),
  maxAccelLateralG: real("max_accel_lateral_g"),
  maxAccelLongG: real("max_accel_long_g"),
  altGainM: real("alt_gain_m"),
  altLossM: real("alt_loss_m"),
  curvyScore: real("curvy_score"),
  totalPoints: bigint("total_points", { mode: "number" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("segment_telemetry_user_id_idx").on(table.userId),
  index("segment_telemetry_route_id_idx").on(table.routeId),
]);

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
