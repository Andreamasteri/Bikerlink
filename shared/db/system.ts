import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  serial,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";

export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body"),
  notificationType: varchar("notification_type", { length: 50 }).notNull(),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: varchar("reference_id", { length: 36 }),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("notifications_user_id_idx").on(table.userId),
]);

export const invitationCodes = pgTable("invitation_codes", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(),
  label: varchar("label", { length: 100 }),
  giftMessage: text("gift_message"),
  createdBy: varchar("created_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  usedBy: varchar("used_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  maxUses: integer("max_uses").notNull().default(1),
  currentUses: integer("current_uses").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const feedbackTickets = pgTable("feedback_tickets", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  ticketType: varchar("ticket_type", { length: 30 }).notNull().default("feedback"),
  subject: varchar("subject", { length: 200 }).notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  internalNote: text("internal_note"),
  deviceInfo: jsonb("device_info").$type<{
    model?: string | null;
    platform?: string | null;
    osVersion?: string | null;
    appVersion?: string | null;
  } | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  valueJson: jsonb("value_json"),
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const mediaLibrary = pgTable("media_library", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  type: varchar("type", { length: 10 }).notNull().default("pdf"),
  titleIt: varchar("title_it", { length: 300 }).notNull(),
  titleEn: varchar("title_en", { length: 300 }).notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("media_library_type_idx").on(table.type),
  index("media_library_sort_idx").on(table.sortOrder),
]);

export const siteVisits = pgTable("site_visits", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  visitorId: varchar("visitor_id", { length: 64 }).notNull(),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  event: varchar("event", { length: 20 }).notNull().default("view"),
  path: text("path").notNull(),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  ipHash: varchar("ip_hash", { length: 64 }),
  ipPrefix: varchar("ip_prefix", { length: 48 }),
  lang: varchar("lang", { length: 10 }),
  country: varchar("country", { length: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("site_visits_created_at_idx").on(table.createdAt),
  index("site_visits_visitor_id_idx").on(table.visitorId),
  index("site_visits_event_idx").on(table.event),
  index("site_visits_user_id_idx").on(table.userId),
]);

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  notifyRides: boolean("notify_rides").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type InsertNewsletterSubscriber = typeof newsletterSubscribers.$inferInsert;

export const appCrashLogs = pgTable("app_crash_logs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  crashType: varchar("crash_type", { length: 20 }).notNull(),
  appVersion: varchar("app_version", { length: 32 }),
  platform: varchar("platform", { length: 16 }),
  osVersion: varchar("os_version", { length: 50 }),
  deviceModel: varchar("device_model", { length: 100 }),
  deviceBrand: varchar("device_brand", { length: 100 }),
  totalMemoryMb: integer("total_memory_mb"),
  errorMessage: text("error_message"),
  stackTrace: text("stack_trace"),
  sessionStartedAt: timestamp("session_started_at"),
  sessionEndedAt: timestamp("session_ended_at"),
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
}, (table) => [
  index("app_crash_logs_user_id_idx").on(table.userId),
  index("app_crash_logs_crash_type_idx").on(table.crashType),
  index("app_crash_logs_reported_at_idx").on(table.reportedAt),
]);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
export type InvitationCode = typeof invitationCodes.$inferSelect;
export type InsertInvitationCode = typeof invitationCodes.$inferInsert;
export type FeedbackTicket = typeof feedbackTickets.$inferSelect;
export type InsertFeedbackTicket = typeof feedbackTickets.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;
export type MediaLibrary = typeof mediaLibrary.$inferSelect;
export type InsertMediaLibrary = typeof mediaLibrary.$inferInsert;
export type SiteVisit = typeof siteVisits.$inferSelect;
export type InsertSiteVisit = typeof siteVisits.$inferInsert;
export type AppCrashLog = typeof appCrashLogs.$inferSelect;
export type InsertAppCrashLog = typeof appCrashLogs.$inferInsert;

export const createFeedbackSchema = z.object({
  ticketType: z.enum(["bug", "suggestion", "feature", "feedback", "other"]).optional().default("feedback"),
  subject: z.string().min(1, "Oggetto obbligatorio").max(200, "L'oggetto non può superare 200 caratteri"),
  message: z.string().min(1, "Messaggio obbligatorio").max(4000, "Il messaggio non può superare 4000 caratteri"),
  deviceInfo: z.object({
    model: z.string().max(100).nullable().optional(),
    platform: z.string().max(16).nullable().optional(),
    osVersion: z.string().max(50).nullable().optional(),
    appVersion: z.string().max(32).nullable().optional(),
  }).nullable().optional(),
});
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

export const createInviteCodeSchema = z.object({
  code: z.string().max(50).optional(),
  label: z.string().max(200).optional().nullable(),
  giftMessage: z.string().max(500).optional().nullable(),
  maxUses: z.number().int().min(1).optional(),
  expiresAt: z.coerce.date().optional().nullable(),
});
export type CreateInviteCodeInput = z.infer<typeof createInviteCodeSchema>;

export const upsertSettingSchema = z.object({
  key: z.string().min(1, "Chiave obbligatoria").max(100),
  value: z.string(),
});
export type UpsertSettingInput = z.infer<typeof upsertSettingSchema>;

export const generateInvitationSchema = z.object({
  maxUses: z.number().int().min(1).optional(),
  expiresAt: z.coerce.date().optional().nullable(),
});
export type GenerateInvitationInput = z.infer<typeof generateInvitationSchema>;

export const arcadeScoreSchema = z.object({
  game: z.string().min(1, "Gioco obbligatorio"),
  score: z.number().int().min(0, "Punteggio non valido"),
});
export type ArcadeScoreInput = z.infer<typeof arcadeScoreSchema>;

export const crashLogsSchema = z.object({
  logs: z.array(z.unknown()).min(1, "logs deve essere un array non vuoto").max(50, "Massimo 50 log per batch"),
});
export type CrashLogsInput = z.infer<typeof crashLogsSchema>;

export const emailConfigSchema = z.object({
  gmailUser: z.string().optional().nullable(),
  gmailAppPassword: z.string().optional().nullable(),
  adminPassword: z.string().min(1, "Password admin richiesta"),
});
export type EmailConfigInput = z.infer<typeof emailConfigSchema>;

export const disableFeatureSchema = z.object({
  key: z.string().min(1, "Chiave obbligatoria"),
  disabled: z.boolean().optional(),
});
export type DisableFeatureInput = z.infer<typeof disableFeatureSchema>;

export const toggleProtectedSchema = z.object({
  key: z.string().min(1, "Chiave obbligatoria"),
  value: z.string(),
  adminPassword: z.string().min(1, "Password admin richiesta"),
});
export type ToggleProtectedInput = z.infer<typeof toggleProtectedSchema>;

export const booleanSettingValueSchema = z.object({
  value: z.enum(["true", "false"], { message: "Valore non valido: usare 'true' o 'false'" }),
});
export type BooleanSettingValueInput = z.infer<typeof booleanSettingValueSchema>;

export const stringSettingValueSchema = z.object({
  value: z.string().min(1, "value è obbligatorio"),
});
export type StringSettingValueInput = z.infer<typeof stringSettingValueSchema>;

export const mapsProviderSchema = z.object({
  value: z.enum(["carto_light", "carto_dark", "esri_gray"], { message: "Provider non valido" }),
});
export type MapsProviderInput = z.infer<typeof mapsProviderSchema>;

export const clientErrorSchema = z.object({
  message: z.string().optional(),
  stack: z.string().optional(),
  componentStack: z.string().optional(),
  platform: z.string().optional(),
  appVersion: z.string().optional(),
  isFatal: z.boolean().optional(),
}).passthrough();
export type ClientErrorInput = z.infer<typeof clientErrorSchema>;

export const startupBeaconSchema = z.object({
  step: z.string().min(1, "step is required"),
  ts: z.number().optional(),
  recovered: z.boolean().optional(),
  platform: z.string().optional(),
}).passthrough();
export type StartupBeaconInput = z.infer<typeof startupBeaconSchema>;

export const updateFeedbackTicketSchema = z.object({
  status: z.string().optional(),
  internalNote: z.string().optional(),
});
export type UpdateFeedbackTicketInput = z.infer<typeof updateFeedbackTicketSchema>;

export const musicProviderSchema = z.object({
  value: z.literal("lastfm").transform(() => "lastfm" as const),
}).or(z.object({ value: z.string().min(1) }).transform(({ value }) => {
  if (value !== "lastfm") throw new Error("Provider non valido: usare 'lastfm'");
  return { value: "lastfm" as const };
}));

export const themeDefaultSchema = z.object({
  value: z.enum(["attuale", "asfalto", "velocita", "rotta"], { message: "Tema non valido" }),
});
export type ThemeDefaultInput = z.infer<typeof themeDefaultSchema>;

export const matchingCountriesSchema = z.object({
  value: z.string(),
});
export type MatchingCountriesInput = z.infer<typeof matchingCountriesSchema>;

export const coordinatesMaxAgeSchema = z.object({
  value: z.union([z.string(), z.number()]),
});
export type CoordinatesMaxAgeInput = z.infer<typeof coordinatesMaxAgeSchema>;

export const genericSettingSchema = z.object({
  value: z.string().optional(),
  valueJson: z.unknown().optional(),
}).passthrough();
export type GenericSettingInput = z.infer<typeof genericSettingSchema>;

export const emailTestSchema = z.object({
  to: z.string().optional(),
});
export type EmailTestInput = z.infer<typeof emailTestSchema>;

export const emailRateLimitResetSchema = z.object({
  scope: z.enum(["verify", "resend", "user-lockouts", "all"], { message: "Scope non valido. Usa: verify | resend | user-lockouts | all" }),
  ip: z.string().optional(),
  userId: z.string().optional(),
});
export type EmailRateLimitResetInput = z.infer<typeof emailRateLimitResetSchema>;

export const updateInvitationCodeAdminSchema = z.object({
  label: z.string().optional(),
  giftMessage: z.string().optional(),
  maxUses: z.union([z.number().int().min(1), z.string()]).optional(),
  isActive: z.union([z.boolean(), z.string()]).optional(),
  expiresAt: z.string().optional(),
}).passthrough();
export type UpdateInvitationCodeAdminInput = z.infer<typeof updateInvitationCodeAdminSchema>;

export const enabledSchema = z.object({
  enabled: z.boolean({ message: "enabled deve essere un booleano" }),
});
export type EnabledInput = z.infer<typeof enabledSchema>;

export const backupFrequencySchema = z.object({
  dbHours: z.union([z.number().min(1), z.string()]).optional(),
  mediaHours: z.union([z.number().min(1), z.string()]).optional(),
}).passthrough();
export type BackupFrequencyInput = z.infer<typeof backupFrequencySchema>;

export const translationKeys = pgTable("translation_keys", {
  key: varchar("key", { length: 200 }).primaryKey(),
  position: varchar("position", { length: 200 }),
  it: text("it"),
  en: text("en"),
  de: text("de"),
  es: text("es"),
  fr: text("fr"),
  el: text("el"),
  tr: text("tr"),
});
export type TranslationKey = typeof translationKeys.$inferSelect;
export type InsertTranslationKey = typeof translationKeys.$inferInsert;

export const translationKeySchema = z.object({
  key: z.string().min(1, "key mancante"),
  lang: z.string().min(1, "lang non valido"),
  value: z.string().min(1, "value mancante o vuoto"),
});
export type TranslationKeyInput = z.infer<typeof translationKeySchema>;

export const bgLocationSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  trigger: z.enum(["always", "tracking", "sos", "tracking_or_sos"]).optional(),
  intervalSeconds: z.union([z.number().int().min(10).max(300), z.string()]).optional(),
  notificationText: z.string().optional(),
  ghostModeContinue: z.boolean().optional(),
}).passthrough();
export type BgLocationSettingsInput = z.infer<typeof bgLocationSettingsSchema>;

