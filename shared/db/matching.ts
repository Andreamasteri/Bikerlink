import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { users, userMotorcycles } from "./users";

export const zavarrinaWishlists = pgTable("zavorrina_wishlists", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const zavarrinaWishlistPhotos = pgTable("zavorrina_wishlist_photos", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  wishlistId: varchar("wishlist_id", { length: 36 })
    .notNull()
    .references(() => zavarrinaWishlists.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const zavarrinaWishlistMotos = pgTable("zavorrina_wishlist_motos", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  wishlistId: varchar("wishlist_id", { length: 36 })
    .notNull()
    .references(() => zavarrinaWishlists.id, { onDelete: "cascade" }),
  brand: varchar("brand", { length: 100 }),
  model: varchar("model", { length: 100 }),
  motorcycleType: varchar("motorcycle_type", { length: 50 }),
  ridingStyle: varchar("riding_style", { length: 50 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bikerZavarrinaMatches = pgTable("biker_zavorrina_matches", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  bikerId: varchar("biker_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  zavarrinaId: varchar("zavorrina_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  bikerMotorcycleId: varchar("biker_motorcycle_id", { length: 36 })
    .notNull()
    .references(() => userMotorcycles.id, { onDelete: "cascade" }),
  wishlistMotoId: varchar("wishlist_moto_id", { length: 36 })
    .notNull()
    .references(() => zavarrinaWishlistMotos.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default("new"),
  isSupermatch: boolean("is_supermatch").notNull().default(false),
  notificationPriority: varchar("notification_priority", { length: 10 }).notNull().default("normal"),
  notifiedAt: timestamp("notified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("matches_biker_id_idx").on(table.bikerId),
  index("matches_zavorrina_id_idx").on(table.zavarrinaId),
  index("matches_bz_notif_pending_idx").on(table.notificationPriority, table.notifiedAt),
  uniqueIndex("matches_unique_combo_idx").on(table.bikerId, table.zavarrinaId, table.bikerMotorcycleId, table.wishlistMotoId),
]);

export const bikerBikerMatches = pgTable("biker_biker_matches", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  biker1Id: varchar("biker1_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  biker2Id: varchar("biker2_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  motorcycleBrand: varchar("motorcycle_brand", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("new"),
  isSupermatch: boolean("is_supermatch").notNull().default(false),
  pairType: varchar("pair_type", { length: 10 }).notNull().default("bb"),
  notificationPriority: varchar("notification_priority", { length: 10 }).notNull().default("normal"),
  notifiedAt: timestamp("notified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("biker_biker_biker1_idx").on(table.biker1Id),
  index("biker_biker_biker2_idx").on(table.biker2Id),
  index("biker_biker_notif_pending_idx").on(table.notificationPriority, table.notifiedAt),
  uniqueIndex("biker_biker_symmetric_idx").on(
    sql`LEAST(${table.biker1Id}, ${table.biker2Id})`,
    sql`GREATEST(${table.biker1Id}, ${table.biker2Id})`,
    table.motorcycleBrand,
  ),
]);

export const directMatchRequests = pgTable("direct_match_requests", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  receiverId: varchar("receiver_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("direct_match_requests_unique_idx").on(table.senderId, table.receiverId),
  index("direct_match_requests_receiver_idx").on(table.receiverId),
  index("direct_match_requests_sender_idx").on(table.senderId),
]);

export const matchPreferences = pgTable("match_preferences", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  bikerBikerBrand: boolean("biker_biker_brand").notNull().default(true),
  bikerZavorrinaBrand: boolean("biker_zavorrina_brand").notNull().default(true),
  bikerClubBrand: boolean("biker_club_brand").notNull().default(true),
  zavarrinaClubBrand: boolean("zavorrina_club_brand").notNull().default(true),
  bikerBikerTypeStyle: boolean("biker_biker_type_style").notNull().default(true),
  bikerZavarrinaTypeStyle: boolean("biker_zavorrina_type_style").notNull().default(true),
  bikerBikerDistance: boolean("biker_biker_distance").notNull().default(true),
  bikerZavarrinaDistance: boolean("biker_zavorrina_distance").notNull().default(true),
  bikerBikerMusic: boolean("biker_biker_music").notNull().default(true),
  bikerZavarrinaMusic: boolean("biker_zavorrina_music").notNull().default(true),
  bikerBikerLeanAngle: boolean("biker_biker_lean_angle").notNull().default(true),
  bikerBikerRouteTypeZone: boolean("biker_biker_route_type_zone").notNull().default(true),
  bikerZavarrinaRouteTypeZone: boolean("biker_zavorrina_route_type_zone").notNull().default(true),
  bikerBikerAvgSpeed: boolean("biker_biker_avg_speed").notNull().default(true),
  bikerBikerAvgDuration: boolean("biker_biker_avg_duration").notNull().default(true),
  bikerBikerDayTime: boolean("biker_biker_day_time").notNull().default(true),
  bikerBikerEvents: boolean("biker_biker_events").notNull().default(true),
  directMatch: boolean("direct_match").notNull().default(true),
  topMatchesOnly: boolean("top_matches_only").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("match_preferences_user_id_idx").on(table.userId),
]);

export type ZavarrinaWishlist = typeof zavarrinaWishlists.$inferSelect;
export type InsertZavarrinaWishlist = typeof zavarrinaWishlists.$inferInsert;
export type ZavarrinaWishlistPhoto = typeof zavarrinaWishlistPhotos.$inferSelect;
export type InsertZavarrinaWishlistPhoto = typeof zavarrinaWishlistPhotos.$inferInsert;
export type ZavarrinaWishlistMoto = typeof zavarrinaWishlistMotos.$inferSelect;
export type InsertZavarrinaWishlistMoto = typeof zavarrinaWishlistMotos.$inferInsert;
export type BikerZavarrinaMatch = typeof bikerZavarrinaMatches.$inferSelect;
export type InsertBikerZavarrinaMatch = typeof bikerZavarrinaMatches.$inferInsert;
export type BikerBikerMatch = typeof bikerBikerMatches.$inferSelect;
export type InsertBikerBikerMatch = typeof bikerBikerMatches.$inferInsert;
export type DirectMatchRequest = typeof directMatchRequests.$inferSelect;
export type InsertDirectMatchRequest = typeof directMatchRequests.$inferInsert;
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

export type MatchPreferences = typeof matchPreferences.$inferSelect;
export type InsertMatchPreferences = typeof matchPreferences.$inferInsert;

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

export const matchPreferencesAdminUpdateSchema = z.record(z.string(), z.boolean()).and(z.object({}).passthrough());
export type MatchPreferencesAdminUpdateInput = z.infer<typeof matchPreferencesAdminUpdateSchema>;
