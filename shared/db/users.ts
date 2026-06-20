import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

// Task #2510: tipo PostGIS `geography(Point, 4326)`. Drizzle non ha un tipo
// nativo; usiamo customType che mappa la colonna come stringa WKT lato JS
// (in pratica le query usano ST_DWithin / ST_MakePoint, non leggono il valore
// raw). La colonna è GENERATED ALWAYS dal DB — non va mai impostata in INSERT.
// dataType() restituisce "geography" (senza parametri) per corrispondere a
// udt_name restituito da PostgreSQL. generatedAlwaysAs rispecchia l'espressione
// GENERATED ALWAYS definita in PG, preservando la colonna nei diff ORM.
const geographyPoint = customType<{ data: string; notNull: false; default: false }>({
  dataType() { return "geography"; },
});
import { z } from "zod";
export const users = pgTable("users", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  nickname: varchar("nickname", { length: 50 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 30 }),
  password: text("password").notNull(),
  userType: varchar("user_type", { length: 20 }).notNull().default("biker"),
  sex: varchar("sex", { length: 5 }),
  coupleSexConfig: varchar("couple_sex_config", { length: 10 }),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  // Task #2532 — scadenza ban temporanea (auto-unban quando NOW() > suspendedUntil).
  suspendedUntil: timestamp("suspended_until"),
  birthYear: integer("birth_year"),
  region: varchar("region", { length: 100 }),
  avatarUrl: text("avatar_url"),
  emailVerified: boolean("email_verified").notNull().default(false),
  eulaAccepted: boolean("eula_accepted").notNull().default(false),
  privacyAccepted: boolean("privacy_accepted").notNull().default(false),
  marketingConsent: boolean("marketing_consent").notNull().default(false),
  consentAcceptedAt: timestamp("consent_accepted_at"),
  deletionRequestedAt: timestamp("deletion_requested_at"),
  deletionScheduledFor: timestamp("deletion_scheduled_for"),
  invitationCode: varchar("invitation_code", { length: 50 }),
  isFake: boolean("is_fake").notNull().default(false),
  isPrimal: boolean("is_primal").notNull().default(false),
  // Task #2794 — flag dedicato per gli account di sistema (es. BikerLink_Official).
  // Rende l'identificazione auto-descrittiva e indipendente dal nickname
  // (sostituisce/affianca PROTECTED_NICKNAMES in server/constants.ts).
  isSystem: boolean("is_system").notNull().default(false),
  country: varchar("country", { length: 2 }),
  spokenLanguages: jsonb("spoken_languages").$type<string[]>().default([]),
  autoJoinClubs: boolean("auto_join_clubs").notNull().default(true),
  ghostMode: boolean("ghost_mode").notNull().default(false),
  mapTester: boolean("map_tester").notNull().default(false),
  floatingWidgetEnabled: boolean("floating_widget_enabled").notNull().default(true),
  // Task #2530 — shadow-ban morbido per moderazione segnalazioni
  shadowBannedAt: timestamp("shadow_banned_at"),
  shadowBanReason: text("shadow_ban_reason"),
  shadowBannedUntil: timestamp("shadow_banned_until"),
  lastLoginAt: timestamp("last_login_at"),
  lastLogoutAt: timestamp("last_logout_at"),
  lastAppCloseAt: timestamp("last_app_close_at"),
  lastAppVersion: varchar("last_app_version", { length: 32 }),
  lastPlatform: varchar("last_platform", { length: 16 }),
  lastDeviceModel: varchar("last_device_model", { length: 100 }),
  expoPushToken: text("expo_push_token"),
  // Causa reale dell'ultimo fallimento di registrazione del push token,
  // persistita dal client per renderla visibile nel diagnostic in-app senza
  // accesso ai log (PERMESSI_NEGATI / PROJECT_ID_MANCANTE / TOKEN_NON_OTTENUTO /
  // TOKEN_VUOTO / ERRORE_REGISTRAZIONE). NULL = nessun errore noto.
  pushTokenError: varchar("push_token_error", { length: 48 }),
  pushTokenErrorDetail: text("push_token_error_detail"),
  pushTokenErrorPlatform: varchar("push_token_error_platform", { length: 16 }),
  pushTokenErrorAt: timestamp("push_token_error_at"),
  // Task #2645 — preferenze admin (onboarding console, hint dismissed, ecc.)
  adminPrefs: jsonb("admin_prefs").$type<Record<string, unknown>>().default({}),
  // Task #2698 — preferenze AI Assistant per utenti normali (opt-out per-user)
  assistantPrefs: jsonb("assistant_prefs").$type<{
    disabled?: boolean;
    proactiveDisabled?: boolean;
    onboardingDisabled?: boolean;
    updatedAt?: string;
  }>().default({}),
  firstLoginAt: timestamp("first_login_at"),
  firstLoginLat: doublePrecision("first_login_lat"),
  firstLoginLng: doublePrecision("first_login_lng"),
  lastSeenMatchAt: timestamp("last_seen_match_at"),
  telemetryDisabled: boolean("telemetry_disabled").notNull().default(false),
  matchingDisabled: boolean("matching_disabled").notNull().default(false),
  // Task #3946 — calibrazione assi supporto moto persistente su server
  mountCalibration: jsonb("mount_calibration").$type<{
    longAxis: "x" | "y" | "z";
    latAxis: "x" | "y" | "z";
    vertAxis: "x" | "y" | "z";
    longSign: 1 | -1;
    timestamp: number;
  } | null>(),
  aisEnabled: boolean("ais_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("users_status_idx").on(table.status),
  index("users_is_fake_idx").on(table.isFake),
  index("users_ghost_mode_idx").on(table.ghostMode),
  index("users_country_idx").on(table.country),
  index("users_user_type_idx").on(table.userType),
  index("users_active_pool_idx").on(table.status, table.isFake, table.ghostMode),
  index("users_role_idx").on(table.role),
]);

