import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const otaReleases = pgTable("ota_releases", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  easUpdateId: varchar("eas_update_id", { length: 200 }).notNull().unique(),
  easGroupId: varchar("eas_group_id", { length: 200 }),
  channel: varchar("channel", { length: 50 }).notNull().default("staging"),
  runtimeVersion: varchar("runtime_version", { length: 50 }),
  message: text("message"),
  otaVersion: varchar("ota_version", { length: 50 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  rejectedAt: timestamp("rejected_at"),
  rejectedBy: varchar("rejected_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  // Telemetria (Task #2503)
  bootSuccessCount: integer("boot_success_count").notNull().default(0),
  bootFailureCount: integer("boot_failure_count").notNull().default(0),
  downloadCount: integer("download_count").notNull().default(0),
  // Auto-rollback opt-in per release (OFF di default)
  autoRollbackEnabled: boolean("auto_rollback_enabled").notNull().default(false),
  autoRollbackThreshold: integer("auto_rollback_threshold").notNull().default(70),
  autoRollbackMinDownloads: integer("auto_rollback_min_downloads").notNull().default(10),
  autoRollbackWindowMinutes: integer("auto_rollback_window_minutes").notNull().default(30),
  autoRolledBackAt: timestamp("auto_rolled_back_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const otaBootEvents = pgTable("ota_boot_events", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id", { length: 36 })
    .notNull()
    .references(() => otaReleases.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  deviceId: varchar("device_id", { length: 80 }).notNull(),
  eventType: varchar("event_type", { length: 20 }).notNull(),
  platform: varchar("platform", { length: 16 }),
  appVersion: varchar("app_version", { length: 32 }),
  deviceModel: text("device_model"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("ota_boot_events_release_id_idx").on(table.releaseId),
  index("ota_boot_events_event_type_idx").on(table.eventType),
  index("ota_boot_events_user_id_idx").on(table.userId),
  uniqueIndex("ota_boot_events_unique_per_device").on(table.releaseId, table.deviceId, table.eventType),
]);

export type OtaRelease = typeof otaReleases.$inferSelect;
export type InsertOtaRelease = typeof otaReleases.$inferInsert;
export type OtaBootEvent = typeof otaBootEvents.$inferSelect;
export type InsertOtaBootEvent = typeof otaBootEvents.$inferInsert;

// Task #2535 — AI Orchestrator OTA: audit di ogni interazione con l'assistente.
export const otaAssistantRuns = pgTable("ota_assistant_runs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  prompt: text("prompt").notNull(),
  response: text("response"),
  toolCalls: text("tool_calls"),
  status: varchar("status", { length: 20 }).notNull().default("completed"),
  error: text("error"),
  logPath: text("log_path"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
}, (table) => [
  index("ota_assistant_runs_started_at_idx").on(table.startedAt),
  index("ota_assistant_runs_admin_id_idx").on(table.adminId),
]);

export type OtaAssistantRun = typeof otaAssistantRuns.$inferSelect;
export type InsertOtaAssistantRun = typeof otaAssistantRuns.$inferInsert;

// Task #2535 — Snapshot persistente del watchdog post-publish, generato dall'AI
// orchestrator quando l'admin chiede "ci sono release da rollbackare?" o
// quando una propose-rollback produce candidati. Permette di interrogare
// lo storico delle anomalie indipendentemente dalla chat.
export const otaWatchdogReports = pgTable("ota_watchdog_reports", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  triggeredBy: varchar("triggered_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  candidateCount: integer("candidate_count").notNull().default(0),
  payload: text("payload").notNull(),
  threshold: integer("threshold").notNull(),
  minDownloads: integer("min_downloads").notNull(),
}, (table) => [
  index("ota_watchdog_reports_generated_at_idx").on(table.generatedAt),
]);

export type OtaWatchdogReport = typeof otaWatchdogReports.$inferSelect;
export type InsertOtaWatchdogReport = typeof otaWatchdogReports.$inferInsert;
