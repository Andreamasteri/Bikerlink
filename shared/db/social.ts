import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";

// Task #2530 — categorie/contesti segnalazione (lato server/UI: i valori sono
// validati anche da Zod in shared/validators/users.ts).
export const REPORT_CATEGORIES = [
  "aggressive",
  "harassment",
  "fake_profile",
  "no_show",
  "opportunist",
  "group_misconduct",
  "dangerous_riding",
  "other",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_CONTEXTS = [
  "match",
  "chat",
  "profile",
  "post_meetup",
  "other",
] as const;
export type ReportContext = (typeof REPORT_CONTEXTS)[number];

export const REPORT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type ReportSeverity = (typeof REPORT_SEVERITIES)[number];

export function categoryToSeverity(cat: ReportCategory): ReportSeverity {
  switch (cat) {
    case "dangerous_riding": return "critical";
    case "harassment":
    case "aggressive": return "high";
    case "fake_profile":
    case "opportunist":
    case "group_misconduct": return "medium";
    default: return "low";
  }
}
import { z } from "zod";
import { users } from "./users";

export const easterEggs = pgTable("easter_eggs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  radius: integer("radius").notNull().default(100),
  iconUrl: text("icon_url"),
  points: integer("points").notNull().default(10),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("easter_eggs_location_idx").on(table.latitude, table.longitude),
]);

export const collectedEasterEggs = pgTable("collected_easter_eggs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  easterEggId: varchar("easter_egg_id", { length: 36 })
    .notNull()
    .references(() => easterEggs.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("collected_easter_eggs_unique_idx").on(table.easterEggId, table.userId),
]);

