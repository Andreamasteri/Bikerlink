import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const diagnosticReports = pgTable("diagnostic_reports", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "cascade" }),
  triggeredBy: varchar("triggered_by", { length: 20 }).notNull().default("auto"),
  appVersion: varchar("app_version", { length: 50 }),
  platform: varchar("platform", { length: 20 }),
  deviceModel: varchar("device_model", { length: 100 }),
  buildProfile: varchar("build_profile", { length: 20 }),
  runAt: timestamp("run_at").notNull().defaultNow(),
  sentryEventId: varchar("sentry_event_id", { length: 100 }),
  summary: jsonb("summary"),
  results: jsonb("results"),
  reviewedByAgent: timestamp("reviewed_by_agent"),
}, (table) => [
  index("diagnostic_reports_user_id_idx").on(table.userId),
  index("diagnostic_reports_run_at_idx").on(table.runAt),
]);

export const diagnosticQueue = pgTable("diagnostic_queue", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  commandedBy: varchar("commanded_by", { length: 36 }),
  showBanner: boolean("show_banner").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  executedAt: timestamp("executed_at"),
}, (table) => [
  index("diagnostic_queue_user_id_idx").on(table.userId),
]);

export type DiagnosticReport = typeof diagnosticReports.$inferSelect;
export type DiagnosticQueue = typeof diagnosticQueue.$inferSelect;

export interface DiagnosticSummary {
  totalTests: number;
  passed: number;
  failed: number;
  warned: number;
  skipped: number;
  durationMs: number;
}

export interface DiagnosticTestResult {
  section: string;
  name: string;
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
  message?: string;
  durationMs: number;
}
