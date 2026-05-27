// Task #2536 — AI Database Integrity tables.
// Runs (one row per scan), violations (one row per check finding),
// quarantine (rows copied before automatic deletes — TTL 30 giorni).
import { sql } from "drizzle-orm";
import {
  pgTable, varchar, text, integer, doublePrecision,
  timestamp, jsonb, index, boolean,
} from "drizzle-orm/pg-core";

export const dbIntegrityRuns = pgTable("db_integrity_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  trigger: varchar("trigger", { length: 20 }).notNull().default("manual"), // manual|cron|weekly|watchdog
  runAt: timestamp("run_at").notNull().defaultNow(),
  durationMs: integer("duration_ms").notNull().default(0),
  checksRun: integer("checks_run").notNull().default(0),
  violationsFound: integer("violations_found").notNull().default(0),
  autoFixed: integer("auto_fixed").notNull().default(0),
  manualPending: integer("manual_pending").notNull().default(0),
  expensive: boolean("expensive").notNull().default(false),
  notes: text("notes"),
}, (t) => [
  index("db_integrity_runs_run_at_idx").on(t.runAt),
]);
export type DbIntegrityRun = typeof dbIntegrityRuns.$inferSelect;

export const dbIntegrityViolations = pgTable("db_integrity_violations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id", { length: 36 }).notNull(),
  checkId: varchar("check_id", { length: 80 }).notNull(),
  checkName: varchar("check_name", { length: 160 }).notNull(),
  severity: varchar("severity", { length: 10 }).notNull(), // low|medium|high|critical
  category: varchar("category", { length: 40 }).notNull(), // orphans|invalid-states|...
  count: integer("count").notNull().default(0),
  sample: jsonb("sample").notNull().default(sql`'[]'::jsonb`),
  details: jsonb("details"),
  hash: varchar("hash", { length: 64 }).notNull(),         // checkId + content fingerprint
  status: varchar("status", { length: 20 }).notNull().default("open"), // open|auto_fixed|manual_pending|resolved|ignored
  autoFixApplied: boolean("auto_fix_applied").notNull().default(false),
  autoFixSummary: text("auto_fix_summary"),
  aiExplain: jsonb("ai_explain"),                          // { rootCause, blastRadius, proposedFix, sql, reasoning, risk, modelUsed }
  aiExplainCostUsd: doublePrecision("ai_explain_cost_usd").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (t) => [
  index("db_integrity_violations_run_idx").on(t.runId),
  index("db_integrity_violations_check_idx").on(t.checkId),
  index("db_integrity_violations_severity_idx").on(t.severity),
  index("db_integrity_violations_status_idx").on(t.status),
  index("db_integrity_violations_hash_idx").on(t.hash),
]);
export type DbIntegrityViolation = typeof dbIntegrityViolations.$inferSelect;

export const dbIntegrityQuarantine = pgTable("db_integrity_quarantine", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  violationId: varchar("violation_id", { length: 36 }),
  sourceTable: varchar("source_table", { length: 80 }).notNull(),
  sourcePk: varchar("source_pk", { length: 80 }).notNull(),
  payload: jsonb("payload").notNull(),
  reason: text("reason"),
  ttlExpiresAt: timestamp("ttl_expires_at").notNull(),
  restoredAt: timestamp("restored_at"),
  purgedAt: timestamp("purged_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("db_integrity_quarantine_table_idx").on(t.sourceTable),
  index("db_integrity_quarantine_ttl_idx").on(t.ttlExpiresAt),
]);
export type DbIntegrityQuarantineRow = typeof dbIntegrityQuarantine.$inferSelect;
