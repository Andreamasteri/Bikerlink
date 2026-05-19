import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  serial,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
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
  birthYear: integer("birth_year"),
  region: varchar("region", { length: 100 }),
  avatarUrl: text("avatar_url"),
  emailVerified: boolean("email_verified").notNull().default(false),
  eulaAccepted: boolean("eula_accepted").notNull().default(false),
  privacyAccepted: boolean("privacy_accepted").notNull().default(false),
  consentAcceptedAt: timestamp("consent_accepted_at"),
  deletionRequestedAt: timestamp("deletion_requested_at"),
  deletionScheduledFor: timestamp("deletion_scheduled_for"),
  invitationCode: varchar("invitation_code", { length: 50 }),
  isFake: boolean("is_fake").notNull().default(false),
  isPrimal: boolean("is_primal").notNull().default(false),
  country: varchar("country", { length: 2 }),
  spokenLanguages: jsonb("spoken_languages").$type<string[]>().default([]),
  autoJoinClubs: boolean("auto_join_clubs").notNull().default(true),
  ghostMode: boolean("ghost_mode").notNull().default(false),
  floatingWidgetEnabled: boolean("floating_widget_enabled").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  lastLogoutAt: timestamp("last_logout_at"),
  lastAppCloseAt: timestamp("last_app_close_at"),
  lastAppVersion: varchar("last_app_version", { length: 32 }),
  lastOtaNumber: integer("last_ota_number"),
  lastPlatform: varchar("last_platform", { length: 16 }),
  expoPushToken: text("expo_push_token"),
  firstLoginAt: timestamp("first_login_at"),
  firstLoginLat: doublePrecision("first_login_lat"),
  firstLoginLng: doublePrecision("first_login_lng"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
  emailChatNotifications: boolean("email_chat_notifications").notNull().default(false),
  hideFromMap: boolean("hide_from_map").notNull().default(false),
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
  lastOfflineLat: doublePrecision("last_offline_lat"),
  lastOfflineLng: doublePrecision("last_offline_lng"),
  gpsPrecision: varchar("gps_precision", { length: 30 }).notNull().default("balanced"),
  unitsPreference: jsonb("units_preference").$type<{ timeFormat: string; speedUnit: string; distanceUnit: string } | null>(),
  coordinatesUpdatedAt: timestamp("coordinates_updated_at"),
  adminOverrideUntil: timestamp("admin_override_until"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("user_profiles_user_id_idx").on(table.userId),
  index("user_profiles_location_idx").on(table.latitude, table.longitude),
]);

