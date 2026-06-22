import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";

export const dailyPushCounts = pgTable("daily_push_counts", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  day: varchar("day", { length: 10 }).notNull(),
  individualCount: integer("individual_count").notNull().default(0),
  digestCount: integer("digest_count").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("daily_push_counts_user_day_idx").on(table.userId, table.day),
]);

export type DailyPushCount = typeof dailyPushCounts.$inferSelect;
export type InsertDailyPushCount = typeof dailyPushCounts.$inferInsert;

export const matchNotificationDeliveries = pgTable("match_notification_deliveries", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  matchTable: varchar("match_table", { length: 40 }).notNull(),
  matchId: varchar("match_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  channel: varchar("channel", { length: 20 }).notNull().default("push"),
  deliveredAt: timestamp("delivered_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("match_notif_deliveries_unique_idx").on(table.matchTable, table.matchId, table.userId),
  index("match_notif_deliveries_user_idx").on(table.userId, table.deliveredAt),
]);

export type MatchNotificationDelivery = typeof matchNotificationDeliveries.$inferSelect;
export type InsertMatchNotificationDelivery = typeof matchNotificationDeliveries.$inferInsert;

export const updateWishlistSchema = z.object({
  description: z.string().max(2000).optional().nullable(),
});
export type UpdateWishlistInput = z.infer<typeof updateWishlistSchema>;

export const addWishlistMotoSchema = z.object({
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  motorcycleType: z.string().optional().nullable(),
  ridingStyle: z.string().optional().nullable(),
}).refine((d) => d.brand || d.model || d.motorcycleType, {
  message: "Specifica marca e modello oppure tipo moto",
});
export type AddWishlistMotoInput = z.infer<typeof addWishlistMotoSchema>;

export const updateWishlistMotoSchema = z.object({
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  motorcycleType: z.string().optional().nullable(),
  ridingStyle: z.string().optional().nullable(),
});
export type UpdateWishlistMotoInput = z.infer<typeof updateWishlistMotoSchema>;

export const matchFeedback = pgTable("match_feedback", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  otherUserId: varchar("other_user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  matchKind: varchar("match_kind", { length: 40 }).notNull(),
  featureKey: varchar("feature_key", { length: 80 }).notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  reasonTag: varchar("reason_tag", { length: 60 }),
  matchRefId: varchar("match_ref_id", { length: 36 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("match_feedback_user_created_idx").on(table.userId, table.createdAt),
  index("match_feedback_feature_idx").on(table.featureKey, table.action),
  index("match_feedback_match_ref_idx").on(table.matchRefId),
]);

export const userMatchProfile = pgTable("user_match_profile", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  featureWeights: jsonb("feature_weights").notNull().default(sql`'{}'::jsonb`),
  featureStats: jsonb("feature_stats").notNull().default(sql`'{}'::jsonb`),
  feedbackCount: integer("feedback_count").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MatchFeedback = typeof matchFeedback.$inferSelect;
export type InsertMatchFeedback = typeof matchFeedback.$inferInsert;
export type UserMatchProfile = typeof userMatchProfile.$inferSelect;
export type InsertUserMatchProfile = typeof userMatchProfile.$inferInsert;

export const NEGATIVE_PREF_KINDS = [
  "bike_type",
  "age_range",
  "max_distance",
  "requires_photo",
  "requires_verified",
  "exclude_user_type",
  "exclude_region",
] as const;
export type NegativePrefKind = typeof NEGATIVE_PREF_KINDS[number];

export const FORBIDDEN_NEGATIVE_KINDS = [
  "ethnicity",
  "race",
  "religion",
  "sexual_orientation",
  "nationality",
  "political",
  "disability",
] as const;

export const negativePrefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bike_type"), value: z.object({ type: z.string().min(1).max(50) }) }),
  z.object({ kind: z.literal("age_range"), value: z.object({ min: z.number().int().min(18).max(99).optional(), max: z.number().int().min(18).max(99).optional() }) }),
  z.object({ kind: z.literal("max_distance"), value: z.object({ km: z.number().int().min(1).max(20000) }) }),
  z.object({ kind: z.literal("requires_photo"), value: z.object({ enabled: z.boolean() }) }),
  z.object({ kind: z.literal("requires_verified"), value: z.object({ enabled: z.boolean() }) }),
  z.object({ kind: z.literal("exclude_user_type"), value: z.object({ userType: z.enum(["biker", "zavorrina"]) }) }),
  z.object({ kind: z.literal("exclude_region"), value: z.object({ region: z.string().min(1).max(100) }) }),
]);
export type NegativePrefInput = z.infer<typeof negativePrefSchema>;

export type FeatureWeights = Record<string, number>;
export type FeatureStats = Record<string, { accepts: number; rejects: number; ignores: number; total: number; acceptRate: number }>;
