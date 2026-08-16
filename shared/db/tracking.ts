import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  index,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";

export const routes = pgTable("routes", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }),
  trackingFrequency: integer("tracking_frequency").notNull().default(5),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  totalDistanceKm: doublePrecision("total_distance_km").default(0),
  maxSpeedKmh: doublePrecision("max_speed_kmh").default(0),
  avgSpeedKmh: doublePrecision("avg_speed_kmh").default(0),
  maxAltitude: doublePrecision("max_altitude").default(0),
  durationSeconds: integer("duration_seconds").default(0),
  idleTimeSeconds: integer("idle_time_seconds").default(0),
  maxTiltDeg: doublePrecision("max_tilt_deg"),
  maxAccelerationG: doublePrecision("max_acceleration_g"),
  maxDecelerationG: doublePrecision("max_deceleration_g"),
  maxLateralG: doublePrecision("max_lateral_g"),
  isSprint: boolean("is_sprint").notNull().default(false),
  sprint0to100Ms: integer("sprint_0to100_ms"),
  gpsBlackoutCount: integer("gps_blackout_count").notNull().default(0),
  gpsBlackoutSeconds: integer("gps_blackout_seconds").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  // An armed automatic-start session has not started measuring yet. Keep the
  // actual measurement timestamp null until the movement gate is confirmed.
  startedAt: timestamp("started_at").defaultNow(),
  stoppedAt: timestamp("stopped_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("routes_user_id_idx").on(table.userId),
]);

export const sprintResults = pgTable("sprint_results", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  routeId: varchar("route_id", { length: 36 })
    .references(() => routes.id, { onDelete: "set null" }),
  sprint0to100Ms: integer("sprint_0to100_ms").notNull(),
  maxAccelerationG: doublePrecision("max_acceleration_g"),
  maxDecelerationG: doublePrecision("max_deceleration_g"),
  maxTiltDeg: doublePrecision("max_tilt_deg"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("sprint_results_user_id_idx").on(table.userId),
]);

export const routePoints = pgTable("route_points", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  routeId: varchar("route_id", { length: 36 })
    .notNull()
    .references(() => routes.id, { onDelete: "cascade" }),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  altitude: doublePrecision("altitude"),
  speedKmh: doublePrecision("speed_kmh"),
  accelG: doublePrecision("accel_g"),
  tiltDeg: doublePrecision("tilt_deg"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => [
  index("route_points_route_id_idx").on(table.routeId),
]);

export const customRoutes = pgTable("custom_routes", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  totalDistanceKm: doublePrecision("total_distance_km").default(0),
  isPublic: boolean("is_public").notNull().default(true),
  visibility: varchar("visibility", { length: 20 }).notNull().default("public"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("custom_routes_user_id_idx").on(table.userId),
]);

export const customRouteWaypoints = pgTable("custom_route_waypoints", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  routeId: varchar("route_id", { length: 36 })
    .notNull()
    .references(() => customRoutes.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  waypointType: varchar("waypoint_type", { length: 20 }).notNull().default("stop"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("custom_route_waypoints_route_id_idx").on(table.routeId),
]);

export const routeVoiceNotes = pgTable("route_voice_notes", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  routeId: varchar("route_id", { length: 36 })
    .notNull()
    .references(() => routes.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("route_voice_notes_route_id_idx").on(table.routeId),
]);

export type RouteVoiceNote = typeof routeVoiceNotes.$inferSelect;
export type InsertRouteVoiceNote = typeof routeVoiceNotes.$inferInsert;

export type Route = typeof routes.$inferSelect;
export type InsertRoute = typeof routes.$inferInsert;
export type SprintResult = typeof sprintResults.$inferSelect;
export type InsertSprintResult = typeof sprintResults.$inferInsert;
export type RoutePoint = typeof routePoints.$inferSelect;
export type InsertRoutePoint = typeof routePoints.$inferInsert;
export type CustomRoute = typeof customRoutes.$inferSelect;
export type InsertCustomRoute = typeof customRoutes.$inferInsert;
export type CustomRouteWaypoint = typeof customRouteWaypoints.$inferSelect;
export type InsertCustomRouteWaypoint = typeof customRouteWaypoints.$inferInsert;

export const createRouteSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  trackingFrequency: z.number().int().min(1).max(60).optional(),
  isSprint: z.boolean().optional(),
  status: z.enum(["active", "armed"]).optional(),
});
export type CreateRouteInput = z.infer<typeof createRouteSchema>;

