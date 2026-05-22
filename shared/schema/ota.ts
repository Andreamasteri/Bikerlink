import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  serial,
  index,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";

export const serverRestarts = pgTable("server_restarts", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  reason: varchar("reason", { length: 50 }).notNull().default("restart"),
});

export const otaReleases = pgTable("ota_releases", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  version: varchar("version", { length: 50 }).notNull(),
  runtimeVersion: varchar("runtime_version", { length: 50 }),
  bundlePath: text("bundle_path"),
  releaseNotes: text("release_notes"),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  slot: varchar("slot", { length: 32 }).default("archived"),
  promotedAt: timestamp("promoted_at"),
  promotedBy: varchar("promoted_by", { length: 100 }),
  successCount: integer("success_count").notNull().default(0),
  approved: boolean("approved").notNull().default(false),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  createdBy: varchar("created_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("ota_releases_status_idx").on(table.status),
  index("ota_releases_rv_status_idx").on(table.runtimeVersion, table.status),
  index("ota_releases_slot_idx").on(table.slot),
]);

export const deviceOtaAssignments = pgTable("device_ota_assignments", {
  deviceId: varchar("device_id", { length: 128 }).primaryKey(),
  slot: varchar("slot", { length: 32 }).notNull().default("stable"),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  assignedBy: varchar("assigned_by", { length: 100 }),
  expiresAt: timestamp("expires_at"),
});

export const otaEvents = pgTable("ota_events", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  phase: varchar("phase", { length: 32 }).notNull(),
  source: varchar("source", { length: 32 }),
  platform: varchar("platform", { length: 16 }),
  runtimeVersion: varchar("runtime_version", { length: 32 }),
  currentUpdateId: varchar("current_update_id", { length: 64 }),
  releaseId: varchar("release_id", { length: 64 }),
  error: text("error"),
  failCount: integer("fail_count").notNull().default(0),
  ip: varchar("ip", { length: 64 }),
  deviceId: varchar("device_id", { length: 64 }),
  diagnostics: jsonb("diagnostics").$type<{
    errorCode?: string;
    errorCause?: string;
    errorUserInfo?: string;
    nativeStack?: string;
    updateUrl?: string;
    channel?: string;
    networkInfo?: string;
    probe?: {
      status?: number;
      contentType?: string;
      bodySnippet?: string;
      durationMs?: number;
      error?: string;
    };
  }>(),
}, (table) => [
  index("ota_events_created_at_idx").on(table.createdAt),
]);

export const otaPublishTokens = pgTable("ota_publish_tokens", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  label: varchar("label", { length: 100 }).notNull().default("default"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  revoked: boolean("revoked").notNull().default(false),
}, (table) => [
  index("ota_publish_tokens_hash_idx").on(table.tokenHash),
]);

export type ServerRestart = typeof serverRestarts.$inferSelect;
export type InsertServerRestart = typeof serverRestarts.$inferInsert;
export type OtaRelease = typeof otaReleases.$inferSelect;
export type InsertOtaRelease = typeof otaReleases.$inferInsert;
export type DeviceOtaAssignment = typeof deviceOtaAssignments.$inferSelect;
export type InsertDeviceOtaAssignment = typeof deviceOtaAssignments.$inferInsert;
export type OtaEvent = typeof otaEvents.$inferSelect;
export type InsertOtaEvent = typeof otaEvents.$inferInsert;
export type OtaPublishToken = typeof otaPublishTokens.$inferSelect;
export type InsertOtaPublishToken = typeof otaPublishTokens.$inferInsert;

