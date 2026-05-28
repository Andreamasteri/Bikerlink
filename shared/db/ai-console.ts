// Task #2637 — Schema unificato per la "AI Console" admin.
// 3 tabelle: conversazioni, messaggi (con tool calls + cost tracking),
// insight "pinnati" dall'admin per riferimento futuro.
import {
  pgTable,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const aiConversations = pgTable("ai_conversations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id", { length: 36 }).notNull(),
  title: varchar("title", { length: 200 }),
  scopesHint: jsonb("scopes_hint"), // ultimi scope selezionati dal router
  summary: text("summary"),         // riassunto incrementale (memoria contestuale)
  entities: jsonb("entities"),      // entità citate accumulate { reportId[], userId[], snapshotId[], violationId[], route[] }
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("ai_conversations_admin_idx").on(t.adminUserId),
  index("ai_conversations_last_msg_idx").on(t.lastMessageAt),
  index("ai_conversations_archived_idx").on(t.archivedAt),
]);

export const aiMessages = pgTable("ai_messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 }).notNull(),
  role: varchar("role", { length: 16 }).notNull(), // user|assistant|tool|system|router
  content: text("content").notNull().default(""),
  scopes: jsonb("scopes"),     // string[] selezionati dal router per il turno
  toolCalls: jsonb("tool_calls"), // [{name, args, result, durationMs}]
  entities: jsonb("entities"), // estratte da memory.ts su quel messaggio
  model: varchar("model", { length: 80 }),
  provider: varchar("provider", { length: 30 }),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_messages_conv_idx").on(t.conversationId),
  index("ai_messages_created_idx").on(t.createdAt),
  // GIN trigram per full-text search su content (creato lato pg_trgm).
  index("ai_messages_content_trgm_idx").using("gin", sql`${t.content} gin_trgm_ops`),
]);

export const aiPinnedInsights = pgTable("ai_pinned_insights", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 }).notNull(),
  messageId: varchar("message_id", { length: 36 }).notNull(),
  adminUserId: varchar("admin_user_id", { length: 36 }).notNull(),
  title: varchar("title", { length: 200 }),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_pinned_insights_admin_idx").on(t.adminUserId),
  index("ai_pinned_insights_conv_idx").on(t.conversationId),
]);

export type AiConversation = typeof aiConversations.$inferSelect;
export type InsertAiConversation = typeof aiConversations.$inferInsert;
export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = typeof aiMessages.$inferInsert;
export type AiPinnedInsight = typeof aiPinnedInsights.$inferSelect;
export type InsertAiPinnedInsight = typeof aiPinnedInsights.$inferInsert;
