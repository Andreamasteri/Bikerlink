// Task #2682 — `ai_messages` gestita esclusivamente via migration SQL numerata.
//
// Perché: la tabella usa un indice GIN trigram (`gin_trgm_ops`) che non può
// essere gestito automaticamente dallo schema ORM (genera diff spurie).
// Source of truth = migrations/*.sql.
//
// Questo file è importato da shared/db/index.ts (runtime).

import { pgTable, varchar, text, integer, jsonb, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const aiMessages = pgTable("ai_messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 }).notNull(),
  role: varchar("role", { length: 16 }).notNull(),
  content: text("content").notNull().default(""),
  scopes: jsonb("scopes"),
  toolCalls: jsonb("tool_calls"),
  entities: jsonb("entities"),
  model: varchar("model", { length: 80 }),
  provider: varchar("provider", { length: 30 }),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_messages_conv_idx").on(t.conversationId),
  index("ai_messages_created_idx").on(t.createdAt),
  index("ai_messages_content_trgm_idx").using("gin", sql`${t.content} gin_trgm_ops`),
]);

export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = typeof aiMessages.$inferInsert;
