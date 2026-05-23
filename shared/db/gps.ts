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
  ts: bigint("ts", { mode: "number" }).notNull(),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  speedKmh: real("speed_kmh"),
  leanAngle: real("lean_angle"),
  gforceX: real("gforce_x"),
  gforceY: real("gforce_y"),
  gforceZ: real("gforce_z"),
  heading: real("heading"),
  altitudeM: real("altitude_m"),
  matched: boolean("matched").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("ride_telemetry_user_id_idx").on(table.userId),
  index("ride_telemetry_session_id_idx").on(table.sessionId),
  index("ride_telemetry_ts_idx").on(table.ts),
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