export const privacyRulesSchema = z.object({
  showDistanceInCounter: z.boolean().optional(),
  offlinePositionRandomize: z.boolean().optional(),
  mapVisibilityFilter: z.enum(["all", "online_only", "available_only"]).optional(),
}).passthrough();
export type PrivacyRulesInput = z.infer<typeof privacyRulesSchema>;

const nativeVersionPlatformSchema = z.object({
  latestVersion: z.string().min(1),
  minVersion: z.string().min(1),
  storeUrl: z.string().min(1),
});
export const nativeVersionSchema = z.object({
  android: nativeVersionPlatformSchema,
  ios: nativeVersionPlatformSchema,
});
export type NativeVersionInput = z.infer<typeof nativeVersionSchema>;

export const urlSettingSchema = z.object({
  url: z.string().optional(),
}).passthrough();
export type UrlSettingInput = z.infer<typeof urlSettingSchema>;

export const maintenanceSettingsSchema = z.object({
  enabled: z.union([z.boolean(), z.string()]).optional(),
  message: z.string().optional(),
}).passthrough();
export type MaintenanceSettingsInput = z.infer<typeof maintenanceSettingsSchema>;

export const publishWithSlotSchema = z.object({
  assignSlot: z.string().optional(),
});
export type PublishWithSlotInput = z.infer<typeof publishWithSlotSchema>;

