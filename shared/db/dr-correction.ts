import {
  pgTable,
  varchar,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  bigint,
  serial,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * DR Correction Engine data model (Task #47).
 *
 * These tables back the deterministic dead-reckoning correction engine (NOT an
 * AI/LLM agent, unrelated to the routing-health "Horus" modules). They store the
 * GPS-vs-dead-reckoning deviations observed when GPS recovers after a blackout,
 * the per-user correction model learned from them, and a global cross-user
 * aggregate used to bootstrap users with little data.
 */

/**
 * Per-session/user deviation log. One row per confirmed GPS recovery (after the
 * client has seen RECOVERY_FIXES_REQUIRED coherent fixes). `isTest` marks rows
 * produced by test/synthetic users so they can be excluded from global aggregates.
 */
export const drDeviationSamples = pgTable("dr_deviation_samples", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  blackoutMs: bigint("blackout_ms", { mode: "number" }).notNull().default(0),
  drDistanceKm: doublePrecision("dr_distance_km").notNull().default(0),
  gpsDistanceKm: doublePrecision("gps_distance_km").notNull().default(0),
  posErrorM: doublePrecision("pos_error_m").notNull().default(0),
  estSpeedKmh: doublePrecision("est_speed_kmh").notNull().default(0),
  obsSpeedKmh: doublePrecision("obs_speed_kmh").notNull().default(0),
  speedErrorKmh: doublePrecision("speed_error_kmh").notNull().default(0),
  headingErrorDeg: doublePrecision("heading_error_deg"),
  recoveryAccuracyM: doublePrecision("recovery_accuracy_m").notNull().default(0),
  recoveryFixCount: integer("recovery_fix_count").notNull().default(0),
  isTest: boolean("is_test").notNull().default(false),
}, (table) => [
  index("dr_deviation_samples_user_idx").on(table.userId),
  index("dr_deviation_samples_recorded_idx").on(table.recordedAt),
  index("dr_deviation_samples_user_recorded_idx").on(table.userId, table.recordedAt),
]);

/**
 * Per-user correction model. Updated in REAL TIME on each ingestion batch (the
 * user's own model is a cheap median over their samples). `isTest` mirrors the
 * user's test/synthetic status so admin views can flag it.
 */
export const drCorrectionModel = pgTable("dr_correction_model", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  distanceScale: doublePrecision("distance_scale").notNull().default(1),
  speedScale: doublePrecision("speed_scale").notNull().default(1),
  speedBiasKmh: doublePrecision("speed_bias_kmh").notNull().default(0),
  headingBiasDeg: doublePrecision("heading_bias_deg").notNull().default(0),
  sampleCount: integer("sample_count").notNull().default(0),
  meanPosErrorM: doublePrecision("mean_pos_error_m").notNull().default(0),
  meanSpeedErrorKmh: doublePrecision("mean_speed_error_kmh").notNull().default(0),
  dataQuality: integer("data_quality").notNull().default(0),
  isTest: boolean("is_test").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("dr_correction_model_data_quality_idx").on(table.dataQuality),
  index("dr_correction_model_updated_idx").on(table.updatedAt),
]);

/**
 * Global cross-user correction aggregate. Singleton row keyed `id='global'`,
 * refreshed by a PERIODIC job (not per-ingestion) since it must scan all
 * non-test users. Used to bootstrap the blended model of users with few samples.
 */
export const drCorrectionGlobal = pgTable("dr_correction_global", {
  id: varchar("id", { length: 16 }).primaryKey().default("global"),
  distanceScale: doublePrecision("distance_scale").notNull().default(1),
  speedScale: doublePrecision("speed_scale").notNull().default(1),
  speedBiasKmh: doublePrecision("speed_bias_kmh").notNull().default(0),
  headingBiasDeg: doublePrecision("heading_bias_deg").notNull().default(0),
  sampleCount: integer("sample_count").notNull().default(0),
  contributingUsers: integer("contributing_users").notNull().default(0),
  meanPosErrorM: doublePrecision("mean_pos_error_m").notNull().default(0),
  meanSpeedErrorKmh: doublePrecision("mean_speed_error_kmh").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DrDeviationSampleRow = typeof drDeviationSamples.$inferSelect;
export type InsertDrDeviationSample = typeof drDeviationSamples.$inferInsert;
export type DrCorrectionModelRow = typeof drCorrectionModel.$inferSelect;
export type InsertDrCorrectionModel = typeof drCorrectionModel.$inferInsert;
export type DrCorrectionGlobalRow = typeof drCorrectionGlobal.$inferSelect;
export type InsertDrCorrectionGlobal = typeof drCorrectionGlobal.$inferInsert;
