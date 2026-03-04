import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  json,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userTypeEnum = ["biker", "zavorrina", "coppia"] as const;
export const sexEnum = ["male", "female"] as const;
export const coupleSexConfigEnum = ["mm", "mf", "ff"] as const;
export const roleEnum = ["user", "moderator", "admin"] as const;
export const userStatusEnum = ["active", "suspended", "blocked"] as const;
export const motorcycleTypeEnum = [
  "sportiva",
  "supersportiva",
  "custom",
  "harley",
  "touring",
  "naked",
  "enduro",
  "altro",
] as const;
export const ridingStyleEnum = [
  "passeggio",
  "tranquilla",
  "allegra",
  "mozzafiato",
] as const;
export const availabilityTypeEnum = [
  "giro",
  "raduno",
  "con_zavorrina",
] as const;
export const proposalTypeEnum = ["proposta", "richiesta"] as const;
export const messageTypeEnum = ["text", "image", "location"] as const;
export const conversationTypeEnum = ["private", "group"] as const;
export const trackingFrequencyEnum = ["1s", "5s", "30s"] as const;
export const workshopTypeEnum = ["officina", "rivenditore"] as const;
export const reportCategoryEnum = [
  "comportamento_piacevole",
  "comportamento_scorretto",
  "foto_inappropriata",
  "altro",
] as const;
export const reportStatusEnum = ["pending", "reviewed", "resolved"] as const;
export const adProductTypeEnum = [
  "olio_motore",
  "lubrificante_catena",
  "olio_freni",
  "olio_forcelle",
  "lubrificanti_generali",
  "altro",
] as const;
export const adDisplayModeEnum = ["banner", "carousel", "card"] as const;
export const moderatorTargetTypeEnum = ["photo", "user"] as const;
export const verificationTypeEnum = [
  "email",
  "phone",
  "password_reset",
] as const;

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  nickname: text("nickname").notNull().unique(),
  sex: text("sex", { enum: sexEnum }).notNull(),
  birthYear: integer("birth_year").notNull(),
  region: text("region").notNull(),
  profilePhotoUrl: text("profile_photo_url"),
  userType: text("user_type", { enum: userTypeEnum }).notNull(),
  coupleSexConfig: text("couple_sex_config", {
    enum: coupleSexConfigEnum,
  }),
  role: text("role", { enum: roleEnum }).notNull().default("user"),
  status: text("status", { enum: userStatusEnum })
    .notNull()
    .default("active"),
  suspendedUntil: timestamp("suspended_until"),
  eulaAccepted: boolean("eula_accepted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userPhotos = pgTable("user_photos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userProfiles = pgTable("user_profiles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  motorcycleType: text("motorcycle_type", { enum: motorcycleTypeEnum }),
  motorcyclePhotoUrl: text("motorcycle_photo_url"),
  ridingStyle: text("riding_style", { enum: ridingStyleEnum }),
  maxPickupDistanceKm: integer("max_pickup_distance_km"),
  isAvailable: boolean("is_available").notNull().default(false),
  availabilityType: text("availability_type", {
    enum: availabilityTypeEnum,
  }),
  departureLocation: text("departure_location"),
  departureTime: timestamp("departure_time"),
  shareExactLocation: boolean("share_exact_location")
    .notNull()
    .default(false),
  lastLatitude: doublePrecision("last_latitude"),
  lastLongitude: doublePrecision("last_longitude"),
  lastCity: text("last_city"),
});

