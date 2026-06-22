import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  timestamp,
  index,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const serverRestarts = pgTable("server_restarts", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  reason: varchar("reason", { length: 50 }).notNull().default("restart"),
});
export type ServerRestart = typeof serverRestarts.$inferSelect;
export type InsertServerRestart = typeof serverRestarts.$inferInsert;

export const abExperiments = pgTable("ab_experiments", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 100 }).notNull().unique(),
  description: text("description"),
  variants: jsonb("variants").$type<Array<{ name: string; weight: number; config?: Record<string, unknown> }>>().notNull(),
  status: varchar("status", { length: 20 }).notNull().default("running"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("ab_experiments_status_idx").on(table.status),
]);
export type AbExperiment = typeof abExperiments.$inferSelect;
export type InsertAbExperiment = typeof abExperiments.$inferInsert;

export const abAssignments = pgTable("ab_assignments", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experimentKey: varchar("experiment_key", { length: 100 }).notNull(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  variant: varchar("variant", { length: 60 }).notNull(),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
}, (table) => [
  index("ab_assignments_exp_user_idx").on(table.experimentKey, table.userId),
  index("ab_assignments_exp_variant_idx").on(table.experimentKey, table.variant),
]);
export type AbAssignment = typeof abAssignments.$inferSelect;
export type InsertAbAssignment = typeof abAssignments.$inferInsert;

export const abEvents = pgTable("ab_events", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experimentKey: varchar("experiment_key", { length: 100 }).notNull(),
  variant: varchar("variant", { length: 60 }).notNull(),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  eventName: varchar("event_name", { length: 60 }).notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("ab_events_exp_variant_event_idx").on(table.experimentKey, table.variant, table.eventName),
  index("ab_events_created_at_idx").on(table.createdAt),
]);
export type AbEvent = typeof abEvents.$inferSelect;
export type InsertAbEvent = typeof abEvents.$inferInsert;

export const mapsQuota = pgTable("maps_quota", {
  providerId: varchar("provider_id", { length: 100 }).notNull(),
  yearMonth: varchar("year_month", { length: 7 }).notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  { primaryKey: [table.providerId, table.yearMonth] },
  index("maps_quota_provider_idx").on(table.providerId),
]);
export type MapsQuota = typeof mapsQuota.$inferSelect;
export type InsertMapsQuota = typeof mapsQuota.$inferInsert;

export const deviceMetrics = pgTable("device_metrics", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  platform: varchar("platform", { length: 16 }),
  memoryUsedMb: integer("memory_used_mb"),
  memoryTotalMb: integer("memory_total_mb"),
  batteryLevel: integer("battery_level"),
  batteryState: varchar("battery_state", { length: 20 }),
  appUptimeSeconds: integer("app_uptime_seconds"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
}, (table) => [
  index("device_metrics_user_id_idx").on(table.userId),
  index("device_metrics_recorded_at_idx").on(table.recordedAt),
]);
export type DeviceMetric = typeof deviceMetrics.$inferSelect;
export type InsertDeviceMetric = typeof deviceMetrics.$inferInsert;

export const resourceSamples = pgTable("resource_samples", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sampledAt: timestamp("sampled_at").notNull().defaultNow(),
  avgRamPct: integer("avg_ram_pct"),
  avgBatteryPct: integer("avg_battery_pct"),
  avgIosRamPct: integer("avg_ios_ram_pct"),
  avgAndroidRamPct: integer("avg_android_ram_pct"),
  onlineUsers: integer("online_users"),
  dbSizeMb: integer("db_size_mb"),
  backendRssMb: integer("backend_rss_mb"),
}, (table) => [
  index("resource_samples_sampled_at_idx").on(table.sampledAt),
]);
export type ResourceSample = typeof resourceSamples.$inferSelect;
export type InsertResourceSample = typeof resourceSamples.$inferInsert;

export const thinkcentreHealthEvents = pgTable("thinkcentre_health_events", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  serviceKey: varchar("service_key", { length: 30 }),
  transitionFrom: varchar("transition_from", { length: 20 }).notNull(),
  transitionTo: varchar("transition_to", { length: 20 }).notNull(),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
}, (table) => [
  index("thinkcentre_health_events_occurred_at_idx").on(table.occurredAt),
  index("thinkcentre_health_events_service_key_idx").on(table.serviceKey),
]);
export type ThinkcentreHealthEvent = typeof thinkcentreHealthEvents.$inferSelect;
export type InsertThinkcentreHealthEvent = typeof thinkcentreHealthEvents.$inferInsert;