export const userPhotos = pgTable("user_photos", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isApproved: boolean("is_approved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("user_photos_user_id_idx").on(table.userId),
]);

export const userMotorcycles = pgTable("user_motorcycles", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  brand: varchar("brand", { length: 100 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  year: integer("year"),
  displacement: integer("displacement"),
  motorcycleType: varchar("motorcycle_type", { length: 50 }),
  ridingStyle: varchar("riding_style", { length: 50 }),
  photoUrl: text("photo_url"),
  isDefault: boolean("is_default").notNull().default(false),
  isForSale: boolean("is_for_sale").notNull().default(false),
  saleDescription: text("sale_description"),
  motoDescription: text("moto_description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("user_motorcycles_user_id_idx").on(table.userId),
  index("user_motorcycles_brand_idx").on(table.brand),
  index("user_motorcycles_brand_model_idx").on(table.brand, table.model),
  index("user_motorcycles_type_idx").on(table.motorcycleType),
]);

export const userProfiles = pgTable("user_profiles", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  isAvailable: boolean("is_available").notNull().default(false),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  maxPickupDistance: integer("max_pickup_distance").default(50),
  bio: text("bio"),
  totalKm: doublePrecision("total_km").notNull().default(0),
  totalRides: integer("total_rides").notNull().default(0),
  easterEggsCollected: integer("easter_eggs_collected").notNull().default(0),
  searchPreference: varchar("search_preference", { length: 20 }).notNull().default("both"),
  preferredMapStyle: varchar("preferred_map_style", { length: 20 }),
  emailChatNotifications: boolean("email_chat_notifications").notNull().default(true),
  notificationPreferences: jsonb("notification_preferences")
    .$type<{ matches: boolean; zoneProposals: boolean; chat: boolean; motoclub: boolean; eventi: boolean; system_alerts?: boolean }>()
    .notNull()
    .default(sql`'{"matches":true,"zoneProposals":true,"chat":true,"motoclub":true,"eventi":true}'::jsonb`),
  pushNotificationsEnabled: boolean("push_notifications_enabled").notNull().default(true),
  hideFromMap: boolean("hide_from_map").notNull().default(false),
  hideOnlineStatus: boolean("hide_online_status").notNull().default(false),
  hideLastSeen: boolean("hide_last_seen").notNull().default(false),
  hideDistance: boolean("hide_distance").notNull().default(false),
  positionFuzz: boolean("position_fuzz").notNull().default(false),
  positionFuzzKm: integer("position_fuzz_km").notNull().default(1),
  fakeHomeEnabled: boolean("fake_home_enabled").notNull().default(false),
  homeLatitude: doublePrecision("home_latitude"),
  homeLongitude: doublePrecision("home_longitude"),
  fakeHomeLatitude: doublePrecision("fake_home_latitude"),
  fakeHomeLongitude: doublePrecision("fake_home_longitude"),
  fakeHomeRadius: integer("fake_home_radius").notNull().default(2),
  offlinePositionRandomize: boolean("offline_position_randomize").notNull().default(true),
  fakeWorkEnabled: boolean("fake_work_enabled").notNull().default(false),
  workLatitude: doublePrecision("work_latitude"),
  workLongitude: doublePrecision("work_longitude"),
  fakeWorkLatitude: doublePrecision("fake_work_latitude"),
  fakeWorkLongitude: doublePrecision("fake_work_longitude"),
  fakeWorkRadius: integer("fake_work_radius").notNull().default(2),
  fakeWhateverEnabled: boolean("fake_whatever_enabled").notNull().default(false),
  whateverLatitude: doublePrecision("whatever_latitude"),
  whateverLongitude: doublePrecision("whatever_longitude"),
  fakeWhateverLatitude: doublePrecision("fake_whatever_latitude"),
  fakeWhateverLongitude: doublePrecision("fake_whatever_longitude"),
  fakeWhateverRadius: integer("fake_whatever_radius").notNull().default(2),
  fixedPositionEnabled: boolean("fixed_position_enabled").notNull().default(false),
  fixedPositionLat: doublePrecision("fixed_position_lat"),
  fixedPositionLng: doublePrecision("fixed_position_lng"),
  lastOfflineLat: doublePrecision("last_offline_lat"),
  lastOfflineLng: doublePrecision("last_offline_lng"),
  gpsPrecision: varchar("gps_precision", { length: 30 }).notNull().default("balanced"),
  unitsPreference: jsonb("units_preference").$type<{ timeFormat: string; speedUnit: string; distanceUnit: string } | null>(),
  mapFilters: jsonb("map_filters").$type<{ biker?: boolean; zavorrina?: boolean; clubs?: boolean; events?: boolean } | null>(),
  coordinatesUpdatedAt: timestamp("coordinates_updated_at"),
  adminOverrideUntil: timestamp("admin_override_until"),
  // Task #2516 — testo libero "gusti musicali" usato in aggiunta ai tag
  // della categoria "musica" per costruire l'embedding `music_taste`.
  musicTasteText: text("music_taste_text"),
  // Task #2510: colonna PostGIS generata sempre da (longitude, latitude).
  // generatedAlwaysAs rispecchia GENERATED ALWAYS del DB.
  geom: geographyPoint("geom").generatedAlwaysAs(
    sql`CASE WHEN ((longitude IS NOT NULL) AND (latitude IS NOT NULL)) THEN (st_setsrid(st_makepoint(longitude, latitude), 4326))::geography ELSE NULL::geography END`,
  ),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("user_profiles_user_id_idx").on(table.userId),
  index("user_profiles_location_idx").on(table.latitude, table.longitude),
  index("user_profiles_latitude_idx").on(table.latitude),
  index("user_profiles_longitude_idx").on(table.longitude),
  index("user_profiles_coords_updated_idx").on(table.coordinatesUpdatedAt),
  index("user_profiles_is_available_idx").on(table.isAvailable),
]);

export const userDevices = pgTable("user_devices", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  model: varchar("model", { length: 100 }).notNull(),
  platform: varchar("platform", { length: 16 }),
  osVersion: varchar("os_version", { length: 50 }),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
}, (table) => [
  index("user_devices_user_id_idx").on(table.userId),
  index("user_devices_last_seen_at_idx").on(table.lastSeenAt),
  uniqueIndex("user_devices_user_model_uq").on(table.userId, table.model),
]);