export const reports = pgTable("reports", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  reporterId: varchar("reporter_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reportedUserId: varchar("reported_user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 100 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  resolvedBy: varchar("resolved_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Task #2530
  category: varchar("category", { length: 40 }),
  context: varchar("context", { length: 20 }),
  contextId: varchar("context_id", { length: 64 }),
  reportedUserRole: varchar("reported_user_role", { length: 20 }),
  severity: varchar("severity", { length: 10 }).notNull().default("low"),
  affectedFeedbackLoop: boolean("affected_feedback_loop").notNull().default(false),
  reporterTrustScore: doublePrecision("reporter_trust_score").notNull().default(1.0),
  // Task #2531 — claim system: ogni report può essere preso in carico da un moderatore.
  assignedModeratorId: varchar("assigned_moderator_id", { length: 36 }),
  assignedAt: timestamp("assigned_at"),
  // Task #2532 — AI Co-Pilot moderation analysis (mai sovrascrive scelte umane).
  aiAnalysis: jsonb("ai_analysis"),
  aiAnalyzedAt: timestamp("ai_analyzed_at"),
  aiModel: text("ai_model"),
  disableAiAnalysis: boolean("disable_ai_analysis").notNull().default(false),
}, (table) => [
  index("reports_status_idx").on(table.status),
  index("reports_category_idx").on(table.category),
  index("reports_reported_user_idx").on(table.reportedUserId),
  index("reports_severity_status_idx").on(table.severity, table.status),
  index("reports_reporter_idx").on(table.reporterId),
  index("reports_assigned_moderator_idx").on(table.assignedModeratorId).where(sql`"assigned_moderator_id" IS NOT NULL`),
  index("reports_ai_analyzed_at_idx").on(table.aiAnalyzedAt),
]);

// Task #2532 — log strutturato di ogni suggerimento/chat AI (audit + cost tracking).
export const aiSuggestionsLog = pgTable("ai_suggestions_log", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id", { length: 36 }),
  userId: varchar("user_id", { length: 36 }),
  scope: varchar("scope", { length: 30 }).notNull(), // triage|chat|digest|anomaly|action_draft
  prompt: text("prompt"),
  response: text("response"),
  model: varchar("model", { length: 80 }),
  provider: varchar("provider", { length: 30 }),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  suggestion: jsonb("suggestion"),
  acceptedByAdminId: varchar("accepted_by_admin_id", { length: 36 }),
  acceptedAt: timestamp("accepted_at"),
  rejectedByAdminId: varchar("rejected_by_admin_id", { length: 36 }),
  rejectedAt: timestamp("rejected_at"),
  rejectReason: varchar("reject_reason", { length: 300 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("ai_suggestions_scope_idx").on(table.scope),
  index("ai_suggestions_report_idx").on(table.reportId),
  index("ai_suggestions_created_idx").on(table.createdAt),
]);

// Task #2532 — budget mensile per costi AI (alert 80%, freeze chat a 100%).
export const aiUsageBudget = pgTable("ai_usage_budget", {
  month: varchar("month", { length: 7 }).primaryKey(), // YYYY-MM
  totalCostUsd: numeric("total_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  limitUsd: numeric("limit_usd", { precision: 12, scale: 2 }).notNull().default("55"), // ~50€
  alertSent80: boolean("alert_sent_80").notNull().default(false),
  alertSent100: boolean("alert_sent_100").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Task #2532 — digest giornaliero per moderatore.
export const moderatorDigests = pgTable("moderator_digests", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  moderatorId: varchar("moderator_id", { length: 36 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("moderator_digests_mod_date_idx").on(table.moderatorId, table.date),
]);

// Task #2532 — eventi di anomalia rilevati (spike per categoria etc.).
export const anomalyEvents = pgTable("anomaly_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type", { length: 40 }).notNull(),
  category: varchar("category", { length: 40 }),
  windowMinutes: integer("window_minutes").notNull().default(60),
  observed: integer("observed").notNull().default(0),
  threshold: doublePrecision("threshold").notNull().default(0),
  details: jsonb("details"),
  notifiedAdmins: boolean("notified_admins").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("anomaly_events_created_idx").on(table.createdAt),
  index("anomaly_events_type_idx").on(table.type),
]);

export type AiSuggestionLog = typeof aiSuggestionsLog.$inferSelect;
export type InsertAiSuggestionLog = typeof aiSuggestionsLog.$inferInsert;
export type AnomalyEvent = typeof anomalyEvents.$inferSelect;
export type ModeratorDigest = typeof moderatorDigests.$inferSelect;

// Task #2551 — stato letto/non letto del digest per moderatore.
// PK composto (moderatorId, digestId) garantisce idempotenza del mark-read.
export const digestReadState = pgTable("digest_read_state", {
  moderatorId: varchar("moderator_id", { length: 36 }).notNull(),
  digestId: varchar("digest_id", { length: 36 }).notNull(),
  readAt: timestamp("read_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("digest_read_state_mod_digest_idx").on(table.moderatorId, table.digestId),
  index("digest_read_state_mod_idx").on(table.moderatorId),
]);
export type DigestReadState = typeof digestReadState.$inferSelect;
export type InsertDigestReadState = typeof digestReadState.$inferInsert;

// Task #2530 — soglie configurabili (biker/zavorrina) per notify/shadow_ban.
export const moderationThresholds = pgTable("moderation_thresholds", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  targetRole: varchar("target_role", { length: 20 }).notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  threshold: integer("threshold").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("moderation_thresholds_role_action_idx").on(table.targetRole, table.action),
]);

export const moderatorLogs = pgTable("moderator_logs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  moderatorId: varchar("moderator_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("target_type", { length: 50 }).notNull(),
  targetId: varchar("target_id", { length: 36 }).notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("moderator_logs_target_id_idx").on(table.targetId),
  index("moderator_logs_moderator_id_idx").on(table.moderatorId),
  index("moderator_logs_created_at_idx").on(table.createdAt),
]);

export const fakeUserInteractions = pgTable("fake_user_interactions", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  fakeUserId: varchar("fake_user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  realUserId: varchar("real_user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  interactionType: varchar("interaction_type", { length: 30 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("fake_interactions_fake_user_idx").on(table.fakeUserId),
  index("fake_interactions_real_user_idx").on(table.realUserId),
]);

export const userBlocks = pgTable("user_blocks", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  blockerId: varchar("blocker_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  blockedId: varchar("blocked_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_blocks_unique_idx").on(table.blockerId, table.blockedId),
  index("user_blocks_blocker_idx").on(table.blockerId),
  index("user_blocks_blocked_idx").on(table.blockedId),
]);

export const userFavorites = pgTable("user_favorites", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  favoriteUserId: varchar("favorite_user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_favorites_unique_idx").on(table.userId, table.favoriteUserId),
  index("user_favorites_user_id_idx").on(table.userId),
]);

export type EasterEgg = typeof easterEggs.$inferSelect;
export type InsertEasterEgg = typeof easterEggs.$inferInsert;
export type CollectedEasterEgg = typeof collectedEasterEggs.$inferSelect;
export type InsertCollectedEasterEgg = typeof collectedEasterEggs.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;
export type ModerationThreshold = typeof moderationThresholds.$inferSelect;
export type InsertModerationThreshold = typeof moderationThresholds.$inferInsert;
export type ModeratorLog = typeof moderatorLogs.$inferSelect;
export type InsertModeratorLog = typeof moderatorLogs.$inferInsert;
export type FakeUserInteraction = typeof fakeUserInteractions.$inferSelect;
export type InsertFakeUserInteraction = typeof fakeUserInteractions.$inferInsert;
export type UserBlock = typeof userBlocks.$inferSelect;
export type InsertUserBlock = typeof userBlocks.$inferInsert;
export type UserFavorite = typeof userFavorites.$inferSelect;
export type InsertUserFavorite = typeof userFavorites.$inferInsert;

export const easterEggSchema = z.object({
  name: z.string().optional(),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
}).passthrough();
export type EasterEggInput = z.infer<typeof easterEggSchema>;

export const easterEggBatchSchema = z.object({
  count: z.union([z.number(), z.string()]).optional(),
  radius: z.union([z.number(), z.string()]).optional(),
  points: z.union([z.number(), z.string()]).optional(),
});
export type EasterEggBatchInput = z.infer<typeof easterEggBatchSchema>;

export const reportResolveSchema = z.object({
  status: z.enum(["resolved", "dismissed"], { message: "Stato non valido" }),
});
export type ReportResolveInput = z.infer<typeof reportResolveSchema>;

export const stregattaSchema = z.object({
  nickname: z.string().min(1, "Nickname obbligatorio"),
  userType: z.string().min(1, "Tipo utente obbligatorio"),
  sex: z.string().optional(),
  coupleSexConfig: z.string().optional(),
  birthYear: z.union([z.number().int(), z.string()]).optional(),
  region: z.string().optional(),
  country: z.string().default("IT"),
  bio: z.string().optional(),
  moto: z.unknown().optional(),
  wishlistDescription: z.string().optional(),
  wishlistMotos: z.array(z.unknown()).optional(),
}).passthrough();
export type StregattaInput = z.infer<typeof stregattaSchema>;

export const stregattaToggleSchema = z.object({
  enabled: z.boolean({ message: "Il campo 'enabled' deve essere un booleano" }),
  adminPassword: z.string().min(1, "Password admin richiesta"),
});
export type StregattaToggleInput = z.infer<typeof stregattaToggleSchema>;

export const simulateActivitySchema = z.object({
  message: z.string().optional(),
  count: z.number().int().min(1).default(1),
}).passthrough();
export type SimulateActivityInput = z.infer<typeof simulateActivitySchema>;