export const gpsErrorSchema = z.object({
  errorMessage: z.string().min(1, "errorMessage è obbligatorio").max(2000),
  stackTrace: z.string().max(5000).nullable().optional(),
  timestamp: z.string().max(40).optional(),
  platform: z.string().max(20).optional(),
  deviceName: z.string().max(100).nullable().optional(),
  osVersion: z.string().max(40).nullable().optional(),
  context: z.string().max(100).optional(),
  routeId: z.string().max(36).nullable().optional(),
  speedKmh: z.number().nullable().optional(),
});
export type GpsErrorInput = z.infer<typeof gpsErrorSchema>;

export const serverRestarts = pgTable("server_restarts", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  reason: varchar("reason", { length: 50 }).notNull().default("restart"),
});
export type ServerRestart = typeof serverRestarts.$inferSelect;
export type InsertServerRestart = typeof serverRestarts.$inferInsert;

export const abExperiments = pgTable("ab_experiments", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 100 }).notNull().unique(),
  description: text("description"),
  variants: jsonb("variants").$type<Array<{ name: string; weight: number; config?: Record<string, unknown> }>>().notNull(),
  status: varchar("status", { length: 20 }).notNull().default("running"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("ab_experiments_status_idx").on(table.status),
]);
export type AbExperiment = typeof abExperiments.$inferSelect;
export type InsertAbExperiment = typeof abExperiments.$inferInsert;

