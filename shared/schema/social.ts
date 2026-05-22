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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";

export const easterEggs = pgTable("easter_eggs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  radius: integer("radius").notNull().default(100),
  iconUrl: text("icon_url"),
  points: integer("points").notNull().default(10),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("easter_eggs_location_idx").on(table.latitude, table.longitude),
]);

export const collectedEasterEggs = pgTable("collected_easter_eggs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  easterEggId: varchar("easter_egg_id", { length: 36 })
    .notNull()
    .references(() => easterEggs.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("collected_easter_eggs_unique_idx").on(table.easterEggId, table.userId),
]);

export const reports = pgTable("reports", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  reporterId: varchar("reporter_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reportedUserId: varchar("reported_user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 100 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  resolvedBy: varchar("resolved_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("reports_status_idx").on(table.status),
]);

export const moderatorLogs = pgTable("moderator_logs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  moderatorId: varchar("moderator_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("target_type", { length: 50 }).notNull(),
  targetId: varchar("target_id", { length: 36 }).notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const fakeUserInteractions = pgTable("fake_user_interactions", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  fakeUserId: varchar("fake_user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  realUserId: varchar("real_user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  interactionType: varchar("interaction_type", { length: 30 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("fake_interactions_fake_user_idx").on(table.fakeUserId),
  index("fake_interactions_real_user_idx").on(table.realUserId),
]);

export const userBlocks = pgTable("user_blocks", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  blockerId: varchar("blocker_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  blockedId: varchar("blocked_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_blocks_unique_idx").on(table.blockerId, table.blockedId),
  index("user_blocks_blocker_idx").on(table.blockerId),
  index("user_blocks_blocked_idx").on(table.blockedId),
]);

export const userFavorites = pgTable("user_favorites", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  favoriteUserId: varchar("favorite_user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_favorites_unique_idx").on(table.userId, table.favoriteUserId),
  index("user_favorites_user_id_idx").on(table.userId),
]);

export type EasterEgg = typeof easterEggs.$inferSelect;
export type InsertEasterEgg = typeof easterEggs.$inferInsert;
export type CollectedEasterEgg = typeof collectedEasterEggs.$inferSelect;
export type InsertCollectedEasterEgg = typeof collectedEasterEggs.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;
export type ModeratorLog = typeof moderatorLogs.$inferSelect;
export type InsertModeratorLog = typeof moderatorLogs.$inferInsert;
export type FakeUserInteraction = typeof fakeUserInteractions.$inferSelect;
export type InsertFakeUserInteraction = typeof fakeUserInteractions.$inferInsert;
export type UserBlock = typeof userBlocks.$inferSelect;
export type InsertUserBlock = typeof userBlocks.$inferInsert;
export type UserFavorite = typeof userFavorites.$inferSelect;
export type InsertUserFavorite = typeof userFavorites.$inferInsert;

export const easterEggSchema = z.object({
  name: z.string().optional(),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
}).passthrough();
export type EasterEggInput = z.infer<typeof easterEggSchema>;

export const easterEggBatchSchema = z.object({
  count: z.union([z.number(), z.string()]).optional(),
  radius: z.union([z.number(), z.string()]).optional(),
  points: z.union([z.number(), z.string()]).optional(),
});
export type EasterEggBatchInput = z.infer<typeof easterEggBatchSchema>;

export const reportResolveSchema = z.object({
  status: z.enum(["resolved", "dismissed"], { message: "Stato non valido" }),
});
export type ReportResolveInput = z.infer<typeof reportResolveSchema>;

export const stregattaSchema = z.object({
  nickname: z.string().min(1, "Nickname obbligatorio"),
  userType: z.string().min(1, "Tipo utente obbligatorio"),
  sex: z.string().optional(),
  coupleSexConfig: z.string().optional(),
  birthYear: z.union([z.number().int(), z.string()]).optional(),
  region: z.string().optional(),
  country: z.string().default("IT"),
  bio: z.string().optional(),
  moto: z.unknown().optional(),
  wishlistDescription: z.string().optional(),
  wishlistMotos: z.array(z.unknown()).optional(),
}).passthrough();
export type StregattaInput = z.infer<typeof stregattaSchema>;

export const stregattaToggleSchema = z.object({
  enabled: z.boolean({ message: "Il campo 'enabled' deve essere un booleano" }),
  adminPassword: z.string().min(1, "Password admin richiesta"),
});
export type StregattaToggleInput = z.infer<typeof stregattaToggleSchema>;

export const simulateActivitySchema = z.object({
  message: z.string().optional(),
  count: z.number().int().min(1).default(1),
}).passthrough();
export type SimulateActivityInput = z.infer<typeof simulateActivitySchema>;