export const proposals = pgTable("proposals", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: proposalTypeEnum }).notNull(),
  description: text("description").notNull(),
  departureLocation: text("departure_location"),
  departureTime: timestamp("departure_time"),
  departureLat: doublePrecision("departure_lat"),
  departureLng: doublePrecision("departure_lng"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  type: text("type", { enum: conversationTypeEnum }).notNull(),
  proposalId: varchar("proposal_id").references(() => proposals.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    conversationId: varchar("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("conv_participant_unique").on(
      table.conversationId,
      table.userId,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    senderId: varchar("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: varchar("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    content: text("content"),
    messageType: text("message_type", { enum: messageTypeEnum })
      .notNull()
      .default("text"),
    imageUrl: text("image_url"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    isRead: boolean("is_read").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("messages_conversation_idx").on(table.conversationId)],
);

export const routes = pgTable("routes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  startTime: timestamp("start_time").notNull().defaultNow(),
  endTime: timestamp("end_time"),
  totalDistanceKm: doublePrecision("total_distance_km"),
  maxSpeedKmh: doublePrecision("max_speed_kmh"),
  minAltitudeM: doublePrecision("min_altitude_m"),
  maxAltitudeM: doublePrecision("max_altitude_m"),
  totalDurationMinutes: integer("total_duration_minutes"),
  trackingFrequency: text("tracking_frequency", {
    enum: trackingFrequencyEnum,
  })
    .notNull()
    .default("5s"),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const routePoints = pgTable(
  "route_points",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    routeId: varchar("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    altitude: doublePrecision("altitude"),
    speed: doublePrecision("speed"),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
    isStop: boolean("is_stop").notNull().default(false),
  },
  (table) => [index("route_points_route_idx").on(table.routeId)],
);

export const routePhotos = pgTable("route_photos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  routeId: varchar("route_id")
    .notNull()
    .references(() => routes.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url").notNull(),
  caption: text("caption"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const routeLikes = pgTable(
  "route_likes",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    routeId: varchar("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("route_like_unique").on(table.routeId, table.userId),
  ],
);

export const photoContestEntries = pgTable("photo_contest_entries", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  routeId: varchar("route_id").references(() => routes.id, {
    onDelete: "set null",
  }),
  photoUrl: text("photo_url").notNull(),
  caption: text("caption"),
  weekNumber: integer("week_number").notNull(),
  yearNumber: integer("year_number").notNull(),
  isRemoved: boolean("is_removed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const photoVotes = pgTable(
  "photo_votes",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photoId: varchar("photo_id")
      .notNull()
      .references(() => photoContestEntries.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("photo_vote_unique").on(table.photoId, table.userId),
  ],
);

export const photoWinners = pgTable("photo_winners", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  photoId: varchar("photo_id")
    .notNull()
    .references(() => photoContestEntries.id),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  weekNumber: integer("week_number").notNull(),
  yearNumber: integer("year_number").notNull(),
  voteCount: integer("vote_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const dailyVoteCounts = pgTable(
  "daily_vote_counts",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    voteCount: integer("vote_count").notNull().default(0),
  },
  (table) => [
    uniqueIndex("daily_vote_unique").on(table.userId, table.date),
  ],
);

export const workshops = pgTable("workshops", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  phone: text("phone"),
  whatsappNumber: text("whatsapp_number"),
  openingHours: json("opening_hours"),
  type: text("type", { enum: workshopTypeEnum }).notNull(),
  isApproved: boolean("is_approved").notNull().default(false),
  qrCode: text("qr_code"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workshopContacts = pgTable("workshop_contacts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  workshopId: varchar("workshop_id")
    .notNull()
    .references(() => workshops.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  contactType: text("contact_type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const easterEggs = pgTable("easter_eggs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  iconUrl: text("icon_url"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  radius: integer("radius").notNull().default(50),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const collectedEasterEggs = pgTable(
  "collected_easter_eggs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    easterEggId: varchar("easter_egg_id")
      .notNull()
      .references(() => easterEggs.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    collectedAt: timestamp("collected_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("collected_egg_unique").on(table.easterEggId, table.userId),
  ],
);

export const reports = pgTable("reports", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  reporterId: varchar("reporter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reportedUserId: varchar("reported_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  category: text("category", { enum: reportCategoryEnum }).notNull(),
  description: text("description").notNull(),
  status: text("status", { enum: reportStatusEnum })
    .notNull()
    .default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const adCampaigns = pgTable("ad_campaigns", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  imageUrl: text("image_url").notNull(),
  targetUrl: text("target_url"),
  productType: text("product_type", { enum: adProductTypeEnum }).notNull(),
  displayMode: text("display_mode", { enum: adDisplayModeEnum })
    .notNull()
    .default("banner"),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
  impressionCount: integer("impression_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const moderatorLogs = pgTable("moderator_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  moderatorId: varchar("moderator_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  targetType: text("target_type", {
    enum: moderatorTargetTypeEnum,
  }).notNull(),
  targetId: varchar("target_id").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verificationCodes = pgTable("verification_codes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  identifier: text("identifier").notNull(),
  code: text("code").notNull(),
  type: text("type", { enum: verificationTypeEnum }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  type: text("type").notNull(),
  relatedId: varchar("related_id"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(6),
  nickname: z.string().min(2).max(30),
  sex: z.enum(sexEnum),
  birthYear: z.number().min(1940).max(2010),
  region: z.string().min(2),
  userType: z.enum(userTypeEnum),
  coupleSexConfig: z.enum(coupleSexConfigEnum).optional(),
  eulaAccepted: z.literal(true),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Route = typeof routes.$inferSelect;
export type RoutePoint = typeof routePoints.$inferSelect;
export type Workshop = typeof workshops.$inferSelect;
export type EasterEgg = typeof easterEggs.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type AdCampaign = typeof adCampaigns.$inferSelect;
export type PhotoContestEntry = typeof photoContestEntries.$inferSelect;
export type PhotoWinner = typeof photoWinners.$inferSelect;
export type ModeratorLog = typeof moderatorLogs.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