export const proposals = pgTable("proposals", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  proposalType: varchar("proposal_type", { length: 30 }).notNull(),
  searchType: varchar("search_type", { length: 30 }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  searchRadius: integer("search_radius"),
  motorcycleId: varchar("motorcycle_id", { length: 36 }),
  wishlistMotoId: varchar("wishlist_moto_id", { length: 36 }),
  anyMotoOk: boolean("any_moto_ok").notNull().default(false),
  departureLatitude: doublePrecision("departure_latitude"),
  departureLongitude: doublePrecision("departure_longitude"),
  departureAddress: text("departure_address"),
  destinationAddress: text("destination_address"),
  destinationLatitude: doublePrecision("destination_latitude"),
  destinationLongitude: doublePrecision("destination_longitude"),
  scheduledAt: timestamp("scheduled_at"),
  departureTimeFrom: timestamp("departure_time_from"),
  departureTimeTo: timestamp("departure_time_to"),
  returnDeadline: timestamp("return_deadline"),
  stops: jsonb("stops"),
  maxParticipants: integer("max_participants"),
  expiresAt: timestamp("expires_at"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  clubId: varchar("club_id", { length: 36 }),
  extendToDestination: boolean("extend_to_destination").notNull().default(false),
  destinationSearchRadius: integer("destination_search_radius"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("proposals_user_id_idx").on(table.userId),
  index("proposals_status_idx").on(table.status),
  index("proposals_expires_at_idx").on(table.expiresAt),
]);

export const proposalParticipants = pgTable("proposal_participants", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id", { length: 36 })
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("proposal_participants_unique_idx").on(table.proposalId, table.userId),
]);

export const proposalMatches = pgTable("proposal_matches", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  proposalId1: varchar("proposal_id_1", { length: 36 })
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade" }),
  proposalId2: varchar("proposal_id_2", { length: 36 })
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade" }),
  userId1: varchar("user_id_1", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  userId2: varchar("user_id_2", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  acceptedByUser1: boolean("accepted_by_user_1").notNull().default(false),
  acceptedByUser2: boolean("accepted_by_user_2").notNull().default(false),
  conversationId: varchar("conversation_id", { length: 36 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("proposal_matches_user1_idx").on(table.userId1),
  index("proposal_matches_user2_idx").on(table.userId2),
  index("proposal_matches_status_idx").on(table.status),
]);

export const conversations = pgTable("conversations", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationType: varchar("conversation_type", { length: 20 }).notNull().default("private"),
  title: varchar("title", { length: 200 }),
  proposalId: varchar("proposal_id", { length: 36 })
    .references(() => proposals.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversationParticipants = pgTable("conversation_participants", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 })
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  lastReadAt: timestamp("last_read_at"),
}, (table) => [
  uniqueIndex("conversation_participants_unique_idx").on(table.conversationId, table.userId),
  index("conversation_participants_user_id_idx").on(table.userId),
]);

export const messages = pgTable("messages", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 })
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  messageType: varchar("message_type", { length: 20 }).notNull().default("text"),
  content: text("content"),
  imageUrl: text("image_url"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  isFiltered: boolean("is_filtered").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  playlistId: integer("playlist_id").references(() => sharedPlaylists.id, { onDelete: "set null" }),
}, (table) => [
  index("messages_conversation_id_idx").on(table.conversationId),
  index("messages_sender_id_idx").on(table.senderId),
]);

export const routes = pgTable("routes", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }),
  trackingFrequency: integer("tracking_frequency").notNull().default(5),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  totalDistanceKm: doublePrecision("total_distance_km").default(0),
  maxSpeedKmh: doublePrecision("max_speed_kmh").default(0),
  avgSpeedKmh: doublePrecision("avg_speed_kmh").default(0),
  maxAltitude: doublePrecision("max_altitude").default(0),
  durationSeconds: integer("duration_seconds").default(0),
  idleTimeSeconds: integer("idle_time_seconds").default(0),
  maxTiltDeg: doublePrecision("max_tilt_deg"),
  maxAccelerationG: doublePrecision("max_acceleration_g"),
  maxDecelerationG: doublePrecision("max_deceleration_g"),
  maxLateralG: doublePrecision("max_lateral_g"),
  isSprint: boolean("is_sprint").notNull().default(false),
  sprint0to100Ms: integer("sprint_0to100_ms"),
  gpsBlackoutCount: integer("gps_blackout_count").notNull().default(0),
  gpsBlackoutSeconds: integer("gps_blackout_seconds").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  stoppedAt: timestamp("stopped_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("routes_user_id_idx").on(table.userId),
]);

export const sprintResults = pgTable("sprint_results", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  routeId: varchar("route_id", { length: 36 })
    .references(() => routes.id, { onDelete: "set null" }),
  sprint0to100Ms: integer("sprint_0to100_ms").notNull(),
  maxAccelerationG: doublePrecision("max_acceleration_g"),
  maxDecelerationG: doublePrecision("max_deceleration_g"),
  maxTiltDeg: doublePrecision("max_tilt_deg"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("sprint_results_user_id_idx").on(table.userId),
]);

export type SprintResult = typeof sprintResults.$inferSelect;
export type InsertSprintResult = typeof sprintResults.$inferInsert;

