// Task #2698 — Telemetria AI Assistant utente (eventi: conversazione, azione, tip, opt-out).
// Task #3017 — ai_call_logs e ai_conversation_turns (logging + memoria).
import { pgTable, uuid, varchar, jsonb, timestamp, index, uniqueIndex, integer, doublePrecision, text, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

// Task #3017 — ai_call_logs: log completo di ogni chiamata AI (provider, latenza, token, costo).
export const aiCallLogs = pgTable("ai_call_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  provider: varchar("provider", { length: 40 }).notNull(),
  modelId: varchar("model_id", { length: 100 }).notNull(),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  latencyMs: integer("latency_ms"),
  costUsd: doublePrecision("cost_usd").notNull().default(0),
  degraded: boolean("degraded").notNull().default(false),
  // Task #5222 — true quando il filtro di sicurezza ha bloccato l'output AI
  // (tentato leak di credenziali/token/env). La risposta viene sostituita con
  // un messaggio di rifiuto e l'attempt resta tracciato qui per audit.
  securityBlocked: boolean("security_blocked").notNull().default(false),
  // Task #5228 — Bowie Standalone monitor: attribuzione persona/sorgente e
  // esito consegna delle risposte inviate via notifica (notification-reply).
  //   persona            → "bowie" | "horus" | "ares" (roster AI).
  //   sourceApp          → "main_app" | "bowie_terminal" (quale client ha originato).
  //   notificationStatus → "delivered" | "failed" SOLO sulle righe che tracciano
  //                         l'esito di una push notification-reply; NULL sui turni normali.
  persona: varchar("persona", { length: 16 }),
  sourceApp: varchar("source_app", { length: 32 }),
  notificationStatus: varchar("notification_status", { length: 16 }),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_call_logs_created_at_idx").on(t.createdAt.desc()),
  index("ai_call_logs_provider_idx").on(t.provider, t.createdAt.desc()),
  index("ai_call_logs_user_id_idx").on(t.userId),
  index("ai_call_logs_degraded_idx").on(t.degraded).where(sql`degraded = true`),
  index("ai_call_logs_security_blocked_idx").on(t.securityBlocked).where(sql`security_blocked = true`),
  index("ai_call_logs_source_app_idx").on(t.sourceApp),
]);

export type AiCallLog = typeof aiCallLogs.$inferSelect;
export type InsertAiCallLog = typeof aiCallLogs.$inferInsert;

// Task #5228 — Token push per-dispositivo del client "Bowie Terminal" (APK
// standalone). Separati da users.expoPushToken (che resta il token attivo per
// la consegna): questa tabella permette al monitor admin di elencare i device
// registrati, distinguere gli attivi (last_active_at recente) e revocarli uno
// a uno senza toccare il token principale dell'utente.
export const bowieTerminalTokens = pgTable("bowie_terminal_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceId: varchar("device_id", { length: 128 }).notNull(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  pushToken: text("push_token").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
}, (t) => [
  uniqueIndex("bowie_terminal_tokens_device_id_key").on(t.deviceId),
  index("bowie_terminal_tokens_user_id_idx").on(t.userId),
]);

export type BowieTerminalToken = typeof bowieTerminalTokens.$inferSelect;
export type InsertBowieTerminalToken = typeof bowieTerminalTokens.$inferInsert;

// Task #3017 — ai_conversation_turns: memoria conversazionale persistente per user.
export const aiConversationTurns = pgTable("ai_conversation_turns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content").notNull(),
  summaryOf: uuid("summary_of"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_conversation_turns_user_id_idx").on(t.userId, t.createdAt.desc()),
  index("ai_conversation_turns_summary_of_idx").on(t.summaryOf).where(sql`"summary_of" IS NOT NULL`),
]);

export type AiConversationTurn = typeof aiConversationTurns.$inferSelect;
export type InsertAiConversationTurn = typeof aiConversationTurns.$inferInsert;

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