export const routePointSchema = z.object({
  latitude: z.number().finite("Latitudine non valida"),
  longitude: z.number().finite("Longitudine non valida"),
  altitude: z.number().optional().nullable(),
  speedKmh: z.number().optional().nullable(),
  accelG: z.number().optional().nullable(),
  tiltDeg: z.number().optional().nullable(),
  timestamp: z.string().optional().nullable(),
});
export type RoutePointInput = z.infer<typeof routePointSchema>;

export const addRoutePointsSchema = z.object({
  points: z.array(routePointSchema).min(1, "Nessun punto GPS fornito"),
});
export type AddRoutePointsInput = z.infer<typeof addRoutePointsSchema>;

export const stopRouteSchema = z.object({
  totalDistanceKm: z.number().optional(),
  maxSpeedKmh: z.number().optional(),
  avgSpeedKmh: z.number().optional(),
  maxAltitude: z.number().optional(),
  durationSeconds: z.number().optional(),
  idleTimeSeconds: z.number().optional(),
  maxTiltDeg: z.number().optional().nullable(),
  maxAccelerationG: z.number().optional().nullable(),
  maxDecelerationG: z.number().optional().nullable(),
  maxLateralG: z.number().optional().nullable(),
  sprint0to100Ms: z.number().optional().nullable(),
  gpsBlackoutCount: z.number().optional(),
  gpsBlackoutSeconds: z.number().optional(),
});
export type StopRouteInput = z.infer<typeof stopRouteSchema>;

export const routeStatsSchema = z.object({
  totalDistanceKm: z.number().optional(),
  maxSpeedKmh: z.number().optional(),
  avgSpeedKmh: z.number().optional(),
  maxAltitude: z.number().optional(),
  idleTimeSeconds: z.number().optional(),
});
export type RouteStatsInput = z.infer<typeof routeStatsSchema>;

export const updateRouteTitleSchema = z.object({
  title: z.string().min(1, "Titolo obbligatorio").max(200),
});
export type UpdateRouteTitleInput = z.infer<typeof updateRouteTitleSchema>;

export const createSprintSchema = z.object({
  sprint0to100Ms: z.number().finite().positive("Tempo sprint non valido"),
  maxAccelerationG: z.number().finite().optional().nullable(),
  maxDecelerationG: z.number().finite().optional().nullable(),
  maxTiltDeg: z.number().finite().optional().nullable(),
  routeId: z.string().optional().nullable(),
});
export type CreateSprintInput = z.infer<typeof createSprintSchema>;

export const createCustomRouteSchema = z.object({
  title: z.string().min(1, "Titolo obbligatorio").max(200),
  description: z.string().max(2000).optional().nullable(),
  isPublic: z.boolean().optional(),
  visibility: z.enum(["public", "friends", "private"]).optional(),
});
export type CreateCustomRouteInput = z.infer<typeof createCustomRouteSchema>;

export const updateCustomRouteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  isPublic: z.boolean().optional(),
  visibility: z.enum(["public", "friends", "private"]).optional(),
  totalDistanceKm: z.number().optional().nullable(),
});
export type UpdateCustomRouteInput = z.infer<typeof updateCustomRouteSchema>;

export const createWaypointSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio").max(200),
  latitude: z.number().finite("Latitudine non valida"),
  longitude: z.number().finite("Longitudine non valida"),
  description: z.string().max(2000).optional().nullable(),
  waypointType: z.string().optional(),
  orderIndex: z.number().int().optional(),
});
export type CreateWaypointInput = z.infer<typeof createWaypointSchema>;

export const updateWaypointSchema = createWaypointSchema.partial();
export type UpdateWaypointInput = z.infer<typeof updateWaypointSchema>;

export const curvyScoreWeightsSchema = z.object({
  weight_lean: z.number().gt(0).max(1).optional(),
  weight_gforce: z.number().gt(0).max(1).optional(),
  min_samples: z.number().int().min(1).optional(),
}).passthrough();
export type CurvyScoreWeightsInput = z.infer<typeof curvyScoreWeightsSchema>;