export const otaStuckEvents = pgTable("ota_stuck_events", {
  id: serial("id").primaryKey(),
  deviceId: varchar("device_id", { length: 64 }).notNull(),
  rollbackCount: integer("rollback_count").notNull().default(0),
  stuckSessions: integer("stuck_sessions").notNull().default(0),
  runtimeVersion: varchar("runtime_version", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("ota_stuck_events_device_idx").on(table.deviceId),
]);

export type OtaStuckEvent = typeof otaStuckEvents.$inferSelect;
export type InsertOtaStuckEvent = typeof otaStuckEvents.$inferInsert;

export const otaErrorSchema = z.object({
  error: z.string().min(1, "error is required"),
  failCount: z.number().int().optional(),
  updateId: z.string().optional(),
  runtimeVersion: z.string().optional(),
  phase: z.string().optional(),
  source: z.string().optional(),
  platform: z.string().optional(),
  deviceId: z.string().optional(),
  errorCode: z.string().optional(),
  errorCause: z.string().optional(),
  errorUserInfo: z.string().optional(),
  nativeStack: z.string().optional(),
  updateUrl: z.string().optional(),
  channel: z.string().optional(),
  networkInfo: z.string().optional(),
  probe: z.object({
    status: z.number().optional(),
    contentType: z.string().optional(),
    bodySnippet: z.string().optional(),
    durationMs: z.number().optional(),
    error: z.string().optional(),
  }).optional(),
});
export type OtaErrorInput = z.infer<typeof otaErrorSchema>;

export const createOtaReleaseSchema = z.object({
  version: z.string().min(1, "Versione obbligatoria").max(50),
  runtimeVersion: z.string().max(50).optional().nullable(),
  bundlePath: z.string().optional().nullable(),
  releaseNotes: z.string().max(5000).optional().nullable(),
  slot: z.enum(["stable", "beta", "canary", "archived"]).optional(),
});
export type CreateOtaReleaseInput = z.infer<typeof createOtaReleaseSchema>;

export const publishOtaReleaseSchema = z.object({
  version: z.string().min(1, "version è obbligatorio"),
  runtimeVersion: z.string().min(1, "runtimeVersion è obbligatorio"),
  bundlePath: z.string().min(1, "bundlePath è obbligatorio"),
  releaseNotes: z.string().max(5000).optional().nullable(),
  slot: z.enum(["stable", "beta", "canary", "archived"]).optional(),
});
export type PublishOtaReleaseInput = z.infer<typeof publishOtaReleaseSchema>;

export const assignOtaSlotSchema = z.object({
  releaseId: z.string().min(1, "releaseId è obbligatorio"),
  slot: z.string().min(1, "slot è obbligatorio"),
});
export type AssignOtaSlotInput = z.infer<typeof assignOtaSlotSchema>;

export const createOtaTokenSchema = z.object({
  label: z.string().min(1, "Label obbligatoria").max(100),
  expiresInDays: z.number().int().min(1).max(3650).optional().nullable(),
});
export type CreateOtaTokenInput = z.infer<typeof createOtaTokenSchema>;

export const otaAssignDeviceSchema = z.object({
  deviceId: z.string().min(1, "deviceId obbligatorio"),
  slot: z.string().min(1, "slot obbligatorio"),
  expiresAt: z.string().optional(),
});
export type OtaAssignDeviceInput = z.infer<typeof otaAssignDeviceSchema>;

export const otaPromoteSchema = z.object({
  fromSlot: z.string().min(1, "fromSlot obbligatorio"),
});
export type OtaPromoteInput = z.infer<typeof otaPromoteSchema>;

export const otaMarkBrokenSchema = z.object({
  releaseId: z.string().min(1, "releaseId obbligatorio"),
});
export type OtaMarkBrokenInput = z.infer<typeof otaMarkBrokenSchema>;


export const coordinateHistorySettingsSchema = z.object({
  enabled: z.boolean().optional(),
  interval: z.union([z.number().int().min(5), z.string()]).optional(),
  maxRecords: z.union([z.number().int().min(1), z.string()]).optional(),
  mode: z.enum(["all", "selected"]).optional(),
  selectedUsers: z.array(z.string()).optional(),
}).passthrough();
export type CoordinateHistorySettingsInput = z.infer<typeof coordinateHistorySettingsSchema>;

export const telemetryTargetKmSchema = z.object({
  target_km: z.union([z.number().int().min(10).max(100000), z.string()]),
});
export type TelemetryTargetKmInput = z.infer<typeof telemetryTargetKmSchema>;