export const abAssignments = pgTable("ab_assignments", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experimentKey: varchar("experiment_key", { length: 100 }).notNull(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  variant: varchar("variant", { length: 60 }).notNull(),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
}, (table) => [
  index("ab_assignments_exp_user_idx").on(table.experimentKey, table.userId),
  index("ab_assignments_exp_variant_idx").on(table.experimentKey, table.variant),
]);
export type AbAssignment = typeof abAssignments.$inferSelect;
export type InsertAbAssignment = typeof abAssignments.$inferInsert;

export const abEvents = pgTable("ab_events", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experimentKey: varchar("experiment_key", { length: 100 }).notNull(),
  variant: varchar("variant", { length: 60 }).notNull(),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  eventName: varchar("event_name", { length: 60 }).notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("ab_events_exp_variant_event_idx").on(table.experimentKey, table.variant, table.eventName),
  index("ab_events_created_at_idx").on(table.createdAt),
]);
export type AbEvent = typeof abEvents.$inferSelect;
export type InsertAbEvent = typeof abEvents.$inferInsert;

export const mapsQuota = pgTable("maps_quota", {
  providerId: varchar("provider_id", { length: 100 }).notNull(),
  yearMonth: varchar("year_month", { length: 7 }).notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  { primaryKey: [table.providerId, table.yearMonth] },
  index("maps_quota_provider_idx").on(table.providerId),
]);
export type MapsQuota = typeof mapsQuota.$inferSelect;
export type InsertMapsQuota = typeof mapsQuota.$inferInsert;

export const deviceMetrics = pgTable("device_metrics", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  platform: varchar("platform", { length: 16 }),
  memoryUsedMb: integer("memory_used_mb"),
  memoryTotalMb: integer("memory_total_mb"),
  batteryLevel: integer("battery_level"),
  batteryState: varchar("battery_state", { length: 20 }),
  appUptimeSeconds: integer("app_uptime_seconds"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
}, (table) => [
  index("device_metrics_user_id_idx").on(table.userId),
  index("device_metrics_recorded_at_idx").on(table.recordedAt),
]);
export type DeviceMetric = typeof deviceMetrics.$inferSelect;
export type InsertDeviceMetric = typeof deviceMetrics.$inferInsert;

export const resourceSamples = pgTable("resource_samples", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sampledAt: timestamp("sampled_at").notNull().defaultNow(),
  avgRamPct: integer("avg_ram_pct"),
  avgBatteryPct: integer("avg_battery_pct"),
  onlineUsers: integer("online_users"),
  dbSizeMb: integer("db_size_mb"),
  backendRssMb: integer("backend_rss_mb"),
}, (table) => [
  index("resource_samples_sampled_at_idx").on(table.sampledAt),
]);
export type ResourceSample = typeof resourceSamples.$inferSelect;
export type InsertResourceSample = typeof resourceSamples.$inferInsert;

export const thinkcentreHealthEvents = pgTable("thinkcentre_health_events", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  serviceKey: varchar("service_key", { length: 30 }),
  transitionFrom: varchar("transition_from", { length: 20 }).notNull(),
  transitionTo: varchar("transition_to", { length: 20 }).notNull(),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
}, (table) => [
  index("thinkcentre_health_events_occurred_at_idx").on(table.occurredAt),
  index("thinkcentre_health_events_service_key_idx").on(table.serviceKey),
]);
export type ThinkcentreHealthEvent = typeof thinkcentreHealthEvents.$inferSelect;
export type InsertThinkcentreHealthEvent = typeof thinkcentreHealthEvents.$inferInsert;
