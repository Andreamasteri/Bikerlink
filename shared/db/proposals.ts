import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// Task #2510: PostGIS geography(Point, 4326), colonne generated.
// Task #2678: dataType()="geography" corrisponde a udt_name nel DB; generatedAlwaysAs
// rispecchia GENERATED ALWAYS, evitando ALTER SET DATA TYPE / DROP EXPRESSION.
const geographyPoint = customType<{ data: string; notNull: false; default: false }>({
  dataType() { return "geography"; },
});

export const proposals = pgTable("proposals", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  proposalType: varchar("proposal_type", { length: 30 }).notNull(),
  searchType: varchar("search_type", { length: 30 }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  searchRadius: integer("search_radius"),
  motorcycleId: varchar("motorcycle_id", { length: 36 }),
  wishlistMotoId: varchar("wishlist_moto_id", { length: 36 }),
  anyMotoOk: boolean("any_moto_ok").notNull().default(false),
  departureLatitude: doublePrecision("departure_latitude"),
  departureLongitude: doublePrecision("departure_longitude"),
  departureAddress: text("departure_address"),
  destinationAddress: text("destination_address"),
  destinationLatitude: doublePrecision("destination_latitude"),
  destinationLongitude: doublePrecision("destination_longitude"),
  // Task #2510: colonne PostGIS generated, mantenute in sync dal DB.
  // Task #2678: generatedAlwaysAs rispecchia GENERATED ALWAYS del DB.
  departureGeom: geographyPoint("departure_geom").generatedAlwaysAs(
    sql`CASE WHEN ((departure_longitude IS NOT NULL) AND (departure_latitude IS NOT NULL)) THEN (st_setsrid(st_makepoint(departure_longitude, departure_latitude), 4326))::geography ELSE NULL::geography END`,
  ),
  destinationGeom: geographyPoint("destination_geom").generatedAlwaysAs(
    sql`CASE WHEN ((destination_longitude IS NOT NULL) AND (destination_latitude IS NOT NULL)) THEN (st_setsrid(st_makepoint(destination_longitude, destination_latitude), 4326))::geography ELSE NULL::geography END`,
  ),
  scheduledAt: timestamp("scheduled_at"),
  departureTimeFrom: timestamp("departure_time_from"),
  departureTimeTo: timestamp("departure_time_to"),
  returnDeadline: timestamp("return_deadline"),
  stops: jsonb("stops"),
  maxParticipants: integer("max_participants"),
  expiresAt: timestamp("expires_at"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  clubId: varchar("club_id", { length: 36 }),
  extendToDestination: boolean("extend_to_destination").notNull().default(false),
  destinationSearchRadius: integer("destination_search_radius"),
  searchTypes: jsonb("search_types").$type<string[]>(),
  targetUserTypes: jsonb("target_user_types").$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("proposals_user_id_idx").on(table.userId),
  index("proposals_status_idx").on(table.status),
  index("proposals_expires_at_idx").on(table.expiresAt),
  index("proposals_scheduled_at_idx").on(table.scheduledAt),
  index("proposals_search_type_idx").on(table.searchType),
  index("proposals_club_id_idx").on(table.clubId),
  index("proposals_status_scheduled_idx").on(table.status, table.scheduledAt),
  index("proposals_departure_lat_idx").on(table.departureLatitude),
  index("proposals_departure_lng_idx").on(table.departureLongitude),
]);

export const proposalParticipants = pgTable("proposal_participants", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id", { length: 36 })
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("proposal_participants_unique_idx").on(table.proposalId, table.userId),
]);

export const proposalMatches = pgTable("proposal_matches", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  proposalId1: varchar("proposal_id_1", { length: 36 })
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade" }),
  proposalId2: varchar("proposal_id_2", { length: 36 })
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade" }),
  userId1: varchar("user_id_1", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  userId2: varchar("user_id_2", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  acceptedByUser1: boolean("accepted_by_user_1").notNull().default(false),
  acceptedByUser2: boolean("accepted_by_user_2").notNull().default(false),
  conversationId: varchar("conversation_id", { length: 36 }),
  notificationPriority: varchar("notification_priority", { length: 10 }).notNull().default("normal"),
  notifiedAt: timestamp("notified_at"),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("proposal_matches_user1_idx").on(table.userId1),
  index("proposal_matches_user2_idx").on(table.userId2),
  index("proposal_matches_status_idx").on(table.status),
  index("proposal_matches_notif_pending_idx").on(table.notificationPriority, table.notifiedAt),
  index("proposal_matches_archived_at_idx").on(table.archivedAt),
]);

export const proposalZoneNotifications = pgTable("proposal_zone_notifications", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  proposalId: varchar("proposal_id", { length: 36 })
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade" }),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("proposal_zone_notif_unique_idx").on(table.userId, table.proposalId),
  index("proposal_zone_notif_proposal_idx").on(table.proposalId),
]);

export const proposalProfileMatches = pgTable("proposal_profile_matches", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id", { length: 36 })
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade" }),
  bikerId: varchar("biker_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  zavorrinaId: varchar("zavorrina_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  distanceKm: doublePrecision("distance_km"),
  status: varchar("status", { length: 20 }).notNull().default("new"),
  notificationPriority: varchar("notification_priority", { length: 10 }).notNull().default("normal"),
  notifiedAt: timestamp("notified_at"),
  archivedAt: timestamp("archived_at"),
  resetCount: integer("reset_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("ppm_biker_id_idx").on(table.bikerId),
  index("ppm_zavorrina_id_idx").on(table.zavorrinaId),
  index("ppm_proposal_id_idx").on(table.proposalId),
  index("ppm_notif_pending_idx").on(table.notificationPriority, table.notifiedAt),
  uniqueIndex("ppm_proposal_zavorrina_unique_idx").on(table.proposalId, table.zavorrinaId),
  uniqueIndex("ppm_biker_zavorrina_active_idx")
    .on(table.bikerId, table.zavorrinaId)
    .where(sql`${table.status} = 'new'`),
  index("ppm_archived_at_idx").on(table.archivedAt),
]);

export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;
export type ProposalParticipant = typeof proposalParticipants.$inferSelect;
export type InsertProposalParticipant = typeof proposalParticipants.$inferInsert;
export type ProposalMatch = typeof proposalMatches.$inferSelect;
export type InsertProposalMatch = typeof proposalMatches.$inferInsert;
export type ProposalZoneNotification = typeof proposalZoneNotifications.$inferSelect;
export type InsertProposalZoneNotification = typeof proposalZoneNotifications.$inferInsert;
export type ProposalProfileMatch = typeof proposalProfileMatches.$inferSelect;
export type InsertProposalProfileMatch = typeof proposalProfileMatches.$inferInsert;
