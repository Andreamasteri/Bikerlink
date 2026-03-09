var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  adCampaigns: () => adCampaigns,
  adClicks: () => adClicks,
  appSettings: () => appSettings,
  bikerZavarrinaMatches: () => bikerZavarrinaMatches,
  collectedEasterEggs: () => collectedEasterEggs,
  conversationParticipants: () => conversationParticipants,
  conversations: () => conversations,
  customRouteWaypoints: () => customRouteWaypoints,
  customRoutes: () => customRoutes,
  dailyVoteCounts: () => dailyVoteCounts,
  easterEggs: () => easterEggs,
  emailVerificationTokens: () => emailVerificationTokens,
  fakeUserInteractions: () => fakeUserInteractions,
  feedbackTickets: () => feedbackTickets,
  invitationCodes: () => invitationCodes,
  loginSchema: () => loginSchema,
  messages: () => messages,
  moderatorLogs: () => moderatorLogs,
  motorcyclePhotos: () => motorcyclePhotos,
  notifications: () => notifications,
  passwordResetTokens: () => passwordResetTokens,
  phoneSharingTracker: () => phoneSharingTracker,
  photoContestEntries: () => photoContestEntries,
  photoVotes: () => photoVotes,
  photoWinners: () => photoWinners,
  proposalMatches: () => proposalMatches,
  proposalParticipants: () => proposalParticipants,
  proposals: () => proposals,
  registerSchema: () => registerSchema,
  reports: () => reports,
  routePoints: () => routePoints,
  routes: () => routes,
  userMotorcycles: () => userMotorcycles,
  userPhotos: () => userPhotos,
  userProfiles: () => userProfiles,
  users: () => users,
  verificationCodes: () => verificationCodes,
  workshopContacts: () => workshopContacts,
  workshops: () => workshops,
  zavarrinaWishlistMotos: () => zavarrinaWishlistMotos,
  zavarrinaWishlistPhotos: () => zavarrinaWishlistPhotos,
  zavarrinaWishlists: () => zavarrinaWishlists
});
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
  uniqueIndex
} from "drizzle-orm/pg-core";
import { z } from "zod";
var users, userPhotos, userMotorcycles, userProfiles, proposals, proposalParticipants, proposalMatches, conversations, conversationParticipants, messages, routes, routePoints, customRoutes, customRouteWaypoints, photoContestEntries, photoVotes, dailyVoteCounts, photoWinners, workshops, workshopContacts, easterEggs, collectedEasterEggs, reports, moderatorLogs, adCampaigns, adClicks, notifications, invitationCodes, feedbackTickets, appSettings, verificationCodes, passwordResetTokens, motorcyclePhotos, zavarrinaWishlists, zavarrinaWishlistPhotos, zavarrinaWishlistMotos, bikerZavarrinaMatches, emailVerificationTokens, phoneSharingTracker, fakeUserInteractions, registerSchema, loginSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    users = pgTable("users", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      nickname: varchar("nickname", { length: 50 }).notNull().unique(),
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
      deletionRequestedAt: timestamp("deletion_requested_at"),
      deletionScheduledFor: timestamp("deletion_scheduled_for"),
      invitationCode: varchar("invitation_code", { length: 50 }),
      isFake: boolean("is_fake").notNull().default(false),
      lastLoginAt: timestamp("last_login_at"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    userPhotos = pgTable("user_photos", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      photoUrl: text("photo_url").notNull(),
      sortOrder: integer("sort_order").notNull().default(0),
      isApproved: boolean("is_approved").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("user_photos_user_id_idx").on(table.userId)
    ]);
    userMotorcycles = pgTable("user_motorcycles", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      brand: varchar("brand", { length: 100 }).notNull(),
      model: varchar("model", { length: 100 }).notNull(),
      year: integer("year"),
      displacement: integer("displacement"),
      motorcycleType: varchar("motorcycle_type", { length: 50 }),
      ridingStyle: varchar("riding_style", { length: 50 }),
      photoUrl: text("photo_url"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("user_motorcycles_user_id_idx").on(table.userId)
    ]);
    userProfiles = pgTable("user_profiles", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull().unique().references(() => users.id, { onDelete: "cascade" }),
      isAvailable: boolean("is_available").notNull().default(false),
      latitude: doublePrecision("latitude"),
      longitude: doublePrecision("longitude"),
      maxPickupDistance: integer("max_pickup_distance").default(50),
      bio: text("bio"),
      totalKm: doublePrecision("total_km").notNull().default(0),
      totalRides: integer("total_rides").notNull().default(0),
      easterEggsCollected: integer("easter_eggs_collected").notNull().default(0),
      searchPreference: varchar("search_preference", { length: 20 }).notNull().default("both"),
      adminOverrideUntil: timestamp("admin_override_until"),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => [
      index("user_profiles_user_id_idx").on(table.userId),
      index("user_profiles_location_idx").on(table.latitude, table.longitude)
    ]);
    proposals = pgTable("proposals", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
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
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => [
      index("proposals_user_id_idx").on(table.userId),
      index("proposals_status_idx").on(table.status),
      index("proposals_expires_at_idx").on(table.expiresAt)
    ]);
    proposalParticipants = pgTable("proposal_participants", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      proposalId: varchar("proposal_id", { length: 36 }).notNull().references(() => proposals.id, { onDelete: "cascade" }),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      joinedAt: timestamp("joined_at").notNull().defaultNow()
    }, (table) => [
      uniqueIndex("proposal_participants_unique_idx").on(table.proposalId, table.userId)
    ]);
    proposalMatches = pgTable("proposal_matches", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      proposalId1: varchar("proposal_id_1", { length: 36 }).notNull().references(() => proposals.id, { onDelete: "cascade" }),
      proposalId2: varchar("proposal_id_2", { length: 36 }).notNull().references(() => proposals.id, { onDelete: "cascade" }),
      userId1: varchar("user_id_1", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      userId2: varchar("user_id_2", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      status: varchar("status", { length: 20 }).notNull().default("pending"),
      acceptedByUser1: boolean("accepted_by_user_1").notNull().default(false),
      acceptedByUser2: boolean("accepted_by_user_2").notNull().default(false),
      conversationId: varchar("conversation_id", { length: 36 }),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("proposal_matches_user1_idx").on(table.userId1),
      index("proposal_matches_user2_idx").on(table.userId2),
      index("proposal_matches_status_idx").on(table.status)
    ]);
    conversations = pgTable("conversations", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      conversationType: varchar("conversation_type", { length: 20 }).notNull().default("private"),
      title: varchar("title", { length: 200 }),
      proposalId: varchar("proposal_id", { length: 36 }).references(() => proposals.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    conversationParticipants = pgTable("conversation_participants", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      conversationId: varchar("conversation_id", { length: 36 }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      joinedAt: timestamp("joined_at").notNull().defaultNow(),
      lastReadAt: timestamp("last_read_at")
    }, (table) => [
      uniqueIndex("conversation_participants_unique_idx").on(table.conversationId, table.userId),
      index("conversation_participants_user_id_idx").on(table.userId)
    ]);
    messages = pgTable("messages", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      conversationId: varchar("conversation_id", { length: 36 }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
      senderId: varchar("sender_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      messageType: varchar("message_type", { length: 20 }).notNull().default("text"),
      content: text("content"),
      imageUrl: text("image_url"),
      latitude: doublePrecision("latitude"),
      longitude: doublePrecision("longitude"),
      isFiltered: boolean("is_filtered").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("messages_conversation_id_idx").on(table.conversationId),
      index("messages_sender_id_idx").on(table.senderId)
    ]);
    routes = pgTable("routes", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      title: varchar("title", { length: 200 }),
      trackingFrequency: integer("tracking_frequency").notNull().default(5),
      status: varchar("status", { length: 20 }).notNull().default("active"),
      totalDistanceKm: doublePrecision("total_distance_km").default(0),
      maxSpeedKmh: doublePrecision("max_speed_kmh").default(0),
      avgSpeedKmh: doublePrecision("avg_speed_kmh").default(0),
      maxAltitude: doublePrecision("max_altitude").default(0),
      durationSeconds: integer("duration_seconds").default(0),
      idleTimeSeconds: integer("idle_time_seconds").default(0),
      likes: integer("likes").notNull().default(0),
      startedAt: timestamp("started_at").notNull().defaultNow(),
      stoppedAt: timestamp("stopped_at"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("routes_user_id_idx").on(table.userId)
    ]);
    routePoints = pgTable("route_points", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      routeId: varchar("route_id", { length: 36 }).notNull().references(() => routes.id, { onDelete: "cascade" }),
      latitude: doublePrecision("latitude").notNull(),
      longitude: doublePrecision("longitude").notNull(),
      altitude: doublePrecision("altitude"),
      speedKmh: doublePrecision("speed_kmh"),
      timestamp: timestamp("timestamp").notNull().defaultNow()
    }, (table) => [
      index("route_points_route_id_idx").on(table.routeId)
    ]);
    customRoutes = pgTable("custom_routes", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      title: varchar("title", { length: 200 }).notNull(),
      description: text("description"),
      totalDistanceKm: doublePrecision("total_distance_km").default(0),
      isPublic: boolean("is_public").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => [
      index("custom_routes_user_id_idx").on(table.userId)
    ]);
    customRouteWaypoints = pgTable("custom_route_waypoints", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      routeId: varchar("route_id", { length: 36 }).notNull().references(() => customRoutes.id, { onDelete: "cascade" }),
      orderIndex: integer("order_index").notNull().default(0),
      name: varchar("name", { length: 200 }).notNull(),
      description: text("description"),
      latitude: doublePrecision("latitude").notNull(),
      longitude: doublePrecision("longitude").notNull(),
      waypointType: varchar("waypoint_type", { length: 20 }).notNull().default("stop"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("custom_route_waypoints_route_id_idx").on(table.routeId)
    ]);
    photoContestEntries = pgTable("photo_contest_entries", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      photoUrl: text("photo_url"),
      caption: text("caption"),
      performanceData: text("performance_data"),
      weekNumber: integer("week_number").notNull(),
      year: integer("year").notNull(),
      votesCount: integer("votes_count").notNull().default(0),
      isApproved: boolean("is_approved").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("photo_contest_entries_user_id_idx").on(table.userId),
      index("photo_contest_entries_week_idx").on(table.weekNumber, table.year)
    ]);
    photoVotes = pgTable("photo_votes", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      entryId: varchar("entry_id", { length: 36 }).notNull().references(() => photoContestEntries.id, { onDelete: "cascade" }),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      uniqueIndex("photo_votes_unique_idx").on(table.entryId, table.userId)
    ]);
    dailyVoteCounts = pgTable("daily_vote_counts", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      voteDate: varchar("vote_date", { length: 10 }).notNull(),
      count: integer("count").notNull().default(0)
    }, (table) => [
      uniqueIndex("daily_vote_counts_unique_idx").on(table.userId, table.voteDate)
    ]);
    photoWinners = pgTable("photo_winners", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      entryId: varchar("entry_id", { length: 36 }).notNull().references(() => photoContestEntries.id, { onDelete: "cascade" }),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      weekNumber: integer("week_number").notNull(),
      year: integer("year").notNull(),
      totalVotes: integer("total_votes").notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    workshops = pgTable("workshops", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
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
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => [
      index("workshops_location_idx").on(table.latitude, table.longitude)
    ]);
    workshopContacts = pgTable("workshop_contacts", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      workshopId: varchar("workshop_id", { length: 36 }).notNull().references(() => workshops.id, { onDelete: "cascade" }),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      contactType: varchar("contact_type", { length: 20 }).notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("workshop_contacts_workshop_id_idx").on(table.workshopId)
    ]);
    easterEggs = pgTable("easter_eggs", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      name: varchar("name", { length: 200 }).notNull(),
      description: text("description"),
      latitude: doublePrecision("latitude").notNull(),
      longitude: doublePrecision("longitude").notNull(),
      radius: integer("radius").notNull().default(100),
      iconUrl: text("icon_url"),
      points: integer("points").notNull().default(10),
      isActive: boolean("is_active").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("easter_eggs_location_idx").on(table.latitude, table.longitude)
    ]);
    collectedEasterEggs = pgTable("collected_easter_eggs", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      easterEggId: varchar("easter_egg_id", { length: 36 }).notNull().references(() => easterEggs.id, { onDelete: "cascade" }),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      collectedAt: timestamp("collected_at").notNull().defaultNow()
    }, (table) => [
      uniqueIndex("collected_easter_eggs_unique_idx").on(table.easterEggId, table.userId)
    ]);
    reports = pgTable("reports", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      reporterId: varchar("reporter_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      reportedUserId: varchar("reported_user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      reason: varchar("reason", { length: 100 }).notNull(),
      description: text("description"),
      status: varchar("status", { length: 20 }).notNull().default("pending"),
      resolvedBy: varchar("resolved_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      resolvedAt: timestamp("resolved_at"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("reports_status_idx").on(table.status)
    ]);
    moderatorLogs = pgTable("moderator_logs", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      moderatorId: varchar("moderator_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      action: varchar("action", { length: 100 }).notNull(),
      targetType: varchar("target_type", { length: 50 }).notNull(),
      targetId: varchar("target_id", { length: 36 }).notNull(),
      details: text("details"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    adCampaigns = pgTable("ad_campaigns", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
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
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    adClicks = pgTable("ad_clicks", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      campaignId: varchar("campaign_id", { length: 36 }).notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
      userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("ad_clicks_campaign_id_idx").on(table.campaignId)
    ]);
    notifications = pgTable("notifications", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      title: varchar("title", { length: 200 }).notNull(),
      body: text("body"),
      notificationType: varchar("notification_type", { length: 50 }).notNull(),
      referenceType: varchar("reference_type", { length: 50 }),
      referenceId: varchar("reference_id", { length: 36 }),
      isRead: boolean("is_read").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("notifications_user_id_idx").on(table.userId)
    ]);
    invitationCodes = pgTable("invitation_codes", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      code: varchar("code", { length: 50 }).notNull().unique(),
      createdBy: varchar("created_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      usedBy: varchar("used_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      maxUses: integer("max_uses").notNull().default(1),
      currentUses: integer("current_uses").notNull().default(0),
      isActive: boolean("is_active").notNull().default(true),
      expiresAt: timestamp("expires_at"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    feedbackTickets = pgTable("feedback_tickets", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      ticketType: varchar("ticket_type", { length: 30 }).notNull().default("feedback"),
      subject: varchar("subject", { length: 200 }).notNull(),
      message: text("message").notNull(),
      status: varchar("status", { length: 20 }).notNull().default("open"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    appSettings = pgTable("app_settings", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      key: varchar("key", { length: 100 }).notNull().unique(),
      value: text("value"),
      valueJson: jsonb("value_json"),
      description: text("description"),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    verificationCodes = pgTable("verification_codes", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
      codeType: varchar("code_type", { length: 30 }).notNull(),
      code: varchar("code", { length: 10 }).notNull(),
      target: varchar("target", { length: 255 }).notNull(),
      isUsed: boolean("is_used").notNull().default(false),
      expiresAt: timestamp("expires_at").notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("verification_codes_target_idx").on(table.target)
    ]);
    passwordResetTokens = pgTable("password_reset_tokens", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      token: varchar("token", { length: 64 }).notNull().unique(),
      expiresAt: timestamp("expires_at").notNull(),
      used: boolean("used").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    motorcyclePhotos = pgTable("motorcycle_photos", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      motorcycleId: varchar("motorcycle_id", { length: 36 }).notNull().references(() => userMotorcycles.id, { onDelete: "cascade" }),
      photoUrl: text("photo_url").notNull(),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("motorcycle_photos_motorcycle_id_idx").on(table.motorcycleId)
    ]);
    zavarrinaWishlists = pgTable("zavorrina_wishlists", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull().unique().references(() => users.id, { onDelete: "cascade" }),
      description: text("description"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    zavarrinaWishlistPhotos = pgTable("zavorrina_wishlist_photos", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      wishlistId: varchar("wishlist_id", { length: 36 }).notNull().references(() => zavarrinaWishlists.id, { onDelete: "cascade" }),
      photoUrl: text("photo_url").notNull(),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    zavarrinaWishlistMotos = pgTable("zavorrina_wishlist_motos", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      wishlistId: varchar("wishlist_id", { length: 36 }).notNull().references(() => zavarrinaWishlists.id, { onDelete: "cascade" }),
      brand: varchar("brand", { length: 100 }),
      model: varchar("model", { length: 100 }),
      motorcycleType: varchar("motorcycle_type", { length: 50 }),
      ridingStyle: varchar("riding_style", { length: 50 }),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    bikerZavarrinaMatches = pgTable("biker_zavorrina_matches", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      bikerId: varchar("biker_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      zavarrinaId: varchar("zavorrina_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      bikerMotorcycleId: varchar("biker_motorcycle_id", { length: 36 }).notNull().references(() => userMotorcycles.id, { onDelete: "cascade" }),
      wishlistMotoId: varchar("wishlist_moto_id", { length: 36 }).notNull().references(() => zavarrinaWishlistMotos.id, { onDelete: "cascade" }),
      status: varchar("status", { length: 20 }).notNull().default("new"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("matches_biker_id_idx").on(table.bikerId),
      index("matches_zavorrina_id_idx").on(table.zavarrinaId)
    ]);
    emailVerificationTokens = pgTable("email_verification_tokens", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      token: varchar("token", { length: 64 }).notNull().unique(),
      expiresAt: timestamp("expires_at").notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    phoneSharingTracker = pgTable("phone_sharing_tracker", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      conversationId: varchar("conversation_id", { length: 36 }).notNull(),
      userId: varchar("user_id", { length: 36 }).notNull(),
      sharedCount: integer("shared_count").notNull().default(0)
    }, (table) => [
      uniqueIndex("phone_sharing_tracker_unique_idx").on(table.conversationId, table.userId)
    ]);
    fakeUserInteractions = pgTable("fake_user_interactions", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      fakeUserId: varchar("fake_user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      realUserId: varchar("real_user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      interactionType: varchar("interaction_type", { length: 30 }).notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("fake_interactions_fake_user_idx").on(table.fakeUserId),
      index("fake_interactions_real_user_idx").on(table.realUserId)
    ]);
    registerSchema = z.object({
      nickname: z.string().min(3).max(50),
      email: z.string().email(),
      phone: z.string().optional(),
      password: z.string().min(8, "La password deve avere almeno 8 caratteri").regex(/[A-Z]/, "La password deve contenere almeno una lettera maiuscola").regex(/[a-z]/, "La password deve contenere almeno una lettera minuscola").regex(/[0-9]/, "La password deve contenere almeno un numero"),
      userType: z.enum(["biker", "zavorrina", "coppia"]),
      sex: z.enum(["M", "F"]).optional(),
      coupleSexConfig: z.enum(["M+M", "M+F", "F+F"]).optional(),
      birthYear: z.number().int().min(1940).max(2010).optional(),
      region: z.string().max(100).optional(),
      eulaAccepted: z.literal(true, {
        errorMap: () => ({ message: "Devi accettare i termini di utilizzo" })
      }),
      invitationCode: z.string().optional()
    });
    loginSchema = z.object({
      identifier: z.string().min(1, "Inserisci email o nickname"),
      password: z.string().min(1, "Inserisci la password")
    });
  }
});

// server/db.ts
var db_exports = {};
__export(db_exports, {
  db: () => db,
  pool: () => pool
});
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
var Pool, pool, db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    ({ Pool } = pg);
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?"
      );
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema: schema_exports });
  }
});

// server/index.ts
import express from "express";

// server/routes.ts
init_db();
import { createServer } from "node:http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

// server/storage.ts
init_db();
init_schema();
import { eq, and, or, sql as sql2, desc, asc, gte, lte, inArray } from "drizzle-orm";
var DatabaseStorage = class {
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }
  async getUserByNickname(nickname) {
    const [user] = await db.select().from(users).where(eq(users.nickname, nickname)).limit(1);
    return user;
  }
  async getUserByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }
  async createUser(data) {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }
  async updateUser(id, data) {
    const [user] = await db.update(users).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, id)).returning();
    return user;
  }
  async getUserPhotos(userId) {
    return db.select().from(userPhotos).where(eq(userPhotos.userId, userId)).orderBy(asc(userPhotos.sortOrder));
  }
  async createUserPhoto(data) {
    const [photo] = await db.insert(userPhotos).values(data).returning();
    return photo;
  }
  async deleteUserPhoto(id) {
    await db.delete(userPhotos).where(eq(userPhotos.id, id));
  }
  async getUserPhotoCount(userId) {
    const result = await db.select({ count: sql2`count(*)::int` }).from(userPhotos).where(eq(userPhotos.userId, userId));
    return result[0]?.count ?? 0;
  }
  async getUserMotorcycles(userId) {
    return db.select().from(userMotorcycles).where(eq(userMotorcycles.userId, userId));
  }
  async createUserMotorcycle(data) {
    const [moto] = await db.insert(userMotorcycles).values(data).returning();
    return moto;
  }
  async updateUserMotorcycle(id, data) {
    const [moto] = await db.update(userMotorcycles).set(data).where(eq(userMotorcycles.id, id)).returning();
    return moto;
  }
  async deleteUserMotorcycle(id) {
    await db.delete(userMotorcycles).where(eq(userMotorcycles.id, id));
  }
  async searchUsers(query) {
    const pattern = `%${query}%`;
    const results = await db.select({ user: users, profile: userProfiles }).from(users).leftJoin(userProfiles, eq(users.id, userProfiles.userId)).where(
      and(
        eq(users.status, "active"),
        or(
          sql2`${users.nickname} ILIKE ${pattern}`,
          sql2`${users.email} ILIKE ${pattern}`
        )
      )
    ).limit(20);
    return results.map((r) => ({ user: r.user, profile: r.profile }));
  }
  async getUserProfile(userId) {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    return profile;
  }
  async createUserProfile(data) {
    const [profile] = await db.insert(userProfiles).values(data).returning();
    return profile;
  }
  async updateUserProfile(userId, data) {
    const [profile] = await db.update(userProfiles).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(userProfiles.userId, userId)).returning();
    return profile;
  }
  async getProposals(filters) {
    if (filters?.status) {
      return db.select().from(proposals).where(eq(proposals.status, filters.status)).orderBy(desc(proposals.createdAt));
    }
    return db.select().from(proposals).orderBy(desc(proposals.createdAt));
  }
  async getProposal(id) {
    const [proposal] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
    return proposal;
  }
  async deleteProposal(id) {
    await db.delete(proposals).where(eq(proposals.id, id));
  }
  async createProposal(data) {
    const [proposal] = await db.insert(proposals).values(data).returning();
    return proposal;
  }
  async updateProposal(id, data) {
    const [proposal] = await db.update(proposals).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(proposals.id, id)).returning();
    return proposal;
  }
  async getProposalParticipants(proposalId) {
    return db.select().from(proposalParticipants).where(eq(proposalParticipants.proposalId, proposalId));
  }
  async addProposalParticipant(data) {
    const [participant] = await db.insert(proposalParticipants).values(data).returning();
    return participant;
  }
  async getActiveProposalsWithLocation() {
    return db.select().from(proposals).where(
      and(
        eq(proposals.status, "active"),
        sql2`${proposals.departureLatitude} IS NOT NULL`,
        sql2`${proposals.departureLongitude} IS NOT NULL`,
        sql2`${proposals.searchType} IS NOT NULL`
      )
    );
  }
  async getProposalMatches(userId) {
    return db.select().from(proposalMatches).where(
      or(
        eq(proposalMatches.userId1, userId),
        eq(proposalMatches.userId2, userId)
      )
    ).orderBy(desc(proposalMatches.createdAt));
  }
  async getProposalMatch(id) {
    const [match] = await db.select().from(proposalMatches).where(eq(proposalMatches.id, id));
    return match;
  }
  async createProposalMatch(data) {
    const [match] = await db.insert(proposalMatches).values(data).returning();
    return match;
  }
  async updateProposalMatch(id, data) {
    const [match] = await db.update(proposalMatches).set(data).where(eq(proposalMatches.id, id)).returning();
    return match;
  }
  async findExistingMatch(proposalId1, proposalId2) {
    const [match] = await db.select().from(proposalMatches).where(
      or(
        and(eq(proposalMatches.proposalId1, proposalId1), eq(proposalMatches.proposalId2, proposalId2)),
        and(eq(proposalMatches.proposalId1, proposalId2), eq(proposalMatches.proposalId2, proposalId1))
      )
    );
    return match;
  }
  async expireOldProposals() {
    const now = /* @__PURE__ */ new Date();
    const result = await db.update(proposals).set({ status: "expired", updatedAt: now }).where(
      and(
        eq(proposals.status, "active"),
        sql2`${proposals.expiresAt} IS NOT NULL`,
        lte(proposals.expiresAt, now)
      )
    ).returning();
    if (result.length > 0) {
      const expiredIds = result.map((p) => p.id);
      await db.update(proposalMatches).set({ status: "expired" }).where(
        and(
          eq(proposalMatches.status, "pending"),
          sql2`${proposalMatches.proposalId1} = ANY(${expiredIds})`,
          sql2`${proposalMatches.proposalId2} = ANY(${expiredIds})`
        )
      );
    }
    return result.length;
  }
  async deleteExpiredProposals() {
    const expiredProposalsList = await db.select({ id: proposals.id }).from(proposals).where(eq(proposals.status, "expired"));
    if (expiredProposalsList.length === 0) return 0;
    const expiredIds = expiredProposalsList.map((p) => p.id);
    await db.delete(proposalMatches).where(
      or(
        inArray(proposalMatches.proposalId1, expiredIds),
        inArray(proposalMatches.proposalId2, expiredIds)
      )
    );
    await db.delete(proposalParticipants).where(
      inArray(proposalParticipants.proposalId, expiredIds)
    );
    const deleted = await db.delete(proposals).where(eq(proposals.status, "expired")).returning();
    return deleted.length;
  }
  async getConversations(userId) {
    const participantRows = await db.select().from(conversationParticipants).where(eq(conversationParticipants.userId, userId));
    if (participantRows.length === 0) return [];
    const convIds = participantRows.map((p) => p.conversationId);
    return db.select().from(conversations).where(inArray(conversations.id, convIds)).orderBy(desc(conversations.updatedAt));
  }
  async getConversation(id) {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return conv;
  }
  async createConversation(data) {
    const [conv] = await db.insert(conversations).values(data).returning();
    return conv;
  }
  async deleteConversation(id) {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversationParticipants).where(eq(conversationParticipants.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }
  async getConversationParticipants(conversationId) {
    return db.select().from(conversationParticipants).where(eq(conversationParticipants.conversationId, conversationId));
  }
  async addConversationParticipant(data) {
    const [participant] = await db.insert(conversationParticipants).values(data).returning();
    return participant;
  }
  async getMessages(conversationId, limit = 50, offset = 0) {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.createdAt)).limit(limit).offset(offset);
  }
  async createMessage(data) {
    const [message] = await db.insert(messages).values(data).returning();
    return message;
  }
  async updateConversationLastRead(conversationId, userId) {
    await db.update(conversationParticipants).set({ lastReadAt: /* @__PURE__ */ new Date() }).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)));
  }
  async updateConversationTimestamp(conversationId) {
    await db.update(conversations).set({ updatedAt: /* @__PURE__ */ new Date() }).where(eq(conversations.id, conversationId));
  }
  async getRoutes(userId) {
    return db.select().from(routes).where(eq(routes.userId, userId)).orderBy(desc(routes.createdAt));
  }
  async getAllRoutes() {
    return db.select().from(routes).orderBy(desc(routes.createdAt));
  }
  async getRoute(id) {
    const [route] = await db.select().from(routes).where(eq(routes.id, id)).limit(1);
    return route;
  }
  async createRoute(data) {
    const [route] = await db.insert(routes).values(data).returning();
    return route;
  }
  async updateRoute(id, data) {
    const [route] = await db.update(routes).set(data).where(eq(routes.id, id)).returning();
    return route;
  }
  async getRoutePoints(routeId) {
    return db.select().from(routePoints).where(eq(routePoints.routeId, routeId)).orderBy(asc(routePoints.timestamp));
  }
  async createRoutePoints(data) {
    if (data.length === 0) return [];
    return db.insert(routePoints).values(data).returning();
  }
  async getPhotoContestEntries(weekNumber, year) {
    return db.select().from(photoContestEntries).where(and(eq(photoContestEntries.weekNumber, weekNumber), eq(photoContestEntries.year, year))).orderBy(desc(photoContestEntries.votesCount));
  }
  async createPhotoContestEntry(data) {
    const [entry] = await db.insert(photoContestEntries).values(data).returning();
    return entry;
  }
  async createPhotoVote(data) {
    const [vote] = await db.insert(photoVotes).values(data).returning();
    return vote;
  }
  async getPhotoVote(entryId, userId) {
    const [vote] = await db.select().from(photoVotes).where(and(eq(photoVotes.entryId, entryId), eq(photoVotes.userId, userId))).limit(1);
    return vote;
  }
  async getDailyVoteCount(userId, voteDate) {
    const [row] = await db.select().from(dailyVoteCounts).where(and(eq(dailyVoteCounts.userId, userId), eq(dailyVoteCounts.voteDate, voteDate))).limit(1);
    return row;
  }
  async upsertDailyVoteCount(userId, voteDate) {
    await db.insert(dailyVoteCounts).values({ userId, voteDate, count: 1 }).onConflictDoUpdate({
      target: [dailyVoteCounts.userId, dailyVoteCounts.voteDate],
      set: { count: sql2`${dailyVoteCounts.count} + 1` }
    });
  }
  async incrementEntryVotes(entryId) {
    await db.update(photoContestEntries).set({ votesCount: sql2`${photoContestEntries.votesCount} + 1` }).where(eq(photoContestEntries.id, entryId));
  }
  async getPhotoWinners() {
    return db.select().from(photoWinners).orderBy(desc(photoWinners.year), desc(photoWinners.weekNumber));
  }
  async createPhotoWinner(data) {
    const [winner] = await db.insert(photoWinners).values(data).returning();
    return winner;
  }
  async getWorkshops(approved) {
    if (approved !== void 0) {
      return db.select().from(workshops).where(eq(workshops.isApproved, approved));
    }
    return db.select().from(workshops);
  }
  async getWorkshop(id) {
    const [workshop] = await db.select().from(workshops).where(eq(workshops.id, id)).limit(1);
    return workshop;
  }
  async createWorkshop(data) {
    const [workshop] = await db.insert(workshops).values(data).returning();
    return workshop;
  }
  async updateWorkshop(id, data) {
    const [workshop] = await db.update(workshops).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(workshops.id, id)).returning();
    return workshop;
  }
  async createWorkshopContact(data) {
    const [contact] = await db.insert(workshopContacts).values(data).returning();
    return contact;
  }
  async getEasterEggs(active) {
    if (active !== void 0) {
      return db.select().from(easterEggs).where(eq(easterEggs.isActive, active));
    }
    return db.select().from(easterEggs);
  }
  async getEasterEgg(id) {
    const [egg] = await db.select().from(easterEggs).where(eq(easterEggs.id, id)).limit(1);
    return egg;
  }
  async createEasterEgg(data) {
    const [egg] = await db.insert(easterEggs).values(data).returning();
    return egg;
  }
  async updateEasterEgg(id, data) {
    const [egg] = await db.update(easterEggs).set(data).where(eq(easterEggs.id, id)).returning();
    return egg;
  }
  async collectEasterEgg(data) {
    const [collected] = await db.insert(collectedEasterEggs).values(data).returning();
    return collected;
  }
  async getCollectedEasterEggs(userId) {
    return db.select().from(collectedEasterEggs).where(eq(collectedEasterEggs.userId, userId));
  }
  async hasCollectedEasterEgg(easterEggId, userId) {
    const [row] = await db.select().from(collectedEasterEggs).where(and(eq(collectedEasterEggs.easterEggId, easterEggId), eq(collectedEasterEggs.userId, userId))).limit(1);
    return !!row;
  }
  async getReports(status) {
    if (status) {
      return db.select().from(reports).where(eq(reports.status, status)).orderBy(desc(reports.createdAt));
    }
    return db.select().from(reports).orderBy(desc(reports.createdAt));
  }
  async createReport(data) {
    const [report] = await db.insert(reports).values(data).returning();
    return report;
  }
  async updateReport(id, data) {
    const [report] = await db.update(reports).set(data).where(eq(reports.id, id)).returning();
    return report;
  }
  async createModeratorLog(data) {
    const [log2] = await db.insert(moderatorLogs).values(data).returning();
    return log2;
  }
  async getActiveCampaigns() {
    return db.select().from(adCampaigns).where(eq(adCampaigns.isActive, true));
  }
  async getActiveAdsByUserType(userType) {
    return db.select().from(adCampaigns).where(and(eq(adCampaigns.isActive, true), eq(adCampaigns.targetUserType, userType))).orderBy(asc(adCampaigns.sortOrder));
  }
  async createAdCampaign(data) {
    const [campaign] = await db.insert(adCampaigns).values(data).returning();
    return campaign;
  }
  async updateAdCampaign(id, data) {
    const [campaign] = await db.update(adCampaigns).set(data).where(eq(adCampaigns.id, id)).returning();
    return campaign;
  }
  async createAdClick(data) {
    const [click] = await db.insert(adClicks).values(data).returning();
    return click;
  }
  async incrementCampaignImpressions(id) {
    await db.update(adCampaigns).set({ impressions: sql2`${adCampaigns.impressions} + 1` }).where(eq(adCampaigns.id, id));
  }
  async getNotifications(userId) {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }
  async createNotification(data) {
    const [notification] = await db.insert(notifications).values(data).returning();
    return notification;
  }
  async markNotificationRead(id) {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }
  async getInvitationCodes() {
    return db.select().from(invitationCodes).orderBy(desc(invitationCodes.createdAt));
  }
  async getInvitationCode(code) {
    const [row] = await db.select().from(invitationCodes).where(eq(invitationCodes.code, code)).limit(1);
    return row;
  }
  async createInvitationCode(data) {
    const [code] = await db.insert(invitationCodes).values(data).returning();
    return code;
  }
  async incrementInvitationCodeUses(id) {
    await db.update(invitationCodes).set({ currentUses: sql2`${invitationCodes.currentUses} + 1` }).where(eq(invitationCodes.id, id));
  }
  async getFeedbackTickets() {
    return db.select().from(feedbackTickets).orderBy(desc(feedbackTickets.createdAt));
  }
  async createFeedbackTicket(data) {
    const [ticket] = await db.insert(feedbackTickets).values(data).returning();
    return ticket;
  }
  async getAppSetting(key) {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    return setting;
  }
  async upsertAppSetting(key, value, valueJson) {
    const [setting] = await db.insert(appSettings).values({ key, value, valueJson, updatedAt: /* @__PURE__ */ new Date() }).onConflictDoUpdate({
      target: [appSettings.key],
      set: { value, valueJson, updatedAt: /* @__PURE__ */ new Date() }
    }).returning();
    return setting;
  }
  async createVerificationCode(data) {
    const [code] = await db.insert(verificationCodes).values(data).returning();
    return code;
  }
  async getNearbyUsers(lat, lng, radiusKm) {
    const results = await db.select({
      user: users,
      profile: userProfiles,
      distance: sql2`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance")
    }).from(userProfiles).innerJoin(users, eq(users.id, userProfiles.userId)).where(
      and(
        eq(users.status, "active"),
        sql2`${userProfiles.latitude} IS NOT NULL`,
        sql2`${userProfiles.longitude} IS NOT NULL`
      )
    ).orderBy(sql2`distance`);
    return results;
  }
  async getUserMotorcycle(id) {
    const [moto] = await db.select().from(userMotorcycles).where(eq(userMotorcycles.id, id)).limit(1);
    return moto;
  }
  async getUserPhoto(id) {
    const [photo] = await db.select().from(userPhotos).where(eq(userPhotos.id, id)).limit(1);
    return photo;
  }
  async getAllUsers() {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }
  async getModeratorLogs() {
    return db.select().from(moderatorLogs).orderBy(desc(moderatorLogs.createdAt));
  }
  async getAllCampaigns() {
    return db.select().from(adCampaigns).orderBy(desc(adCampaigns.createdAt));
  }
  async deleteEasterEgg(id) {
    await db.delete(easterEggs).where(eq(easterEggs.id, id));
  }
  async deleteWorkshop(id) {
    await db.delete(workshops).where(eq(workshops.id, id));
  }
  async deleteCampaign(id) {
    await db.delete(adCampaigns).where(eq(adCampaigns.id, id));
  }
  async getAllAppSettings() {
    return db.select().from(appSettings);
  }
  async getWorkshopContactsByPeriod(startDate, endDate) {
    return db.select().from(workshopContacts).where(and(gte(workshopContacts.createdAt, startDate), lte(workshopContacts.createdAt, endDate)));
  }
  async countUsers() {
    const result = await db.select({ count: sql2`count(*)::int` }).from(users);
    return result[0]?.count ?? 0;
  }
  async countActiveUsers(since) {
    const result = await db.select({ count: sql2`count(*)::int` }).from(users).where(and(eq(users.status, "active"), gte(users.lastLoginAt, since)));
    return result[0]?.count ?? 0;
  }
  async countAvailableUsers(since) {
    const conditions = [eq(users.status, "active"), eq(userProfiles.isAvailable, true)];
    if (since) conditions.push(gte(users.lastLoginAt, since));
    const result = await db.select({ count: sql2`count(*)::int` }).from(userProfiles).innerJoin(users, eq(users.id, userProfiles.userId)).where(and(...conditions));
    return result[0]?.count ?? 0;
  }
  async getOnlineUsersList(since, lat, lng) {
    const distanceExpr = lat != null && lng != null ? sql2`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance") : sql2`0`.as("distance");
    const results = await db.select({ user: users, profile: userProfiles, distance: distanceExpr }).from(users).leftJoin(userProfiles, eq(userProfiles.userId, users.id)).where(and(eq(users.status, "active"), gte(users.lastLoginAt, since))).orderBy(sql2`distance`);
    return results;
  }
  async getAvailableUsersList(since, lat, lng) {
    const distanceExpr = lat != null && lng != null ? sql2`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance") : sql2`0`.as("distance");
    const results = await db.select({ user: users, profile: userProfiles, distance: distanceExpr }).from(userProfiles).innerJoin(users, eq(users.id, userProfiles.userId)).where(and(eq(users.status, "active"), eq(userProfiles.isAvailable, true), gte(users.lastLoginAt, since))).orderBy(sql2`distance`);
    return results;
  }
  async getUnapprovedUserPhotos() {
    return db.select().from(userPhotos).where(eq(userPhotos.isApproved, false)).orderBy(asc(userPhotos.createdAt));
  }
  async updateUserPhotoApproval(id, approved) {
    const [photo] = await db.update(userPhotos).set({ isApproved: approved }).where(eq(userPhotos.id, id)).returning();
    return photo;
  }
  async getUnapprovedContestEntries() {
    return db.select().from(photoContestEntries).where(eq(photoContestEntries.isApproved, false)).orderBy(asc(photoContestEntries.createdAt));
  }
  async updateContestEntryApproval(id, approved) {
    const [entry] = await db.update(photoContestEntries).set({ isApproved: approved }).where(eq(photoContestEntries.id, id)).returning();
    return entry;
  }
  async getPhotoContestEntry(id) {
    const [entry] = await db.select().from(photoContestEntries).where(eq(photoContestEntries.id, id)).limit(1);
    return entry;
  }
  async getPhoneSharedCount(conversationId, userId) {
    const [row] = await db.select().from(phoneSharingTracker).where(and(eq(phoneSharingTracker.conversationId, conversationId), eq(phoneSharingTracker.userId, userId))).limit(1);
    return row?.sharedCount ?? 0;
  }
  async incrementPhoneSharedCount(conversationId, userId) {
    await db.insert(phoneSharingTracker).values({ conversationId, userId, sharedCount: 1 }).onConflictDoUpdate({
      target: [phoneSharingTracker.conversationId, phoneSharingTracker.userId],
      set: { sharedCount: sql2`${phoneSharingTracker.sharedCount} + 1` }
    });
  }
  async createPasswordResetToken(userId, token, expiresAt) {
    await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
  }
  async getPasswordResetToken(token) {
    const [row] = await db.select().from(passwordResetTokens).where(and(eq(passwordResetTokens.token, token), eq(passwordResetTokens.used, false))).limit(1);
    return row;
  }
  async markPasswordResetTokenUsed(token) {
    await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.token, token));
  }
  async getMotorcyclePhotos(motorcycleId) {
    return db.select().from(motorcyclePhotos).where(eq(motorcyclePhotos.motorcycleId, motorcycleId)).orderBy(asc(motorcyclePhotos.sortOrder));
  }
  async addMotorcyclePhoto(data) {
    const [photo] = await db.insert(motorcyclePhotos).values(data).returning();
    return photo;
  }
  async deleteMotorcyclePhoto(id) {
    await db.delete(motorcyclePhotos).where(eq(motorcyclePhotos.id, id));
  }
  async getMotorcyclePhotoCount(motorcycleId) {
    const result = await db.select({ count: sql2`count(*)` }).from(motorcyclePhotos).where(eq(motorcyclePhotos.motorcycleId, motorcycleId));
    return Number(result[0]?.count ?? 0);
  }
  async getWishlist(userId) {
    const [wl] = await db.select().from(zavarrinaWishlists).where(eq(zavarrinaWishlists.userId, userId)).limit(1);
    return wl;
  }
  async createOrUpdateWishlist(userId, description) {
    const existing = await this.getWishlist(userId);
    if (existing) {
      const [wl2] = await db.update(zavarrinaWishlists).set({ description, updatedAt: /* @__PURE__ */ new Date() }).where(eq(zavarrinaWishlists.id, existing.id)).returning();
      return wl2;
    }
    const [wl] = await db.insert(zavarrinaWishlists).values({ userId, description }).returning();
    return wl;
  }
  async getWishlistPhotos(wishlistId) {
    return db.select().from(zavarrinaWishlistPhotos).where(eq(zavarrinaWishlistPhotos.wishlistId, wishlistId)).orderBy(asc(zavarrinaWishlistPhotos.sortOrder));
  }
  async addWishlistPhoto(data) {
    const [photo] = await db.insert(zavarrinaWishlistPhotos).values(data).returning();
    return photo;
  }
  async deleteWishlistPhoto(id) {
    await db.delete(zavarrinaWishlistPhotos).where(eq(zavarrinaWishlistPhotos.id, id));
  }
  async getWishlistPhotoCount(wishlistId) {
    const result = await db.select({ count: sql2`count(*)` }).from(zavarrinaWishlistPhotos).where(eq(zavarrinaWishlistPhotos.wishlistId, wishlistId));
    return Number(result[0]?.count ?? 0);
  }
  async getWishlistMoto(id) {
    const [moto] = await db.select().from(zavarrinaWishlistMotos).where(eq(zavarrinaWishlistMotos.id, id)).limit(1);
    return moto;
  }
  async getWishlistMotos(wishlistId) {
    return db.select().from(zavarrinaWishlistMotos).where(eq(zavarrinaWishlistMotos.wishlistId, wishlistId));
  }
  async addWishlistMoto(data) {
    const [moto] = await db.insert(zavarrinaWishlistMotos).values(data).returning();
    return moto;
  }
  async updateWishlistMoto(id, data) {
    const [moto] = await db.update(zavarrinaWishlistMotos).set(data).where(eq(zavarrinaWishlistMotos.id, id)).returning();
    return moto;
  }
  async deleteWishlistMoto(id) {
    await db.delete(zavarrinaWishlistMotos).where(eq(zavarrinaWishlistMotos.id, id));
  }
  async getWishlistMotoCount(wishlistId) {
    const result = await db.select({ count: sql2`count(*)` }).from(zavarrinaWishlistMotos).where(eq(zavarrinaWishlistMotos.wishlistId, wishlistId));
    return Number(result[0]?.count ?? 0);
  }
  async findMatchingWishlistMotos(brand, model, ridingStyle, motorcycleType) {
    const brandModelMatch = and(
      sql2`${zavarrinaWishlistMotos.brand} IS NOT NULL AND ${zavarrinaWishlistMotos.brand} != ''`,
      sql2`${zavarrinaWishlistMotos.model} IS NOT NULL AND ${zavarrinaWishlistMotos.model} != ''`,
      sql2`LOWER(${zavarrinaWishlistMotos.brand}) = LOWER(${brand})`,
      sql2`(LOWER(${zavarrinaWishlistMotos.model}) LIKE '%' || LOWER(${model}) || '%' OR LOWER(${model}) LIKE '%' || LOWER(${zavarrinaWishlistMotos.model}) || '%')`,
      sql2`LOWER(${zavarrinaWishlistMotos.ridingStyle}) = LOWER(${ridingStyle})`
    );
    const typeMatch = and(
      sql2`(${zavarrinaWishlistMotos.brand} IS NULL OR ${zavarrinaWishlistMotos.brand} = '')`,
      sql2`(${zavarrinaWishlistMotos.model} IS NULL OR ${zavarrinaWishlistMotos.model} = '')`,
      sql2`${zavarrinaWishlistMotos.motorcycleType} IS NOT NULL AND ${zavarrinaWishlistMotos.motorcycleType} != ''`,
      sql2`LOWER(${zavarrinaWishlistMotos.motorcycleType}) = LOWER(${motorcycleType})`,
      sql2`LOWER(${zavarrinaWishlistMotos.ridingStyle}) = LOWER(${ridingStyle})`
    );
    const results = await db.select({
      id: zavarrinaWishlistMotos.id,
      wishlistId: zavarrinaWishlistMotos.wishlistId,
      brand: zavarrinaWishlistMotos.brand,
      model: zavarrinaWishlistMotos.model,
      motorcycleType: zavarrinaWishlistMotos.motorcycleType,
      ridingStyle: zavarrinaWishlistMotos.ridingStyle,
      createdAt: zavarrinaWishlistMotos.createdAt,
      userId: zavarrinaWishlists.userId
    }).from(zavarrinaWishlistMotos).innerJoin(zavarrinaWishlists, eq(zavarrinaWishlistMotos.wishlistId, zavarrinaWishlists.id)).where(or(brandModelMatch, typeMatch));
    return results;
  }
  async findMatchingBikerMotos(brand, model, ridingStyle, motorcycleType) {
    if (brand && model) {
      return db.select().from(userMotorcycles).where(and(
        sql2`LOWER(${userMotorcycles.brand}) = LOWER(${brand})`,
        sql2`(LOWER(${userMotorcycles.model}) LIKE '%' || LOWER(${model}) || '%' OR LOWER(${model}) LIKE '%' || LOWER(${userMotorcycles.model}) || '%')`,
        sql2`LOWER(${userMotorcycles.ridingStyle}) = LOWER(${ridingStyle})`
      ));
    }
    if (motorcycleType) {
      return db.select().from(userMotorcycles).where(and(
        sql2`LOWER(${userMotorcycles.motorcycleType}) = LOWER(${motorcycleType})`,
        sql2`LOWER(${userMotorcycles.ridingStyle}) = LOWER(${ridingStyle})`
      ));
    }
    return [];
  }
  async createMatch(data) {
    const [match] = await db.insert(bikerZavarrinaMatches).values(data).returning();
    return match;
  }
  async getMatchesForUser(userId) {
    return db.select().from(bikerZavarrinaMatches).where(
      or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId))
    ).orderBy(desc(bikerZavarrinaMatches.createdAt));
  }
  async getGarageMatch(id) {
    const [match] = await db.select().from(bikerZavarrinaMatches).where(eq(bikerZavarrinaMatches.id, id));
    return match;
  }
  async updateGarageMatch(id, data) {
    const [updated] = await db.update(bikerZavarrinaMatches).set(data).where(eq(bikerZavarrinaMatches.id, id)).returning();
    return updated;
  }
  async getAllWishlistMotosWithUsers() {
    const results = await db.select({
      wishlistMoto: zavarrinaWishlistMotos,
      userId: zavarrinaWishlists.userId
    }).from(zavarrinaWishlistMotos).innerJoin(zavarrinaWishlists, eq(zavarrinaWishlists.id, zavarrinaWishlistMotos.wishlistId));
    return results;
  }
  async getAllBikerMotorcyclesWithUsers() {
    const results = await db.select({
      motorcycle: userMotorcycles,
      userId: userMotorcycles.userId
    }).from(userMotorcycles).innerJoin(users, eq(users.id, userMotorcycles.userId)).where(or(eq(users.userType, "biker"), eq(users.userType, "coppia")));
    return results;
  }
  async findExistingBikerZavarrinaMatch(bikerId, zavarrinaId, bikerMotorcycleId, wishlistMotoId) {
    const [match] = await db.select().from(bikerZavarrinaMatches).where(
      and(
        eq(bikerZavarrinaMatches.bikerId, bikerId),
        eq(bikerZavarrinaMatches.zavarrinaId, zavarrinaId),
        eq(bikerZavarrinaMatches.bikerMotorcycleId, bikerMotorcycleId),
        eq(bikerZavarrinaMatches.wishlistMotoId, wishlistMotoId)
      )
    ).limit(1);
    return match;
  }
  async countAvailableBikers(since) {
    const result = await db.select({ count: sql2`count(*)::int` }).from(userProfiles).innerJoin(users, eq(users.id, userProfiles.userId)).where(and(
      eq(users.status, "active"),
      eq(userProfiles.isAvailable, true),
      gte(users.lastLoginAt, since),
      or(eq(users.userType, "biker"), eq(users.userType, "coppia"))
    ));
    return result[0]?.count ?? 0;
  }
  async countAvailableZavorrine(since) {
    const result = await db.select({ count: sql2`count(*)::int` }).from(userProfiles).innerJoin(users, eq(users.id, userProfiles.userId)).where(and(
      eq(users.status, "active"),
      eq(userProfiles.isAvailable, true),
      gte(users.lastLoginAt, since),
      eq(users.userType, "zavorrina")
    ));
    return result[0]?.count ?? 0;
  }
  async getAvailableBikersList(since, lat, lng) {
    const distanceExpr = lat != null && lng != null ? sql2`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance") : sql2`0`.as("distance");
    return db.select({ user: users, profile: userProfiles, distance: distanceExpr }).from(userProfiles).innerJoin(users, eq(users.id, userProfiles.userId)).where(and(
      eq(users.status, "active"),
      eq(userProfiles.isAvailable, true),
      gte(users.lastLoginAt, since),
      or(eq(users.userType, "biker"), eq(users.userType, "coppia"))
    )).orderBy(sql2`distance`);
  }
  async getAvailableZavorrinaList(since, lat, lng) {
    const distanceExpr = lat != null && lng != null ? sql2`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance") : sql2`0`.as("distance");
    return db.select({ user: users, profile: userProfiles, distance: distanceExpr }).from(userProfiles).innerJoin(users, eq(users.id, userProfiles.userId)).where(and(
      eq(users.status, "active"),
      eq(userProfiles.isAvailable, true),
      gte(users.lastLoginAt, since),
      eq(users.userType, "zavorrina")
    )).orderBy(sql2`distance`);
  }
  async createEmailVerificationToken(userId, token, expiresAt) {
    await db.insert(emailVerificationTokens).values({ userId, token, expiresAt });
  }
  async getEmailVerificationToken(token) {
    const [row] = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.token, token)).limit(1);
    return row;
  }
  async deleteEmailVerificationTokens(userId) {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
  }
  async markUserEmailVerified(userId) {
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
  }
  async requestUserDeletion(userId) {
    const now = /* @__PURE__ */ new Date();
    const scheduledFor = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1e3);
    await db.update(users).set({
      deletionRequestedAt: now,
      deletionScheduledFor: scheduledFor
    }).where(eq(users.id, userId));
  }
  async cancelUserDeletion(userId) {
    await db.update(users).set({
      deletionRequestedAt: null,
      deletionScheduledFor: null
    }).where(eq(users.id, userId));
  }
  async deleteUser(userId) {
    await db.delete(users).where(eq(users.id, userId));
  }
  async recordFakeUserInteraction(fakeUserId, realUserId, interactionType) {
    await db.insert(fakeUserInteractions).values({ fakeUserId, realUserId, interactionType });
  }
  async getFakeUserStats() {
    const fakeUsers = await db.select().from(users).where(eq(users.isFake, true)).orderBy(desc(users.createdAt));
    const stats = [];
    for (const u of fakeUsers) {
      const profile = await this.getUserProfile(u.id);
      const [views] = await db.select({ count: sql2`count(*)::int` }).from(fakeUserInteractions).where(and(eq(fakeUserInteractions.fakeUserId, u.id), eq(fakeUserInteractions.interactionType, "profile_view")));
      const [chats] = await db.select({ count: sql2`count(*)::int` }).from(fakeUserInteractions).where(and(eq(fakeUserInteractions.fakeUserId, u.id), eq(fakeUserInteractions.interactionType, "chat_request")));
      const [msgs] = await db.select({ count: sql2`count(*)::int` }).from(fakeUserInteractions).where(and(eq(fakeUserInteractions.fakeUserId, u.id), eq(fakeUserInteractions.interactionType, "chat_message")));
      const { password: _, ...safeUser } = u;
      stats.push({
        ...safeUser,
        profile,
        profileViews: views?.count ?? 0,
        chatRequests: chats?.count ?? 0,
        chatMessages: msgs?.count ?? 0
      });
    }
    return stats;
  }
  async getFakeUsers() {
    return db.select().from(users).where(eq(users.isFake, true)).orderBy(desc(users.createdAt));
  }
  async deleteFakeUser(id) {
    await db.delete(users).where(and(eq(users.id, id), eq(users.isFake, true)));
  }
  async toggleFakeZavorrineAvailability() {
    const fakeZavorrine = await db.select({ id: users.id, profileUserId: userProfiles.userId, adminOverrideUntil: userProfiles.adminOverrideUntil }).from(users).innerJoin(userProfiles, eq(userProfiles.userId, users.id)).where(and(eq(users.isFake, true), eq(users.userType, "zavorrina")));
    const now = /* @__PURE__ */ new Date();
    for (const z3 of fakeZavorrine) {
      if (z3.adminOverrideUntil && new Date(z3.adminOverrideUntil) > now) continue;
      const available = Math.random() < 0.55;
      await db.update(userProfiles).set({ isAvailable: available }).where(eq(userProfiles.userId, z3.id));
      if (available) {
        await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, z3.id));
      }
    }
    const fakeBikers = await db.select({ id: users.id, profileUserId: userProfiles.userId, adminOverrideUntil: userProfiles.adminOverrideUntil }).from(users).innerJoin(userProfiles, eq(userProfiles.userId, users.id)).where(and(eq(users.isFake, true), or(eq(users.userType, "biker"), eq(users.userType, "coppia"))));
    for (const b of fakeBikers) {
      if (b.adminOverrideUntil && new Date(b.adminOverrideUntil) > now) continue;
      const available = Math.random() < 0.55;
      await db.update(userProfiles).set({ isAvailable: available }).where(eq(userProfiles.userId, b.id));
      if (available) {
        await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, b.id));
      }
    }
  }
  async getFakeUserConversations(fakeUserId) {
    const participantRows = await db.select().from(conversationParticipants).where(eq(conversationParticipants.userId, fakeUserId));
    if (participantRows.length === 0) return [];
    const convIds = participantRows.map((p) => p.conversationId);
    const convs = await db.select().from(conversations).where(sql2`${conversations.id} = ANY(${convIds})`).orderBy(desc(conversations.updatedAt));
    const result = [];
    for (const conv of convs) {
      const parts = await this.getConversationParticipants(conv.id);
      const partUsers = [];
      for (const p of parts) {
        const u = await this.getUser(p.userId);
        if (u) partUsers.push({ id: u.id, nickname: u.nickname, userType: u.userType, isFake: u.isFake });
      }
      const msgs = await this.getMessages(conv.id, 1, 0);
      const totalMsgs = await db.select({ count: sql2`count(*)::int` }).from(messages).where(eq(messages.conversationId, conv.id));
      result.push({
        ...conv,
        participants: partUsers,
        lastMessage: msgs[0] || null,
        messageCount: totalMsgs[0]?.count ?? 0
      });
    }
    return result;
  }
  async getCustomRoutes(userId) {
    return db.select().from(customRoutes).where(eq(customRoutes.userId, userId)).orderBy(desc(customRoutes.createdAt));
  }
  async getPublicCustomRoutes() {
    return db.select().from(customRoutes).where(eq(customRoutes.isPublic, true)).orderBy(desc(customRoutes.createdAt));
  }
  async getCustomRoute(id) {
    const [route] = await db.select().from(customRoutes).where(eq(customRoutes.id, id)).limit(1);
    return route;
  }
  async createCustomRoute(data) {
    const [route] = await db.insert(customRoutes).values(data).returning();
    return route;
  }
  async updateCustomRoute(id, data) {
    const [route] = await db.update(customRoutes).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(customRoutes.id, id)).returning();
    return route;
  }
  async deleteCustomRoute(id) {
    await db.delete(customRoutes).where(eq(customRoutes.id, id));
  }
  async getCustomRouteWaypoints(routeId) {
    return db.select().from(customRouteWaypoints).where(eq(customRouteWaypoints.routeId, routeId)).orderBy(asc(customRouteWaypoints.orderIndex));
  }
  async createCustomRouteWaypoint(data) {
    const [wp] = await db.insert(customRouteWaypoints).values(data).returning();
    return wp;
  }
  async updateCustomRouteWaypoint(id, data) {
    const [wp] = await db.update(customRouteWaypoints).set(data).where(eq(customRouteWaypoints.id, id)).returning();
    return wp;
  }
  async deleteCustomRouteWaypoint(id) {
    await db.delete(customRouteWaypoints).where(eq(customRouteWaypoints.id, id));
  }
};
var storage = new DatabaseStorage();

// server/routes/auth.ts
init_schema();
import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
var router = Router();
router.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const data = parsed.data;
    const existingEmail = await storage.getUserByEmail(data.email);
    if (existingEmail) {
      return res.status(409).json({ message: "Email gi\xE0 registrata" });
    }
    const existingNickname = await storage.getUserByNickname(data.nickname);
    if (existingNickname) {
      return res.status(409).json({ message: "Nickname gi\xE0 in uso" });
    }
    if (data.invitationCode) {
      const invitation = await storage.getInvitationCode(data.invitationCode);
      if (!invitation || !invitation.isActive || invitation.currentUses >= invitation.maxUses) {
        return res.status(400).json({ message: "Codice invito non valido" });
      }
      if (invitation.expiresAt && new Date(invitation.expiresAt) < /* @__PURE__ */ new Date()) {
        return res.status(400).json({ message: "Codice invito scaduto" });
      }
      await storage.incrementInvitationCodeUses(invitation.id);
    }
    const hashedPassword = await bcrypt.hash(data.password, 12);
    const user = await storage.createUser({
      nickname: data.nickname,
      email: data.email,
      phone: data.phone,
      password: hashedPassword,
      userType: data.userType,
      sex: data.sex,
      coupleSexConfig: data.coupleSexConfig,
      birthYear: data.birthYear,
      region: data.region,
      eulaAccepted: data.eulaAccepted,
      invitationCode: data.invitationCode
    });
    await storage.createUserProfile({ userId: user.id });
    const emailVerifSetting = await storage.getAppSetting("email_verification_enabled");
    const emailVerificationEnabled = emailVerifSetting?.value === "true";
    if (emailVerificationEnabled) {
      const token = crypto.randomBytes(3).toString("hex").toUpperCase();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1e3);
      await storage.createEmailVerificationToken(user.id, token, expiresAt);
      console.log(`[EMAIL VERIFICATION] User: ${user.email}, Token: ${token}`);
      const { password: _2, ...safeUser2 } = user;
      return res.status(201).json({ ...safeUser2, requiresEmailVerification: true });
    }
    req.session.userId = user.id;
    const { password: _, ...safeUser } = user;
    return res.status(201).json(safeUser);
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const { identifier, password } = parsed.data;
    let user = await storage.getUserByEmail(identifier);
    if (!user) {
      user = await storage.getUserByNickname(identifier);
    }
    if (!user) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }
    if (user.status === "blocked" || user.status === "suspended") {
      return res.status(403).json({ message: "Account sospeso o bloccato" });
    }
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }
    await storage.updateUser(user.id, { lastLoginAt: /* @__PURE__ */ new Date() });
    req.session.userId = user.id;
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Errore durante il logout" });
    }
    res.clearCookie("connect.sid");
    return res.json({ message: "Logout effettuato" });
  });
});
router.get("/me", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "Utente non trovato" });
    }
    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(user.id);
    return res.json({
      ...safeUser,
      profileLatitude: profile?.latitude ?? null,
      profileLongitude: profile?.longitude ?? null
    });
  } catch (error) {
    console.error("Me error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Inserisci un'email valida" });
    }
    const user = await storage.getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.json({ message: "Se l'email \xE8 registrata, riceverai un link di recupero" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1e3);
    await storage.createPasswordResetToken(user.id, token, expiresAt);
    console.log(`
========== PASSWORD RESET ==========`);
    console.log(`User: ${user.nickname} (${user.email})`);
    console.log(`Token: ${token}`);
    console.log(`Expires: ${expiresAt.toISOString()}`);
    console.log(`====================================
`);
    return res.json({ message: "Se l'email \xE8 registrata, riceverai un link di recupero" });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: "Token e password richiesti" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "La password deve avere almeno 8 caratteri" });
    }
    const resetToken = await storage.getPasswordResetToken(token);
    if (!resetToken) {
      return res.status(400).json({ message: "Token non valido o gi\xE0 utilizzato" });
    }
    if (new Date(resetToken.expiresAt) < /* @__PURE__ */ new Date()) {
      return res.status(400).json({ message: "Token scaduto" });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    await storage.updateUser(resetToken.userId, { password: hashedPassword });
    await storage.markPasswordResetTokenUsed(token);
    return res.json({ message: "Password aggiornata con successo" });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router.post("/verify-email", async (req, res) => {
  try {
    const { email, token } = req.body;
    if (!email || !token) {
      return res.status(400).json({ message: "Email e codice richiesti" });
    }
    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const verif = await storage.getEmailVerificationToken(token.toUpperCase());
    if (!verif || verif.userId !== user.id) {
      return res.status(400).json({ message: "Codice non valido" });
    }
    if (new Date(verif.expiresAt) < /* @__PURE__ */ new Date()) {
      return res.status(400).json({ message: "Codice scaduto. Richiedi un nuovo codice." });
    }
    await storage.markUserEmailVerified(user.id);
    await storage.deleteEmailVerificationTokens(user.id);
    req.session.userId = user.id;
    const { password: _, ...safeUser } = user;
    return res.json({ ...safeUser, emailVerified: true });
  } catch (error) {
    console.error("Verify email error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email richiesta" });
    }
    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    if (user.emailVerified) {
      return res.status(400).json({ message: "Email gi\xE0 verificata" });
    }
    await storage.deleteEmailVerificationTokens(user.id);
    const token = crypto.randomBytes(3).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1e3);
    await storage.createEmailVerificationToken(user.id, token, expiresAt);
    console.log(`[EMAIL VERIFICATION] User: ${user.email}, Token: ${token}`);
    return res.json({ message: "Nuovo codice inviato" });
  } catch (error) {
    console.error("Resend verification error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var auth_default = router;

// server/routes/users.ts
import { Router as Router2 } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
var router2 = Router2();
var uploadsDir = path.join(process.cwd(), "uploads", "photos");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
var photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
var upload = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo di file non supportato. Usa JPEG, PNG o WebP."));
    }
  }
});
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}
router2.get("/", requireAuth, async (req, res) => {
  try {
    const allUsers = await storage.getAllUsers();
    const results = allUsers.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      avatarUrl: u.avatarUrl,
      userType: u.userType
    }));
    return res.json(results);
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(userId);
    const photos = await storage.getUserPhotos(userId);
    const motorcycles = await storage.getUserMotorcycles(userId);
    return res.json({
      ...safeUser,
      profile,
      photos,
      motorcycles
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.put("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const allowedUserFields = ["nickname", "phone", "sex", "coupleSexConfig", "birthYear", "region", "avatarUrl"];
    const userUpdate = {};
    for (const field of allowedUserFields) {
      if (req.body[field] !== void 0) {
        userUpdate[field] = req.body[field];
      }
    }
    if (Object.keys(userUpdate).length > 0) {
      if (userUpdate.nickname) {
        const existing = await storage.getUserByNickname(userUpdate.nickname);
        if (existing && existing.id !== userId) {
          return res.status(409).json({ message: "Nickname gi\xE0 in uso" });
        }
      }
      await storage.updateUser(userId, userUpdate);
    }
    const allowedProfileFields = ["bio", "maxPickupDistance", "latitude", "longitude"];
    const profileUpdate = {};
    for (const field of allowedProfileFields) {
      if (req.body[field] !== void 0) {
        profileUpdate[field] = req.body[field];
      }
    }
    if (Object.keys(profileUpdate).length > 0) {
      const existingProfile = await storage.getUserProfile(userId);
      if (existingProfile) {
        await storage.updateUserProfile(userId, profileUpdate);
      } else {
        await storage.createUserProfile({ userId, ...profileUpdate });
      }
    }
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(userId);
    const photos = await storage.getUserPhotos(userId);
    const motorcycles = await storage.getUserMotorcycles(userId);
    return res.json({
      ...safeUser,
      profile,
      photos,
      motorcycles
    });
  } catch (error) {
    console.error("Update user profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.get("/profile", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(userId);
    return res.json({
      ...safeUser,
      ...profile || {}
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.put("/profile/dynamic", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { isAvailable, latitude, longitude, searchPreference } = req.body;
    const existingProfile = await storage.getUserProfile(userId);
    const updateData = {};
    if (typeof isAvailable === "boolean") updateData.isAvailable = isAvailable;
    if (latitude !== void 0) updateData.latitude = latitude;
    if (longitude !== void 0) updateData.longitude = longitude;
    if (searchPreference !== void 0) updateData.searchPreference = searchPreference;
    if (existingProfile) {
      const profile = await storage.updateUserProfile(userId, updateData);
      return res.json(profile);
    } else {
      const profile = await storage.createUserProfile({ userId, ...updateData });
      return res.json(profile);
    }
  } catch (error) {
    console.error("Update dynamic profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.put("/location", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { latitude, longitude } = req.body;
    if (latitude === void 0 || longitude === void 0) {
      return res.status(400).json({ message: "Latitudine e longitudine richieste" });
    }
    const existingProfile = await storage.getUserProfile(userId);
    if (existingProfile) {
      await storage.updateUserProfile(userId, { latitude, longitude });
    } else {
      await storage.createUserProfile({ userId, latitude, longitude });
    }
    return res.json({ message: "Posizione aggiornata" });
  } catch (error) {
    console.error("Update location error:", error);
    return res.status(500).json({ message: "Errore aggiornamento posizione" });
  }
});
router2.put("/me/availability", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { isAvailable, latitude, longitude } = req.body;
    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({ message: "isAvailable deve essere un booleano" });
    }
    const existingProfile = await storage.getUserProfile(userId);
    const updateData = { isAvailable };
    if (latitude !== void 0) updateData.latitude = latitude;
    if (longitude !== void 0) updateData.longitude = longitude;
    if (existingProfile) {
      const profile = await storage.updateUserProfile(userId, updateData);
      return res.json(profile);
    } else {
      const profile = await storage.createUserProfile({ userId, ...updateData });
      return res.json(profile);
    }
  } catch (error) {
    console.error("Toggle availability error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.get("/:id/public", requireAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    if (targetUser.isFake && req.session.userId && req.session.userId !== userId) {
      storage.recordFakeUserInteraction(userId, req.session.userId, "profile_view").catch(() => {
      });
    }
    const { password: _, ...safeUser } = targetUser;
    const profile = await storage.getUserProfile(userId);
    const motorcycles = await storage.getUserMotorcycles(userId);
    const photos = await storage.getUserPhotos(userId);
    const approvedPhotos = photos.filter((p) => p.isApproved);
    return res.json({
      ...safeUser,
      bio: profile?.bio || null,
      motorcycles,
      photos: approvedPhotos
    });
  } catch (error) {
    console.error("Get public user profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.get("/online-count", requireAuth, async (req, res) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    const count = await storage.countActiveUsers(fifteenMinutesAgo);
    return res.json({ count });
  } catch (error) {
    console.error("Online count error:", error);
    return res.json({ count: 0 });
  }
});
router2.get("/available-count", requireAuth, async (req, res) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    const count = await storage.countAvailableUsers(fifteenMinutesAgo);
    return res.json({ count });
  } catch (error) {
    console.error("Available count error:", error);
    return res.json({ count: 0 });
  }
});
router2.get("/online-list", requireAuth, async (req, res) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    const lat = req.query.lat ? parseFloat(req.query.lat) : void 0;
    const lng = req.query.lng ? parseFloat(req.query.lng) : void 0;
    const includeOffline = req.query.includeOffline === "true";
    const onlineResults = await storage.getOnlineUsersList(fifteenMinutesAgo, lat, lng);
    let allResults = onlineResults;
    const onlineIdSet = new Set(onlineResults.map((r) => r.user.id));
    if (includeOffline) {
      const { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const { users: usersTable, userProfiles: profilesTable } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2, and: and2, lt, or: or2, isNull } = await import("drizzle-orm");
      const { sql: sqlTag } = await import("drizzle-orm");
      const distanceExpr = lat != null && lng != null ? sqlTag`(6371 * acos(cos(radians(${lat})) * cos(radians(${profilesTable.latitude})) * cos(radians(${profilesTable.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${profilesTable.latitude}))))`.as("distance") : sqlTag`0`.as("distance");
      const offlineResults = await db2.select({ user: usersTable, profile: profilesTable, distance: distanceExpr }).from(usersTable).leftJoin(profilesTable, eq2(profilesTable.userId, usersTable.id)).where(and2(eq2(usersTable.status, "active"), or2(lt(usersTable.lastLoginAt, fifteenMinutesAgo), isNull(usersTable.lastLoginAt)))).orderBy(sqlTag`distance`);
      const offlineOnly = offlineResults.filter((r) => !onlineIdSet.has(r.user.id));
      allResults = [...onlineResults, ...offlineOnly];
    }
    const motorcyclesMap = {};
    for (const item of allResults) {
      if (!motorcyclesMap[item.user.id]) {
        motorcyclesMap[item.user.id] = await storage.getUserMotorcycles(item.user.id);
      }
    }
    const mapped = allResults.map((item) => {
      const motos = motorcyclesMap[item.user.id] || [];
      const firstMoto = motos[0];
      return {
        id: item.user.id,
        nickname: item.user.nickname,
        userType: item.user.userType,
        sex: item.user.sex,
        region: item.user.region,
        birthYear: item.user.birthYear,
        bio: item.profile?.bio || null,
        moto: firstMoto ? `${firstMoto.brand} ${firstMoto.model}` : null,
        ridingStyle: firstMoto?.ridingStyle || null,
        distance: lat != null && lng != null ? Math.round(item.distance * 10) / 10 : null,
        isAvailable: item.profile?.isAvailable || false,
        isOnline: onlineIdSet.has(item.user.id)
      };
    });
    return res.json(mapped);
  } catch (error) {
    console.error("Online list error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});
router2.get("/available-list", requireAuth, async (req, res) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    const lat = req.query.lat ? parseFloat(req.query.lat) : void 0;
    const lng = req.query.lng ? parseFloat(req.query.lng) : void 0;
    const results = await storage.getAvailableUsersList(fifteenMinutesAgo, lat, lng);
    const motorcyclesMap = {};
    for (const item of results) {
      if (!motorcyclesMap[item.user.id]) {
        motorcyclesMap[item.user.id] = await storage.getUserMotorcycles(item.user.id);
      }
    }
    const mapped = results.map((item) => {
      const motos = motorcyclesMap[item.user.id] || [];
      const firstMoto = motos[0];
      return {
        id: item.user.id,
        nickname: item.user.nickname,
        userType: item.user.userType,
        sex: item.user.sex,
        region: item.user.region,
        birthYear: item.user.birthYear,
        bio: item.profile?.bio || null,
        moto: firstMoto ? `${firstMoto.brand} ${firstMoto.model}` : null,
        ridingStyle: firstMoto?.ridingStyle || null,
        distance: lat != null && lng != null ? Math.round(item.distance * 10) / 10 : null,
        isAvailable: true
      };
    });
    return res.json(mapped);
  } catch (error) {
    console.error("Available list error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});
router2.get("/biker-available-count", requireAuth, async (req, res) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    const count = await storage.countAvailableBikers(fifteenMinutesAgo);
    return res.json({ count });
  } catch (error) {
    console.error("Biker available count error:", error);
    return res.json({ count: 0 });
  }
});
router2.get("/zavorrine-available-count", requireAuth, async (req, res) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    const count = await storage.countAvailableZavorrine(fifteenMinutesAgo);
    return res.json({ count });
  } catch (error) {
    console.error("Zavorrine available count error:", error);
    return res.json({ count: 0 });
  }
});
router2.get("/biker-available-list", requireAuth, async (req, res) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    const lat = req.query.lat ? parseFloat(req.query.lat) : void 0;
    const lng = req.query.lng ? parseFloat(req.query.lng) : void 0;
    const includeOffline = req.query.includeOffline === "true";
    const onlineResults = await storage.getAvailableBikersList(fifteenMinutesAgo, lat, lng);
    let allResults = onlineResults;
    if (includeOffline) {
      const { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const { users: usersTable, userProfiles: profilesTable } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2, and: and2, or: or2 } = await import("drizzle-orm");
      const { sql: sqlTag } = await import("drizzle-orm");
      const distanceExpr = lat != null && lng != null ? sqlTag`(6371 * acos(cos(radians(${lat})) * cos(radians(${profilesTable.latitude})) * cos(radians(${profilesTable.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${profilesTable.latitude}))))`.as("distance") : sqlTag`0`.as("distance");
      const allBikers = await db2.select({ user: usersTable, profile: profilesTable, distance: distanceExpr }).from(profilesTable).innerJoin(usersTable, eq2(usersTable.id, profilesTable.userId)).where(and2(eq2(usersTable.status, "active"), or2(eq2(usersTable.userType, "biker"), eq2(usersTable.userType, "coppia")))).orderBy(sqlTag`distance`);
      const onlineIds = new Set(onlineResults.map((r) => r.user.id));
      const offlineOnly = allBikers.filter((r) => !onlineIds.has(r.user.id));
      allResults = [...onlineResults, ...offlineOnly];
    }
    const motorcyclesMap = {};
    for (const item of allResults) {
      if (!motorcyclesMap[item.user.id]) {
        motorcyclesMap[item.user.id] = await storage.getUserMotorcycles(item.user.id);
      }
    }
    const onlineAvailableIds = new Set(onlineResults.map((r) => r.user.id));
    const mapped = allResults.map((item) => {
      const motos = motorcyclesMap[item.user.id] || [];
      const firstMoto = motos[0];
      return {
        id: item.user.id,
        nickname: item.user.nickname,
        userType: item.user.userType,
        sex: item.user.sex,
        region: item.user.region,
        birthYear: item.user.birthYear,
        bio: item.profile?.bio || null,
        moto: firstMoto ? `${firstMoto.brand} ${firstMoto.model}` : null,
        ridingStyle: firstMoto?.ridingStyle || null,
        distance: lat != null && lng != null ? Math.round(item.distance * 10) / 10 : null,
        isAvailable: item.profile?.isAvailable || false,
        isOnline: onlineAvailableIds.has(item.user.id)
      };
    });
    return res.json(mapped);
  } catch (error) {
    console.error("Biker available list error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});
router2.get("/zavorrine-available-list", requireAuth, async (req, res) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    const lat = req.query.lat ? parseFloat(req.query.lat) : void 0;
    const lng = req.query.lng ? parseFloat(req.query.lng) : void 0;
    const includeOffline = req.query.includeOffline === "true";
    const onlineResults = await storage.getAvailableZavorrinaList(fifteenMinutesAgo, lat, lng);
    let allResults = onlineResults;
    if (includeOffline) {
      const { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const { users: usersTable, userProfiles: profilesTable } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2, and: and2 } = await import("drizzle-orm");
      const { sql: sqlTag } = await import("drizzle-orm");
      const distanceExpr = lat != null && lng != null ? sqlTag`(6371 * acos(cos(radians(${lat})) * cos(radians(${profilesTable.latitude})) * cos(radians(${profilesTable.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${profilesTable.latitude}))))`.as("distance") : sqlTag`0`.as("distance");
      const allZav = await db2.select({ user: usersTable, profile: profilesTable, distance: distanceExpr }).from(profilesTable).innerJoin(usersTable, eq2(usersTable.id, profilesTable.userId)).where(and2(eq2(usersTable.status, "active"), eq2(usersTable.userType, "zavorrina"))).orderBy(sqlTag`distance`);
      const onlineIds = new Set(onlineResults.map((r) => r.user.id));
      const offlineOnly = allZav.filter((r) => !onlineIds.has(r.user.id));
      allResults = [...onlineResults, ...offlineOnly];
    }
    const motorcyclesMap = {};
    for (const item of allResults) {
      if (!motorcyclesMap[item.user.id]) {
        motorcyclesMap[item.user.id] = await storage.getUserMotorcycles(item.user.id);
      }
    }
    const onlineAvailableIds = new Set(onlineResults.map((r) => r.user.id));
    const mapped = allResults.map((item) => {
      const motos = motorcyclesMap[item.user.id] || [];
      const firstMoto = motos[0];
      return {
        id: item.user.id,
        nickname: item.user.nickname,
        userType: item.user.userType,
        sex: item.user.sex,
        region: item.user.region,
        birthYear: item.user.birthYear,
        bio: item.profile?.bio || null,
        moto: firstMoto ? `${firstMoto.brand} ${firstMoto.model}` : null,
        ridingStyle: firstMoto?.ridingStyle || null,
        distance: lat != null && lng != null ? Math.round(item.distance * 10) / 10 : null,
        isAvailable: item.profile?.isAvailable || false,
        isOnline: onlineAvailableIds.has(item.user.id)
      };
    });
    return res.json(mapped);
  } catch (error) {
    console.error("Zavorrine available list error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});
router2.get("/nearby", requireAuth, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius) || 50;
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ message: "Parametri lat e lng richiesti" });
    }
    const nearbyUsers = await storage.getNearbyUsers(lat, lng, radius);
    const results = nearbyUsers.map((item) => {
      const { password: _, ...safeUser } = item.user;
      return {
        ...safeUser,
        latitude: item.profile?.latitude,
        longitude: item.profile?.longitude,
        isAvailable: item.profile?.isAvailable || false,
        profile: item.profile,
        distance: Math.round(item.distance * 10) / 10
      };
    }).filter((item) => item.latitude != null && item.longitude != null && !isNaN(item.latitude) && !isNaN(item.longitude));
    return res.json(results);
  } catch (error) {
    console.error("Nearby users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.get("/search", requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (q.length < 2) {
      return res.json([]);
    }
    const results = await storage.searchUsers(q);
    const safeResults = results.map((item) => {
      const { password: _, ...safeUser } = item.user;
      return {
        ...safeUser,
        latitude: item.profile?.latitude || null,
        longitude: item.profile?.longitude || null,
        isAvailable: item.profile?.isAvailable || false,
        profile: item.profile
      };
    });
    return res.json(safeResults);
  } catch (error) {
    console.error("Search users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.post("/me/photos", requireAuth, upload.single("photo"), async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    if (user.userType === "zavorrina") {
      const count = await storage.getUserPhotoCount(userId);
      if (count >= 3) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ message: "Massimo 3 foto consentite per le zavorrine" });
      }
    }
    if (!req.file) {
      return res.status(400).json({ message: "Nessuna foto caricata" });
    }
    const photoUrl = `/uploads/photos/${req.file.filename}`;
    const sortOrder = await storage.getUserPhotoCount(userId);
    const photo = await storage.createUserPhoto({
      userId,
      photoUrl,
      sortOrder,
      isApproved: true
    });
    return res.status(201).json(photo);
  } catch (error) {
    console.error("Upload photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.delete("/me/photos/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const photoId = req.params.id;
    const photo = await storage.getUserPhoto(photoId);
    if (!photo) {
      return res.status(404).json({ message: "Foto non trovata" });
    }
    if (photo.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    const filePath = path.join(process.cwd(), photo.photoUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    await storage.deleteUserPhoto(photoId);
    return res.json({ message: "Foto eliminata" });
  } catch (error) {
    console.error("Delete photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.post("/me/request-deletion", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    await storage.requestUserDeletion(userId);
    req.session.destroy(() => {
    });
    return res.json({ message: "Richiesta di cancellazione inviata. Il tuo account sar\xE0 eliminato tra 30 giorni." });
  } catch (error) {
    console.error("Request deletion error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.post("/me/cancel-deletion", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    await storage.cancelUserDeletion(userId);
    return res.json({ message: "Richiesta di cancellazione annullata." });
  } catch (error) {
    console.error("Cancel deletion error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var users_default = router2;

// server/routes/motorcycles.ts
import { Router as Router3 } from "express";
import path2 from "path";
import fs2 from "fs";
var router3 = Router3();
var uploadsDir2 = path2.join(process.cwd(), "uploads", "motorcycles");
if (!fs2.existsSync(uploadsDir2)) {
  fs2.mkdirSync(uploadsDir2, { recursive: true });
}
function requireAuth2(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}
router3.get("/", requireAuth2, async (req, res) => {
  try {
    const userId = req.session.userId;
    const motorcycles = await storage.getUserMotorcycles(userId);
    const result = await Promise.all(motorcycles.map(async (m) => {
      const photos = await storage.getMotorcyclePhotos(m.id);
      return { ...m, photos };
    }));
    return res.json(result);
  } catch (error) {
    console.error("Get motorcycles error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router3.post("/", requireAuth2, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    if (user.userType !== "biker" && user.userType !== "coppia") {
      return res.status(403).json({ message: "Solo biker e coppie possono aggiungere moto" });
    }
    const { brand, model, year, displacement, motorcycleType, ridingStyle, photoUrl } = req.body;
    if (!brand || !model) {
      return res.status(400).json({ message: "Marca e modello sono obbligatori" });
    }
    const motorcycle = await storage.createUserMotorcycle({
      userId,
      brand,
      model,
      year: year || null,
      displacement: displacement || null,
      motorcycleType: motorcycleType || null,
      ridingStyle: ridingStyle || null,
      photoUrl: photoUrl || null
    });
    let matches = [];
    if (ridingStyle) {
      const wishlistMotos = await storage.findMatchingWishlistMotos(brand || "", model || "", ridingStyle, motorcycleType || "");
      for (const wm of wishlistMotos) {
        if (wm.userId === userId) continue;
        await storage.createMatch({
          bikerId: userId,
          zavarrinaId: wm.userId,
          bikerMotorcycleId: motorcycle.id,
          wishlistMotoId: wm.id,
          status: "new"
        });
        const zavarrinaUser = await storage.getUser(wm.userId);
        await storage.createNotification({
          userId,
          title: "Here Comes Your Chance!!",
          body: `Una zavorrina cerca proprio la tua moto: ${brand} ${model}! (${zavarrinaUser?.nickname || "Zavorrina"})`,
          notificationType: "match",
          referenceType: "match",
          referenceId: wm.id
        });
        await storage.createNotification({
          userId: wm.userId,
          title: "Here Comes Your Chance!!",
          body: `Un biker ha la moto che cerchi: ${brand} ${model}!`,
          notificationType: "match",
          referenceType: "match",
          referenceId: motorcycle.id
        });
        matches.push({ zavarrinaNickname: zavarrinaUser?.nickname, brand, model, ridingStyle });
      }
    }
    return res.status(201).json({ motorcycle, matches });
  } catch (error) {
    console.error("Create motorcycle error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router3.put("/:id", requireAuth2, async (req, res) => {
  try {
    const userId = req.session.userId;
    const motoId = req.params.id;
    const existing = await storage.getUserMotorcycle(motoId);
    if (!existing) {
      return res.status(404).json({ message: "Moto non trovata" });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    const allowedFields = ["brand", "model", "year", "displacement", "motorcycleType", "ridingStyle", "photoUrl"];
    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== void 0) {
        updateData[field] = req.body[field];
      }
    }
    const motorcycle = await storage.updateUserMotorcycle(motoId, updateData);
    return res.json(motorcycle);
  } catch (error) {
    console.error("Update motorcycle error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router3.delete("/:id", requireAuth2, async (req, res) => {
  try {
    const userId = req.session.userId;
    const motoId = req.params.id;
    const existing = await storage.getUserMotorcycle(motoId);
    if (!existing) {
      return res.status(404).json({ message: "Moto non trovata" });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    await storage.deleteUserMotorcycle(motoId);
    return res.json({ message: "Moto eliminata" });
  } catch (error) {
    console.error("Delete motorcycle error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router3.get("/:id/photos", requireAuth2, async (req, res) => {
  try {
    const motoId = req.params.id;
    const photos = await storage.getMotorcyclePhotos(motoId);
    return res.json(photos);
  } catch (error) {
    console.error("Get motorcycle photos error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router3.post("/:id/photos", requireAuth2, async (req, res) => {
  try {
    const userId = req.session.userId;
    const motoId = req.params.id;
    const existing = await storage.getUserMotorcycle(motoId);
    if (!existing || existing.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    const count = await storage.getMotorcyclePhotoCount(motoId);
    if (count >= 3) {
      return res.status(400).json({ message: "Massimo 3 foto per moto" });
    }
    const { imageBase64, filename } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ message: "Nessuna immagine fornita" });
    }
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const ext = (filename || "photo.jpg").split(".").pop() || "jpg";
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const filePath = path2.join(uploadsDir2, uniqueName);
    fs2.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
    const photoUrl = `/uploads/motorcycles/${uniqueName}`;
    const photo = await storage.addMotorcyclePhoto({
      motorcycleId: motoId,
      photoUrl,
      sortOrder: count
    });
    return res.status(201).json(photo);
  } catch (error) {
    console.error("Upload motorcycle photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router3.delete("/:id/photos/:photoId", requireAuth2, async (req, res) => {
  try {
    const photoId = req.params.photoId;
    await storage.deleteMotorcyclePhoto(photoId);
    return res.json({ message: "Foto eliminata" });
  } catch (error) {
    console.error("Delete motorcycle photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var motorcycles_default = router3;

// server/routes/proposals.ts
import { Router as Router4 } from "express";
var router4 = Router4();
function requireAuth3(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}
var BIKER_SEARCH_TYPES = ["find_a_friend", "find_a_guest", "hitcher", "hitchhiker"];
var ZAVORRINA_SEARCH_TYPES = ["find_a_biker", "hitchhiker"];
router4.get("/", requireAuth3, async (req, res) => {
  try {
    const status = req.query.status || void 0;
    const proposalType = req.query.type;
    const filter = req.query.filter;
    let allProposals = await storage.getProposals(status ? { status } : void 0);
    if (proposalType) {
      allProposals = allProposals.filter((p) => p.proposalType === proposalType);
    }
    if (filter) {
      const filterMap = {
        giro: ["find_a_friend"],
        con_zavorrina: ["find_a_guest"],
        passaggio_al_volo: ["hitcher", "hitchhiker"],
        richieste: ["find_a_biker"]
      };
      const allowedTypes = filterMap[filter];
      if (allowedTypes) {
        allProposals = allProposals.filter((p) => p.searchType && allowedTypes.includes(p.searchType));
      }
    }
    const results = await Promise.all(
      allProposals.map(async (proposal) => {
        const participants = await storage.getProposalParticipants(proposal.id);
        const creator = await storage.getUser(proposal.userId);
        const creatorName = creator?.nickname ?? "Sconosciuto";
        let motoInfo = null;
        if (proposal.motorcycleId) {
          const motos = await storage.getUserMotorcycles(proposal.userId);
          const moto = motos.find((m) => m.id === proposal.motorcycleId);
          if (moto) motoInfo = { brand: moto.brand, model: moto.model, motorcycleType: moto.motorcycleType, ridingStyle: moto.ridingStyle };
        }
        return {
          ...proposal,
          creatorNickname: creatorName,
          creatorUserType: creator?.userType,
          participantCount: participants.length,
          motoInfo
        };
      })
    );
    return res.json(results);
  } catch (error) {
    console.error("Get proposals error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.get("/matches", requireAuth3, async (req, res) => {
  try {
    const userId = req.session.userId;
    const matches = await storage.getProposalMatches(userId);
    const results = await Promise.all(
      matches.map(async (match) => {
        const proposal1 = await storage.getProposal(match.proposalId1);
        const proposal2 = await storage.getProposal(match.proposalId2);
        const user1 = await storage.getUser(match.userId1);
        const user2 = await storage.getUser(match.userId2);
        return {
          ...match,
          proposal1: proposal1 ? { ...proposal1, creatorNickname: user1?.nickname } : null,
          proposal2: proposal2 ? { ...proposal2, creatorNickname: user2?.nickname } : null,
          user1Nickname: user1?.nickname,
          user2Nickname: user2?.nickname,
          user1Type: user1?.userType,
          user2Type: user2?.userType
        };
      })
    );
    return res.json(results);
  } catch (error) {
    console.error("Get matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.get("/garage-matches", requireAuth3, async (req, res) => {
  try {
    const userId = req.session.userId;
    const garageMatches = await storage.getMatchesForUser(userId);
    const results = await Promise.all(
      garageMatches.map(async (match) => {
        const biker = await storage.getUser(match.bikerId);
        const zavorrina = await storage.getUser(match.zavarrinaId);
        const bikerMoto = await storage.getUserMotorcycle(match.bikerMotorcycleId);
        const wishlistMoto = await storage.getWishlistMoto(match.wishlistMotoId);
        return {
          ...match,
          bikerNickname: biker?.nickname,
          bikerType: biker?.userType,
          zavarrinaNickname: zavorrina?.nickname,
          zavarrinaType: zavorrina?.userType,
          bikerMoto: bikerMoto ? { brand: bikerMoto.brand, model: bikerMoto.model, motorcycleType: bikerMoto.motorcycleType } : null,
          wishlistMoto: wishlistMoto ? { brand: wishlistMoto.brand, model: wishlistMoto.model, motorcycleType: wishlistMoto.motorcycleType } : null
        };
      })
    );
    return res.json(results);
  } catch (error) {
    console.error("Get garage matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.post("/garage-matches/:id/accept", requireAuth3, async (req, res) => {
  try {
    const userId = req.session.userId;
    const matchId = req.params.id;
    const match = await storage.getGarageMatch(matchId);
    if (!match) {
      return res.status(404).json({ message: "Match non trovato" });
    }
    if (match.bikerId !== userId && match.zavarrinaId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    if (match.status !== "new") {
      return res.status(400).json({ message: "Match gi\xE0 gestito" });
    }
    const updated = await storage.updateGarageMatch(matchId, { status: "accepted" });
    return res.json(updated);
  } catch (error) {
    console.error("Accept garage match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.post("/garage-matches/:id/reject", requireAuth3, async (req, res) => {
  try {
    const userId = req.session.userId;
    const matchId = req.params.id;
    const match = await storage.getGarageMatch(matchId);
    if (!match) {
      return res.status(404).json({ message: "Match non trovato" });
    }
    if (match.bikerId !== userId && match.zavarrinaId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    if (match.status !== "new") {
      return res.status(400).json({ message: "Match gi\xE0 gestito" });
    }
    const updated = await storage.updateGarageMatch(matchId, { status: "rejected" });
    return res.json(updated);
  } catch (error) {
    console.error("Reject garage match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.post("/matches/:id/accept", requireAuth3, async (req, res) => {
  try {
    const userId = req.session.userId;
    const matchId = req.params.id;
    const match = await storage.getProposalMatch(matchId);
    if (!match) {
      return res.status(404).json({ message: "Match non trovato" });
    }
    if (match.status !== "pending") {
      return res.status(400).json({ message: "Match non pi\xF9 in attesa" });
    }
    const isUser1 = match.userId1 === userId;
    const isUser2 = match.userId2 === userId;
    if (!isUser1 && !isUser2) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    const updateData = {};
    if (isUser1) updateData.acceptedByUser1 = true;
    if (isUser2) updateData.acceptedByUser2 = true;
    const newAcceptedByUser1 = isUser1 ? true : match.acceptedByUser1;
    const newAcceptedByUser2 = isUser2 ? true : match.acceptedByUser2;
    if (newAcceptedByUser1 && newAcceptedByUser2) {
      updateData.status = "accepted";
      const proposal1 = await storage.getProposal(match.proposalId1);
      const proposal2 = await storage.getProposal(match.proposalId2);
      const chatTitle = `Match: ${proposal1?.title || "Proposta"} \u2194 ${proposal2?.title || "Proposta"}`;
      const conv = await storage.createConversation({
        conversationType: "group",
        title: chatTitle,
        proposalId: match.proposalId1
      });
      await storage.addConversationParticipant({ conversationId: conv.id, userId: match.userId1 });
      if (match.userId2 !== match.userId1) {
        await storage.addConversationParticipant({ conversationId: conv.id, userId: match.userId2 });
      }
      updateData.conversationId = conv.id;
      if (proposal2?.returnDeadline) {
        const deadline = new Date(proposal2.returnDeadline);
        const timeStr = deadline.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        await storage.createMessage({
          conversationId: conv.id,
          senderId: match.userId2,
          content: `\u26A0\uFE0F Attenzione: vuole rientrare entro le ${timeStr}`,
          messageType: "text"
        });
      }
      if (proposal1?.returnDeadline) {
        const deadline = new Date(proposal1.returnDeadline);
        const timeStr = deadline.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        await storage.createMessage({
          conversationId: conv.id,
          senderId: match.userId1,
          content: `\u26A0\uFE0F Attenzione: vuole rientrare entro le ${timeStr}`,
          messageType: "text"
        });
      }
    }
    const updated = await storage.updateProposalMatch(matchId, updateData);
    return res.json(updated);
  } catch (error) {
    console.error("Accept match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.post("/matches/:id/reject", requireAuth3, async (req, res) => {
  try {
    const userId = req.session.userId;
    const matchId = req.params.id;
    const match = await storage.getProposalMatch(matchId);
    if (!match) {
      return res.status(404).json({ message: "Match non trovato" });
    }
    if (match.userId1 !== userId && match.userId2 !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    const updated = await storage.updateProposalMatch(matchId, { status: "rejected" });
    return res.json(updated);
  } catch (error) {
    console.error("Reject match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.get("/:id", requireAuth3, async (req, res) => {
  try {
    const proposalId = req.params.id;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: "Proposta non trovata" });
    }
    const participants = await storage.getProposalParticipants(proposal.id);
    const creator = await storage.getUser(proposal.userId);
    const participantDetails = await Promise.all(
      participants.map(async (p) => {
        const user = await storage.getUser(p.userId);
        return {
          ...p,
          nickname: user?.nickname ?? "Sconosciuto",
          userType: user?.userType,
          avatarUrl: user?.avatarUrl
        };
      })
    );
    let motoInfo = null;
    if (proposal.motorcycleId) {
      const motos = await storage.getUserMotorcycles(proposal.userId);
      const moto = motos.find((m) => m.id === proposal.motorcycleId);
      if (moto) motoInfo = { brand: moto.brand, model: moto.model, motorcycleType: moto.motorcycleType, ridingStyle: moto.ridingStyle };
    }
    return res.json({
      ...proposal,
      creatorNickname: creator?.nickname ?? "Sconosciuto",
      creatorUserType: creator?.userType,
      creatorAvatarUrl: creator?.avatarUrl,
      participants: participantDetails,
      motoInfo
    });
  } catch (error) {
    console.error("Get proposal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.post("/", requireAuth3, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const {
      proposalType,
      searchType,
      title,
      description,
      searchRadius,
      motorcycleId,
      wishlistMotoId,
      anyMotoOk,
      departureLatitude,
      departureLongitude,
      departureAddress,
      destinationAddress,
      destinationLatitude,
      destinationLongitude,
      scheduledAt,
      departureTimeFrom,
      departureTimeTo,
      returnDeadline,
      stops,
      maxParticipants
    } = req.body;
    if (!proposalType || !title) {
      return res.status(400).json({ message: "Tipo e titolo sono obbligatori" });
    }
    if (searchType) {
      const userType = user.userType;
      if ((userType === "biker" || userType === "coppia") && !BIKER_SEARCH_TYPES.includes(searchType)) {
        return res.status(400).json({ message: "Tipo di ricerca non valido per biker/coppia" });
      }
      if (userType === "zavorrina" && !ZAVORRINA_SEARCH_TYPES.includes(searchType)) {
        return res.status(400).json({ message: "Tipo di ricerca non valido per zavorrina" });
      }
    }
    let expiresAt = null;
    if (departureTimeTo) {
      expiresAt = new Date(new Date(departureTimeTo).getTime() + 2 * 60 * 60 * 1e3);
    }
    const proposal = await storage.createProposal({
      userId,
      proposalType,
      searchType: searchType || null,
      title,
      description: description || null,
      searchRadius: searchRadius || null,
      motorcycleId: motorcycleId || null,
      wishlistMotoId: wishlistMotoId || null,
      anyMotoOk: anyMotoOk || false,
      departureLatitude: departureLatitude ?? null,
      departureLongitude: departureLongitude ?? null,
      departureAddress: departureAddress || null,
      destinationAddress: destinationAddress || null,
      destinationLatitude: destinationLatitude ?? null,
      destinationLongitude: destinationLongitude ?? null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      departureTimeFrom: departureTimeFrom ? new Date(departureTimeFrom) : null,
      departureTimeTo: departureTimeTo ? new Date(departureTimeTo) : null,
      returnDeadline: returnDeadline ? new Date(returnDeadline) : null,
      stops: stops || null,
      maxParticipants: maxParticipants ?? null,
      expiresAt
    });
    await storage.addProposalParticipant({
      proposalId: proposal.id,
      userId
    });
    return res.status(201).json(proposal);
  } catch (error) {
    console.error("Create proposal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.put("/:id", requireAuth3, async (req, res) => {
  try {
    const userId = req.session.userId;
    const proposalId = req.params.id;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: "Proposta non trovata" });
    }
    if (proposal.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    const allowedFields = [
      "title",
      "description",
      "departureLatitude",
      "departureLongitude",
      "departureAddress",
      "destinationAddress",
      "destinationLatitude",
      "destinationLongitude",
      "scheduledAt",
      "departureTimeFrom",
      "departureTimeTo",
      "returnDeadline",
      "searchRadius",
      "motorcycleId",
      "wishlistMotoId",
      "anyMotoOk",
      "stops",
      "maxParticipants",
      "status"
    ];
    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== void 0) {
        updateData[field] = req.body[field];
      }
    }
    const dateFields = ["scheduledAt", "departureTimeFrom", "departureTimeTo", "returnDeadline"];
    for (const f of dateFields) {
      if (updateData[f]) updateData[f] = new Date(updateData[f]);
    }
    if (updateData.departureTimeTo) {
      updateData.expiresAt = new Date(updateData.departureTimeTo.getTime() + 2 * 60 * 60 * 1e3);
    }
    const updated = await storage.updateProposal(proposalId, updateData);
    return res.json(updated);
  } catch (error) {
    console.error("Update proposal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.post("/:id/join", requireAuth3, async (req, res) => {
  try {
    const userId = req.session.userId;
    const proposalId = req.params.id;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: "Proposta non trovata" });
    }
    if (proposal.status !== "active") {
      return res.status(400).json({ message: "La proposta non \xE8 pi\xF9 attiva" });
    }
    const participants = await storage.getProposalParticipants(proposal.id);
    const alreadyJoined = participants.some((p) => p.userId === userId);
    if (alreadyJoined) {
      return res.status(409).json({ message: "Sei gi\xE0 iscritto a questa proposta" });
    }
    if (proposal.maxParticipants && participants.length >= proposal.maxParticipants) {
      return res.status(400).json({ message: "Numero massimo di partecipanti raggiunto" });
    }
    const participant = await storage.addProposalParticipant({
      proposalId: proposal.id,
      userId
    });
    return res.status(201).json(participant);
  } catch (error) {
    console.error("Join proposal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.delete("/:id", requireAuth3, async (req, res) => {
  try {
    const proposalId = req.params.id;
    const userId = req.session.userId;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: "Proposta non trovata" });
    }
    if (proposal.userId !== userId) {
      return res.status(403).json({ message: "Solo il creatore pu\xF2 eliminare questa proposta" });
    }
    await storage.deleteProposal(proposalId);
    return res.json({ message: "Proposta eliminata" });
  } catch (error) {
    console.error("Delete proposal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var proposals_default = router4;

// server/routes/tracking.ts
import { Router as Router5 } from "express";
var router5 = Router5();
function requireAuth4(req, res) {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}
router5.post("/", async (req, res) => {
  try {
    const userId = requireAuth4(req, res);
    if (!userId) return;
    const { title, trackingFrequency } = req.body;
    const route = await storage.createRoute({
      userId,
      title: title || null,
      trackingFrequency: trackingFrequency || 5,
      status: "active",
      startedAt: /* @__PURE__ */ new Date()
    });
    return res.status(201).json(route);
  } catch (error) {
    console.error("Create route error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.post("/:id/points", async (req, res) => {
  try {
    const userId = requireAuth4(req, res);
    if (!userId) return;
    const id = req.params.id;
    const route = await storage.getRoute(id);
    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    if (route.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    if (route.status !== "active") {
      return res.status(400).json({ message: "Il percorso non \xE8 attivo" });
    }
    const { points } = req.body;
    if (!Array.isArray(points) || points.length === 0) {
      return res.status(400).json({ message: "Nessun punto GPS fornito" });
    }
    const routePoints2 = points.map((p) => ({
      routeId: id,
      latitude: p.latitude,
      longitude: p.longitude,
      altitude: p.altitude ?? null,
      speedKmh: p.speedKmh ?? null,
      timestamp: p.timestamp ? new Date(p.timestamp) : /* @__PURE__ */ new Date()
    }));
    const created = await storage.createRoutePoints(routePoints2);
    return res.status(201).json(created);
  } catch (error) {
    console.error("Add route points error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.put("/:id/stop", async (req, res) => {
  try {
    const userId = requireAuth4(req, res);
    if (!userId) return;
    const id = req.params.id;
    const route = await storage.getRoute(id);
    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    if (route.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    const allPoints = await storage.getRoutePoints(id);
    let totalDistanceKm = 0;
    let maxSpeedKmh = 0;
    let maxAltitude = 0;
    let idleTimeSeconds = 0;
    for (let i = 0; i < allPoints.length; i++) {
      const pt = allPoints[i];
      if (pt.speedKmh !== null && pt.speedKmh !== void 0) {
        if (pt.speedKmh > maxSpeedKmh) maxSpeedKmh = pt.speedKmh;
      }
      if (pt.altitude !== null && pt.altitude !== void 0) {
        if (pt.altitude > maxAltitude) maxAltitude = pt.altitude;
      }
      if (i > 0) {
        const prev = allPoints[i - 1];
        totalDistanceKm += haversineKm(prev.latitude, prev.longitude, pt.latitude, pt.longitude);
        const intervalSec = Math.abs(new Date(pt.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1e3;
        const speed = pt.speedKmh ?? 0;
        if (speed < 3) {
          idleTimeSeconds += intervalSec;
        }
      }
    }
    const stoppedAt = /* @__PURE__ */ new Date();
    const durationSeconds = Math.floor((stoppedAt.getTime() - new Date(route.startedAt).getTime()) / 1e3);
    const netTravelSeconds = Math.max(durationSeconds - idleTimeSeconds, 1);
    const avgSpeedKmh = totalDistanceKm > 0 ? totalDistanceKm / (netTravelSeconds / 3600) : 0;
    const updated = await storage.updateRoute(id, {
      status: "completed",
      totalDistanceKm,
      maxSpeedKmh,
      avgSpeedKmh,
      maxAltitude,
      durationSeconds,
      idleTimeSeconds: Math.round(idleTimeSeconds),
      stoppedAt
    });
    const profile = await storage.getUserProfile(userId);
    if (profile) {
      await storage.updateUserProfile(userId, {
        totalKm: (profile.totalKm || 0) + totalDistanceKm,
        totalRides: (profile.totalRides || 0) + 1
      });
    }
    return res.json(updated);
  } catch (error) {
    console.error("Stop route error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.patch("/:id/stats", async (req, res) => {
  try {
    const userId = requireAuth4(req, res);
    if (!userId) return;
    const id = req.params.id;
    const route = await storage.getRoute(id);
    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    if (route.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    if (route.status !== "active") {
      return res.status(400).json({ message: "Il percorso non \xE8 attivo" });
    }
    const { totalDistanceKm, maxSpeedKmh, avgSpeedKmh, maxAltitude, idleTimeSeconds } = req.body;
    const updates = {};
    if (totalDistanceKm !== void 0) updates.totalDistanceKm = totalDistanceKm;
    if (maxSpeedKmh !== void 0) updates.maxSpeedKmh = maxSpeedKmh;
    if (avgSpeedKmh !== void 0) updates.avgSpeedKmh = avgSpeedKmh;
    if (maxAltitude !== void 0) updates.maxAltitude = maxAltitude;
    if (idleTimeSeconds !== void 0) updates.idleTimeSeconds = idleTimeSeconds;
    if (Object.keys(updates).length > 0) {
      await storage.updateRoute(id, updates);
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("Update route stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.get("/", async (req, res) => {
  try {
    const userId = requireAuth4(req, res);
    if (!userId) return;
    const userRoutes = await storage.getRoutes(userId);
    return res.json(userRoutes);
  } catch (error) {
    console.error("Get routes error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.get("/:id", async (req, res) => {
  try {
    const userId = requireAuth4(req, res);
    if (!userId) return;
    const id = req.params.id;
    const route = await storage.getRoute(id);
    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    if (route.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    const points = await storage.getRoutePoints(id);
    return res.json({ ...route, points });
  } catch (error) {
    console.error("Get route error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.post("/:id/like", async (req, res) => {
  try {
    const userId = requireAuth4(req, res);
    if (!userId) return;
    const id = req.params.id;
    const route = await storage.getRoute(id);
    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    const updated = await storage.updateRoute(id, {
      likes: (route.likes || 0) + 1
    });
    return res.json(updated);
  } catch (error) {
    console.error("Like route error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function toRad(deg) {
  return deg * (Math.PI / 180);
}
var tracking_default = router5;

// server/routes/wishlist.ts
import { Router as Router6 } from "express";
import path3 from "path";
import fs3 from "fs";
var router6 = Router6();
var uploadsDir3 = path3.join(process.cwd(), "uploads", "wishlist");
if (!fs3.existsSync(uploadsDir3)) {
  fs3.mkdirSync(uploadsDir3, { recursive: true });
}
function requireAuth5(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}
router6.get("/", requireAuth5, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await storage.getUser(userId);
    if (!user || user.userType !== "zavorrina") {
      return res.status(403).json({ message: "Solo le zavorrine possono accedere alla wishlist" });
    }
    let wishlist = await storage.getWishlist(userId);
    if (!wishlist) {
      wishlist = await storage.createOrUpdateWishlist(userId, "");
    }
    const photos = await storage.getWishlistPhotos(wishlist.id);
    const motos = await storage.getWishlistMotos(wishlist.id);
    return res.json({ wishlist, photos, motos });
  } catch (error) {
    console.error("Get wishlist error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router6.put("/", requireAuth5, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { description } = req.body;
    const wishlist = await storage.createOrUpdateWishlist(userId, description || "");
    return res.json(wishlist);
  } catch (error) {
    console.error("Update wishlist error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router6.post("/photos", requireAuth5, async (req, res) => {
  try {
    const userId = req.session.userId;
    let wishlist = await storage.getWishlist(userId);
    if (!wishlist) {
      wishlist = await storage.createOrUpdateWishlist(userId, "");
    }
    const count = await storage.getWishlistPhotoCount(wishlist.id);
    if (count >= 3) {
      return res.status(400).json({ message: "Massimo 3 foto permesse" });
    }
    const { imageBase64, filename } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ message: "Nessuna immagine fornita" });
    }
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const ext = (filename || "photo.jpg").split(".").pop() || "jpg";
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const filePath = path3.join(uploadsDir3, uniqueName);
    fs3.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
    const photoUrl = `/uploads/wishlist/${uniqueName}`;
    const photo = await storage.addWishlistPhoto({
      wishlistId: wishlist.id,
      photoUrl,
      sortOrder: count
    });
    return res.status(201).json(photo);
  } catch (error) {
    console.error("Upload wishlist photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router6.delete("/photos/:photoId", requireAuth5, async (req, res) => {
  try {
    const photoId = req.params.photoId;
    await storage.deleteWishlistPhoto(photoId);
    return res.json({ message: "Foto eliminata" });
  } catch (error) {
    console.error("Delete wishlist photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router6.post("/motos", requireAuth5, async (req, res) => {
  try {
    const userId = req.session.userId;
    let wishlist = await storage.getWishlist(userId);
    if (!wishlist) {
      wishlist = await storage.createOrUpdateWishlist(userId, "");
    }
    const count = await storage.getWishlistMotoCount(wishlist.id);
    if (count >= 5) {
      return res.status(400).json({ message: "Massimo 5 moto nella wishlist" });
    }
    const { brand, model, ridingStyle, motorcycleType } = req.body;
    if (!brand && !model && !motorcycleType) {
      return res.status(400).json({ message: "Specifica marca e modello oppure tipo moto" });
    }
    const moto = await storage.addWishlistMoto({
      wishlistId: wishlist.id,
      brand: brand || null,
      model: model || null,
      motorcycleType: motorcycleType || null,
      ridingStyle: ridingStyle || null
    });
    let matches = [];
    if (ridingStyle) {
      const bikerMotos = await storage.findMatchingBikerMotos(brand || "", model || "", ridingStyle, motorcycleType || "");
      for (const bikerMoto of bikerMotos) {
        if (bikerMoto.userId === userId) continue;
        await storage.createMatch({
          bikerId: bikerMoto.userId,
          zavarrinaId: userId,
          bikerMotorcycleId: bikerMoto.id,
          wishlistMotoId: moto.id,
          status: "new"
        });
        const bikerUser = await storage.getUser(bikerMoto.userId);
        await storage.createNotification({
          userId: bikerMoto.userId,
          title: "Here Comes Your Chance!!",
          body: `Una zavorrina cerca proprio la tua moto: ${brand} ${model}!`,
          notificationType: "match",
          referenceType: "match",
          referenceId: moto.id
        });
        await storage.createNotification({
          userId,
          title: "Here Comes Your Chance!!",
          body: `Un biker ha la moto che cerchi: ${brand} ${model}! (${bikerUser?.nickname || "Biker"})`,
          notificationType: "match",
          referenceType: "match",
          referenceId: bikerMoto.id
        });
        matches.push({ bikerNickname: bikerUser?.nickname, brand, model, ridingStyle });
      }
    }
    return res.status(201).json({ moto, matches });
  } catch (error) {
    console.error("Add wishlist moto error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router6.put("/motos/:motoId", requireAuth5, async (req, res) => {
  try {
    const motoId = req.params.motoId;
    const { brand, model, ridingStyle, motorcycleType } = req.body;
    const moto = await storage.updateWishlistMoto(motoId, { brand, model, ridingStyle, motorcycleType });
    return res.json(moto);
  } catch (error) {
    console.error("Update wishlist moto error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router6.delete("/motos/:motoId", requireAuth5, async (req, res) => {
  try {
    const motoId = req.params.motoId;
    await storage.deleteWishlistMoto(motoId);
    return res.json({ message: "Moto eliminata dalla wishlist" });
  } catch (error) {
    console.error("Delete wishlist moto error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var wishlist_default = router6;

// server/routes/feedback.ts
import { Router as Router7 } from "express";
var router7 = Router7();
router7.post("/", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const { ticketType, subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ message: "Oggetto e messaggio sono obbligatori" });
    }
    const ticket = await storage.createFeedbackTicket({
      userId: req.session.userId,
      ticketType: ticketType || "feedback",
      subject,
      message
    });
    return res.status(201).json(ticket);
  } catch (error) {
    console.error("Feedback create error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router7.get("/", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin" && user.role !== "moderator") {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const tickets = await storage.getFeedbackTickets();
    return res.json(tickets);
  } catch (error) {
    console.error("Feedback list error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var feedback_default = router7;

// server/routes/invitations.ts
import { Router as Router8 } from "express";
var router8 = Router8();
router8.post("/generate", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const { maxUses, expiresAt } = req.body;
    const code = "BL-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).substr(2, 5).toUpperCase();
    const invitation = await storage.createInvitationCode({
      code,
      createdBy: req.session.userId,
      maxUses: maxUses || 1,
      expiresAt: expiresAt ? new Date(expiresAt) : void 0
    });
    return res.status(201).json(invitation);
  } catch (error) {
    console.error("Invitation generate error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router8.get("/", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const codes = await storage.getInvitationCodes();
    return res.json(codes);
  } catch (error) {
    console.error("Invitation list error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router8.get("/placeholders", async (_req, res) => {
  return res.json({
    comingSoon: [
      {
        id: "paypal_donations",
        name: "Donazioni PayPal",
        description: "Supporta BikerLink con una donazione via PayPal",
        status: "planned",
        enabled: false
      },
      {
        id: "foodtracker",
        name: "Integrazione Foodtracker",
        description: "Trova ristoranti e soste lungo il percorso",
        status: "planned",
        enabled: false
      },
      {
        id: "google_drive_backup",
        name: "Backup Google Drive",
        description: "Salva i tuoi percorsi e foto su Google Drive",
        status: "planned",
        enabled: false
      }
    ]
  });
});
var invitations_default = router8;

// server/routes/contest.ts
import { Router as Router9 } from "express";
var router9 = Router9();
function requireAuth6(req, res) {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
}
router9.post("/entries", async (req, res) => {
  try {
    const userId = requireAuth6(req, res);
    if (!userId) return;
    const { photoUrl, caption, performanceData } = req.body;
    if (!photoUrl && !performanceData) {
      return res.status(400).json({ message: "Foto o dati performance obbligatori" });
    }
    const now = /* @__PURE__ */ new Date();
    const weekNumber = getWeekNumber(now);
    const year = now.getFullYear();
    const entry = await storage.createPhotoContestEntry({
      userId,
      photoUrl: photoUrl || null,
      caption: caption || null,
      performanceData: performanceData ? typeof performanceData === "string" ? performanceData : JSON.stringify(performanceData) : null,
      weekNumber,
      year,
      isApproved: true
    });
    return res.status(201).json(entry);
  } catch (error) {
    console.error("Contest entry error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router9.get("/entries", async (req, res) => {
  try {
    const userId = requireAuth6(req, res);
    if (!userId) return;
    const now = /* @__PURE__ */ new Date();
    let weekNumber = parseInt(req.query.week) || getWeekNumber(now);
    let year = parseInt(req.query.year) || now.getFullYear();
    const entries = await storage.getPhotoContestEntries(weekNumber, year);
    const today = now.toISOString().split("T")[0];
    const dailyCount = await storage.getDailyVoteCount(userId, today);
    const votesUsed = dailyCount?.count ?? 0;
    const entriesWithVoteInfo = await Promise.all(
      entries.map(async (entry) => {
        const existingVote = await storage.getPhotoVote(entry.id, userId);
        return {
          ...entry,
          hasVoted: !!existingVote,
          isOwn: entry.userId === userId
        };
      })
    );
    return res.json({
      entries: entriesWithVoteInfo,
      weekNumber,
      year,
      votesUsed,
      maxVotesPerDay: 10
    });
  } catch (error) {
    console.error("Contest entries error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router9.post("/entries/:id/vote", async (req, res) => {
  try {
    const userId = requireAuth6(req, res);
    if (!userId) return;
    const { id } = req.params;
    const entries = await storage.getPhotoContestEntries(0, 0);
    let entry = null;
    const allEntries = await storage.getPhotoContestEntries(
      getWeekNumber(/* @__PURE__ */ new Date()),
      (/* @__PURE__ */ new Date()).getFullYear()
    );
    entry = allEntries.find((e) => e.id === id);
    if (!entry) {
      const now = /* @__PURE__ */ new Date();
      const prevWeek = getWeekNumber(new Date(now.getTime() - 7 * 864e5));
      const prevYear = new Date(now.getTime() - 7 * 864e5).getFullYear();
      const prevEntries = await storage.getPhotoContestEntries(prevWeek, prevYear);
      entry = prevEntries.find((e) => e.id === id);
    }
    if (!entry) {
      return res.status(404).json({ message: "Foto non trovata" });
    }
    if (entry.userId === userId) {
      return res.status(400).json({ message: "Non puoi votare la tua foto" });
    }
    const entryId = Array.isArray(id) ? id[0] : id;
    const existingVote = await storage.getPhotoVote(entryId, userId);
    if (existingVote) {
      return res.status(400).json({ message: "Hai gi\xE0 votato questa foto" });
    }
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const dailyCount = await storage.getDailyVoteCount(userId, today);
    if (dailyCount && dailyCount.count >= 10) {
      return res.status(400).json({ message: "Hai raggiunto il limite di 10 voti giornalieri" });
    }
    await storage.createPhotoVote({ entryId, userId });
    await storage.incrementEntryVotes(entryId);
    await storage.upsertDailyVoteCount(userId, today);
    return res.json({ message: "Voto registrato" });
  } catch (error) {
    console.error("Contest vote error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router9.get("/winners", async (req, res) => {
  try {
    const userId = requireAuth6(req, res);
    if (!userId) return;
    const winners = await storage.getPhotoWinners();
    return res.json(winners);
  } catch (error) {
    console.error("Contest winners error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var contest_default = router9;

// server/routes/ads.ts
import { Router as Router10 } from "express";
var router10 = Router10();
router10.get("/active", async (req, res) => {
  try {
    const campaigns = await storage.getActiveCampaigns();
    const now = /* @__PURE__ */ new Date();
    const activeCampaigns = campaigns.filter((c) => {
      if (c.startDate && new Date(c.startDate) > now) return false;
      if (c.endDate && new Date(c.endDate) < now) return false;
      return true;
    });
    for (const campaign of activeCampaigns) {
      await storage.incrementCampaignImpressions(campaign.id);
    }
    return res.json(activeCampaigns);
  } catch (error) {
    console.error("Get active ads error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router10.get("/my-ads", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const userType = user.userType || "biker";
    const campaigns = await storage.getActiveAdsByUserType(userType);
    const now = /* @__PURE__ */ new Date();
    const activeCampaigns = campaigns.filter((c) => {
      if (c.startDate && new Date(c.startDate) > now) return false;
      if (c.endDate && new Date(c.endDate) < now) return false;
      return true;
    });
    return res.json(activeCampaigns);
  } catch (error) {
    console.error("Get my ads error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router10.post("/:id/click", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session?.userId ?? null;
    await storage.createAdClick({
      campaignId: id,
      userId
    });
    return res.json({ message: "Click registrato" });
  } catch (error) {
    console.error("Ad click error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var ads_default = router10;

// server/routes/chat.ts
import { Router as Router11 } from "express";
var router11 = Router11();
var fakeBotMessageCounts = /* @__PURE__ */ new Map();
var fakeBotLastReplies = /* @__PURE__ */ new Map();
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function maybeInformal(text2) {
  if (Math.random() < 0.25) {
    text2 = text2.replace(/\bche\b/g, "ke").replace(/\bperché\b/gi, "xke").replace(/\bcomunque\b/gi, "cmq");
  }
  if (Math.random() < 0.15) {
    text2 = text2.replace(/\bnon\b/g, "nn");
  }
  return text2;
}
function maybeEmoji(text2) {
  if (Math.random() > 0.35) return text2;
  const emojis = ["\u{1F604}", "\u{1F44D}", "\u{1F60A}", "\u{1F601}", "\u{1F60E}", "\u{1F919}", "\u{1F609}", "\u{1F648}"];
  return text2 + " " + pick(emojis);
}
function avoidRepeat(reply, conversationId) {
  const history = fakeBotLastReplies.get(conversationId) || [];
  if (history.includes(reply)) {
    const alts = ["ahah", "eh", "boh", "vabb\xE8", "dai", "mah"];
    return reply + " " + pick(alts);
  }
  history.push(reply);
  if (history.length > 10) history.shift();
  fakeBotLastReplies.set(conversationId, history);
  return reply;
}
var VULGAR_WORDS = ["tette", "culo", "scopare", "sesso", "nuda", "nudo", "pompino", "cazzo", "troia", "puttana", "figa", "zoccola", "porca", "succhia", "scopami", "spoglia", "topa", "chiappe", "bocchin"];
function isFakeZavorrina(ctx) {
  return ctx.userType === "zavorrina_f" || ctx.userType === "zavorrina_m";
}
function isFakeBiker(ctx) {
  return ctx.userType === "biker_m" || ctx.userType === "biker_f";
}
function isSenderBiker(ctx) {
  return ctx.senderUserType === "biker_m" || ctx.senderUserType === "biker_f";
}
function isSenderZavorrina(ctx) {
  return ctx.senderUserType === "zavorrina_f" || ctx.senderUserType === "zavorrina_m";
}
function getFakeBotReply(content, conversationId, ctx) {
  const count = fakeBotMessageCounts.get(conversationId) || 0;
  fakeBotMessageCounts.set(conversationId, count + 1);
  const lower = content.toLowerCase().trim();
  const region = ctx.region || "zona mia";
  const bike = ctx.brand && ctx.model ? `${ctx.brand} ${ctx.model}` : "";
  const hasBike = !!bike;
  const isZav = isFakeZavorrina(ctx);
  const isBik = isFakeBiker(ctx);
  const senderIsBiker = isSenderBiker(ctx);
  const senderIsZav = isSenderZavorrina(ctx);
  const words = lower.split(/\s+/);
  const isShort = words.length <= 3;
  const isVulgar = VULGAR_WORDS.some((w) => lower.includes(w));
  const isGreeting = ["ciao", "hey", "salve", "buongiorno", "buonasera", "ehi", "yo", "hola"].some((k) => lower.includes(k));
  const isPushing = ["usciamo", "vediamo", "giro", "andiamo", "quando", "domani", "weekend", "sabato", "domenica", "stasera", "oggi", "uscire", "incontriamo", "vieni", "raggiungi", "dove ci", "ci troviamo", "partiamo", "pronti", "sei libero", "sei libera"].some((k) => lower.includes(k));
  const isMotoTalk = ["moto", "mota", "cilindrata", "cavalli", "modello", "marca", "guido", "patente", "naked", "sport", "adventure", "touring", "enduro", "casco", "ducati", "yamaha", "honda", "kawasaki", "bmw", "ktm", "aprilia", "triumph", "guzzi"].some((k) => lower.includes(k));
  const isWeather = ["tempo", "pioggia", "piove", "sole", "freddo", "caldo", "meteo", "vento"].some((k) => lower.includes(k));
  const isLocation = ["zona", "dove stai", "dove sei", "di dove", "citt\xE0", "paese", "abiti", "vivi"].some((k) => lower.includes(k));
  const isConfused = lower.includes("scusa") || lower.includes("??") || lower === "?" || lower === "eh" || lower === "cosa";
  const isAppQuestion = ["app", "soldi", "pagare", "costo", "gratis", "abbonamento", "premium", "pagamento"].some((k) => lower.includes(k));
  const isCompliment = ["bella", "bello", "carino", "carina", "figo", "figa", "simpatico", "simpatica", "attraente"].some((k) => lower.includes(k));
  const isAge = ["anni", "et\xE0", "vecchio", "giovane", "grande"].some((k) => lower.includes(k));
  let reply;
  if (isVulgar) {
    const vulgarReplies = [
      "Ma che stai a d\xEC? Ciao proprio",
      "Guarda che ti segnalo eh",
      "Ma sei serio? Con me non funziona cos\xEC",
      "Ok, bloccato. Ciao",
      "Ma vattene va, che roba",
      "Io con questi discorsi chiudo, ciao",
      "No grazie, cerca qualcun altro",
      "Ma che modo \xE8? Vergognati"
    ];
    return pick(vulgarReplies);
  }
  if (count === 0 && isGreeting) {
    if (isZav && senderIsBiker) {
      reply = pick([
        `Ciao! Di dove sei? Io ${region}`,
        "Ehi ciao, che moto hai?",
        `Ciao! Tutto bene? Io sono di ${region}`,
        "Bella ciao! Da quanto guidi?"
      ]);
    } else if (isBik && senderIsZav) {
      reply = pick([
        `Ciao! Io sono di ${region}, te?`,
        "Ehi ciao, piacere! Come stai?",
        `Ciao! Qui in ${region} bella giornata`,
        "Ciao! Tu di dove sei?"
      ]);
    } else if (isBik && senderIsBiker) {
      reply = pick([
        `U\xE8 ciao! Tu che moto hai?`,
        `Ciao! Io giro in ${region}, te?`,
        bike ? `Ciao! Io ho la ${bike}, te?` : "Ciao! Che moto hai?",
        "Ehi bella, come va? Da quanto guidi?"
      ]);
    } else {
      reply = pick([
        `Ciao! Io sono di ${region}, te di dove sei?`,
        "Ehi ciao, piacere!",
        "Ciao! Come stai?"
      ]);
    }
  } else if (count === 0) {
    reply = pick([
      "Ehi ciao, piacere",
      `Ciao! Io sono di ${region}`,
      "Oh ciao, come va?"
    ]);
  } else if (isConfused) {
    reply = pick([
      "Ahah scusa non avevo capito",
      "Eh? In che senso?",
      "Scusa mi sono spiegato male",
      "No niente, lascia stare",
      "Haha scusa, dicevo altro"
    ]);
  } else if (isShort && !isGreeting && !isPushing && !isMotoTalk && count > 0) {
    reply = pick([
      "In che senso?",
      "Dimmi",
      "Eh?",
      "Cio\xE8?",
      "E poi?",
      "Vai avanti",
      "Tipo?"
    ]);
  } else if (isAppQuestion) {
    reply = pick([
      "No tranquillo \xE8 tutto gratis",
      "L'app \xE8 gratuita, non ti preoccupare",
      "No no non si paga niente",
      "Gratis gratis, stai tranquillo"
    ]);
  } else if (isPushing && count >= 5) {
    if (isZav) {
      reply = pick([
        "Guarda appena mi organizzo ti scrivo io",
        "Ahah dai calma, non \xE8 che posso uscire cos\xEC su due piedi",
        "Senti ti faccio sapere io, promesso",
        "Eh lo so ma davvero non \xE8 periodo, poi vediamo",
        `Qua in ${region} \xE8 un po complicato adesso`,
        "Ma ci conosciamo appena, fammi prendere un po di fiducia dai"
      ]);
    } else {
      reply = pick([
        "Guarda ti faccio sapere io, adesso ho un sacco di roba",
        "Appena mi libero ti scrivo, tranquillo",
        `In ${region} sto periodo \xE8 complicato`,
        "Dai non ti preoccupare, quando si fa si fa",
        "Eh lo so che insisto anch'io a rimandare, ma davvero non riesco",
        "Prima devo sistemare un po di cose, poi ne parliamo"
      ]);
    }
  } else if (isPushing) {
    if (isZav) {
      reply = pick([
        "Mi piacerebbe ma devo vedere col lavoro",
        `Qua in ${region} piove da giorni`,
        "Forse la prossima settimana, ti faccio sapere",
        "Eh bello, per\xF2 devo controllare gli impegni",
        "Adesso \xE8 un po complicato, magari pi\xF9 avanti",
        "Si dai vediamo, fammi capire come si mette il tempo",
        "Non \xE8 che non voglio eh, \xE8 che davvero non posso adesso"
      ]);
    } else {
      reply = pick([
        bike ? `Devo portare la ${bike} a fare il tagliando prima` : "Ho la moto ferma in questo periodo",
        `In ${region} col freddo che fa non mi muovo`,
        "Sto periodo il lavoro mi ammazza, vediamo tra un po",
        "Si dai ne parliamo, fammi controllare la settimana prossima",
        "Bella idea ma adesso non riesco, ti faccio sapere",
        bike ? `La ${bike} ha un problemino, devo prima sistemarla` : "Devo prima sistemare la moto"
      ]);
    }
  } else if (isMotoTalk) {
    if (isZav) {
      reply = pick([
        "Io non ho la moto ma mi piace tanto andare come passeggera",
        "A me piacciono tanto le moto grosse, tipo adventure",
        "Non ho la patente della moto ma prima o poi la faccio",
        "Mi piacciono le moto comode, quelle da viaggio",
        "Che moto hai te? Io le adoro ma non ne ho una mia",
        "Un mio amico ha una Ducati ed \xE8 bellissima"
      ]);
    } else if (isBik && senderIsBiker) {
      reply = pick([
        bike ? `Io ho la ${bike}, tu?` : "Tu che moto hai?",
        bike ? `Con la ${bike} mi trovo da dio` : "La mia moto va alla grande",
        "Quanti km fai all'anno? Io un bel po",
        bike ? `La ${bike} consuma un po ma ne vale la pena` : "La mia consuma un po ma ne vale la pena",
        "Tu che tipo di giri fai? Stradali o off road?",
        bike ? `Ho fatto la ${bike} revisionare da poco, va che \xE8 una meraviglia` : "L'ho fatta revisionare da poco"
      ]);
    } else {
      reply = pick([
        bike ? `Ho la ${bike}, se vuoi un giorno ti porto a fare un giro` : "Appena posso ti porto a fare un giro",
        bike ? `La ${bike} \xE8 comoda anche per il passeggero` : "La mia \xE8 comoda anche per il passeggero",
        "Ti piacciono le moto? Che tipo preferisci?",
        bike ? `Con la ${bike} ho girato mezza Italia` : "Ho girato mezza Italia in moto"
      ]);
    }
  } else if (isCompliment && count > 0) {
    if (isZav) {
      reply = pick([
        "Ahah grazie, sei gentile",
        "Dai non esagerare",
        "Haha troppo gentile",
        "Grazie! Anche tu sembri simpatico"
      ]);
    } else {
      reply = pick([
        "Grazie! Sei gentile",
        "Ahah dai, troppo buono",
        "Ma dai, grazie"
      ]);
    }
  } else if (isAge) {
    reply = pick([
      "Non si chiede l'et\xE0 ahah",
      "Eh abbastanza per guidare, diciamo cos\xEC",
      "L'et\xE0 giusta per godersi la moto"
    ]);
  } else if (isWeather) {
    reply = pick([
      `Qua in ${region} fa schifo ultimamente`,
      "Con sto tempo non si va da nessuna parte",
      "Speriamo si rimetta presto",
      `In ${region} quando c'\xE8 il sole per\xF2 \xE8 uno spettacolo`
    ]);
  } else if (isLocation) {
    reply = pick([
      `Io sto in ${region}, bella zona per guidare`,
      `Sono di ${region}, conosci?`,
      `${region}. Ci sono delle strade bellissime da queste parti`
    ]);
  } else {
    if (isZav && senderIsBiker && count < 4) {
      reply = pick([
        "Tu che moto hai? Sono curiosa",
        "Da quanto tempo guidi?",
        "Ti piace andare in giro?",
        `Io abito in ${region}, te di dove sei?`,
        "Ma tu giri da solo o con un gruppo?",
        "Che tipo di strade ti piacciono di pi\xF9?"
      ]);
    } else if (isBik && senderIsZav && count < 4) {
      reply = pick([
        "Sei mai salita in moto?",
        `Di dove sei? Io sono di ${region}`,
        "Ti piacciono le moto o \xE8 la prima volta?",
        bike ? `Se vuoi un giorno ti faccio fare un giro sulla ${bike}` : "Se vuoi un giorno ti faccio fare un giro",
        "Cosa ti ha fatto scaricare l'app?"
      ]);
    } else if (isBik && senderIsBiker && count < 4) {
      reply = pick([
        "Tu che giri fai di solito?",
        `Io di solito giro in ${region}`,
        "Hai mai fatto viaggi lunghi in moto?",
        "Preferisci le strade di montagna o di mare?",
        bike ? `Io con la ${bike} faccio soprattutto stradali` : "Io faccio soprattutto giri stradali"
      ]);
    } else {
      reply = pick([
        "Si vero",
        "Eh capisco",
        "Ah ok",
        "Mah si",
        "Boh vediamo",
        "Si dai",
        `Qui in ${region} \xE8 cos\xEC`,
        "Anche a me capita",
        "Gi\xE0",
        "Ma si"
      ]);
    }
  }
  reply = maybeInformal(reply);
  reply = maybeEmoji(reply);
  reply = avoidRepeat(reply, conversationId);
  return reply;
}
function requireAuth7(req, res) {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}
var PHONE_REGEX = /(?:\+?\d[\d\s\-().]{6,}\d|\b\d{3}[\s\-.]?\d{3}[\s\-.]?\d{4}\b)/g;
async function filterPhoneNumbers(content, conversationId, senderId) {
  const matches = content.match(PHONE_REGEX);
  if (!matches || matches.length === 0) {
    return { filtered: content, wasFiltered: false };
  }
  const currentCount = await storage.getPhoneSharedCount(conversationId, senderId);
  if (currentCount === 0) {
    await storage.incrementPhoneSharedCount(conversationId, senderId);
    return { filtered: content, wasFiltered: false };
  }
  const filtered = content.replace(PHONE_REGEX, "[numero bloccato]");
  return {
    filtered: filtered + "\n\n\u26A0 Per la tua sicurezza, puoi condividere il tuo numero di telefono solo una volta per conversazione.",
    wasFiltered: true
  };
}
router11.get("/conversations", async (req, res) => {
  try {
    const userId = requireAuth7(req, res);
    if (!userId) return;
    const convs = await storage.getConversations(userId);
    const result = await Promise.all(
      convs.map(async (conv) => {
        const participants = await storage.getConversationParticipants(conv.id);
        const msgs = await storage.getMessages(conv.id, 1, 0);
        const lastMessage = msgs[0] || null;
        const participantUsers = await Promise.all(
          participants.map(async (p) => {
            const user = await storage.getUser(p.userId);
            return user ? { id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl, userType: user.userType, sex: user.sex } : null;
          })
        );
        const myParticipant = participants.find((p) => p.userId === userId);
        const unreadCount = lastMessage && myParticipant?.lastReadAt ? new Date(lastMessage.createdAt) > new Date(myParticipant.lastReadAt) ? 1 : 0 : lastMessage ? 1 : 0;
        return {
          ...conv,
          participants: participantUsers.filter(Boolean),
          lastMessage,
          unreadCount
        };
      })
    );
    return res.json(result);
  } catch (error) {
    console.error("Get conversations error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router11.post("/conversations", async (req, res) => {
  try {
    const userId = requireAuth7(req, res);
    if (!userId) return;
    const { conversationType, title, proposalId, participantIds } = req.body;
    if (conversationType === "contact" && participantIds?.length === 1) {
      const targetUserId = participantIds[0];
      const targetConvs = await storage.getConversations(targetUserId);
      const existingContactConv = targetConvs.find((c) => c.conversationType === "contact");
      if (existingContactConv) {
        const parts = await storage.getConversationParticipants(existingContactConv.id);
        const alreadyParticipant = parts.some((p) => p.userId === userId);
        if (!alreadyParticipant) {
          await storage.addConversationParticipant({
            conversationId: existingContactConv.id,
            userId
          });
        }
        return res.json(existingContactConv);
      }
      const conv2 = await storage.createConversation({
        conversationType: "contact",
        title: title || null,
        proposalId: proposalId || null
      });
      await storage.addConversationParticipant({
        conversationId: conv2.id,
        userId: targetUserId
      });
      await storage.addConversationParticipant({
        conversationId: conv2.id,
        userId
      });
      return res.status(201).json(conv2);
    }
    if (conversationType === "private" && participantIds?.length === 1) {
      const otherUserId = participantIds[0];
      const existingConvs = await storage.getConversations(userId);
      for (const conv2 of existingConvs) {
        if (conv2.conversationType !== "private") continue;
        const parts = await storage.getConversationParticipants(conv2.id);
        if (parts.length === 2) {
          const ids = parts.map((p) => p.userId);
          if (ids.includes(userId) && ids.includes(otherUserId)) {
            return res.json(conv2);
          }
        }
      }
    }
    if (conversationType === "group" && proposalId) {
      const existingConvs = await storage.getConversations(userId);
      const existingGroupConv = existingConvs.find(
        (c) => c.conversationType === "group" && c.proposalId === proposalId
      );
      if (existingGroupConv) {
        return res.json(existingGroupConv);
      }
    }
    const conv = await storage.createConversation({
      conversationType: conversationType || "private",
      title: title || null,
      proposalId: proposalId || null
    });
    await storage.addConversationParticipant({
      conversationId: conv.id,
      userId
    });
    if (participantIds && Array.isArray(participantIds)) {
      for (const pid of participantIds) {
        if (pid !== userId) {
          await storage.addConversationParticipant({
            conversationId: conv.id,
            userId: pid
          });
          const targetUser = await storage.getUser(pid);
          if (targetUser?.isFake) {
            storage.recordFakeUserInteraction(pid, userId, "chat_request").catch(() => {
            });
          }
        }
      }
    }
    return res.status(201).json(conv);
  } catch (error) {
    console.error("Create conversation error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router11.delete("/conversations/:id", async (req, res) => {
  try {
    const userId = requireAuth7(req, res);
    if (!userId) return;
    const id = req.params.id;
    const participants = await storage.getConversationParticipants(id);
    if (!participants.find((p) => p.userId === userId)) {
      return res.status(403).json({ message: "Non fai parte di questa conversazione" });
    }
    await storage.deleteConversation(id);
    return res.json({ message: "Conversazione eliminata" });
  } catch (error) {
    console.error("Delete conversation error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router11.get("/conversations/:id/messages", async (req, res) => {
  try {
    const userId = requireAuth7(req, res);
    if (!userId) return;
    const id = req.params.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const participants = await storage.getConversationParticipants(id);
    if (!participants.find((p) => p.userId === userId)) {
      return res.status(403).json({ message: "Non fai parte di questa conversazione" });
    }
    const msgs = await storage.getMessages(id, limit, offset);
    const result = await Promise.all(
      msgs.map(async (msg) => {
        const sender = await storage.getUser(msg.senderId);
        return {
          ...msg,
          sender: sender ? { id: sender.id, nickname: sender.nickname, avatarUrl: sender.avatarUrl, userType: sender.userType, sex: sender.sex } : null
        };
      })
    );
    await storage.updateConversationLastRead(id, userId);
    return res.json(result);
  } catch (error) {
    console.error("Get messages error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router11.post("/conversations/:id/messages", async (req, res) => {
  try {
    const userId = requireAuth7(req, res);
    if (!userId) return;
    const id = req.params.id;
    const { messageType, content, imageUrl, latitude, longitude } = req.body;
    const participants = await storage.getConversationParticipants(id);
    if (!participants.find((p) => p.userId === userId)) {
      return res.status(403).json({ message: "Non fai parte di questa conversazione" });
    }
    let finalContent = content;
    let isFiltered = false;
    if (messageType === "text" && content) {
      const result = await filterPhoneNumbers(content, id, userId);
      finalContent = result.filtered;
      isFiltered = result.wasFiltered;
    }
    const message = await storage.createMessage({
      conversationId: id,
      senderId: userId,
      messageType: messageType || "text",
      content: finalContent,
      imageUrl: imageUrl || null,
      latitude: latitude || null,
      longitude: longitude || null,
      isFiltered
    });
    await storage.updateConversationTimestamp(id);
    for (const p of participants) {
      if (p.userId !== userId) {
        const targetUser = await storage.getUser(p.userId);
        if (targetUser?.isFake) {
          storage.recordFakeUserInteraction(p.userId, userId, "chat_message").catch(() => {
          });
          const chatbotSetting = await storage.getAppSetting("chatbot_enabled");
          if (chatbotSetting?.value === "false") continue;
          const fakeUserId = p.userId;
          const convId = id;
          const userContent = finalContent || "";
          const contentLen = userContent.length;
          const delay = contentLen > 50 ? 2e3 + Math.random() * 2e3 : 1e3 + Math.random() * 2e3;
          const fakeProfile = await storage.getUserProfile(fakeUserId);
          const fakeMotoList = await storage.getUserMotorcycles(fakeUserId);
          const firstMoto = fakeMotoList[0];
          const senderUser = await storage.getUser(userId);
          const fakeCtx = {
            nickname: targetUser.nickname,
            region: targetUser.region || void 0,
            bio: fakeProfile?.bio || void 0,
            brand: firstMoto?.brand || void 0,
            model: firstMoto?.model || void 0,
            userType: targetUser.userType || void 0,
            sex: targetUser.sex || void 0,
            senderUserType: senderUser?.userType || void 0,
            senderSex: senderUser?.sex || void 0,
            senderNickname: senderUser?.nickname || void 0
          };
          setTimeout(async () => {
            try {
              const replyText = getFakeBotReply(userContent, convId, fakeCtx);
              await storage.createMessage({
                conversationId: convId,
                senderId: fakeUserId,
                messageType: "text",
                content: replyText,
                imageUrl: null,
                latitude: null,
                longitude: null,
                isFiltered: false
              });
              await storage.updateConversationTimestamp(convId);
            } catch (err) {
              console.error("Fake bot reply error:", err);
            }
          }, delay);
        }
      }
    }
    const sender = await storage.getUser(userId);
    return res.status(201).json({
      ...message,
      sender: sender ? { id: sender.id, nickname: sender.nickname, avatarUrl: sender.avatarUrl, userType: sender.userType } : null
    });
  } catch (error) {
    console.error("Send message error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var chat_default = router11;

// server/routes/notifications.ts
import { Router as Router12 } from "express";
var router12 = Router12();
function requireAuth8(req, res) {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}
router12.get("/", async (req, res) => {
  try {
    const userId = requireAuth8(req, res);
    if (!userId) return;
    const notificationsList = await storage.getNotifications(userId);
    return res.json(notificationsList);
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router12.put("/:id/read", async (req, res) => {
  try {
    const userId = requireAuth8(req, res);
    if (!userId) return;
    const id = req.params.id;
    const notificationsList = await storage.getNotifications(userId);
    const notification = notificationsList.find((n) => n.id === id);
    if (!notification) {
      return res.status(404).json({ message: "Notifica non trovata" });
    }
    await storage.markNotificationRead(id);
    return res.json({ message: "Notifica segnata come letta" });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var notifications_default = router12;

// server/routes/reports.ts
import { Router as Router13 } from "express";
import { z as z2 } from "zod";
var router13 = Router13();
function requireAuth9(req, res) {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}
var createReportSchema = z2.object({
  reportedUserId: z2.string().min(1, "ID utente segnalato obbligatorio"),
  reason: z2.string().min(1, "Motivo obbligatorio").max(100),
  description: z2.string().optional()
});
router13.post("/", async (req, res) => {
  try {
    const userId = requireAuth9(req, res);
    if (!userId) return;
    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const { reportedUserId, reason, description } = parsed.data;
    if (reportedUserId === userId) {
      return res.status(400).json({ message: "Non puoi segnalare te stesso" });
    }
    const reportedUser = await storage.getUser(reportedUserId);
    if (!reportedUser) {
      return res.status(404).json({ message: "Utente segnalato non trovato" });
    }
    const report = await storage.createReport({
      reporterId: userId,
      reportedUserId,
      reason,
      description
    });
    return res.status(201).json(report);
  } catch (error) {
    console.error("Create report error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router13.get("/", async (req, res) => {
  try {
    const userId = requireAuth9(req, res);
    if (!userId) return;
    const user = await storage.getUser(userId);
    if (!user || user.role !== "admin" && user.role !== "moderator") {
      return res.status(403).json({ message: "Accesso non autorizzato" });
    }
    const status = req.query.status;
    const reportsList = await storage.getReports(status);
    return res.json(reportsList);
  } catch (error) {
    console.error("Get reports error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var reports_default = router13;

// server/routes/workshops.ts
import { Router as Router14 } from "express";
var router14 = Router14();
router14.get("/", async (req, res) => {
  try {
    const workshops2 = await storage.getWorkshops(true);
    return res.json(workshops2);
  } catch (error) {
    console.error("Get workshops error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router14.get("/:id", async (req, res) => {
  try {
    const workshop = await storage.getWorkshop(req.params.id);
    if (!workshop) {
      return res.status(404).json({ message: "Officina non trovata" });
    }
    return res.json(workshop);
  } catch (error) {
    console.error("Get workshop error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router14.post("/:id/contact", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const workshopId = req.params.id;
    const workshop = await storage.getWorkshop(workshopId);
    if (!workshop) {
      return res.status(404).json({ message: "Officina non trovata" });
    }
    const { contactType } = req.body;
    if (!contactType || !["phone", "whatsapp", "email", "website"].includes(contactType)) {
      return res.status(400).json({ message: "Tipo di contatto non valido" });
    }
    const contact = await storage.createWorkshopContact({
      workshopId,
      userId: req.session.userId,
      contactType
    });
    return res.status(201).json(contact);
  } catch (error) {
    console.error("Workshop contact error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var workshops_default = router14;

// server/routes/easter-eggs.ts
import { Router as Router15 } from "express";
var router15 = Router15();
router15.get("/nearby", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ message: "Coordinate non valide" });
    }
    const allEggs = await storage.getEasterEggs(true);
    const collectedEggs = await storage.getCollectedEasterEggs(req.session.userId);
    const collectedIds = new Set(collectedEggs.map((c) => c.easterEggId));
    const nearbyEggs = allEggs.map((egg) => {
      const distance = haversineDistance(lat, lng, egg.latitude, egg.longitude);
      return { ...egg, distance, collected: collectedIds.has(egg.id) };
    }).filter((egg) => egg.distance <= egg.radius / 1e3).sort((a, b) => a.distance - b.distance);
    return res.json(nearbyEggs);
  } catch (error) {
    console.error("Get nearby easter eggs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router15.get("/collected", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const collected = await storage.getCollectedEasterEggs(req.session.userId);
    return res.json(collected);
  } catch (error) {
    console.error("Get collected easter eggs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router15.post("/:id/collect", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const eggId = req.params.id;
    const egg = await storage.getEasterEgg(eggId);
    if (!egg) {
      return res.status(404).json({ message: "Easter egg non trovato" });
    }
    if (!egg.isActive) {
      return res.status(400).json({ message: "Easter egg non attivo" });
    }
    const alreadyCollected = await storage.hasCollectedEasterEgg(eggId, req.session.userId);
    if (alreadyCollected) {
      return res.status(409).json({ message: "Easter egg gi\xE0 raccolto" });
    }
    const collected = await storage.collectEasterEgg({
      easterEggId: eggId,
      userId: req.session.userId
    });
    const profile = await storage.getUserProfile(req.session.userId);
    const newCount = (profile?.easterEggsCollected || 0) + 1;
    if (profile) {
      await storage.updateUserProfile(req.session.userId, {
        easterEggsCollected: newCount
      });
    }
    const prizeUnlocked = newCount === 10;
    return res.status(201).json({
      collected,
      message: prizeUnlocked ? `Hai sbloccato un premio! Hai raccolto 10 Easter Egg!` : `Complimenti! Hai raccolto un premio! Continua cos\xEC!`,
      points: egg.points,
      prizeUnlocked,
      totalCollected: newCount
    });
  } catch (error) {
    console.error("Collect easter egg error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad2(lat2 - lat1);
  const dLon = toRad2(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad2(lat1)) * Math.cos(toRad2(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function toRad2(deg) {
  return deg * (Math.PI / 180);
}
var easter_eggs_default = router15;

// server/routes/admin.ts
import { Router as Router16 } from "express";
import multer2 from "multer";
import fs4 from "fs";
import path4 from "path";
import bcrypt2 from "bcryptjs";
var router16 = Router16();
function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  storage.getUser(req.session.userId).then((user) => {
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Accesso non autorizzato" });
    }
    req.currentUser = user;
    next();
  });
}
router16.use(requireAdmin);
router16.get("/users", async (_req, res) => {
  try {
    const users2 = await storage.getAllUsers();
    const safeUsers = users2.map(({ password, ...u }) => u);
    return res.json(safeUsers);
  } catch (error) {
    console.error("Admin get users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.put("/users/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;
    if (!["active", "suspended", "blocked"].includes(status)) {
      return res.status(400).json({ message: "Stato non valido" });
    }
    const user = await storage.updateUser(id, { status });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: `set_status_${status}`,
      targetType: "user",
      targetId: id,
      details: `Status cambiato a ${status}`
    });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin update user status error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.put("/users/:id/role", async (req, res) => {
  try {
    const id = req.params.id;
    const { role } = req.body;
    if (!["user", "moderator", "admin"].includes(role)) {
      return res.status(400).json({ message: "Ruolo non valido" });
    }
    const user = await storage.updateUser(id, { role });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: `set_role_${role}`,
      targetType: "user",
      targetId: id,
      details: `Ruolo cambiato a ${role}`
    });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin update user role error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/workshops", async (_req, res) => {
  try {
    const workshopsList = await storage.getWorkshops();
    return res.json(workshopsList);
  } catch (error) {
    console.error("Admin get workshops error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.post("/workshops", async (req, res) => {
  try {
    const workshop = await storage.createWorkshop(req.body);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "create_workshop",
      targetType: "workshop",
      targetId: workshop.id,
      details: `Officina creata: ${workshop.name}`
    });
    return res.status(201).json(workshop);
  } catch (error) {
    console.error("Admin create workshop error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.put("/workshops/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const workshop = await storage.updateWorkshop(id, req.body);
    if (!workshop) {
      return res.status(404).json({ message: "Officina non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "update_workshop",
      targetType: "workshop",
      targetId: id,
      details: `Officina aggiornata: ${workshop.name}`
    });
    return res.json(workshop);
  } catch (error) {
    console.error("Admin update workshop error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.put("/workshops/:id/approve", async (req, res) => {
  try {
    const id = req.params.id;
    const workshop = await storage.updateWorkshop(id, { isApproved: true });
    if (!workshop) {
      return res.status(404).json({ message: "Officina non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "approve_workshop",
      targetType: "workshop",
      targetId: id,
      details: `Officina approvata: ${workshop.name}`
    });
    return res.json(workshop);
  } catch (error) {
    console.error("Admin approve workshop error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.delete("/workshops/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await storage.deleteWorkshop(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "delete_workshop",
      targetType: "workshop",
      targetId: id
    });
    return res.json({ message: "Officina eliminata" });
  } catch (error) {
    console.error("Admin delete workshop error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/easter-eggs", async (_req, res) => {
  try {
    const eggs = await storage.getEasterEggs();
    return res.json(eggs);
  } catch (error) {
    console.error("Admin get easter eggs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.post("/easter-eggs", async (req, res) => {
  try {
    const egg = await storage.createEasterEgg(req.body);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "create_easter_egg",
      targetType: "easter_egg",
      targetId: egg.id,
      details: `Easter egg creato: ${egg.name}`
    });
    return res.status(201).json(egg);
  } catch (error) {
    console.error("Admin create easter egg error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.post("/easter-eggs/batch", async (req, res) => {
  try {
    const count = parseInt(req.body.count) || 10;
    const radius = parseInt(req.body.radius) || 30;
    const points = parseInt(req.body.points) || 10;
    const existing = await storage.getEasterEggs();
    const startNum = existing.length + 1;
    const created = [];
    for (let i = 0; i < count; i++) {
      const lat = 36 + Math.random() * 11;
      const lng = 6.5 + Math.random() * 12;
      const egg = await storage.createEasterEgg({
        name: `Easter Egg #${startNum + i}`,
        latitude: parseFloat(lat.toFixed(6)),
        longitude: parseFloat(lng.toFixed(6)),
        radius,
        points,
        isActive: true
      });
      created.push(egg);
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "batch_create_easter_eggs",
      targetType: "easter_egg",
      targetId: "",
      details: `${count} Easter Egg creati in batch`
    });
    return res.status(201).json(created);
  } catch (error) {
    console.error("Admin batch create easter eggs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.put("/easter-eggs/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const egg = await storage.updateEasterEgg(id, req.body);
    if (!egg) {
      return res.status(404).json({ message: "Easter egg non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "update_easter_egg",
      targetType: "easter_egg",
      targetId: id,
      details: `Easter egg aggiornato: ${egg.name}`
    });
    return res.json(egg);
  } catch (error) {
    console.error("Admin update easter egg error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.delete("/easter-eggs/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await storage.deleteEasterEgg(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "delete_easter_egg",
      targetType: "easter_egg",
      targetId: id
    });
    return res.json({ message: "Easter egg eliminato" });
  } catch (error) {
    console.error("Admin delete easter egg error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/easter-eggs/:id/stats", async (req, res) => {
  try {
    const id = req.params.id;
    const egg = await storage.getEasterEgg(id);
    if (!egg) {
      return res.status(404).json({ message: "Easter egg non trovato" });
    }
    const { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const { collectedEasterEggs: collectedEasterEggs2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const { eq: eq2, count } = await import("drizzle-orm");
    const [result] = await db2.select({ count: count() }).from(collectedEasterEggs2).where(eq2(collectedEasterEggs2.easterEggId, id));
    return res.json({ eggId: id, collectionsCount: result?.count || 0 });
  } catch (error) {
    console.error("Admin get easter egg stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/easter-eggs-stats", async (_req, res) => {
  try {
    const { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const { collectedEasterEggs: collectedEasterEggs2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const { count, sql: sql3 } = await import("drizzle-orm");
    const rows = await db2.select({
      easterEggId: collectedEasterEggs2.easterEggId,
      collectionsCount: count()
    }).from(collectedEasterEggs2).groupBy(collectedEasterEggs2.easterEggId);
    const statsMap = {};
    rows.forEach((r) => {
      statsMap[r.easterEggId] = Number(r.collectionsCount);
    });
    return res.json(statsMap);
  } catch (error) {
    console.error("Admin get easter egg stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/campaigns", async (_req, res) => {
  try {
    const campaigns = await storage.getAllCampaigns();
    return res.json(campaigns);
  } catch (error) {
    console.error("Admin get campaigns error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.post("/campaigns", async (req, res) => {
  try {
    const campaign = await storage.createAdCampaign(req.body);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "create_campaign",
      targetType: "campaign",
      targetId: campaign.id,
      details: `Campagna creata: ${campaign.name}`
    });
    return res.status(201).json(campaign);
  } catch (error) {
    console.error("Admin create campaign error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.put("/campaigns/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const campaign = await storage.updateAdCampaign(id, req.body);
    if (!campaign) {
      return res.status(404).json({ message: "Campagna non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "update_campaign",
      targetType: "campaign",
      targetId: id,
      details: `Campagna aggiornata: ${campaign.name}`
    });
    return res.json(campaign);
  } catch (error) {
    console.error("Admin update campaign error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.delete("/campaigns/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await storage.deleteCampaign(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "delete_campaign",
      targetType: "campaign",
      targetId: id
    });
    return res.json({ message: "Campagna eliminata" });
  } catch (error) {
    console.error("Admin delete campaign error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/reports", async (req, res) => {
  try {
    const status = req.query.status;
    const reportsList = await storage.getReports(status);
    return res.json(reportsList);
  } catch (error) {
    console.error("Admin get reports error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.put("/reports/:id/resolve", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;
    if (!["resolved", "dismissed"].includes(status)) {
      return res.status(400).json({ message: "Stato non valido" });
    }
    const report = await storage.updateReport(id, {
      status,
      resolvedBy: req.session.userId,
      resolvedAt: /* @__PURE__ */ new Date()
    });
    if (!report) {
      return res.status(404).json({ message: "Segnalazione non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: `resolve_report_${status}`,
      targetType: "report",
      targetId: id,
      details: `Segnalazione ${status}`
    });
    return res.json(report);
  } catch (error) {
    console.error("Admin resolve report error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/analytics", async (_req, res) => {
  try {
    const now = /* @__PURE__ */ new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1e3);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1e3);
    const [totalUsers, activeUsersMonth, activeUsersWeek, workshopContacts2, campaigns, pendingReports] = await Promise.all([
      storage.countUsers(),
      storage.countActiveUsers(thirtyDaysAgo),
      storage.countActiveUsers(sevenDaysAgo),
      storage.getWorkshopContactsByPeriod(thirtyDaysAgo, now),
      storage.getAllCampaigns(),
      storage.getReports("pending")
    ]);
    const totalAdClicks = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);
    return res.json({
      totalUsers,
      activeUsersMonth,
      activeUsersWeek,
      workshopContactsMonth: workshopContacts2.length,
      totalAdClicks,
      activeCampaigns: campaigns.filter((c) => c.isActive).length,
      pendingReports: pendingReports.length
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/analytics/export-csv", async (_req, res) => {
  try {
    const now = /* @__PURE__ */ new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1e3);
    const [workshopContacts2, campaigns] = await Promise.all([
      storage.getWorkshopContactsByPeriod(thirtyDaysAgo, now),
      storage.getAllCampaigns()
    ]);
    let csv = "Tipo,ID,Nome,Contatti/Click,Impressioni,Periodo\n";
    for (const campaign of campaigns) {
      csv += `Campagna,${campaign.id},"${campaign.name}",${campaign.impressions},${campaign.impressions},Ultimo mese
`;
    }
    const contactsByWorkshop = {};
    for (const contact of workshopContacts2) {
      contactsByWorkshop[contact.workshopId] = (contactsByWorkshop[contact.workshopId] || 0) + 1;
    }
    for (const [workshopId, count] of Object.entries(contactsByWorkshop)) {
      csv += `Officina,${workshopId},,${count},,Ultimo mese
`;
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=syneco-report.csv");
    return res.send(csv);
  } catch (error) {
    console.error("Admin export CSV error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/settings", async (_req, res) => {
  try {
    const settings = await storage.getAllAppSettings();
    return res.json(settings);
  } catch (error) {
    console.error("Admin get settings error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.put("/settings/:key", async (req, res) => {
  try {
    const key = req.params.key;
    const { value, valueJson } = req.body;
    const setting = await storage.upsertAppSetting(key, value, valueJson);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "update_setting",
      targetType: "app_setting",
      targetId: key,
      details: `Impostazione aggiornata: ${key}`
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin update setting error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var adsDir = path4.join(process.cwd(), "uploads", "ads");
if (!fs4.existsSync(adsDir)) {
  fs4.mkdirSync(adsDir, { recursive: true });
}
var adImageStorage = multer2.diskStorage({
  destination: (_req, _file, cb) => cb(null, adsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
    cb(null, uniqueSuffix + path4.extname(file.originalname));
  }
});
var adUpload = multer2({
  storage: adImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Solo immagini JPEG, PNG, WebP o GIF"));
    }
  }
});
router16.get("/advertisements", async (_req, res) => {
  try {
    const campaigns = await storage.getAllCampaigns();
    return res.json(campaigns);
  } catch (error) {
    console.error("Admin get advertisements error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.post("/advertisements", adUpload.single("image"), async (req, res) => {
  try {
    const { name, sponsor, linkUrl, description, targetUserType, rotationDuration, rotationMode, sortOrder, startDate, endDate } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Nome campagna obbligatorio" });
    }
    const imageUrl = req.file ? `/uploads/ads/${req.file.filename}` : req.body.imageUrl || null;
    const campaign = await storage.createAdCampaign({
      name,
      sponsor: sponsor || "Syneco Lubrificanti",
      imageUrl,
      linkUrl: linkUrl || null,
      displayMode: "banner",
      description: description || null,
      targetUserType: targetUserType || "biker",
      rotationDuration: rotationDuration ? parseInt(rotationDuration) : 10,
      rotationMode: rotationMode || "sequential",
      sortOrder: sortOrder ? parseInt(sortOrder) : 0,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null
    });
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "create_advertisement",
      targetType: "campaign",
      targetId: campaign.id,
      details: `Pubblicit\xE0 creata: ${campaign.name} (${targetUserType || "biker"})`
    });
    return res.status(201).json(campaign);
  } catch (error) {
    console.error("Admin create advertisement error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.put("/advertisements/:id", adUpload.single("image"), async (req, res) => {
  try {
    const id = req.params.id;
    const updates = {};
    if (req.body.name !== void 0) updates.name = req.body.name;
    if (req.body.sponsor !== void 0) updates.sponsor = req.body.sponsor;
    if (req.body.linkUrl !== void 0) updates.linkUrl = req.body.linkUrl;
    if (req.body.description !== void 0) updates.description = req.body.description;
    if (req.body.isActive !== void 0) updates.isActive = req.body.isActive === true || req.body.isActive === "true";
    if (req.body.targetUserType !== void 0) updates.targetUserType = req.body.targetUserType;
    if (req.body.rotationDuration !== void 0) updates.rotationDuration = parseInt(req.body.rotationDuration);
    if (req.body.rotationMode !== void 0) updates.rotationMode = req.body.rotationMode;
    if (req.body.sortOrder !== void 0) updates.sortOrder = parseInt(req.body.sortOrder);
    if (req.body.startDate !== void 0) updates.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    if (req.body.endDate !== void 0) updates.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    if (req.file) updates.imageUrl = `/uploads/ads/${req.file.filename}`;
    else if (req.body.imageUrl !== void 0) updates.imageUrl = req.body.imageUrl;
    const campaign = await storage.updateAdCampaign(id, updates);
    if (!campaign) {
      return res.status(404).json({ message: "Campagna non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "update_advertisement",
      targetType: "campaign",
      targetId: id,
      details: `Pubblicit\xE0 aggiornata: ${campaign.name}`
    });
    return res.json(campaign);
  } catch (error) {
    console.error("Admin update advertisement error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.delete("/advertisements/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await storage.deleteCampaign(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "delete_advertisement",
      targetType: "campaign",
      targetId: id
    });
    return res.json({ message: "Pubblicit\xE0 eliminata" });
  } catch (error) {
    console.error("Admin delete advertisement error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var eulaUpload = multer2({
  dest: path4.join(process.cwd(), "uploads", "tmp"),
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/plain") {
      cb(null, true);
    } else {
      cb(new Error("Solo file .txt (text/plain) sono accettati"));
    }
  }
});
router16.post("/settings/eula/upload", eulaUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Nessun file caricato" });
    }
    const content = fs4.readFileSync(req.file.path, "utf-8");
    fs4.unlinkSync(req.file.path);
    const setting = await storage.upsertAppSetting("eula_text", content);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "upload_eula",
      targetType: "app_setting",
      targetId: "eula_text",
      details: "EULA caricato da file .txt"
    });
    return res.json({ message: "EULA caricato con successo", value: content, setting });
  } catch (error) {
    if (req.file && fs4.existsSync(req.file.path)) {
      fs4.unlinkSync(req.file.path);
    }
    console.error("Admin upload EULA error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.post("/settings/privacy-policy/upload", eulaUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Nessun file caricato" });
    }
    const content = fs4.readFileSync(req.file.path, "utf-8");
    fs4.unlinkSync(req.file.path);
    const setting = await storage.upsertAppSetting("privacy_policy_text", content);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "upload_privacy_policy",
      targetType: "app_setting",
      targetId: "privacy_policy_text",
      details: "Privacy Policy caricata da file .txt"
    });
    return res.json({ message: "Privacy Policy caricata con successo", value: content, setting });
  } catch (error) {
    if (req.file && fs4.existsSync(req.file.path)) {
      fs4.unlinkSync(req.file.path);
    }
    console.error("Admin upload Privacy Policy error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/performance-records", async (_req, res) => {
  try {
    const allRoutes = await storage.getAllRoutes();
    const userIds = [...new Set(allRoutes.map((r) => r.userId))];
    const usersMap = {};
    for (const uid of userIds) {
      const user = await storage.getUser(uid);
      if (user) usersMap[uid] = user.nickname;
    }
    const records = allRoutes.map((r) => ({
      ...r,
      nickname: usersMap[r.userId] || "Sconosciuto"
    }));
    return res.json(records);
  } catch (error) {
    console.error("Admin get performance records error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/logs", async (_req, res) => {
  try {
    const logs = await storage.getModeratorLogs();
    return res.json(logs);
  } catch (error) {
    console.error("Admin get logs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/fake-users", async (_req, res) => {
  try {
    const stats = await storage.getFakeUserStats();
    return res.json(stats);
  } catch (error) {
    console.error("Admin get fake users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.post("/fake-users", async (req, res) => {
  try {
    const { nickname, userType, sex, coupleSexConfig, birthYear, region, bio, moto, wishlistDescription, wishlistMotos } = req.body;
    if (!nickname || !userType) {
      return res.status(400).json({ message: "Nickname e tipo utente obbligatori" });
    }
    const email = `fake_${nickname.toLowerCase().replace(/[^a-z0-9]/g, "")}@fakeuser.bikerlink.it`;
    const hashedPassword = await bcrypt2.hash("fakeuser2025!", 10);
    const user = await storage.createUser({
      nickname,
      email,
      password: hashedPassword,
      userType,
      sex: sex || null,
      coupleSexConfig: coupleSexConfig || null,
      birthYear: birthYear || null,
      region: region || null,
      isFake: true,
      status: "active",
      emailVerified: true,
      eulaAccepted: true,
      lastLoginAt: /* @__PURE__ */ new Date()
    });
    const regionCoords = {
      "Abruzzo": { lat: 42.19, lng: 13.73 },
      "Basilicata": { lat: 40.64, lng: 15.97 },
      "Calabria": { lat: 38.91, lng: 16.59 },
      "Campania": { lat: 40.85, lng: 14.27 },
      "Emilia-Romagna": { lat: 44.49, lng: 11.34 },
      "Friuli Venezia Giulia": { lat: 46.07, lng: 13.23 },
      "Lazio": { lat: 41.9, lng: 12.5 },
      "Liguria": { lat: 44.41, lng: 8.95 },
      "Lombardia": { lat: 45.46, lng: 9.19 },
      "Marche": { lat: 43.62, lng: 13.52 },
      "Molise": { lat: 41.56, lng: 14.67 },
      "Piemonte": { lat: 45.07, lng: 7.69 },
      "Puglia": { lat: 41.13, lng: 16.86 },
      "Sardegna": { lat: 39.22, lng: 9.12 },
      "Sicilia": { lat: 37.6, lng: 14.02 },
      "Toscana": { lat: 43.77, lng: 11.25 },
      "Trentino-Alto Adige": { lat: 46.07, lng: 11.13 },
      "Umbria": { lat: 43, lng: 12.64 },
      "Valle d'Aosta": { lat: 45.74, lng: 7.32 },
      "Veneto": { lat: 45.44, lng: 12.33 }
    };
    const coords = region ? regionCoords[region] : null;
    const lat = coords ? coords.lat + (Math.random() - 0.5) * 0.5 : null;
    const lng = coords ? coords.lng + (Math.random() - 0.5) * 0.5 : null;
    await storage.createUserProfile({
      userId: user.id,
      isAvailable: true,
      latitude: lat,
      longitude: lng,
      bio: bio || null
    });
    if (moto && (userType === "biker" || userType === "coppia")) {
      await storage.createUserMotorcycle({
        userId: user.id,
        brand: moto.brand || "Ducati",
        model: moto.model || "Monster",
        year: moto.year || 2022,
        displacement: moto.displacement || 821,
        motorcycleType: moto.motorcycleType || "Naked",
        ridingStyle: moto.ridingStyle || "Allegra"
      });
    }
    if (userType === "zavorrina" && wishlistDescription) {
      const wl = await storage.createOrUpdateWishlist(user.id, wishlistDescription);
      if (wishlistMotos && Array.isArray(wishlistMotos)) {
        for (const wm of wishlistMotos) {
          await storage.addWishlistMoto({
            wishlistId: wl.id,
            brand: wm.brand || null,
            model: wm.model || null,
            motorcycleType: wm.motorcycleType || null,
            ridingStyle: wm.ridingStyle || null
          });
        }
      }
    }
    const { password: _, ...safeUser } = user;
    return res.status(201).json(safeUser);
  } catch (error) {
    console.error("Admin create fake user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.delete("/fake-users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await storage.deleteFakeUser(id);
    return res.json({ message: "Utente finto eliminato" });
  } catch (error) {
    console.error("Admin delete fake user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.put("/fake-users/:id/toggle-available", async (req, res) => {
  try {
    const id = req.params.id;
    const profile = await storage.getUserProfile(id);
    if (!profile) {
      return res.status(404).json({ message: "Profilo non trovato" });
    }
    const overrideUntil = new Date(Date.now() + 60 * 60 * 1e3);
    await storage.updateUserProfile(id, {
      isAvailable: !profile.isAvailable,
      adminOverrideUntil: overrideUntil
    });
    return res.json({ isAvailable: !profile.isAvailable });
  } catch (error) {
    console.error("Admin toggle fake user availability error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.put("/fake-users/:id/toggle-online", async (req, res) => {
  try {
    const id = req.params.id;
    const user = await storage.getUser(id);
    if (!user || !user.isFake) {
      return res.status(404).json({ message: "Utente finto non trovato" });
    }
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    const isCurrentlyOnline = user.lastLoginAt && new Date(user.lastLoginAt) >= fifteenMinutesAgo;
    const newLoginAt = isCurrentlyOnline ? /* @__PURE__ */ new Date("2020-01-01") : /* @__PURE__ */ new Date();
    await storage.updateUser(id, { lastLoginAt: newLoginAt });
    const overrideUntil = new Date(Date.now() + 60 * 60 * 1e3);
    await storage.updateUserProfile(id, { adminOverrideUntil: overrideUntil });
    return res.json({ isOnline: !isCurrentlyOnline });
  } catch (error) {
    console.error("Admin toggle fake user online error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/fake-users/:id/conversations", async (req, res) => {
  try {
    const id = req.params.id;
    const convs = await storage.getFakeUserConversations(id);
    return res.json(convs);
  } catch (error) {
    console.error("Admin get fake user conversations error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/fake-users/conversations/:convId/messages", async (req, res) => {
  try {
    const convId = req.params.convId;
    const msgs = await storage.getMessages(convId, 200, 0);
    const result = await Promise.all(
      msgs.map(async (msg) => {
        const sender = await storage.getUser(msg.senderId);
        return {
          ...msg,
          sender: sender ? { id: sender.id, nickname: sender.nickname, userType: sender.userType, isFake: sender.isFake } : null
        };
      })
    );
    return res.json(result);
  } catch (error) {
    console.error("Admin get fake user conversation messages error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var admin_default = router16;

// server/routes/moderator.ts
import { Router as Router17 } from "express";
var router17 = Router17();
function requireAuth10(req, res) {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}
async function requireModerator(req, res) {
  const userId = requireAuth10(req, res);
  if (!userId) return null;
  const user = await storage.getUser(userId);
  if (!user || user.role !== "admin" && user.role !== "moderator") {
    res.status(403).json({ message: "Accesso non autorizzato" });
    return null;
  }
  return userId;
}
router17.get("/photos", async (req, res) => {
  try {
    const userId = await requireModerator(req, res);
    if (!userId) return;
    const userPhotos2 = await storage.getUnapprovedUserPhotos();
    const contestEntries = await storage.getUnapprovedContestEntries();
    const photos = [
      ...userPhotos2.map((p) => ({
        id: p.id,
        type: "user_photo",
        photoUrl: p.photoUrl,
        userId: p.userId,
        createdAt: p.createdAt,
        isApproved: p.isApproved
      })),
      ...contestEntries.map((e) => ({
        id: e.id,
        type: "contest_entry",
        photoUrl: e.photoUrl,
        userId: e.userId,
        caption: e.caption,
        createdAt: e.createdAt,
        isApproved: e.isApproved
      }))
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return res.json(photos);
  } catch (error) {
    console.error("Get moderator photos error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/photos/:id/approve", async (req, res) => {
  try {
    const moderatorId = await requireModerator(req, res);
    if (!moderatorId) return;
    const id = req.params.id;
    const photoType = req.body.type || "user_photo";
    let result;
    if (photoType === "contest_entry") {
      result = await storage.updateContestEntryApproval(id, true);
    } else {
      result = await storage.updateUserPhotoApproval(id, true);
    }
    if (!result) {
      return res.status(404).json({ message: "Foto non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId,
      action: "approve_photo",
      targetType: photoType,
      targetId: id,
      details: "Foto approvata"
    });
    return res.json(result);
  } catch (error) {
    console.error("Approve photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/photos/:id/reject", async (req, res) => {
  try {
    const moderatorId = await requireModerator(req, res);
    if (!moderatorId) return;
    const id = req.params.id;
    const photoType = req.body.type || "user_photo";
    const reason = req.body.reason;
    if (photoType === "contest_entry") {
      const entry = await storage.getPhotoContestEntry(id);
      if (!entry) {
        return res.status(404).json({ message: "Foto non trovata" });
      }
      await storage.updateContestEntryApproval(id, false);
    } else {
      const photo = await storage.getUserPhoto(id);
      if (!photo) {
        return res.status(404).json({ message: "Foto non trovata" });
      }
      await storage.deleteUserPhoto(id);
    }
    await storage.createModeratorLog({
      moderatorId,
      action: "reject_photo",
      targetType: photoType,
      targetId: id,
      details: reason ? `Foto rifiutata: ${reason}` : "Foto rifiutata"
    });
    return res.json({ message: "Foto rifiutata" });
  } catch (error) {
    console.error("Reject photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/logs", async (req, res) => {
  try {
    const userId = await requireModerator(req, res);
    if (!userId) return;
    const logs = await storage.getModeratorLogs();
    return res.json(logs);
  } catch (error) {
    console.error("Get moderator logs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var moderator_default = router17;

// server/routes/custom-routes.ts
import { Router as Router18 } from "express";
var router18 = Router18();
router18.get("/api/custom-routes", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });
    const featureSetting = await storage.getAppSetting("custom_routes_enabled");
    if (featureSetting?.value === "false") {
      return res.json({ disabled: true, myRoutes: [], publicRoutes: [] });
    }
    const myRoutesRaw = await storage.getCustomRoutes(userId);
    const publicRoutesRaw = await storage.getPublicCustomRoutes();
    const enrichRoute = async (route) => {
      const waypoints = await storage.getCustomRouteWaypoints(route.id);
      const creator = await storage.getUser(route.userId);
      return {
        ...route,
        waypointCount: waypoints.length,
        creatorNickname: creator?.nickname || "Sconosciuto"
      };
    };
    const myRoutes = await Promise.all(myRoutesRaw.map(enrichRoute));
    const publicRoutes = await Promise.all(
      publicRoutesRaw.filter((r) => r.userId !== userId).map(enrichRoute)
    );
    res.json({ disabled: false, myRoutes, publicRoutes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router18.post("/api/custom-routes", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });
    const featureSetting = await storage.getAppSetting("custom_routes_enabled");
    if (featureSetting?.value === "false") {
      return res.status(403).json({ error: "Funzione disattivata" });
    }
    const { title, description, isPublic } = req.body;
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: "Il titolo \xE8 obbligatorio" });
    }
    const route = await storage.createCustomRoute({
      userId,
      title: title.trim(),
      description: description?.trim() || null,
      isPublic: isPublic || false
    });
    res.json(route);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router18.get("/api/custom-routes/:id", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });
    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return res.status(404).json({ error: "Percorso non trovato" });
    if (!route.isPublic && route.userId !== userId) {
      return res.status(403).json({ error: "Accesso negato" });
    }
    const waypoints = await storage.getCustomRouteWaypoints(route.id);
    const creator = await storage.getUser(route.userId);
    res.json({
      ...route,
      waypoints,
      isMine: route.userId === userId,
      creatorNickname: creator?.nickname || "Sconosciuto"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router18.put("/api/custom-routes/:id", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });
    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return res.status(404).json({ error: "Percorso non trovato" });
    if (route.userId !== userId) return res.status(403).json({ error: "Non autorizzato" });
    const { title, description, isPublic, totalDistanceKm } = req.body;
    const updated = await storage.updateCustomRoute(req.params.id, {
      ...title !== void 0 && { title: title.trim() },
      ...description !== void 0 && { description: description?.trim() || null },
      ...isPublic !== void 0 && { isPublic },
      ...totalDistanceKm !== void 0 && { totalDistanceKm }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router18.delete("/api/custom-routes/:id", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });
    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return res.status(404).json({ error: "Percorso non trovato" });
    if (route.userId !== userId) return res.status(403).json({ error: "Non autorizzato" });
    await storage.deleteCustomRoute(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router18.post("/api/custom-routes/:id/waypoints", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });
    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return res.status(404).json({ error: "Percorso non trovato" });
    if (route.userId !== userId) return res.status(403).json({ error: "Non autorizzato" });
    const { name, description, latitude, longitude, waypointType, orderIndex } = req.body;
    if (!name || latitude == null || longitude == null) {
      return res.status(400).json({ error: "Nome e coordinate obbligatori" });
    }
    const waypoint = await storage.createCustomRouteWaypoint({
      routeId: route.id,
      name: name.trim(),
      description: description?.trim() || null,
      latitude,
      longitude,
      waypointType: waypointType || "stop",
      orderIndex: orderIndex ?? 0
    });
    res.json(waypoint);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router18.put("/api/custom-routes/:id/waypoints/:waypointId", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });
    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return res.status(404).json({ error: "Percorso non trovato" });
    if (route.userId !== userId) return res.status(403).json({ error: "Non autorizzato" });
    const { name, description, latitude, longitude, waypointType, orderIndex } = req.body;
    const updated = await storage.updateCustomRouteWaypoint(req.params.waypointId, {
      ...name !== void 0 && { name: name.trim() },
      ...description !== void 0 && { description: description?.trim() || null },
      ...latitude !== void 0 && { latitude },
      ...longitude !== void 0 && { longitude },
      ...waypointType !== void 0 && { waypointType },
      ...orderIndex !== void 0 && { orderIndex }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router18.delete("/api/custom-routes/:id/waypoints/:waypointId", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });
    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return res.status(404).json({ error: "Percorso non trovato" });
    if (route.userId !== userId) return res.status(403).json({ error: "Non autorizzato" });
    await storage.deleteCustomRouteWaypoint(req.params.waypointId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
var custom_routes_default = router18;

// server/routes.ts
async function registerRoutes(app2) {
  const PgStore = connectPgSimple(session);
  app2.use(
    session({
      store: new PgStore({
        pool,
        tableName: "session",
        createTableIfMissing: true
      }),
      secret: process.env.SESSION_SECRET || "bikerlink-secret-key-change-in-production",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1e3,
        httpOnly: true,
        secure: false,
        sameSite: "lax"
      }
    })
  );
  app2.use("/api/auth", auth_default);
  app2.use("/api/users", users_default);
  app2.use("/api/motorcycles", motorcycles_default);
  app2.use("/api/proposals", proposals_default);
  app2.use("/api/chat", chat_default);
  app2.use("/api/notifications", notifications_default);
  app2.use("/api/reports", reports_default);
  app2.use("/api/workshops", workshops_default);
  app2.use("/api/easter-eggs", easter_eggs_default);
  app2.use("/api/ads", ads_default);
  app2.use("/api/contest", contest_default);
  app2.use("/api/wishlist", wishlist_default);
  app2.use("/api/feedback", feedback_default);
  app2.use("/api/invitations", invitations_default);
  app2.use("/api/routes", tracking_default);
  app2.use(custom_routes_default);
  app2.use("/api/admin", admin_default);
  app2.use("/api/moderator", moderator_default);
  app2.get("/api/settings/privacy-policy", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("privacy_policy_text");
      const text2 = setting?.value || "";
      res.json({ text: text2 });
    } catch {
      res.json({ text: "" });
    }
  });
  app2.get("/api/settings/email-verification", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("email_verification_enabled");
      const enabled = setting?.value === "true";
      res.json({ enabled });
    } catch {
      res.json({ enabled: false });
    }
  });
  app2.get("/api/settings/syneco-branding", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("syneco_branding_visible");
      const visible = setting?.value === "true";
      res.json({ visible });
    } catch {
      res.json({ visible: false });
    }
  });
  app2.get("/api/settings/chatbot-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("chatbot_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });
  app2.get("/api/settings/custom-routes", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("custom_routes_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });
  app2.get("/api/settings/auto-matching", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("auto_matching_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });
  app2.get("/api/settings/paypal", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("paypal_email");
      const email = setting?.value || "Andreamasteri81@gmail.com";
      res.json({ email });
    } catch {
      res.json({ email: "Andreamasteri81@gmail.com" });
    }
  });
  app2.get("/api/settings/all", async (_req, res) => {
    try {
      const [syneco, emailVerification, chatbot, autoMatching, customRoutes2, paypal] = await Promise.all([
        storage.getAppSetting("syneco_branding_visible"),
        storage.getAppSetting("email_verification_enabled"),
        storage.getAppSetting("chatbot_enabled"),
        storage.getAppSetting("auto_matching_enabled"),
        storage.getAppSetting("custom_routes_enabled"),
        storage.getAppSetting("paypal_email")
      ]);
      res.json({
        synecoBranding: syneco?.value === "true",
        emailVerification: emailVerification?.value === "true",
        chatbotEnabled: chatbot?.value !== "false",
        autoMatching: autoMatching?.value !== "false",
        customRoutes: customRoutes2?.value !== "false",
        paypalEmail: paypal?.value || "Andreamasteri81@gmail.com"
      });
    } catch {
      res.json({
        synecoBranding: false,
        emailVerification: false,
        chatbotEnabled: true,
        autoMatching: true,
        customRoutes: true,
        paypalEmail: "Andreamasteri81@gmail.com"
      });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/matching-engine.ts
function haversineDistance2(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function timeRangesOverlap(from1, to1, from2, to2) {
  if (!from1 || !to1 || !from2 || !to2) return true;
  const f1 = new Date(from1).getTime();
  const t1 = new Date(to1).getTime();
  const f2 = new Date(from2).getTime();
  const t2 = new Date(to2).getTime();
  return f1 <= t2 && f2 <= t1;
}
function sameDay(d1, d2) {
  if (!d1 || !d2) return true;
  const a = new Date(d1);
  const b = new Date(d2);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
var MATCH_RULES = [
  { searchType1: "find_a_friend", searchType2: "find_a_friend" },
  { searchType1: "find_a_guest", searchType2: "find_a_biker" },
  { searchType1: "hitcher", searchType2: "hitchhiker" },
  { searchType1: "find_a_guest", searchType2: "hitchhiker" },
  { searchType1: "hitcher", searchType2: "find_a_biker" }
];
function areCompatible(p1, p2) {
  if (!p1.searchType || !p2.searchType) return false;
  if (p1.userId === p2.userId) return false;
  const ruleMatch = MATCH_RULES.some(
    (r) => r.searchType1 === p1.searchType && r.searchType2 === p2.searchType || r.searchType1 === p2.searchType && r.searchType2 === p1.searchType
  );
  if (!ruleMatch) return false;
  if (!p1.departureLatitude || !p1.departureLongitude || !p2.departureLatitude || !p2.departureLongitude) return false;
  const distance = haversineDistance2(
    p1.departureLatitude,
    p1.departureLongitude,
    p2.departureLatitude,
    p2.departureLongitude
  );
  const radius1 = p1.searchRadius || 50;
  const radius2 = p2.searchRadius || 50;
  const maxAllowedDistance = Math.min(radius1, radius2);
  if (distance > maxAllowedDistance) return false;
  const date1 = p1.scheduledAt || p1.departureTimeFrom;
  const date2 = p2.scheduledAt || p2.departureTimeFrom;
  if (!sameDay(date1, date2)) return false;
  if (!timeRangesOverlap(p1.departureTimeFrom, p1.departureTimeTo, p2.departureTimeFrom, p2.departureTimeTo)) return false;
  return true;
}
async function runMatching() {
  try {
    const activeProposals = await storage.getActiveProposalsWithLocation();
    let matchCount = 0;
    for (let i = 0; i < activeProposals.length; i++) {
      for (let j = i + 1; j < activeProposals.length; j++) {
        const p1 = activeProposals[i];
        const p2 = activeProposals[j];
        if (!areCompatible(p1, p2)) continue;
        const existing = await storage.findExistingMatch(p1.id, p2.id);
        if (existing) continue;
        await storage.createProposalMatch({
          proposalId1: p1.id,
          proposalId2: p2.id,
          userId1: p1.userId,
          userId2: p2.userId,
          status: "pending",
          acceptedByUser1: false,
          acceptedByUser2: false
        });
        matchCount++;
      }
    }
    return matchCount;
  } catch (error) {
    console.error("Matching engine error:", error);
    return 0;
  }
}
async function runWishlistMatching() {
  try {
    const wishlistMotos = await storage.getAllWishlistMotosWithUsers();
    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers();
    if (wishlistMotos.length === 0 || bikerMotorcycles.length === 0) return 0;
    let matchCount = 0;
    for (const wm of wishlistMotos) {
      const zavarrinaId = wm.userId;
      const wish = wm.wishlistMoto;
      for (const bm of bikerMotorcycles) {
        const bikerId = bm.userId;
        const moto = bm.motorcycle;
        if (bikerId === zavarrinaId) continue;
        let compatible = false;
        if (wish.motorcycleType && moto.motorcycleType) {
          if (wish.motorcycleType.toLowerCase() === moto.motorcycleType.toLowerCase()) {
            compatible = true;
          }
        }
        if (wish.brand && moto.brand) {
          if (wish.brand.toLowerCase() === moto.brand.toLowerCase()) {
            compatible = true;
          }
        }
        if (wish.brand && wish.model && moto.brand && moto.model) {
          if (wish.brand.toLowerCase() === moto.brand.toLowerCase() && (moto.model.toLowerCase().includes(wish.model.toLowerCase()) || wish.model.toLowerCase().includes(moto.model.toLowerCase()))) {
            compatible = true;
          }
        }
        if (!compatible) continue;
        const existing = await storage.findExistingBikerZavarrinaMatch(bikerId, zavarrinaId, moto.id, wish.id);
        if (existing) continue;
        await storage.createMatch({
          bikerId,
          zavarrinaId,
          bikerMotorcycleId: moto.id,
          wishlistMotoId: wish.id,
          status: "new"
        });
        matchCount++;
      }
    }
    return matchCount;
  } catch (error) {
    console.error("Wishlist matching error:", error);
    return 0;
  }
}
async function runCleanup() {
  try {
    return await storage.expireOldProposals();
  } catch (error) {
    console.error("Cleanup error:", error);
    return 0;
  }
}
async function runFakeZavorrineRotation() {
  try {
    await storage.toggleFakeZavorrineAvailability();
  } catch (error) {
    console.error("Fake zavorrine rotation error:", error);
  }
}
function startMatchingEngine() {
  console.log("Matching engine started (60s interval)");
  const run = async () => {
    const expired = await runCleanup();
    if (expired > 0) console.log(`Expired ${expired} proposals`);
    try {
      const deleted = await storage.deleteExpiredProposals();
      if (deleted > 0) console.log(`Deleted ${deleted} expired proposals`);
    } catch (err) {
      console.error("Error deleting expired proposals:", err);
    }
    const autoMatchSetting = await storage.getAppSetting("auto_matching_enabled");
    const autoMatchEnabled = autoMatchSetting?.value !== "false";
    if (autoMatchEnabled) {
      const matches = await runMatching();
      if (matches > 0) console.log(`Found ${matches} new proposal matches`);
      const garageMatches = await runWishlistMatching();
      if (garageMatches > 0) console.log(`Found ${garageMatches} new garage matches`);
    } else {
      console.log("Auto matching disabled by admin, skipping");
    }
  };
  run();
  setInterval(run, 60 * 1e3);
  runFakeZavorrineRotation();
  setInterval(runFakeZavorrineRotation, 5 * 60 * 1e3);
  console.log("Fake zavorrine availability rotation started (5min interval)");
}

// server/index.ts
import * as fs5 from "fs";
import * as path5 from "path";
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path6 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path6.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path6} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && res.statusCode !== 304) {
        const jsonStr = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${jsonStr.length > 200 ? jsonStr.slice(0, 197) + "..." : jsonStr}`;
      }
      if (logLine.length > 120) {
        logLine = logLine.slice(0, 119) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path5.resolve(process.cwd(), "app.json");
    const appJsonContent = fs5.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path5.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs5.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs5.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path5.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs5.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path5.resolve(process.cwd(), "assets")));
  app2.use("/uploads", express.static(path5.resolve(process.cwd(), "uploads")));
  app2.use(express.static(path5.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
      startMatchingEngine();
    }
  );
})();