export type UserDevice = typeof userDevices.$inferSelect;
export type InsertUserDevice = typeof userDevices.$inferInsert;

export const motorcyclePhotos = pgTable("motorcycle_photos", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  motorcycleId: varchar("motorcycle_id", { length: 36 })
    .notNull()
    .references(() => userMotorcycles.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("motorcycle_photos_motorcycle_id_idx").on(table.motorcycleId),
]);

export const userTimeProfile = pgTable("user_time_profile", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  histogram: jsonb("histogram").$type<number[]>().notNull(),
  totalRides: integer("total_rides").notNull().default(0),
  label: varchar("label", { length: 50 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("user_time_profile_user_id_idx").on(table.userId),
  index("user_time_profile_label_idx").on(table.label),
]);

export type UserTimeProfile = typeof userTimeProfile.$inferSelect;
export type InsertUserTimeProfile = typeof userTimeProfile.$inferInsert;

export const userSessions = pgTable("user_sessions", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
  endedAt: timestamp("ended_at"),
  durationSeconds: integer("duration_seconds"),
  exitType: varchar("exit_type", { length: 20 }),
  deviceModel: varchar("device_model", { length: 100 }),
  platform: varchar("platform", { length: 16 }),
  appVersion: varchar("app_version", { length: 32 }),
}, (table) => [
  index("user_sessions_user_id_idx").on(table.userId),
  index("user_sessions_started_at_idx").on(table.startedAt),
  index("user_sessions_ended_at_idx").on(table.endedAt).where(sql`ended_at IS NULL`),
]);

