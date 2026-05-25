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
  serial,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";
import { proposals } from "./proposals";

export const conversations = pgTable("conversations", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationType: varchar("conversation_type", { length: 20 }).notNull().default("private"),
  title: varchar("title", { length: 200 }),
  proposalId: varchar("proposal_id", { length: 36 })
    .references(() => proposals.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversationParticipants = pgTable("conversation_participants", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 })
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  lastReadAt: timestamp("last_read_at"),
}, (table) => [
  uniqueIndex("conversation_participants_unique_idx").on(table.conversationId, table.userId),
  index("conversation_participants_user_id_idx").on(table.userId),
]);

export const sharedPlaylists = pgTable("shared_playlists", {
  id: serial("id").primaryKey(),
  fromUserId: varchar("from_user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  toUserId: varchar("to_user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  conversationId: varchar("conversation_id", { length: 36 })
    .references(() => conversations.id, { onDelete: "set null" }),
  tracksData: jsonb("tracks_data").notNull().$type<Array<{
    trackId: string;
    trackName: string;
    artistId: string;
    artistName: string;
    albumName?: string;
    genres?: string[];
  }>>(),
  trackCount: integer("track_count").notNull(),
  sharedAt: timestamp("shared_at").notNull().defaultNow(),
  mergedAt: timestamp("merged_at"),
}, (table) => [
  index("shared_playlists_to_user_idx").on(table.toUserId),
  index("shared_playlists_from_user_idx").on(table.fromUserId),
]);

export const messages = pgTable("messages", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 })
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  messageType: varchar("message_type", { length: 20 }).notNull().default("text"),
  content: text("content"),
  imageUrl: text("image_url"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  isFiltered: boolean("is_filtered").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  playlistId: integer("playlist_id").references(() => sharedPlaylists.id, { onDelete: "set null" }),
}, (table) => [
  index("messages_conversation_id_idx").on(table.conversationId),
  index("messages_sender_id_idx").on(table.senderId),
]);

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type InsertConversationParticipant = typeof conversationParticipants.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type SharedPlaylist = typeof sharedPlaylists.$inferSelect;
export type InsertSharedPlaylist = typeof sharedPlaylists.$inferInsert;

export const createConversationSchema = z.object({
  conversationType: z.enum(["direct", "private", "contact", "group", "club", "motoclub"]),
  title: z.string().max(200).optional().nullable(),
  proposalId: z.string().optional().nullable(),
  participantIds: z.array(z.string()).min(1, "Almeno un partecipante richiesto"),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1, "ID conversazione obbligatorio"),
  messageType: z.enum(["text", "image", "location", "audio", "video", "system", "playlist"]).default("text"),
  content: z.string().max(10000).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  latitude: z.number().finite().optional().nullable(),
  longitude: z.number().finite().optional().nullable(),
  playlistId: z.string().optional().nullable(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
