// Task #2533 — Schema AI System Watchdog.
// Tabelle per signals raccolti, snapshot di health, log azioni AI, report settimanali.
import { sql } from "drizzle-orm";
import {
  pgTable, varchar, text, integer, doublePrecision,
  timestamp, jsonb, index,
} from "drizzle-orm/pg-core";

// Signal grezzi raccolti dai collectors (BullMQ, scheduler, DB, Redis, latency, errori).
// Retention: 7 giorni (cleanup tramite cron sul watchdog stesso).
export const systemSignals = pgTable("system_signals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  source: varchar("source", { length: 40 }).notNull(),    // bullmq|scheduler|db|redis|latency|error|app
  metric: varchar("metric", { length: 80 }).notNull(),    // e.g. queue.waiting, scheduler.last_run_ms_ago
  value: doublePrecision("value"),                         // numeric value when applicable
  unit: varchar("unit", { length: 20 }),
  severity: varchar("severity", { length: 10 }).notNull().default("info"), // info|warn|high|critical
  details: jsonb("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("system_signals_source_metric_idx").on(t.source, t.metric),
  index("system_signals_created_idx").on(t.createdAt),
  index("system_signals_severity_created_idx").on(t.severity, t.createdAt),
]);
export type SystemSignal = typeof systemSignals.$inferSelect;
export type InsertSystemSignal = typeof systemSignals.$inferInsert;

// Snapshot calcolato (verde/giallo/arancio/rosso) ogni ciclo aggregator (~60s).
export const systemHealthSnapshot = pgTable("system_health_snapshot", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  status: varchar("status", { length: 10 }).notNull(), // green|yellow|orange|red
  score: integer("score").notNull().default(100),       // 0..100
  problems: jsonb("problems").$type<Array<{
    id: string; severity: "info" | "warn" | "high" | "critical";
    source: string; title: string; detail?: string; suggestion?: string;
  }>>().notNull().default(sql`'[]'::jsonb`),
  metrics: jsonb("metrics").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("system_health_snapshot_created_idx").on(t.createdAt),
  index("system_health_snapshot_status_idx").on(t.status),
]);
export type SystemHealthSnapshot = typeof systemHealthSnapshot.$inferSelect;
export type InsertSystemHealthSnapshot = typeof systemHealthSnapshot.$inferInsert;

// Log di ogni azione del watchdog: auto-fix applicato, proposta AI, alert inviato,
// chat con admin. Audit completo + cost tracking shared con #2532 (aiSuggestionsLog).
export const aiWatchdogLog = pgTable("ai_watchdog_log", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  kind: varchar("kind", { length: 30 }).notNull(), // auto_fix|proposal|alert|chat|report|signal
  scope: varchar("scope", { length: 60 }),          // es. "queue.matching" o "scheduler"
  status: varchar("status", { length: 20 }).notNull().default("ok"), // ok|warn|error|pending|accepted|rejected
  summary: text("summary"),
  details: jsonb("details"),
  proposalId: varchar("proposal_id", { length: 36 }), // se kind=proposal: id stesso del log
  acceptedByAdminId: varchar("accepted_by_admin_id", { length: 36 }),
  acceptedAt: timestamp("accepted_at"),
  rejectedByAdminId: varchar("rejected_by_admin_id", { length: 36 }),
  rejectedAt: timestamp("rejected_at"),
  rejectReason: varchar("reject_reason", { length: 300 }),
  costUsd: doublePrecision("cost_usd").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_watchdog_log_kind_idx").on(t.kind),
  index("ai_watchdog_log_status_idx").on(t.status),
  index("ai_watchdog_log_created_idx").on(t.createdAt),
]);
export type AiWatchdogLog = typeof aiWatchdogLog.$inferSelect;
export type InsertAiWatchdogLog = typeof aiWatchdogLog.$inferInsert;

// Report settimanale generato dall'AI ogni lunedì 07:00 Europe/Rome.
export const weeklySystemReports = pgTable("weekly_system_reports", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  weekStart: varchar("week_start", { length: 10 }).notNull().unique(), // YYYY-MM-DD del lunedì
  payload: jsonb("payload").notNull(),
  modelUsed: varchar("model_used", { length: 80 }),
  costUsd: doublePrecision("cost_usd").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("weekly_system_reports_created_idx").on(t.createdAt),
]);
export type WeeklySystemReport = typeof weeklySystemReports.$inferSelect;
export type InsertWeeklySystemReport = typeof weeklySystemReports.$inferInsert;