export const routePoints = pgTable("route_points", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  routeId: varchar("route_id", { length: 36 })
    .notNull()
    .references(() => routes.id, { onDelete: "cascade" }),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  altitude: doublePrecision("altitude"),
  speedKmh: doublePrecision("speed_kmh"),
  accelG: doublePrecision("accel_g"),
  tiltDeg: doublePrecision("tilt_deg"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => [
  index("route_points_route_id_idx").on(table.routeId),
]);

export const customRoutes = pgTable("custom_routes", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  totalDistanceKm: doublePrecision("total_distance_km").default(0),
  isPublic: boolean("is_public").notNull().default(true),
  visibility: varchar("visibility", { length: 20 }).notNull().default("public"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("custom_routes_user_id_idx").on(table.userId),
]);

export const customRouteWaypoints = pgTable("custom_route_waypoints", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  routeId: varchar("route_id", { length: 36 })
    .notNull()
    .references(() => customRoutes.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  waypointType: varchar("waypoint_type", { length: 20 }).notNull().default("stop"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("custom_route_waypoints_route_id_idx").on(table.routeId),
]);

export const photoContestEntries = pgTable("photo_contest_entries", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url"),
  caption: text("caption"),
  performanceData: text("performance_data"),
  weekNumber: integer("week_number").notNull(),
  year: integer("year").notNull(),
  votesCount: integer("votes_count").notNull().default(0),
  isApproved: boolean("is_approved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("photo_contest_entries_user_id_idx").on(table.userId),
  index("photo_contest_entries_week_idx").on(table.weekNumber, table.year),
]);

export const photoVotes = pgTable("photo_votes", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  entryId: varchar("entry_id", { length: 36 })
    .notNull()
    .references(() => photoContestEntries.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("photo_votes_unique_idx").on(table.entryId, table.userId),
]);

export const dailyVoteCounts = pgTable("daily_vote_counts", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  voteDate: varchar("vote_date", { length: 10 }).notNull(),
  count: integer("count").notNull().default(0),
}, (table) => [
  uniqueIndex("daily_vote_counts_unique_idx").on(table.userId, table.voteDate),
]);

export const photoWinners = pgTable("photo_winners", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  entryId: varchar("entry_id", { length: 36 })
    .notNull()
    .references(() => photoContestEntries.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull(),
  year: integer("year").notNull(),
  totalVotes: integer("total_votes").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workshops = pgTable("workshops", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  address: text("address"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  phone: varchar("phone", { length: 30 }),
  whatsapp: varchar("whatsapp", { length: 30 }),
  email: varchar("email", { length: 255 }),
  website: text("website"),
  description: text("description"),
  openingHours: jsonb("opening_hours"),
  logoUrl: text("logo_url"),
  qrCode: text("qr_code"),
  isSynecoPartner: boolean("is_syneco_partner").notNull().default(false),
  isApproved: boolean("is_approved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("workshops_location_idx").on(table.latitude, table.longitude),
]);

export const workshopContacts = pgTable("workshop_contacts", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  workshopId: varchar("workshop_id", { length: 36 })
    .notNull()
    .references(() => workshops.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  contactType: varchar("contact_type", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("workshop_contacts_workshop_id_idx").on(table.workshopId),
]);

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
}, (table) => [
  index("reports_status_idx").on(table.status),
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
});

export const adCampaigns = pgTable("ad_campaigns", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  sponsor: varchar("sponsor", { length: 200 }).notNull().default("Syneco Lubrificanti"),
  imageUrl: text("image_url"),
  linkUrl: text("link_url"),
  displayMode: varchar("display_mode", { length: 30 }).notNull().default("banner"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  impressions: integer("impressions").notNull().default(0),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  targetUserType: varchar("target_user_type", { length: 30 }).notNull().default("biker"),
  rotationDuration: integer("rotation_duration").notNull().default(10),
  rotationMode: varchar("rotation_mode", { length: 20 }).notNull().default("sequential"),
  sortOrder: integer("sort_order").notNull().default(0),
  placement: varchar("placement", { length: 30 }).notNull().default("all"),
  imageVersion: integer("image_version").notNull().default(0),
  groupId: text("group_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const adClicks = pgTable("ad_clicks", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id", { length: 36 })
    .notNull()
    .references(() => adCampaigns.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("ad_clicks_campaign_id_idx").on(table.campaignId),
]);

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

export const verificationCodes = pgTable("verification_codes", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "cascade" }),
  codeType: varchar("code_type", { length: 30 }).notNull(),
  code: varchar("code", { length: 10 }).notNull(),
  target: varchar("target", { length: 255 }).notNull(),
  isUsed: boolean("is_used").notNull().default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("verification_codes_target_idx").on(table.target),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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

export const zavarrinaWishlists = pgTable("zavorrina_wishlists", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const zavarrinaWishlistPhotos = pgTable("zavorrina_wishlist_photos", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  wishlistId: varchar("wishlist_id", { length: 36 })
    .notNull()
    .references(() => zavarrinaWishlists.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const zavarrinaWishlistMotos = pgTable("zavorrina_wishlist_motos", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  wishlistId: varchar("wishlist_id", { length: 36 })
    .notNull()
    .references(() => zavarrinaWishlists.id, { onDelete: "cascade" }),
  brand: varchar("brand", { length: 100 }),
  model: varchar("model", { length: 100 }),
  motorcycleType: varchar("motorcycle_type", { length: 50 }),
  ridingStyle: varchar("riding_style", { length: 50 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bikerZavarrinaMatches = pgTable("biker_zavorrina_matches", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  bikerId: varchar("biker_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  zavarrinaId: varchar("zavorrina_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  bikerMotorcycleId: varchar("biker_motorcycle_id", { length: 36 })
    .notNull()
    .references(() => userMotorcycles.id, { onDelete: "cascade" }),
  wishlistMotoId: varchar("wishlist_moto_id", { length: 36 })
    .notNull()
    .references(() => zavarrinaWishlistMotos.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default("new"),
  isSupermatch: boolean("is_supermatch").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("matches_biker_id_idx").on(table.bikerId),
  index("matches_zavorrina_id_idx").on(table.zavarrinaId),
  uniqueIndex("matches_unique_combo_idx").on(table.bikerId, table.zavarrinaId, table.bikerMotorcycleId, table.wishlistMotoId),
]);

export const bikerBikerMatches = pgTable("biker_biker_matches", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  biker1Id: varchar("biker1_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  biker2Id: varchar("biker2_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  motorcycleBrand: varchar("motorcycle_brand", { length: 100 }).notNull(),
  motorcycleModel: varchar("motorcycle_model", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("new"),
  isSupermatch: boolean("is_supermatch").notNull().default(false),
  pairType: varchar("pair_type", { length: 10 }).notNull().default("bb"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("biker_biker_biker1_idx").on(table.biker1Id),
  index("biker_biker_biker2_idx").on(table.biker2Id),
  uniqueIndex("biker_biker_symmetric_idx").on(
    sql`LEAST(${table.biker1Id}, ${table.biker2Id})`,
    sql`GREATEST(${table.biker1Id}, ${table.biker2Id})`,
    table.motorcycleBrand,
    table.motorcycleModel,
  ),
]);

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const phoneSharingTracker = pgTable("phone_sharing_tracker", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  sharedCount: integer("shared_count").notNull().default(0),
}, (table) => [
  uniqueIndex("phone_sharing_tracker_unique_idx").on(table.conversationId, table.userId),
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

export const sosRequests = pgTable("sos_requests", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  requesterId: varchar("requester_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  helperId: varchar("helper_id", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  radiusKm: integer("radius_km").notNull().default(10),
  conversationId: varchar("conversation_id", { length: 36 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("sos_requests_requester_idx").on(table.requesterId),
  index("sos_requests_status_idx").on(table.status),
]);

export const motoClubs = pgTable("moto_clubs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  clubType: varchar("club_type", { length: 20 }).notNull(),
  brandName: varchar("brand_name", { length: 100 }),
  modelName: varchar("model_name", { length: 100 }),
  region: varchar("region", { length: 100 }),
  country: varchar("country", { length: 2 }),
  description: text("description"),
  logoUrl: text("logo_url"),
  coverUrl: text("cover_url"),
  isApproved: boolean("is_approved").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  memberCount: integer("member_count").notNull().default(0),
  activityScore: integer("activity_score").notNull().default(0),
  conversationId: varchar("conversation_id", { length: 36 }),
  parentClubId: varchar("parent_club_id", { length: 36 }),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  proposedLatitude: doublePrecision("proposed_latitude"),
  proposedLongitude: doublePrecision("proposed_longitude"),
  proposedAddress: text("proposed_address"),
  proposedBy: varchar("proposed_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  proposedAt: timestamp("proposed_at"),
  createdBy: varchar("created_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("moto_clubs_type_idx").on(table.clubType),
  index("moto_clubs_brand_idx").on(table.brandName),
  index("moto_clubs_region_idx").on(table.region),
]);

export const motoClubMembers = pgTable("moto_club_members", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  clubId: varchar("club_id", { length: 36 })
    .notNull()
    .references(() => motoClubs.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default("member"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("moto_club_members_unique_idx").on(table.clubId, table.userId),
  index("moto_club_members_club_idx").on(table.clubId),
  index("moto_club_members_user_idx").on(table.userId),
]);

export const motoClubInvites = pgTable("moto_club_invites", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  clubId: varchar("club_id", { length: 36 })
    .notNull()
    .references(() => motoClubs.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  invitedBy: varchar("invited_by", { length: 36 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("moto_club_invites_unique_idx").on(table.clubId, table.userId),
  index("moto_club_invites_user_idx").on(table.userId),
]);

export const motoClubRequests = pgTable("moto_club_requests", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  clubType: varchar("club_type", { length: 20 }).notNull(),
  brandName: varchar("brand_name", { length: 100 }),
  modelName: varchar("model_name", { length: 100 }),
  requestedBy: varchar("requested_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  reviewedBy: varchar("reviewed_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  reviewNote: text("review_note"),
  parentClubId: varchar("parent_club_id", { length: 36 }),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  inviteRadiusKm: integer("invite_radius_km"),
  inviteUserIds: text("invite_user_ids"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const registerSchema = z.object({
  nickname: z.string().min(3).max(50),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z
    .string()
    .min(8, "La password deve avere almeno 8 caratteri")
    .regex(/[A-Z]/, "La password deve contenere almeno una lettera maiuscola")
    .regex(/[a-z]/, "La password deve contenere almeno una lettera minuscola")
    .regex(/[0-9]/, "La password deve contenere almeno un numero"),
  userType: z.enum(["biker", "zavorrina", "coppia"]),
  sex: z.enum(["M", "F"]).optional(),
  coupleSexConfig: z.enum(["M+M", "M+F", "F+F"]).optional(),
  birthYear: z.number().int().min(1940).max(2010).optional(),
  region: z.string().max(100).optional(),
  country: z.string().max(2).optional(),
  eulaAccepted: z.literal(true, {
    errorMap: () => ({ message: "Devi accettare i termini di utilizzo" }),
  }),
  invitationCode: z.string().optional(),
});

export const loginSchema = z.object({
  identifier: z.string().min(1, "Inserisci email o nickname"),
  password: z.string().min(1, "Inserisci la password"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type UserPhoto = typeof userPhotos.$inferSelect;
export type InsertUserPhoto = typeof userPhotos.$inferInsert;
export type UserMotorcycle = typeof userMotorcycles.$inferSelect;
export type InsertUserMotorcycle = typeof userMotorcycles.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;
export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;
export type ProposalParticipant = typeof proposalParticipants.$inferSelect;
export type InsertProposalParticipant = typeof proposalParticipants.$inferInsert;
export type ProposalMatch = typeof proposalMatches.$inferSelect;
export type InsertProposalMatch = typeof proposalMatches.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type InsertConversationParticipant = typeof conversationParticipants.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type Route = typeof routes.$inferSelect;
export type InsertRoute = typeof routes.$inferInsert;
export type RoutePoint = typeof routePoints.$inferSelect;
export type InsertRoutePoint = typeof routePoints.$inferInsert;
export type PhotoContestEntry = typeof photoContestEntries.$inferSelect;
export type InsertPhotoContestEntry = typeof photoContestEntries.$inferInsert;
export type PhotoVote = typeof photoVotes.$inferSelect;
export type InsertPhotoVote = typeof photoVotes.$inferInsert;
export type DailyVoteCount = typeof dailyVoteCounts.$inferSelect;
export type InsertDailyVoteCount = typeof dailyVoteCounts.$inferInsert;
export type PhotoWinner = typeof photoWinners.$inferSelect;
export type InsertPhotoWinner = typeof photoWinners.$inferInsert;
export type Workshop = typeof workshops.$inferSelect;
export type InsertWorkshop = typeof workshops.$inferInsert;
export type WorkshopContact = typeof workshopContacts.$inferSelect;
export type InsertWorkshopContact = typeof workshopContacts.$inferInsert;
export type EasterEgg = typeof easterEggs.$inferSelect;
export type InsertEasterEgg = typeof easterEggs.$inferInsert;
export type CollectedEasterEgg = typeof collectedEasterEggs.$inferSelect;
export type InsertCollectedEasterEgg = typeof collectedEasterEggs.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;
export type ModeratorLog = typeof moderatorLogs.$inferSelect;
export type InsertModeratorLog = typeof moderatorLogs.$inferInsert;
export type AdCampaign = typeof adCampaigns.$inferSelect;
export type InsertAdCampaign = typeof adCampaigns.$inferInsert;
export type AdClick = typeof adClicks.$inferSelect;
export type InsertAdClick = typeof adClicks.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
export type InvitationCode = typeof invitationCodes.$inferSelect;
export type InsertInvitationCode = typeof invitationCodes.$inferInsert;
export type FeedbackTicket = typeof feedbackTickets.$inferSelect;
export type InsertFeedbackTicket = typeof feedbackTickets.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;
export type VerificationCode = typeof verificationCodes.$inferSelect;
export type InsertVerificationCode = typeof verificationCodes.$inferInsert;

export type PhoneSharingTracker = typeof phoneSharingTracker.$inferSelect;
export type InsertPhoneSharingTracker = typeof phoneSharingTracker.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type MotorcyclePhoto = typeof motorcyclePhotos.$inferSelect;
export type InsertMotorcyclePhoto = typeof motorcyclePhotos.$inferInsert;
export type ZavarrinaWishlist = typeof zavarrinaWishlists.$inferSelect;
export type InsertZavarrinaWishlist = typeof zavarrinaWishlists.$inferInsert;
export type ZavarrinaWishlistPhoto = typeof zavarrinaWishlistPhotos.$inferSelect;
export type InsertZavarrinaWishlistPhoto = typeof zavarrinaWishlistPhotos.$inferInsert;
export type ZavarrinaWishlistMoto = typeof zavarrinaWishlistMotos.$inferSelect;
export type InsertZavarrinaWishlistMoto = typeof zavarrinaWishlistMotos.$inferInsert;
export type BikerZavarrinaMatch = typeof bikerZavarrinaMatches.$inferSelect;
export type InsertBikerZavarrinaMatch = typeof bikerZavarrinaMatches.$inferInsert;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

export type FakeUserInteraction = typeof fakeUserInteractions.$inferSelect;
export type InsertFakeUserInteraction = typeof fakeUserInteractions.$inferInsert;
export type CustomRoute = typeof customRoutes.$inferSelect;
export type InsertCustomRoute = typeof customRoutes.$inferInsert;
export type CustomRouteWaypoint = typeof customRouteWaypoints.$inferSelect;
export type InsertCustomRouteWaypoint = typeof customRouteWaypoints.$inferInsert;

export type SosRequest = typeof sosRequests.$inferSelect;
export type InsertSosRequest = typeof sosRequests.$inferInsert;

export type MotoClub = typeof motoClubs.$inferSelect;
export type InsertMotoClub = typeof motoClubs.$inferInsert;
export type MotoClubMember = typeof motoClubMembers.$inferSelect;
export type InsertMotoClubMember = typeof motoClubMembers.$inferInsert;
export type MotoClubInvite = typeof motoClubInvites.$inferSelect;
export type InsertMotoClubInvite = typeof motoClubInvites.$inferInsert;
export type MotoClubRequest = typeof motoClubRequests.$inferSelect;
export type InsertMotoClubRequest = typeof motoClubRequests.$inferInsert;

export type BikerBikerMatch = typeof bikerBikerMatches.$inferSelect;
export type InsertBikerBikerMatch = typeof bikerBikerMatches.$inferInsert;

export type UserBlock = typeof userBlocks.$inferSelect;
export type InsertUserBlock = typeof userBlocks.$inferInsert;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const serverRestarts = pgTable("server_restarts", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  reason: varchar("reason", { length: 50 }).notNull().default("restart"),
});

export type ServerRestart = typeof serverRestarts.$inferSelect;
export type InsertServerRestart = typeof serverRestarts.$inferInsert;

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
  createdBy: varchar("created_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("ota_releases_status_idx").on(table.status),
  index("ota_releases_rv_status_idx").on(table.runtimeVersion, table.status),
]);

export type OtaRelease = typeof otaReleases.$inferSelect;
export type InsertOtaRelease = typeof otaReleases.$inferInsert;

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
  // Task #1148: structured diagnostics payload (errorCode/Cause/UserInfo,
  // nativeStack, updateUrl, channel, networkInfo, probe). Tutti i campi sono
  // troncati lato server prima della scrittura (vedi server/routes/admin.ts
  // POST /ota-error).
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

export type OtaEvent = typeof otaEvents.$inferSelect;
export type InsertOtaEvent = typeof otaEvents.$inferInsert;

// Renamed from userSpotifyTokens / user_spotify_tokens (legacy Spotify era)
export const userMusicTokens = pgTable("user_music_tokens", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  providerUserId: varchar("provider_user_id", { length: 200 }).notNull(), // renamed from spotify_user_id
  displayName: varchar("display_name", { length: 200 }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
  lastSyncAt: timestamp("last_sync_at"),
});

export type UserMusicToken = typeof userMusicTokens.$inferSelect;
export type InsertUserMusicToken = typeof userMusicTokens.$inferInsert;

export const userMusicTracks = pgTable("user_music_tracks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Renamed from spotifyTrackId / spotify_track_id (legacy Spotify era)
  lastfmTrackId: varchar("lastfm_track_id", { length: 200 }).notNull(),
  trackName: varchar("track_name", { length: 500 }).notNull(),
  artistId: varchar("artist_id", { length: 200 }).notNull(),
  artistName: varchar("artist_name", { length: 300 }).notNull(),
  albumName: varchar("album_name", { length: 500 }),
  imageUrl: varchar("image_url", { length: 500 }),
  genres: text("genres").array().default([]),
  popularity: integer("popularity").default(0),
  provider: varchar("provider", { length: 20 }).notNull().default("lastfm"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_track_uniq").on(table.userId, table.lastfmTrackId, table.provider),
  index("user_music_tracks_user_idx").on(table.userId),
]);

export type UserMusicTrack = typeof userMusicTracks.$inferSelect;
export type InsertUserMusicTrack = typeof userMusicTracks.$inferInsert;

export const userLastfmSessions = pgTable("user_lastfm_sessions", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  lastfmUsername: varchar("lastfm_username", { length: 200 }).notNull(),
  sessionKey: varchar("session_key", { length: 500 }).notNull(),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
});

export type UserLastfmSession = typeof userLastfmSessions.$inferSelect;
export type InsertUserLastfmSession = typeof userLastfmSessions.$inferInsert;

export const userPlaylistSnapshots = pgTable("user_playlist_snapshots", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  tracksJson: jsonb("tracks_json").notNull(),
  savedAt: timestamp("saved_at").notNull().defaultNow(),
});

export type UserPlaylistSnapshot = typeof userPlaylistSnapshots.$inferSelect;
export type InsertUserPlaylistSnapshot = typeof userPlaylistSnapshots.$inferInsert;

export const sharedPlaylists = pgTable("shared_playlists", {
  id: serial("id").primaryKey(),
  fromUserId: varchar("from_user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  toUserId: varchar("to_user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  conversationId: varchar("conversation_id", { length: 36 })
    .references(() => conversations.id, { onDelete: "set null" }),
  tracksData: jsonb("tracks_data").notNull().$type<Array<{
    trackId: string;
    trackName: string;
    artistId: string;
    artistName: string;
    albumName?: string;
    genres?: string[];
  }>>(),
  trackCount: integer("track_count").notNull(),
  sharedAt: timestamp("shared_at").notNull().defaultNow(),
  mergedAt: timestamp("merged_at"),
}, (table) => [
  index("shared_playlists_to_user_idx").on(table.toUserId),
  index("shared_playlists_from_user_idx").on(table.fromUserId),
]);

export type SharedPlaylist = typeof sharedPlaylists.$inferSelect;
export type InsertSharedPlaylist = typeof sharedPlaylists.$inferInsert;

// ── RADUNI / EVENTI ──────────────────────────────────────────────────────────

export const events = pgTable("events", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  eventType: varchar("event_type", { length: 30 }).notNull().default("raduno"),
  // "raduno" | "uscita_gruppo" | "festa" | "gara" | "altro"

  creatorId: varchar("creator_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  locationName: varchar("location_name", { length: 300 }),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),

  eventDate: timestamp("event_date").notNull(),
  eventTime: varchar("event_time", { length: 5 }),  // "HH:MM" opzionale

  isRecurring: boolean("is_recurring").notNull().default(false),
  recurrenceInfo: text("recurrence_info"),

  maxParticipants: integer("max_participants"),       // null = illimitato
  websiteUrl: varchar("website_url", { length: 500 }),

  autoInviteReason: text("auto_invite_reason"),
  autoInviteRegion: varchar("auto_invite_region", { length: 100 }),
  autoInviteBrand: varchar("auto_invite_brand", { length: 100 }),

  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // "pending" | "approved" | "rejected" | "cancelled"

  rejectionReason: text("rejection_reason"),
  approvedBy: varchar("approved_by", { length: 36 })
    .references(() => users.id),
  approvedAt: timestamp("approved_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("events_status_idx").on(table.status),
  index("events_date_idx").on(table.eventDate),
  index("events_creator_idx").on(table.creatorId),
]);

export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;

export const eventImages = pgTable("event_images", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  eventId: varchar("event_id", { length: 36 })
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  imageUrl: varchar("image_url", { length: 1000 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export type EventImage = typeof eventImages.$inferSelect;
export type InsertEventImage = typeof eventImages.$inferInsert;

export const eventParticipants = pgTable("event_participants", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  eventId: varchar("event_id", { length: 36 })
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  participationStatus: varchar("participation_status", { length: 20 }).notNull().default("going"),
  // "going" | "interested"
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("event_participants_unique_idx").on(table.eventId, table.userId),
  index("event_participants_event_idx").on(table.eventId),
]);

export type EventParticipant = typeof eventParticipants.$inferSelect;
export type InsertEventParticipant = typeof eventParticipants.$inferInsert;

export const coordinateHistory = pgTable("coordinate_history", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  slot: integer("slot").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("coordinate_history_user_created_idx").on(table.userId, table.createdAt),
]);

export type CoordinateHistory = typeof coordinateHistory.$inferSelect;
export type InsertCoordinateHistory = typeof coordinateHistory.$inferInsert;

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


export const arcadeGameEnum = pgEnum("arcade_game", [
  "endless_biker",
  "traffic_racer",
  "wheelie",
  "tetris",
  "space_invaders",
]);

export const arcadeScores = pgTable("arcade_scores", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  game: arcadeGameEnum("game").notNull(),
  score: integer("score").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("arcade_scores_user_game_idx").on(table.userId, table.game),
  index("arcade_scores_game_score_idx").on(table.game, table.score),
]);

export type ArcadeScore = typeof arcadeScores.$inferSelect;
export type InsertArcadeScore = typeof arcadeScores.$inferInsert;

export const eventClubInvites = pgTable("event_club_invites", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  eventId: varchar("event_id", { length: 36 })
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  clubId: varchar("club_id", { length: 36 })
    .notNull()
    .references(() => motoClubs.id, { onDelete: "cascade" }),
  invitedAt: timestamp("invited_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("event_club_invites_unique_idx").on(table.eventId, table.clubId),
]);

export const gpsErrors = pgTable("gps_errors", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }),
  routeId: varchar("route_id", { length: 36 }),
  otaNumber: integer("ota_number"),
  platform: varchar("platform", { length: 20 }),
  osVersion: varchar("os_version", { length: 50 }),
  context: varchar("context", { length: 200 }),
  errorMessage: text("error_message"),
  stackTrace: text("stack_trace"),
  speedKmh: doublePrecision("speed_kmh"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("gps_errors_created_at_idx").on(table.createdAt),
]);

export type GpsError = typeof gpsErrors.$inferSelect;
export type InsertGpsError = typeof gpsErrors.$inferInsert;

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
  errorMessage: text("error_message"),
  stackTrace: text("stack_trace"),
  sessionStartedAt: timestamp("session_started_at"),
  sessionEndedAt: timestamp("session_ended_at"),
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
}, (table) => [
  index("app_crash_logs_user_id_idx").on(table.userId),
  index("app_crash_logs_crash_type_idx").on(table.crashType),
  index("app_crash_logs_reported_at_idx").on(table.reportedAt),
  uniqueIndex("app_crash_logs_uniq_session_crash").on(table.userId, table.sessionId, table.crashType),
]);

export type AppCrashLog = typeof appCrashLogs.$inferSelect;
export type InsertAppCrashLog = typeof appCrashLogs.$inferInsert;

// ── PLANNED ROUTES (Giri pianificati) ────────────────────────────────────────

export const plannedRoutes = pgTable("planned_routes", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  waypoints: jsonb("waypoints").$type<Array<{ lat: number; lng: number; name?: string }>>().default([]),
  polyline: text("polyline"),
  distanceKm: doublePrecision("distance_km").default(0),
  durationMinutes: integer("duration_minutes").default(0),
  bikerScore: doublePrecision("biker_score").default(0),
  realCurvatureScore: doublePrecision("real_curvature_score"),
  style: varchar("style", { length: 20 }).notNull().default("curvy"),
  visibility: varchar("visibility", { length: 20 }).notNull().default("public"),
  isMultiDay: boolean("is_multi_day").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("planned_routes_user_id_idx").on(table.userId),
  index("planned_routes_visibility_idx").on(table.visibility),
]);

export const routeWeatherCache = pgTable("route_weather_cache", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  routeId: varchar("route_id", { length: 36 })
    .notNull()
    .references(() => plannedRoutes.id, { onDelete: "cascade" }),
  departureTime: timestamp("departure_time").notNull(),
  weatherData: jsonb("weather_data").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("route_weather_cache_route_id_idx").on(table.routeId),
]);

export type PlannedRoute = typeof plannedRoutes.$inferSelect;
export type InsertPlannedRoute = typeof plannedRoutes.$inferInsert;
export type RouteWeatherCache = typeof routeWeatherCache.$inferSelect;
export type InsertRouteWeatherCache = typeof routeWeatherCache.$inferInsert;

export const proposalZoneNotifications = pgTable("proposal_zone_notifications", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  proposalId: varchar("proposal_id", { length: 36 })
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade" }),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("proposal_zone_notif_unique_idx").on(table.userId, table.proposalId),
  index("proposal_zone_notif_proposal_idx").on(table.proposalId),
]);

export type ProposalZoneNotification = typeof proposalZoneNotifications.$inferSelect;
export type InsertProposalZoneNotification = typeof proposalZoneNotifications.$inferInsert;

export const directMatchRequests = pgTable("direct_match_requests", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  receiverId: varchar("receiver_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("direct_match_requests_unique_idx").on(table.senderId, table.receiverId),
  index("direct_match_requests_receiver_idx").on(table.receiverId),
  index("direct_match_requests_sender_idx").on(table.senderId),
]);

export type DirectMatchRequest = typeof directMatchRequests.$inferSelect;
export type InsertDirectMatchRequest = typeof directMatchRequests.$inferInsert;

export const matchPreferences = pgTable("match_preferences", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  bikerBikerBrand: boolean("biker_biker_brand").notNull().default(true),
  bikerZavorrinaBrand: boolean("biker_zavorrina_brand").notNull().default(true),
  bikerClubBrand: boolean("biker_club_brand").notNull().default(true),
  zavarrinaClubBrand: boolean("zavorrina_club_brand").notNull().default(true),
  bikerBikerTypeStyle: boolean("biker_biker_type_style").notNull().default(true),
  bikerZavarrinaTypeStyle: boolean("biker_zavorrina_type_style").notNull().default(true),
  bikerBikerDistance: boolean("biker_biker_distance").notNull().default(true),
  bikerZavarrinaDistance: boolean("biker_zavorrina_distance").notNull().default(true),
  bikerBikerMusic: boolean("biker_biker_music").notNull().default(true),
  bikerZavarrinaMusic: boolean("biker_zavorrina_music").notNull().default(true),
  bikerBikerLeanAngle: boolean("biker_biker_lean_angle").notNull().default(true),
  bikerBikerRouteTypeZone: boolean("biker_biker_route_type_zone").notNull().default(true),
  bikerZavarrinaRouteTypeZone: boolean("biker_zavorrina_route_type_zone").notNull().default(true),
  bikerBikerAvgSpeed: boolean("biker_biker_avg_speed").notNull().default(true),
  bikerBikerAvgDuration: boolean("biker_biker_avg_duration").notNull().default(true),
  bikerBikerDayTime: boolean("biker_biker_day_time").notNull().default(true),
  bikerBikerEvents: boolean("biker_biker_events").notNull().default(true),
  directMatch: boolean("direct_match").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("match_preferences_user_id_idx").on(table.userId),
]);

export type MatchPreferences = typeof matchPreferences.$inferSelect;
export type InsertMatchPreferences = typeof matchPreferences.$inferInsert;
