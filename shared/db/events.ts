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
  customType,
} from "drizzle-orm/pg-core";

const geographyPoint = customType<{ data: string; notNull: false; default: false }>({
  dataType() { return "geography(Point, 4326)"; },
});
import { z } from "zod";
import { users } from "./users";
import { motoClubs } from "./motoclubs";

export const events = pgTable("events", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  eventType: varchar("event_type", { length: 30 }).notNull().default("raduno"),
  creatorId: varchar("creator_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  locationName: varchar("location_name", { length: 300 }),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  // Task #2510: PostGIS generated.
  geom: geographyPoint("geom"),
  eventDate: timestamp("event_date").notNull(),
  eventTime: varchar("event_time", { length: 5 }),
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurrenceInfo: text("recurrence_info"),
  maxParticipants: integer("max_participants"),
  websiteUrl: varchar("website_url", { length: 500 }),
  autoInviteReason: text("auto_invite_reason"),
  autoInviteRegion: varchar("auto_invite_region", { length: 100 }),
  autoInviteBrand: varchar("auto_invite_brand", { length: 100 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  approvedBy: varchar("approved_by", { length: 36 }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("events_creator_idx").on(table.creatorId),
  index("events_start_date_idx").on(table.eventDate),
  index("events_status_idx").on(table.status),
]);

export const eventImages = pgTable("event_images", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  eventId: varchar("event_id", { length: 36 })
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  imageUrl: varchar("image_url", { length: 1000 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
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
  participationStatus: varchar("participation_status", { length: 20 }).notNull().default("going"),
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
  invitedAt: timestamp("invited_at").notNull().defaultNow(),
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
  locationName: z.string().max(200).optional().nullable(),
  latitude: z.number().finite().optional().nullable(),
  longitude: z.number().finite().optional().nullable(),
  eventDate: z.coerce.date(),
  eventTime: z.string().max(20).optional().nullable(),
  isRecurring: z.boolean().optional(),
  recurrenceInfo: z.string().optional().nullable(),
  maxParticipants: z.number().int().positive().optional().nullable(),
  websiteUrl: z.string().max(500).optional().nullable(),
  autoInviteReason: z.string().optional().nullable(),
  autoInviteRegion: z.string().max(100).optional().nullable(),
  autoInviteBrand: z.string().max(100).optional().nullable(),
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
