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
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";
import { motoClubs } from "./motoclubs";

export const events = pgTable("events", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  clubId: varchar("club_id", { length: 36 })
    .references(() => motoClubs.id, { onDelete: "set null" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  eventType: varchar("event_type", { length: 50 }).notNull().default("general"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  address: text("address"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  maxParticipants: integer("max_participants"),
  participantCount: integer("participant_count").notNull().default(0),
  coverUrl: text("cover_url"),
  isPublic: boolean("is_public").notNull().default(true),
  isMultiday: boolean("is_multiday").notNull().default(false),
  gpxUrl: text("gpx_url"),
  routeGeojson: jsonb("route_geojson"),
  waypoints: jsonb("waypoints"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("events_creator_idx").on(table.creatorId),
  index("events_club_idx").on(table.clubId),
  index("events_start_date_idx").on(table.startDate),
  index("events_status_idx").on(table.status),
]);

export const eventImages = pgTable("event_images", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  eventId: varchar("event_id", { length: 36 })
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("event_images_event_idx").on(table.eventId),
]);

export const eventParticipants = pgTable("event_participants", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  eventId: varchar("event_id", { length: 36 })
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default("going"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("event_participants_unique_idx").on(table.eventId, table.userId),
  index("event_participants_event_idx").on(table.eventId),
  index("event_participants_user_idx").on(table.userId),
]);

export const eventClubInvites = pgTable("event_club_invites", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  eventId: varchar("event_id", { length: 36 })
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  clubId: varchar("club_id", { length: 36 })
    .notNull()
    .references(() => motoClubs.id, { onDelete: "cascade" }),
  invitedBy: varchar("invited_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("event_club_invites_unique_idx").on(table.eventId, table.clubId),
]);

export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;
export type EventImage = typeof eventImages.$inferSelect;
export type InsertEventImage = typeof eventImages.$inferInsert;
export type EventParticipant = typeof eventParticipants.$inferSelect;
export type InsertEventParticipant = typeof eventParticipants.$inferInsert;
export type EventClubInvite = typeof eventClubInvites.$inferSelect;
export type InsertEventClubInvite = typeof eventClubInvites.$inferInsert;

export const createEventSchema = z.object({
  title: z.string().min(1, "Titolo obbligatorio").max(200),
  description: z.string().max(5000).optional().nullable(),
  eventType: z.string().optional().nullable(),
  latitude: z.number().finite().optional().nullable(),
  longitude: z.number().finite().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  maxParticipants: z.number().int().positive().optional().nullable(),
  isPublic: z.boolean().optional(),
  isMultiday: z.boolean().optional(),
  gpxUrl: z.string().optional().nullable(),
  clubId: z.string().optional().nullable(),
  coverUrl: z.string().optional().nullable(),
  waypoints: z.array(z.unknown()).optional().nullable(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = createEventSchema.partial();
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const eventParticipationSchema = z.object({
  status: z.enum(["going", "interested", "not_going"]),
});
export type EventParticipationInput = z.infer<typeof eventParticipationSchema>;

export const rejectEventSchema = z.object({
  reason: z.string().optional(),
}).passthrough();
export type RejectEventInput = z.infer<typeof rejectEventSchema>;

export const inviteUserToEventSchema = z.object({
  userId: z.string().min(1, "userId obbligatorio"),
});
export type InviteUserToEventInput = z.infer<typeof inviteUserToEventSchema>;
