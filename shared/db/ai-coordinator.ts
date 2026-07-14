// Task #2649 — Schema unificato per il Layer AI Coordinato.
// 3 tabelle: eventi emessi dalle AI, decisioni motivate, conflitti risolti.
// Greenfield: nessuna AI è ancora collegata al bus (scope task #2615).
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

export const aiEvents = pgTable("ai_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  aiName: varchar("ai_name", { length: 80 }).notNull(),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  severity: varchar("severity", { length: 16 }).notNull().default("info"), // debug|info|warn|critical
  correlationId: varchar("correlation_id", { length: 80 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_events_ainame_created_idx").on(t.aiName, t.createdAt),
  index("ai_events_type_created_idx").on(t.eventType, t.createdAt),
  index("ai_events_correlation_idx").on(t.correlationId),
  index("ai_events_severity_created_idx").on(t.severity, t.createdAt),
]);

export const aiDecisions = pgTable("ai_decisions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  aiName: varchar("ai_name", { length: 80 }).notNull(),
  decisionType: varchar("decision_type", { length: 80 }).notNull(),
  input: jsonb("input").notNull().default(sql`'{}'::jsonb`),
  output: jsonb("output").notNull().default(sql`'{}'::jsonb`),
  rationale: text("rationale"),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  tookMs: integer("took_ms").notNull().default(0),
  correlationId: varchar("correlation_id", { length: 80 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_decisions_ainame_type_created_idx").on(t.aiName, t.decisionType, t.createdAt),
  index("ai_decisions_correlation_idx").on(t.correlationId),
]);

export const aiConflicts = pgTable("ai_conflicts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  eventIdA: varchar("event_id_a", { length: 36 }).notNull(),
  eventIdB: varchar("event_id_b", { length: 36 }).notNull(),
  conflictType: varchar("conflict_type", { length: 80 }).notNull(),
  resolvedBy: varchar("resolved_by", { length: 16 }).notNull().default("none"), // policy|admin|none
  policyRuleId: varchar("policy_rule_id", { length: 80 }),
  resolutionRationale: text("resolution_rationale"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_conflicts_resolved_idx").on(t.resolvedAt),
  index("ai_conflicts_type_idx").on(t.conflictType),
  index("ai_conflicts_created_idx").on(t.createdAt),
]);

// Task #5 (Quebracho a) — Registry persistente dei job di background gestiti dal
// coordinatore Quebracho. Fonte di verità live = mappa in-memory (job-registry.ts);
// questa tabella persiste stato/direttive fra i restart. Una riga per job.
export const aiCoordinatorJobs = pgTable("ai_coordinator_jobs", {
  name: varchar("name", { length: 120 }).primaryKey(),
  // idle|running|paused|throttled|disabled
  state: varchar("state", { length: 24 }).notNull().default("idle"),
  lastRunAt: timestamp("last_run_at"),
  lastSuccessAt: timestamp("last_success_at"),
  lastErrorAt: timestamp("last_error_at"),
  lastError: text("last_error"),
  nextRunAt: timestamp("next_run_at"),
  // quebracho|admin_manual|killswitch|deterministic
  pauseSource: varchar("pause_source", { length: 24 }),
  pauseReason: text("pause_reason"),
  // { kind: "pause"|"throttle", reason, issuedBy, issuedAt, throttleMs? }
  directive: jsonb("directive"),
  runCount: integer("run_count").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("ai_coordinator_jobs_state_idx").on(t.state),
]);

export type AiEvent = typeof aiEvents.$inferSelect;
export type InsertAiEvent = typeof aiEvents.$inferInsert;
export type AiDecision = typeof aiDecisions.$inferSelect;
export type InsertAiDecision = typeof aiDecisions.$inferInsert;
export type AiConflict = typeof aiConflicts.$inferSelect;
export type InsertAiConflict = typeof aiConflicts.$inferInsert;
export type AiCoordinatorJob = typeof aiCoordinatorJobs.$inferSelect;
export type InsertAiCoordinatorJob = typeof aiCoordinatorJobs.$inferInsert;
