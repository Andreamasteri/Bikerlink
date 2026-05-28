// Task #2698 — Telemetria AI Assistant utente (eventi: conversazione, azione, tip, opt-out).
import { pgTable, uuid, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const aiAssistantTelemetry = pgTable("ai_assistant_telemetry", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("event_type", { length: 40 }).notNull(),
  platform: varchar("platform", { length: 16 }).notNull(),
  userRole: varchar("user_role", { length: 20 }),
  userId: varchar("user_id", { length: 36 }),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_assistant_telemetry_created_at_idx").on(t.createdAt),
  index("ai_assistant_telemetry_event_platform_idx").on(t.eventType, t.platform),
]);

export type AiAssistantTelemetry = typeof aiAssistantTelemetry.$inferSelect;
export type InsertAiAssistantTelemetry = typeof aiAssistantTelemetry.$inferInsert;
