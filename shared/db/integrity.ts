// Task #2537 — App Integrity tables (generalizzazione del motore #2536).
// Famiglie: code, api, ui, i18n, config, assets, deps, env, workflows.
// Tabelle parallele a `db_integrity_*` (mantenute intatte per backward compat).
import { sql } from "drizzle-orm";
import {
  pgTable, varchar, text, integer, doublePrecision,
  timestamp, jsonb, index, boolean,
} from "drizzle-orm/pg-core";

export const integrityRuns = pgTable("integrity_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  trigger: varchar("trigger", { length: 20 }).notNull().default("manual"),
  family: varchar("family", { length: 20 }).notNull().default("all"),
  runAt: timestamp("run_at").notNull().defaultNow(),
  durationMs: integer("duration_ms").notNull().default(0),
  checksRun: integer("checks_run").notNull().default(0),
  violationsFound: integer("violations_found").notNull().default(0),
  autoFixed: integer("auto_fixed").notNull().default(0),
  manualPending: integer("manual_pending").notNull().default(0),
  expensive: boolean("expensive").notNull().default(false),
  notes: text("notes"),
}, (t) => [
  index("integrity_runs_run_at_idx").on(t.runAt),
  index("integrity_runs_family_idx").on(t.family),
]);
export type IntegrityRun = typeof integrityRuns.$inferSelect;

export const integrityViolations = pgTable("integrity_violations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id", { length: 36 }).notNull(),
  family: varchar("family", { length: 20 }).notNull(),
  checkId: varchar("check_id", { length: 120 }).notNull(),
  checkName: varchar("check_name", { length: 200 }).notNull(),
  severity: varchar("severity", { length: 10 }).notNull(),
  count: integer("count").notNull().default(0),
  sample: jsonb("sample").notNull().default(sql`'[]'::jsonb`),
  details: jsonb("details"),
  hash: varchar("hash", { length: 64 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  autoFixApplied: boolean("auto_fix_applied").notNull().default(false),
  autoFixSummary: text("auto_fix_summary"),
  aiExplain: jsonb("ai_explain"),
  aiExplainCostUsd: doublePrecision("ai_explain_cost_usd").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (t) => [
  index("integrity_violations_run_idx").on(t.runId),
  index("integrity_violations_family_idx").on(t.family),
  index("integrity_violations_check_idx").on(t.checkId),
  index("integrity_violations_severity_idx").on(t.severity),
  index("integrity_violations_status_idx").on(t.status),
  index("integrity_violations_hash_idx").on(t.hash),
]);
export type IntegrityViolation = typeof integrityViolations.$inferSelect;

export const integrityQuarantine = pgTable("integrity_quarantine", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  violationId: varchar("violation_id", { length: 36 }),
  family: varchar("family", { length: 20 }).notNull(),
  sourcePath: varchar("source_path", { length: 500 }).notNull(),
  payload: jsonb("payload").notNull(),
  reason: text("reason"),
  ttlExpiresAt: timestamp("ttl_expires_at").notNull(),
  restoredAt: timestamp("restored_at"),
  purgedAt: timestamp("purged_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("integrity_quarantine_family_idx").on(t.family),
  index("integrity_quarantine_ttl_idx").on(t.ttlExpiresAt),
]);
export type IntegrityQuarantineRow = typeof integrityQuarantine.$inferSelect;
