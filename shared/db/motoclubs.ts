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

export const motoClubs = pgTable("moto_clubs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  clubType: varchar("club_type", { length: 20 }).notNull(),
  brandName: varchar("brand_name", { length: 100 }),
  modelName: varchar("model_name", { length: 100 }),
  region: varchar("region", { length: 100 }),
  country: varchar("country", { length: 2 }),
  description: text("description"),
  logoUrl: text("logo_url"),
  coverUrl: text("cover_url"),
  isApproved: boolean("is_approved").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  memberCount: integer("member_count").notNull().default(0),
  activityScore: integer("activity_score").notNull().default(0),
  conversationId: varchar("conversation_id", { length: 36 }),
  parentClubId: varchar("parent_club_id", { length: 36 }),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  proposedLatitude: doublePrecision("proposed_latitude"),
  proposedLongitude: doublePrecision("proposed_longitude"),
  proposedAddress: text("proposed_address"),
  proposedBy: varchar("proposed_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  proposedAt: timestamp("proposed_at"),
  createdBy: varchar("created_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("moto_clubs_type_idx").on(table.clubType),
  index("moto_clubs_brand_idx").on(table.brandName),
  index("moto_clubs_region_idx").on(table.region),
]);

export const motoClubMembers = pgTable("moto_club_members", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  clubId: varchar("club_id", { length: 36 })
    .notNull()
    .references(() => motoClubs.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default("member"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("moto_club_members_unique_idx").on(table.clubId, table.userId),
  index("moto_club_members_club_idx").on(table.clubId),
  index("moto_club_members_user_idx").on(table.userId),
]);

export const motoClubInvites = pgTable("moto_club_invites", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  clubId: varchar("club_id", { length: 36 })
    .notNull()
    .references(() => motoClubs.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  invitedBy: varchar("invited_by", { length: 36 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("moto_club_invites_unique_idx").on(table.clubId, table.userId),
  index("moto_club_invites_user_idx").on(table.userId),
]);

export const motoClubRequests = pgTable("moto_club_requests", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  clubType: varchar("club_type", { length: 20 }).notNull(),
  brandName: varchar("brand_name", { length: 100 }),
  modelName: varchar("model_name", { length: 100 }),
  requestedBy: varchar("requested_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  reviewedBy: varchar("reviewed_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  reviewNote: text("review_note"),
  parentClubId: varchar("parent_club_id", { length: 36 }),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  inviteRadiusKm: integer("invite_radius_km"),
  inviteUserIds: text("invite_user_ids"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MotoClub = typeof motoClubs.$inferSelect;
export type InsertMotoClub = typeof motoClubs.$inferInsert;
export type MotoClubMember = typeof motoClubMembers.$inferSelect;
export type InsertMotoClubMember = typeof motoClubMembers.$inferInsert;
export type MotoClubInvite = typeof motoClubInvites.$inferSelect;
export type InsertMotoClubInvite = typeof motoClubInvites.$inferInsert;
export type MotoClubRequest = typeof motoClubRequests.$inferSelect;
export type InsertMotoClubRequest = typeof motoClubRequests.$inferInsert;

export const createMotoClubSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio").max(100),
  clubType: z.enum(["brand", "region", "generic", "model", "chapter"]).optional(),
  brandName: z.string().max(100).optional().nullable(),
  modelName: z.string().max(100).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
});
export type CreateMotoClubInput = z.infer<typeof createMotoClubSchema>;

export const respondToInviteSchema = z.object({
  response: z.enum(["accepted", "declined"]),
});
export type RespondToInviteInput = z.infer<typeof respondToInviteSchema>;

export const proposeLocationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  address: z.string().optional(),
});
export type ProposeLocationInput = z.infer<typeof proposeLocationSchema>;

export const rejectNoteSchema = z.object({
  note: z.string().optional(),
}).passthrough();
export type RejectNoteInput = z.infer<typeof rejectNoteSchema>;

export const reconcileClubInvitesSchema = z.object({
  userId: z.string().optional(),
}).passthrough();
export type ReconcileClubInvitesInput = z.infer<typeof reconcileClubInvitesSchema>;