export type SessionExitType = "background" | "logout" | "crash";
export type UserSession = Omit<typeof userSessions.$inferSelect, "exitType"> & { exitType: SessionExitType | null };
export type InsertUserSession = Omit<typeof userSessions.$inferInsert, "exitType"> & { exitType?: SessionExitType | null };

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type UserPhoto = typeof userPhotos.$inferSelect;
export type InsertUserPhoto = typeof userPhotos.$inferInsert;
export type UserMotorcycle = typeof userMotorcycles.$inferSelect;
export type InsertUserMotorcycle = typeof userMotorcycles.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;
export type MotorcyclePhoto = typeof motorcyclePhotos.$inferSelect;
export type InsertMotorcyclePhoto = typeof motorcyclePhotos.$inferInsert;

export const updateUserSchema = z.object({
  nickname: z.string().min(3, "Il nickname deve avere almeno 3 caratteri").max(50).optional(),
  phone: z.string().max(30).nullable().optional(),
  sex: z.enum(["M", "F"]).nullable().optional(),
  coupleSexConfig: z.enum(["M+M", "M+F", "F+F"]).nullable().optional(),
  birthYear: z.number().int().min(1930).max(2010).nullable().optional(),
  region: z.string().max(100).nullable().optional(),
  country: z.string().max(2).nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  floatingWidgetEnabled: z.boolean().optional(),
  bio: z.string().max(1000).nullable().optional(),
  maxPickupDistance: z.number().int().min(1).max(500).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  unitsPreference: z.object({
    timeFormat: z.enum(["12h", "24h"]),
    speedUnit: z.enum(["kmh", "mph", "knots"]),
    distanceUnit: z.enum(["km_m", "mi_ft", "mi_yd", "nmi_ftm"]),
  }).nullable().optional(),
  mapFilters: z.object({
    biker: z.boolean().optional(),
    zavorrina: z.boolean().optional(),
    clubs: z.boolean().optional(),
    events: z.boolean().optional(),
  }).nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateDynamicProfileSchema = z.object({
  isAvailable: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  searchPreference: z.string().max(20).optional(),
  preferredMapStyle: z.enum(["carto_light", "carto_dark", "esri_gray"]).nullable().optional(),
  emailChatNotifications: z.boolean().optional(),
  pushNotificationsEnabled: z.boolean().optional(),
  notificationPreferences: z.object({
    matches: z.boolean().optional(),
    zoneProposals: z.boolean().optional(),
    chat: z.boolean().optional(),
    motoclub: z.boolean().optional(),
    eventi: z.boolean().optional(),
  }).optional(),
});
export type UpdateDynamicProfileInput = z.infer<typeof updateDynamicProfileSchema>;

export const pushTokenSchema = z.object({
  token: z.string().max(256).nullable().optional(),
});
export type PushTokenInput = z.infer<typeof pushTokenSchema>;

export const motorcycleSchema = z.object({
  brand: z.string().min(1, "Marca obbligatoria").max(100),
  model: z.string().min(1, "Modello obbligatorio").max(100),
  year: z.number().int().min(1900).max(2030).nullable().optional(),
  displacement: z.number().int().min(1).max(10000).nullable().optional(),
  motorcycleType: z.string().max(50).optional(),
  ridingStyle: z.string().max(50).optional(),
  isDefault: z.boolean().optional(),
  isForSale: z.boolean().optional(),
  saleDescription: z.string().max(1000).nullable().optional(),
  motoDescription: z.string().max(1000).nullable().optional(),
});
export type MotorcycleInput = z.infer<typeof motorcycleSchema>;

export const createMotorcycleSchema = z.object({
  brand: z.string().min(1, "Marca obbligatoria"),
  model: z.string().min(1, "Modello obbligatorio"),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2).optional().nullable(),
  displacement: z.number().int().min(1).optional().nullable(),
  motorcycleType: z.string().optional().nullable(),
  ridingStyle: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  isForSale: z.boolean().optional(),
  saleDescription: z.string().max(2000).optional().nullable(),
  isDefault: z.boolean().optional(),
  motoDescription: z.string().max(2000).optional().nullable(),
});
export type CreateMotorcycleInput = z.infer<typeof createMotorcycleSchema>;

export const updateMotorcycleSchema = createMotorcycleSchema.partial();
export type UpdateMotorcycleInput = z.infer<typeof updateMotorcycleSchema>;

export const uploadPhotoSchema = z.object({
  imageBase64: z.string().min(1, "Immagine obbligatoria"),
  filename: z.string().optional(),
});
export type UploadPhotoInput = z.infer<typeof uploadPhotoSchema>;

export const updateUserMeSchema = z.object({
  nickname: z.string().min(1).max(50).optional(),
  phone: z.string().optional().nullable(),
  sex: z.string().optional().nullable(),
  coupleSexConfig: z.string().optional().nullable(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional().nullable(),
  region: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
  floatingWidgetEnabled: z.boolean().optional(),
  bio: z.string().max(2000).optional().nullable(),
  maxPickupDistance: z.number().min(0).optional().nullable(),
  latitude: z.number().finite().optional().nullable(),
  longitude: z.number().finite().optional().nullable(),
  unitsPreference: z.object({
    timeFormat: z.enum(["12h", "24h"]),
    speedUnit: z.enum(["kmh", "mph", "knots"]),
    distanceUnit: z.enum(["km_m", "mi_ft", "mi_yd", "nmi_ftm"]),
  }).nullable().optional(),
  mapFilters: z.record(z.string(), z.boolean()).nullable().optional(),
});
export type UpdateUserMeInput = z.infer<typeof updateUserMeSchema>;

export const updateLocationSchema = z.object({
  latitude: z.number().finite("Latitudine non valida"),
  longitude: z.number().finite("Longitudine non valida"),
  isAvailable: z.boolean().optional(),
});
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export const updateProfileDynamicSchema = z.object({
  isAvailable: z.boolean().optional(),
  latitude: z.number().finite().nullable().optional(),
  longitude: z.number().finite().nullable().optional(),
  searchPreference: z.string().optional(),
  preferredMapStyle: z.string().optional(),
  emailChatNotifications: z.boolean().optional(),
  notificationPreferences: z.record(z.string(), z.unknown()).optional(),
  pushNotificationsEnabled: z.boolean().optional(),
}).passthrough();
export type UpdateProfileDynamicInput = z.infer<typeof updateProfileDynamicSchema>;

export const ghostModeSchema = z.object({
  enabled: z.boolean({ message: "enabled deve essere un booleano" }),
});
export type GhostModeInput = z.infer<typeof ghostModeSchema>;

export const availabilitySchema = z.object({
  isAvailable: z.boolean({ message: "isAvailable deve essere un booleano" }),
  latitude: z.number().finite().nullable().optional(),
  longitude: z.number().finite().nullable().optional(),
});
export type AvailabilityInput = z.infer<typeof availabilitySchema>;

export const privacySettingsSchema = z.object({
  hideFromMap: z.boolean().optional(),
  positionFuzz: z.boolean().optional(),
  positionFuzzKm: z.number().int().min(1).max(50).optional(),
  fakeHomeEnabled: z.boolean().optional(),
  homeLatitude: z.number().finite().nullable().optional(),
  homeLongitude: z.number().finite().nullable().optional(),
  fakeHomeLatitude: z.number().finite().nullable().optional(),
  fakeHomeLongitude: z.number().finite().nullable().optional(),
  fakeHomeRadius: z.number().positive().nullable().optional(),
  gpsPrecision: z.string().optional(),
  offlinePositionRandomize: z.boolean().optional(),
  fakeWorkEnabled: z.boolean().optional(),
  workLatitude: z.number().finite().nullable().optional(),
  workLongitude: z.number().finite().nullable().optional(),
  fakeWorkLatitude: z.number().finite().nullable().optional(),
  fakeWorkLongitude: z.number().finite().nullable().optional(),
  fakeWorkRadius: z.number().positive().nullable().optional(),
  fakeWhateverEnabled: z.boolean().optional(),
  whateverLatitude: z.number().finite().nullable().optional(),
  whateverLongitude: z.number().finite().nullable().optional(),
  fakeWhateverLatitude: z.number().finite().nullable().optional(),
  fakeWhateverLongitude: z.number().finite().nullable().optional(),
  fakeWhateverRadius: z.number().positive().nullable().optional(),
}).passthrough();
export type PrivacySettingsInput = z.infer<typeof privacySettingsSchema>;

export const userPrivacyLog = pgTable("user_privacy_log", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  settingKey: varchar("setting_key", { length: 64 }).notNull(),
  newValue: boolean("new_value").notNull(),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
}, (table) => [
  index("user_privacy_log_user_id_changed_at_idx").on(table.userId, table.changedAt.desc()),
]);

export type UserPrivacyLog = typeof userPrivacyLog.$inferSelect;
export type InsertUserPrivacyLog = typeof userPrivacyLog.$inferInsert;

export const userReportSchema = z.object({
  reason: z.string().min(1, "Motivo obbligatorio"),
  description: z.string().max(500).optional(),
});
export type UserReportInput = z.infer<typeof userReportSchema>;

export const verifyPasswordSchema = z.object({
  password: z.string().min(1, "Password mancante"),
});
export type VerifyPasswordInput = z.infer<typeof verifyPasswordSchema>;

export const userStatusSchema = z.object({
  status: z.enum(["active", "suspended", "blocked"], { message: "Stato non valido" }),
});
export type UserStatusInput = z.infer<typeof userStatusSchema>;

export const userRoleSchema = z.object({
  role: z.enum(["user", "moderator", "admin"], { message: "Ruolo non valido" }),
});
export type UserRoleInput = z.infer<typeof userRoleSchema>;

export const userEmailAdminSchema = z.object({
  email: z.string().email("Email non valida"),
});
export type UserEmailAdminInput = z.infer<typeof userEmailAdminSchema>;

export const adminSetPasswordSchema = z.object({
  password: z.string().min(6, "La password deve avere almeno 6 caratteri"),
});
export type AdminSetPasswordInput = z.infer<typeof adminSetPasswordSchema>;

export const primalSchema = z.object({
  isPrimal: z.boolean().optional(),
});
export type PrimalInput = z.infer<typeof primalSchema>;
