"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc4) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc4 = __getOwnPropDesc(from, key)) || desc4.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  adCampaigns: () => adCampaigns,
  adClicks: () => adClicks,
  appSettings: () => appSettings,
  bikerBikerMatches: () => bikerBikerMatches,
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
  motoClubInvites: () => motoClubInvites,
  motoClubMembers: () => motoClubMembers,
  motoClubRequests: () => motoClubRequests,
  motoClubs: () => motoClubs,
  motorcyclePhotos: () => motorcyclePhotos,
  notifications: () => notifications,
  otaReleases: () => otaReleases,
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
  serverRestarts: () => serverRestarts,
  sosRequests: () => sosRequests,
  userBlocks: () => userBlocks,
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
var import_drizzle_orm, import_pg_core, import_zod, users, userPhotos, userMotorcycles, userProfiles, proposals, proposalParticipants, proposalMatches, conversations, conversationParticipants, messages, routes, routePoints, customRoutes, customRouteWaypoints, photoContestEntries, photoVotes, dailyVoteCounts, photoWinners, workshops, workshopContacts, easterEggs, collectedEasterEggs, reports, moderatorLogs, adCampaigns, adClicks, notifications, invitationCodes, feedbackTickets, appSettings, verificationCodes, passwordResetTokens, motorcyclePhotos, zavarrinaWishlists, zavarrinaWishlistPhotos, zavarrinaWishlistMotos, bikerZavarrinaMatches, bikerBikerMatches, emailVerificationTokens, phoneSharingTracker, fakeUserInteractions, userBlocks, sosRequests, motoClubs, motoClubMembers, motoClubInvites, motoClubRequests, registerSchema, loginSchema, serverRestarts, otaReleases;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    import_drizzle_orm = require("drizzle-orm");
    import_pg_core = require("drizzle-orm/pg-core");
    import_zod = require("zod");
    users = (0, import_pg_core.pgTable)("users", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      nickname: (0, import_pg_core.varchar)("nickname", { length: 50 }).notNull().unique(),
      email: (0, import_pg_core.varchar)("email", { length: 255 }).notNull().unique(),
      phone: (0, import_pg_core.varchar)("phone", { length: 30 }),
      password: (0, import_pg_core.text)("password").notNull(),
      userType: (0, import_pg_core.varchar)("user_type", { length: 20 }).notNull().default("biker"),
      sex: (0, import_pg_core.varchar)("sex", { length: 5 }),
      coupleSexConfig: (0, import_pg_core.varchar)("couple_sex_config", { length: 10 }),
      role: (0, import_pg_core.varchar)("role", { length: 20 }).notNull().default("user"),
      status: (0, import_pg_core.varchar)("status", { length: 20 }).notNull().default("active"),
      birthYear: (0, import_pg_core.integer)("birth_year"),
      region: (0, import_pg_core.varchar)("region", { length: 100 }),
      avatarUrl: (0, import_pg_core.text)("avatar_url"),
      emailVerified: (0, import_pg_core.boolean)("email_verified").notNull().default(false),
      eulaAccepted: (0, import_pg_core.boolean)("eula_accepted").notNull().default(false),
      privacyAccepted: (0, import_pg_core.boolean)("privacy_accepted").notNull().default(false),
      consentAcceptedAt: (0, import_pg_core.timestamp)("consent_accepted_at"),
      deletionRequestedAt: (0, import_pg_core.timestamp)("deletion_requested_at"),
      deletionScheduledFor: (0, import_pg_core.timestamp)("deletion_scheduled_for"),
      invitationCode: (0, import_pg_core.varchar)("invitation_code", { length: 50 }),
      isFake: (0, import_pg_core.boolean)("is_fake").notNull().default(false),
      isPrimal: (0, import_pg_core.boolean)("is_primal").notNull().default(false),
      country: (0, import_pg_core.varchar)("country", { length: 2 }),
      spokenLanguages: (0, import_pg_core.jsonb)("spoken_languages").$type().default([]),
      autoJoinClubs: (0, import_pg_core.boolean)("auto_join_clubs").notNull().default(true),
      ghostMode: (0, import_pg_core.boolean)("ghost_mode").notNull().default(false),
      lastLoginAt: (0, import_pg_core.timestamp)("last_login_at"),
      firstLoginAt: (0, import_pg_core.timestamp)("first_login_at"),
      firstLoginLat: (0, import_pg_core.doublePrecision)("first_login_lat"),
      firstLoginLng: (0, import_pg_core.doublePrecision)("first_login_lng"),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow(),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
    });
    userPhotos = (0, import_pg_core.pgTable)("user_photos", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      photoUrl: (0, import_pg_core.text)("photo_url").notNull(),
      sortOrder: (0, import_pg_core.integer)("sort_order").notNull().default(0),
      isApproved: (0, import_pg_core.boolean)("is_approved").notNull().default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("user_photos_user_id_idx").on(table.userId)
    ]);
    userMotorcycles = (0, import_pg_core.pgTable)("user_motorcycles", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      brand: (0, import_pg_core.varchar)("brand", { length: 100 }).notNull(),
      model: (0, import_pg_core.varchar)("model", { length: 100 }).notNull(),
      year: (0, import_pg_core.integer)("year"),
      displacement: (0, import_pg_core.integer)("displacement"),
      motorcycleType: (0, import_pg_core.varchar)("motorcycle_type", { length: 50 }),
      ridingStyle: (0, import_pg_core.varchar)("riding_style", { length: 50 }),
      photoUrl: (0, import_pg_core.text)("photo_url"),
      isDefault: (0, import_pg_core.boolean)("is_default").notNull().default(false),
      isForSale: (0, import_pg_core.boolean)("is_for_sale").notNull().default(false),
      saleDescription: (0, import_pg_core.text)("sale_description"),
      motoDescription: (0, import_pg_core.text)("moto_description"),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("user_motorcycles_user_id_idx").on(table.userId)
    ]);
    userProfiles = (0, import_pg_core.pgTable)("user_profiles", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().unique().references(() => users.id, { onDelete: "cascade" }),
      isAvailable: (0, import_pg_core.boolean)("is_available").notNull().default(false),
      latitude: (0, import_pg_core.doublePrecision)("latitude"),
      longitude: (0, import_pg_core.doublePrecision)("longitude"),
      maxPickupDistance: (0, import_pg_core.integer)("max_pickup_distance").default(50),
      bio: (0, import_pg_core.text)("bio"),
      totalKm: (0, import_pg_core.doublePrecision)("total_km").notNull().default(0),
      totalRides: (0, import_pg_core.integer)("total_rides").notNull().default(0),
      easterEggsCollected: (0, import_pg_core.integer)("easter_eggs_collected").notNull().default(0),
      searchPreference: (0, import_pg_core.varchar)("search_preference", { length: 20 }).notNull().default("both"),
      preferredMapStyle: (0, import_pg_core.varchar)("preferred_map_style", { length: 20 }),
      emailChatNotifications: (0, import_pg_core.boolean)("email_chat_notifications").notNull().default(false),
      adminOverrideUntil: (0, import_pg_core.timestamp)("admin_override_until"),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("user_profiles_user_id_idx").on(table.userId),
      (0, import_pg_core.index)("user_profiles_location_idx").on(table.latitude, table.longitude)
    ]);
    proposals = (0, import_pg_core.pgTable)("proposals", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      proposalType: (0, import_pg_core.varchar)("proposal_type", { length: 30 }).notNull(),
      searchType: (0, import_pg_core.varchar)("search_type", { length: 30 }),
      title: (0, import_pg_core.varchar)("title", { length: 200 }).notNull(),
      description: (0, import_pg_core.text)("description"),
      searchRadius: (0, import_pg_core.integer)("search_radius"),
      motorcycleId: (0, import_pg_core.varchar)("motorcycle_id", { length: 36 }),
      wishlistMotoId: (0, import_pg_core.varchar)("wishlist_moto_id", { length: 36 }),
      anyMotoOk: (0, import_pg_core.boolean)("any_moto_ok").notNull().default(false),
      departureLatitude: (0, import_pg_core.doublePrecision)("departure_latitude"),
      departureLongitude: (0, import_pg_core.doublePrecision)("departure_longitude"),
      departureAddress: (0, import_pg_core.text)("departure_address"),
      destinationAddress: (0, import_pg_core.text)("destination_address"),
      destinationLatitude: (0, import_pg_core.doublePrecision)("destination_latitude"),
      destinationLongitude: (0, import_pg_core.doublePrecision)("destination_longitude"),
      scheduledAt: (0, import_pg_core.timestamp)("scheduled_at"),
      departureTimeFrom: (0, import_pg_core.timestamp)("departure_time_from"),
      departureTimeTo: (0, import_pg_core.timestamp)("departure_time_to"),
      returnDeadline: (0, import_pg_core.timestamp)("return_deadline"),
      stops: (0, import_pg_core.jsonb)("stops"),
      maxParticipants: (0, import_pg_core.integer)("max_participants"),
      expiresAt: (0, import_pg_core.timestamp)("expires_at"),
      status: (0, import_pg_core.varchar)("status", { length: 20 }).notNull().default("active"),
      clubId: (0, import_pg_core.varchar)("club_id", { length: 36 }),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow(),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("proposals_user_id_idx").on(table.userId),
      (0, import_pg_core.index)("proposals_status_idx").on(table.status),
      (0, import_pg_core.index)("proposals_expires_at_idx").on(table.expiresAt)
    ]);
    proposalParticipants = (0, import_pg_core.pgTable)("proposal_participants", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      proposalId: (0, import_pg_core.varchar)("proposal_id", { length: 36 }).notNull().references(() => proposals.id, { onDelete: "cascade" }),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      joinedAt: (0, import_pg_core.timestamp)("joined_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.uniqueIndex)("proposal_participants_unique_idx").on(table.proposalId, table.userId)
    ]);
    proposalMatches = (0, import_pg_core.pgTable)("proposal_matches", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      proposalId1: (0, import_pg_core.varchar)("proposal_id_1", { length: 36 }).notNull().references(() => proposals.id, { onDelete: "cascade" }),
      proposalId2: (0, import_pg_core.varchar)("proposal_id_2", { length: 36 }).notNull().references(() => proposals.id, { onDelete: "cascade" }),
      userId1: (0, import_pg_core.varchar)("user_id_1", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      userId2: (0, import_pg_core.varchar)("user_id_2", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      status: (0, import_pg_core.varchar)("status", { length: 20 }).notNull().default("pending"),
      acceptedByUser1: (0, import_pg_core.boolean)("accepted_by_user_1").notNull().default(false),
      acceptedByUser2: (0, import_pg_core.boolean)("accepted_by_user_2").notNull().default(false),
      conversationId: (0, import_pg_core.varchar)("conversation_id", { length: 36 }),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("proposal_matches_user1_idx").on(table.userId1),
      (0, import_pg_core.index)("proposal_matches_user2_idx").on(table.userId2),
      (0, import_pg_core.index)("proposal_matches_status_idx").on(table.status)
    ]);
    conversations = (0, import_pg_core.pgTable)("conversations", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      conversationType: (0, import_pg_core.varchar)("conversation_type", { length: 20 }).notNull().default("private"),
      title: (0, import_pg_core.varchar)("title", { length: 200 }),
      proposalId: (0, import_pg_core.varchar)("proposal_id", { length: 36 }).references(() => proposals.id, { onDelete: "set null" }),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow(),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
    });
    conversationParticipants = (0, import_pg_core.pgTable)("conversation_participants", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      conversationId: (0, import_pg_core.varchar)("conversation_id", { length: 36 }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      joinedAt: (0, import_pg_core.timestamp)("joined_at").notNull().defaultNow(),
      lastReadAt: (0, import_pg_core.timestamp)("last_read_at")
    }, (table) => [
      (0, import_pg_core.uniqueIndex)("conversation_participants_unique_idx").on(table.conversationId, table.userId),
      (0, import_pg_core.index)("conversation_participants_user_id_idx").on(table.userId)
    ]);
    messages = (0, import_pg_core.pgTable)("messages", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      conversationId: (0, import_pg_core.varchar)("conversation_id", { length: 36 }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
      senderId: (0, import_pg_core.varchar)("sender_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      messageType: (0, import_pg_core.varchar)("message_type", { length: 20 }).notNull().default("text"),
      content: (0, import_pg_core.text)("content"),
      imageUrl: (0, import_pg_core.text)("image_url"),
      latitude: (0, import_pg_core.doublePrecision)("latitude"),
      longitude: (0, import_pg_core.doublePrecision)("longitude"),
      isFiltered: (0, import_pg_core.boolean)("is_filtered").notNull().default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("messages_conversation_id_idx").on(table.conversationId),
      (0, import_pg_core.index)("messages_sender_id_idx").on(table.senderId)
    ]);
    routes = (0, import_pg_core.pgTable)("routes", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      title: (0, import_pg_core.varchar)("title", { length: 200 }),
      trackingFrequency: (0, import_pg_core.integer)("tracking_frequency").notNull().default(5),
      status: (0, import_pg_core.varchar)("status", { length: 20 }).notNull().default("active"),
      totalDistanceKm: (0, import_pg_core.doublePrecision)("total_distance_km").default(0),
      maxSpeedKmh: (0, import_pg_core.doublePrecision)("max_speed_kmh").default(0),
      avgSpeedKmh: (0, import_pg_core.doublePrecision)("avg_speed_kmh").default(0),
      maxAltitude: (0, import_pg_core.doublePrecision)("max_altitude").default(0),
      durationSeconds: (0, import_pg_core.integer)("duration_seconds").default(0),
      idleTimeSeconds: (0, import_pg_core.integer)("idle_time_seconds").default(0),
      likes: (0, import_pg_core.integer)("likes").notNull().default(0),
      startedAt: (0, import_pg_core.timestamp)("started_at").notNull().defaultNow(),
      stoppedAt: (0, import_pg_core.timestamp)("stopped_at"),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("routes_user_id_idx").on(table.userId)
    ]);
    routePoints = (0, import_pg_core.pgTable)("route_points", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      routeId: (0, import_pg_core.varchar)("route_id", { length: 36 }).notNull().references(() => routes.id, { onDelete: "cascade" }),
      latitude: (0, import_pg_core.doublePrecision)("latitude").notNull(),
      longitude: (0, import_pg_core.doublePrecision)("longitude").notNull(),
      altitude: (0, import_pg_core.doublePrecision)("altitude"),
      speedKmh: (0, import_pg_core.doublePrecision)("speed_kmh"),
      timestamp: (0, import_pg_core.timestamp)("timestamp").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("route_points_route_id_idx").on(table.routeId)
    ]);
    customRoutes = (0, import_pg_core.pgTable)("custom_routes", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      title: (0, import_pg_core.varchar)("title", { length: 200 }).notNull(),
      description: (0, import_pg_core.text)("description"),
      totalDistanceKm: (0, import_pg_core.doublePrecision)("total_distance_km").default(0),
      isPublic: (0, import_pg_core.boolean)("is_public").notNull().default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow(),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("custom_routes_user_id_idx").on(table.userId)
    ]);
    customRouteWaypoints = (0, import_pg_core.pgTable)("custom_route_waypoints", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      routeId: (0, import_pg_core.varchar)("route_id", { length: 36 }).notNull().references(() => customRoutes.id, { onDelete: "cascade" }),
      orderIndex: (0, import_pg_core.integer)("order_index").notNull().default(0),
      name: (0, import_pg_core.varchar)("name", { length: 200 }).notNull(),
      description: (0, import_pg_core.text)("description"),
      latitude: (0, import_pg_core.doublePrecision)("latitude").notNull(),
      longitude: (0, import_pg_core.doublePrecision)("longitude").notNull(),
      waypointType: (0, import_pg_core.varchar)("waypoint_type", { length: 20 }).notNull().default("stop"),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("custom_route_waypoints_route_id_idx").on(table.routeId)
    ]);
    photoContestEntries = (0, import_pg_core.pgTable)("photo_contest_entries", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      photoUrl: (0, import_pg_core.text)("photo_url"),
      caption: (0, import_pg_core.text)("caption"),
      performanceData: (0, import_pg_core.text)("performance_data"),
      weekNumber: (0, import_pg_core.integer)("week_number").notNull(),
      year: (0, import_pg_core.integer)("year").notNull(),
      votesCount: (0, import_pg_core.integer)("votes_count").notNull().default(0),
      isApproved: (0, import_pg_core.boolean)("is_approved").notNull().default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("photo_contest_entries_user_id_idx").on(table.userId),
      (0, import_pg_core.index)("photo_contest_entries_week_idx").on(table.weekNumber, table.year)
    ]);
    photoVotes = (0, import_pg_core.pgTable)("photo_votes", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      entryId: (0, import_pg_core.varchar)("entry_id", { length: 36 }).notNull().references(() => photoContestEntries.id, { onDelete: "cascade" }),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.uniqueIndex)("photo_votes_unique_idx").on(table.entryId, table.userId)
    ]);
    dailyVoteCounts = (0, import_pg_core.pgTable)("daily_vote_counts", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      voteDate: (0, import_pg_core.varchar)("vote_date", { length: 10 }).notNull(),
      count: (0, import_pg_core.integer)("count").notNull().default(0)
    }, (table) => [
      (0, import_pg_core.uniqueIndex)("daily_vote_counts_unique_idx").on(table.userId, table.voteDate)
    ]);
    photoWinners = (0, import_pg_core.pgTable)("photo_winners", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      entryId: (0, import_pg_core.varchar)("entry_id", { length: 36 }).notNull().references(() => photoContestEntries.id, { onDelete: "cascade" }),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      weekNumber: (0, import_pg_core.integer)("week_number").notNull(),
      year: (0, import_pg_core.integer)("year").notNull(),
      totalVotes: (0, import_pg_core.integer)("total_votes").notNull(),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    });
    workshops = (0, import_pg_core.pgTable)("workshops", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      name: (0, import_pg_core.varchar)("name", { length: 200 }).notNull(),
      address: (0, import_pg_core.text)("address"),
      latitude: (0, import_pg_core.doublePrecision)("latitude"),
      longitude: (0, import_pg_core.doublePrecision)("longitude"),
      phone: (0, import_pg_core.varchar)("phone", { length: 30 }),
      whatsapp: (0, import_pg_core.varchar)("whatsapp", { length: 30 }),
      email: (0, import_pg_core.varchar)("email", { length: 255 }),
      website: (0, import_pg_core.text)("website"),
      description: (0, import_pg_core.text)("description"),
      openingHours: (0, import_pg_core.jsonb)("opening_hours"),
      logoUrl: (0, import_pg_core.text)("logo_url"),
      qrCode: (0, import_pg_core.text)("qr_code"),
      isSynecoPartner: (0, import_pg_core.boolean)("is_syneco_partner").notNull().default(false),
      isApproved: (0, import_pg_core.boolean)("is_approved").notNull().default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow(),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("workshops_location_idx").on(table.latitude, table.longitude)
    ]);
    workshopContacts = (0, import_pg_core.pgTable)("workshop_contacts", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      workshopId: (0, import_pg_core.varchar)("workshop_id", { length: 36 }).notNull().references(() => workshops.id, { onDelete: "cascade" }),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      contactType: (0, import_pg_core.varchar)("contact_type", { length: 20 }).notNull(),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("workshop_contacts_workshop_id_idx").on(table.workshopId)
    ]);
    easterEggs = (0, import_pg_core.pgTable)("easter_eggs", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      name: (0, import_pg_core.varchar)("name", { length: 200 }).notNull(),
      description: (0, import_pg_core.text)("description"),
      latitude: (0, import_pg_core.doublePrecision)("latitude").notNull(),
      longitude: (0, import_pg_core.doublePrecision)("longitude").notNull(),
      radius: (0, import_pg_core.integer)("radius").notNull().default(100),
      iconUrl: (0, import_pg_core.text)("icon_url"),
      points: (0, import_pg_core.integer)("points").notNull().default(10),
      isActive: (0, import_pg_core.boolean)("is_active").notNull().default(true),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("easter_eggs_location_idx").on(table.latitude, table.longitude)
    ]);
    collectedEasterEggs = (0, import_pg_core.pgTable)("collected_easter_eggs", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      easterEggId: (0, import_pg_core.varchar)("easter_egg_id", { length: 36 }).notNull().references(() => easterEggs.id, { onDelete: "cascade" }),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      collectedAt: (0, import_pg_core.timestamp)("collected_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.uniqueIndex)("collected_easter_eggs_unique_idx").on(table.easterEggId, table.userId)
    ]);
    reports = (0, import_pg_core.pgTable)("reports", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      reporterId: (0, import_pg_core.varchar)("reporter_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      reportedUserId: (0, import_pg_core.varchar)("reported_user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      reason: (0, import_pg_core.varchar)("reason", { length: 100 }).notNull(),
      description: (0, import_pg_core.text)("description"),
      status: (0, import_pg_core.varchar)("status", { length: 20 }).notNull().default("pending"),
      resolvedBy: (0, import_pg_core.varchar)("resolved_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      resolvedAt: (0, import_pg_core.timestamp)("resolved_at"),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("reports_status_idx").on(table.status)
    ]);
    moderatorLogs = (0, import_pg_core.pgTable)("moderator_logs", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      moderatorId: (0, import_pg_core.varchar)("moderator_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      action: (0, import_pg_core.varchar)("action", { length: 100 }).notNull(),
      targetType: (0, import_pg_core.varchar)("target_type", { length: 50 }).notNull(),
      targetId: (0, import_pg_core.varchar)("target_id", { length: 36 }).notNull(),
      details: (0, import_pg_core.text)("details"),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    });
    adCampaigns = (0, import_pg_core.pgTable)("ad_campaigns", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      name: (0, import_pg_core.varchar)("name", { length: 200 }).notNull(),
      sponsor: (0, import_pg_core.varchar)("sponsor", { length: 200 }).notNull().default("Syneco Lubrificanti"),
      imageUrl: (0, import_pg_core.text)("image_url"),
      linkUrl: (0, import_pg_core.text)("link_url"),
      displayMode: (0, import_pg_core.varchar)("display_mode", { length: 30 }).notNull().default("banner"),
      description: (0, import_pg_core.text)("description"),
      isActive: (0, import_pg_core.boolean)("is_active").notNull().default(true),
      impressions: (0, import_pg_core.integer)("impressions").notNull().default(0),
      startDate: (0, import_pg_core.timestamp)("start_date"),
      endDate: (0, import_pg_core.timestamp)("end_date"),
      targetUserType: (0, import_pg_core.varchar)("target_user_type", { length: 30 }).notNull().default("biker"),
      rotationDuration: (0, import_pg_core.integer)("rotation_duration").notNull().default(10),
      rotationMode: (0, import_pg_core.varchar)("rotation_mode", { length: 20 }).notNull().default("sequential"),
      sortOrder: (0, import_pg_core.integer)("sort_order").notNull().default(0),
      placement: (0, import_pg_core.varchar)("placement", { length: 30 }).notNull().default("all"),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    });
    adClicks = (0, import_pg_core.pgTable)("ad_clicks", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      campaignId: (0, import_pg_core.varchar)("campaign_id", { length: 36 }).notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("ad_clicks_campaign_id_idx").on(table.campaignId)
    ]);
    notifications = (0, import_pg_core.pgTable)("notifications", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      title: (0, import_pg_core.varchar)("title", { length: 200 }).notNull(),
      body: (0, import_pg_core.text)("body"),
      notificationType: (0, import_pg_core.varchar)("notification_type", { length: 50 }).notNull(),
      referenceType: (0, import_pg_core.varchar)("reference_type", { length: 50 }),
      referenceId: (0, import_pg_core.varchar)("reference_id", { length: 36 }),
      isRead: (0, import_pg_core.boolean)("is_read").notNull().default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("notifications_user_id_idx").on(table.userId)
    ]);
    invitationCodes = (0, import_pg_core.pgTable)("invitation_codes", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      code: (0, import_pg_core.varchar)("code", { length: 50 }).notNull().unique(),
      label: (0, import_pg_core.varchar)("label", { length: 100 }),
      giftMessage: (0, import_pg_core.text)("gift_message"),
      createdBy: (0, import_pg_core.varchar)("created_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      usedBy: (0, import_pg_core.varchar)("used_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      maxUses: (0, import_pg_core.integer)("max_uses").notNull().default(1),
      currentUses: (0, import_pg_core.integer)("current_uses").notNull().default(0),
      isActive: (0, import_pg_core.boolean)("is_active").notNull().default(true),
      expiresAt: (0, import_pg_core.timestamp)("expires_at"),
      imageUrl: (0, import_pg_core.text)("image_url"),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    });
    feedbackTickets = (0, import_pg_core.pgTable)("feedback_tickets", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      ticketType: (0, import_pg_core.varchar)("ticket_type", { length: 30 }).notNull().default("feedback"),
      subject: (0, import_pg_core.varchar)("subject", { length: 200 }).notNull(),
      message: (0, import_pg_core.text)("message").notNull(),
      status: (0, import_pg_core.varchar)("status", { length: 20 }).notNull().default("open"),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow(),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
    });
    appSettings = (0, import_pg_core.pgTable)("app_settings", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      key: (0, import_pg_core.varchar)("key", { length: 100 }).notNull().unique(),
      value: (0, import_pg_core.text)("value"),
      valueJson: (0, import_pg_core.jsonb)("value_json"),
      description: (0, import_pg_core.text)("description"),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
    });
    verificationCodes = (0, import_pg_core.pgTable)("verification_codes", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
      codeType: (0, import_pg_core.varchar)("code_type", { length: 30 }).notNull(),
      code: (0, import_pg_core.varchar)("code", { length: 10 }).notNull(),
      target: (0, import_pg_core.varchar)("target", { length: 255 }).notNull(),
      isUsed: (0, import_pg_core.boolean)("is_used").notNull().default(false),
      expiresAt: (0, import_pg_core.timestamp)("expires_at").notNull(),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("verification_codes_target_idx").on(table.target)
    ]);
    passwordResetTokens = (0, import_pg_core.pgTable)("password_reset_tokens", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      token: (0, import_pg_core.varchar)("token", { length: 64 }).notNull().unique(),
      expiresAt: (0, import_pg_core.timestamp)("expires_at").notNull(),
      used: (0, import_pg_core.boolean)("used").notNull().default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    });
    motorcyclePhotos = (0, import_pg_core.pgTable)("motorcycle_photos", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      motorcycleId: (0, import_pg_core.varchar)("motorcycle_id", { length: 36 }).notNull().references(() => userMotorcycles.id, { onDelete: "cascade" }),
      photoUrl: (0, import_pg_core.text)("photo_url").notNull(),
      sortOrder: (0, import_pg_core.integer)("sort_order").notNull().default(0),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("motorcycle_photos_motorcycle_id_idx").on(table.motorcycleId)
    ]);
    zavarrinaWishlists = (0, import_pg_core.pgTable)("zavorrina_wishlists", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().unique().references(() => users.id, { onDelete: "cascade" }),
      description: (0, import_pg_core.text)("description"),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow(),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
    });
    zavarrinaWishlistPhotos = (0, import_pg_core.pgTable)("zavorrina_wishlist_photos", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      wishlistId: (0, import_pg_core.varchar)("wishlist_id", { length: 36 }).notNull().references(() => zavarrinaWishlists.id, { onDelete: "cascade" }),
      photoUrl: (0, import_pg_core.text)("photo_url").notNull(),
      sortOrder: (0, import_pg_core.integer)("sort_order").notNull().default(0),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    });
    zavarrinaWishlistMotos = (0, import_pg_core.pgTable)("zavorrina_wishlist_motos", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      wishlistId: (0, import_pg_core.varchar)("wishlist_id", { length: 36 }).notNull().references(() => zavarrinaWishlists.id, { onDelete: "cascade" }),
      brand: (0, import_pg_core.varchar)("brand", { length: 100 }),
      model: (0, import_pg_core.varchar)("model", { length: 100 }),
      motorcycleType: (0, import_pg_core.varchar)("motorcycle_type", { length: 50 }),
      ridingStyle: (0, import_pg_core.varchar)("riding_style", { length: 50 }),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    });
    bikerZavarrinaMatches = (0, import_pg_core.pgTable)("biker_zavorrina_matches", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      bikerId: (0, import_pg_core.varchar)("biker_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      zavarrinaId: (0, import_pg_core.varchar)("zavorrina_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      bikerMotorcycleId: (0, import_pg_core.varchar)("biker_motorcycle_id", { length: 36 }).notNull().references(() => userMotorcycles.id, { onDelete: "cascade" }),
      wishlistMotoId: (0, import_pg_core.varchar)("wishlist_moto_id", { length: 36 }).notNull().references(() => zavarrinaWishlistMotos.id, { onDelete: "cascade" }),
      status: (0, import_pg_core.varchar)("status", { length: 20 }).notNull().default("new"),
      isSupermatch: (0, import_pg_core.boolean)("is_supermatch").notNull().default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("matches_biker_id_idx").on(table.bikerId),
      (0, import_pg_core.index)("matches_zavorrina_id_idx").on(table.zavarrinaId),
      (0, import_pg_core.uniqueIndex)("matches_unique_combo_idx").on(table.bikerId, table.zavarrinaId, table.bikerMotorcycleId, table.wishlistMotoId)
    ]);
    bikerBikerMatches = (0, import_pg_core.pgTable)("biker_biker_matches", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      biker1Id: (0, import_pg_core.varchar)("biker1_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      biker2Id: (0, import_pg_core.varchar)("biker2_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      motorcycleBrand: (0, import_pg_core.varchar)("motorcycle_brand", { length: 100 }).notNull(),
      motorcycleModel: (0, import_pg_core.varchar)("motorcycle_model", { length: 100 }).notNull(),
      status: (0, import_pg_core.varchar)("status", { length: 20 }).notNull().default("new"),
      isSupermatch: (0, import_pg_core.boolean)("is_supermatch").notNull().default(false),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("biker_biker_biker1_idx").on(table.biker1Id),
      (0, import_pg_core.index)("biker_biker_biker2_idx").on(table.biker2Id),
      (0, import_pg_core.uniqueIndex)("biker_biker_symmetric_idx").on(
        import_drizzle_orm.sql`LEAST(${table.biker1Id}, ${table.biker2Id})`,
        import_drizzle_orm.sql`GREATEST(${table.biker1Id}, ${table.biker2Id})`,
        table.motorcycleBrand,
        table.motorcycleModel
      )
    ]);
    emailVerificationTokens = (0, import_pg_core.pgTable)("email_verification_tokens", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      token: (0, import_pg_core.varchar)("token", { length: 64 }).notNull().unique(),
      expiresAt: (0, import_pg_core.timestamp)("expires_at").notNull(),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    });
    phoneSharingTracker = (0, import_pg_core.pgTable)("phone_sharing_tracker", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      conversationId: (0, import_pg_core.varchar)("conversation_id", { length: 36 }).notNull(),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull(),
      sharedCount: (0, import_pg_core.integer)("shared_count").notNull().default(0)
    }, (table) => [
      (0, import_pg_core.uniqueIndex)("phone_sharing_tracker_unique_idx").on(table.conversationId, table.userId)
    ]);
    fakeUserInteractions = (0, import_pg_core.pgTable)("fake_user_interactions", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      fakeUserId: (0, import_pg_core.varchar)("fake_user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      realUserId: (0, import_pg_core.varchar)("real_user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      interactionType: (0, import_pg_core.varchar)("interaction_type", { length: 30 }).notNull(),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("fake_interactions_fake_user_idx").on(table.fakeUserId),
      (0, import_pg_core.index)("fake_interactions_real_user_idx").on(table.realUserId)
    ]);
    userBlocks = (0, import_pg_core.pgTable)("user_blocks", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      blockerId: (0, import_pg_core.varchar)("blocker_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      blockedId: (0, import_pg_core.varchar)("blocked_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.uniqueIndex)("user_blocks_unique_idx").on(table.blockerId, table.blockedId),
      (0, import_pg_core.index)("user_blocks_blocker_idx").on(table.blockerId),
      (0, import_pg_core.index)("user_blocks_blocked_idx").on(table.blockedId)
    ]);
    sosRequests = (0, import_pg_core.pgTable)("sos_requests", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      requesterId: (0, import_pg_core.varchar)("requester_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      helperId: (0, import_pg_core.varchar)("helper_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      reason: (0, import_pg_core.text)("reason").notNull(),
      status: (0, import_pg_core.varchar)("status", { length: 20 }).notNull().default("active"),
      latitude: (0, import_pg_core.doublePrecision)("latitude").notNull(),
      longitude: (0, import_pg_core.doublePrecision)("longitude").notNull(),
      radiusKm: (0, import_pg_core.integer)("radius_km").notNull().default(10),
      conversationId: (0, import_pg_core.varchar)("conversation_id", { length: 36 }),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow(),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("sos_requests_requester_idx").on(table.requesterId),
      (0, import_pg_core.index)("sos_requests_status_idx").on(table.status)
    ]);
    motoClubs = (0, import_pg_core.pgTable)("moto_clubs", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      name: (0, import_pg_core.varchar)("name", { length: 200 }).notNull(),
      clubType: (0, import_pg_core.varchar)("club_type", { length: 20 }).notNull(),
      brandName: (0, import_pg_core.varchar)("brand_name", { length: 100 }),
      modelName: (0, import_pg_core.varchar)("model_name", { length: 100 }),
      region: (0, import_pg_core.varchar)("region", { length: 100 }),
      country: (0, import_pg_core.varchar)("country", { length: 2 }),
      description: (0, import_pg_core.text)("description"),
      logoUrl: (0, import_pg_core.text)("logo_url"),
      coverUrl: (0, import_pg_core.text)("cover_url"),
      isApproved: (0, import_pg_core.boolean)("is_approved").notNull().default(false),
      isFeatured: (0, import_pg_core.boolean)("is_featured").notNull().default(false),
      memberCount: (0, import_pg_core.integer)("member_count").notNull().default(0),
      activityScore: (0, import_pg_core.integer)("activity_score").notNull().default(0),
      conversationId: (0, import_pg_core.varchar)("conversation_id", { length: 36 }),
      parentClubId: (0, import_pg_core.varchar)("parent_club_id", { length: 36 }),
      latitude: (0, import_pg_core.doublePrecision)("latitude"),
      longitude: (0, import_pg_core.doublePrecision)("longitude"),
      createdBy: (0, import_pg_core.varchar)("created_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow(),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("moto_clubs_type_idx").on(table.clubType),
      (0, import_pg_core.index)("moto_clubs_brand_idx").on(table.brandName),
      (0, import_pg_core.index)("moto_clubs_region_idx").on(table.region)
    ]);
    motoClubMembers = (0, import_pg_core.pgTable)("moto_club_members", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      clubId: (0, import_pg_core.varchar)("club_id", { length: 36 }).notNull().references(() => motoClubs.id, { onDelete: "cascade" }),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      role: (0, import_pg_core.varchar)("role", { length: 20 }).notNull().default("member"),
      status: (0, import_pg_core.varchar)("status", { length: 20 }).notNull().default("active"),
      joinedAt: (0, import_pg_core.timestamp)("joined_at").notNull().defaultNow(),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.uniqueIndex)("moto_club_members_unique_idx").on(table.clubId, table.userId),
      (0, import_pg_core.index)("moto_club_members_club_idx").on(table.clubId),
      (0, import_pg_core.index)("moto_club_members_user_idx").on(table.userId)
    ]);
    motoClubInvites = (0, import_pg_core.pgTable)("moto_club_invites", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      clubId: (0, import_pg_core.varchar)("club_id", { length: 36 }).notNull().references(() => motoClubs.id, { onDelete: "cascade" }),
      userId: (0, import_pg_core.varchar)("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
      status: (0, import_pg_core.varchar)("status", { length: 20 }).notNull().default("pending"),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.uniqueIndex)("moto_club_invites_unique_idx").on(table.clubId, table.userId),
      (0, import_pg_core.index)("moto_club_invites_user_idx").on(table.userId)
    ]);
    motoClubRequests = (0, import_pg_core.pgTable)("moto_club_requests", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      name: (0, import_pg_core.varchar)("name", { length: 200 }).notNull(),
      clubType: (0, import_pg_core.varchar)("club_type", { length: 20 }).notNull(),
      brandName: (0, import_pg_core.varchar)("brand_name", { length: 100 }),
      modelName: (0, import_pg_core.varchar)("model_name", { length: 100 }),
      requestedBy: (0, import_pg_core.varchar)("requested_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      status: (0, import_pg_core.varchar)("status", { length: 20 }).notNull().default("pending"),
      reviewedBy: (0, import_pg_core.varchar)("reviewed_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      reviewNote: (0, import_pg_core.text)("review_note"),
      parentClubId: (0, import_pg_core.varchar)("parent_club_id", { length: 36 }),
      latitude: (0, import_pg_core.doublePrecision)("latitude"),
      longitude: (0, import_pg_core.doublePrecision)("longitude"),
      inviteRadiusKm: (0, import_pg_core.integer)("invite_radius_km"),
      inviteUserIds: (0, import_pg_core.text)("invite_user_ids"),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow(),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
    });
    registerSchema = import_zod.z.object({
      nickname: import_zod.z.string().min(3).max(50),
      email: import_zod.z.string().email(),
      phone: import_zod.z.string().optional(),
      password: import_zod.z.string().min(8, "La password deve avere almeno 8 caratteri").regex(/[A-Z]/, "La password deve contenere almeno una lettera maiuscola").regex(/[a-z]/, "La password deve contenere almeno una lettera minuscola").regex(/[0-9]/, "La password deve contenere almeno un numero"),
      userType: import_zod.z.enum(["biker", "zavorrina", "coppia"]),
      sex: import_zod.z.enum(["M", "F"]).optional(),
      coupleSexConfig: import_zod.z.enum(["M+M", "M+F", "F+F"]).optional(),
      birthYear: import_zod.z.number().int().min(1940).max(2010).optional(),
      region: import_zod.z.string().max(100).optional(),
      country: import_zod.z.string().max(2).optional(),
      eulaAccepted: import_zod.z.literal(true, {
        errorMap: () => ({ message: "Devi accettare i termini di utilizzo" })
      }),
      invitationCode: import_zod.z.string().optional()
    });
    loginSchema = import_zod.z.object({
      identifier: import_zod.z.string().min(1, "Inserisci email o nickname"),
      password: import_zod.z.string().min(1, "Inserisci la password")
    });
    serverRestarts = (0, import_pg_core.pgTable)("server_restarts", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      startedAt: (0, import_pg_core.timestamp)("started_at").notNull().defaultNow(),
      reason: (0, import_pg_core.varchar)("reason", { length: 50 }).notNull().default("restart")
    });
    otaReleases = (0, import_pg_core.pgTable)("ota_releases", {
      id: (0, import_pg_core.varchar)("id", { length: 36 }).primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
      version: (0, import_pg_core.varchar)("version", { length: 50 }).notNull(),
      bundlePath: (0, import_pg_core.text)("bundle_path"),
      releaseNotes: (0, import_pg_core.text)("release_notes"),
      scheduledAt: (0, import_pg_core.timestamp)("scheduled_at"),
      publishedAt: (0, import_pg_core.timestamp)("published_at"),
      status: (0, import_pg_core.varchar)("status", { length: 20 }).notNull().default("draft"),
      createdBy: (0, import_pg_core.varchar)("created_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
      createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow(),
      updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
    }, (table) => [
      (0, import_pg_core.index)("ota_releases_status_idx").on(table.status)
    ]);
  }
});

// server/db.ts
var db_exports = {};
__export(db_exports, {
  db: () => db,
  pool: () => pool
});
var import_node_postgres, import_pg, Pool, pool, db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    import_node_postgres = require("drizzle-orm/node-postgres");
    import_pg = __toESM(require("pg"));
    init_schema();
    ({ Pool } = import_pg.default);
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?"
      );
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = (0, import_node_postgres.drizzle)(pool, { schema: schema_exports });
  }
});

// server/storage.ts
var storage_exports = {};
__export(storage_exports, {
  DatabaseStorage: () => DatabaseStorage,
  storage: () => storage
});
var import_drizzle_orm2, DatabaseStorage, storage;
var init_storage = __esm({
  "server/storage.ts"() {
    "use strict";
    import_drizzle_orm2 = require("drizzle-orm");
    init_db();
    init_schema();
    DatabaseStorage = class {
      async getUser(id) {
        const [user] = await db.select().from(users).where((0, import_drizzle_orm2.eq)(users.id, id)).limit(1);
        return user;
      }
      async getUserByNickname(nickname) {
        const [user] = await db.select().from(users).where(import_drizzle_orm2.sql`LOWER(${users.nickname}) = LOWER(${nickname})`).limit(1);
        return user;
      }
      async getUserByEmail(email) {
        const [user] = await db.select().from(users).where(import_drizzle_orm2.sql`LOWER(${users.email}) = LOWER(${email})`).limit(1);
        return user;
      }
      async createUser(data) {
        const [user] = await db.insert(users).values(data).returning();
        return user;
      }
      async updateUser(id, data) {
        const [user] = await db.update(users).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(users.id, id)).returning();
        return user;
      }
      async getUserPhotos(userId) {
        return db.select().from(userPhotos).where((0, import_drizzle_orm2.eq)(userPhotos.userId, userId)).orderBy((0, import_drizzle_orm2.asc)(userPhotos.sortOrder));
      }
      async createUserPhoto(data) {
        const [photo] = await db.insert(userPhotos).values(data).returning();
        return photo;
      }
      async deleteUserPhoto(id) {
        await db.delete(userPhotos).where((0, import_drizzle_orm2.eq)(userPhotos.id, id));
      }
      async getUserPhotoCount(userId) {
        const result = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(userPhotos).where((0, import_drizzle_orm2.eq)(userPhotos.userId, userId));
        return result[0]?.count ?? 0;
      }
      async getUserMotorcycles(userId) {
        return db.select().from(userMotorcycles).where((0, import_drizzle_orm2.eq)(userMotorcycles.userId, userId));
      }
      async createUserMotorcycle(data) {
        const [moto] = await db.insert(userMotorcycles).values(data).returning();
        return moto;
      }
      async updateUserMotorcycle(id, data) {
        const [moto] = await db.update(userMotorcycles).set(data).where((0, import_drizzle_orm2.eq)(userMotorcycles.id, id)).returning();
        return moto;
      }
      async deleteUserMotorcycle(id) {
        await db.delete(userMotorcycles).where((0, import_drizzle_orm2.eq)(userMotorcycles.id, id));
      }
      async searchUsers(query) {
        const pattern = `%${query}%`;
        const results = await db.select({ user: users, profile: userProfiles }).from(users).leftJoin(userProfiles, (0, import_drizzle_orm2.eq)(users.id, userProfiles.userId)).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.eq)(users.status, "active"),
            import_drizzle_orm2.sql`${users.nickname} ILIKE ${pattern}`
          )
        ).limit(20);
        return results.map((r) => ({ user: r.user, profile: r.profile }));
      }
      async getUserProfile(userId) {
        const [profile] = await db.select().from(userProfiles).where((0, import_drizzle_orm2.eq)(userProfiles.userId, userId)).limit(1);
        return profile;
      }
      async createUserProfile(data) {
        const [profile] = await db.insert(userProfiles).values(data).returning();
        return profile;
      }
      async updateUserProfile(userId, data) {
        const [profile] = await db.update(userProfiles).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(userProfiles.userId, userId)).returning();
        return profile;
      }
      async upsertUserProfile(userId, data) {
        const [profile] = await db.insert(userProfiles).values({ userId, ...data }).onConflictDoUpdate({
          target: userProfiles.userId,
          set: { ...data, updatedAt: /* @__PURE__ */ new Date() }
        }).returning();
        return profile;
      }
      async getProposals(filters) {
        if (filters?.status) {
          return db.select().from(proposals).where((0, import_drizzle_orm2.eq)(proposals.status, filters.status)).orderBy((0, import_drizzle_orm2.desc)(proposals.createdAt));
        }
        return db.select().from(proposals).orderBy((0, import_drizzle_orm2.desc)(proposals.createdAt));
      }
      async getProposal(id) {
        const [proposal] = await db.select().from(proposals).where((0, import_drizzle_orm2.eq)(proposals.id, id)).limit(1);
        return proposal;
      }
      async deleteProposal(id) {
        await db.delete(proposals).where((0, import_drizzle_orm2.eq)(proposals.id, id));
      }
      async createProposal(data) {
        const [proposal] = await db.insert(proposals).values(data).returning();
        return proposal;
      }
      async updateProposal(id, data) {
        const [proposal] = await db.update(proposals).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(proposals.id, id)).returning();
        return proposal;
      }
      async getProposalParticipants(proposalId) {
        return db.select().from(proposalParticipants).where((0, import_drizzle_orm2.eq)(proposalParticipants.proposalId, proposalId));
      }
      async addProposalParticipant(data) {
        const [participant] = await db.insert(proposalParticipants).values(data).returning();
        return participant;
      }
      async getActiveProposalsWithLocation() {
        return db.select().from(proposals).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.eq)(proposals.status, "active"),
            import_drizzle_orm2.sql`${proposals.departureLatitude} IS NOT NULL`,
            import_drizzle_orm2.sql`${proposals.departureLongitude} IS NOT NULL`,
            import_drizzle_orm2.sql`${proposals.searchType} IS NOT NULL`
          )
        );
      }
      async getProposalMatches(userId) {
        return db.select().from(proposalMatches).where(
          (0, import_drizzle_orm2.or)(
            (0, import_drizzle_orm2.eq)(proposalMatches.userId1, userId),
            (0, import_drizzle_orm2.eq)(proposalMatches.userId2, userId)
          )
        ).orderBy((0, import_drizzle_orm2.desc)(proposalMatches.createdAt));
      }
      async getProposalMatch(id) {
        const [match] = await db.select().from(proposalMatches).where((0, import_drizzle_orm2.eq)(proposalMatches.id, id));
        return match;
      }
      async createProposalMatch(data) {
        const [match] = await db.insert(proposalMatches).values(data).returning();
        return match;
      }
      async updateProposalMatch(id, data) {
        const [match] = await db.update(proposalMatches).set(data).where((0, import_drizzle_orm2.eq)(proposalMatches.id, id)).returning();
        return match;
      }
      async deleteProposalMatch(id, userId) {
        const [match] = await db.select().from(proposalMatches).where((0, import_drizzle_orm2.eq)(proposalMatches.id, id));
        if (!match) return false;
        if (match.userId1 !== userId && match.userId2 !== userId) return false;
        await db.delete(proposalMatches).where((0, import_drizzle_orm2.eq)(proposalMatches.id, id));
        return true;
      }
      async deleteRejectedProposalMatches(userId) {
        const rejected = await db.select().from(proposalMatches).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(proposalMatches.userId1, userId), (0, import_drizzle_orm2.eq)(proposalMatches.userId2, userId)),
            (0, import_drizzle_orm2.eq)(proposalMatches.status, "rejected")
          )
        );
        if (rejected.length === 0) return 0;
        await db.delete(proposalMatches).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(proposalMatches.userId1, userId), (0, import_drizzle_orm2.eq)(proposalMatches.userId2, userId)),
            (0, import_drizzle_orm2.eq)(proposalMatches.status, "rejected")
          )
        );
        return rejected.length;
      }
      async deletePendingProposalMatches(userId) {
        const pending = await db.select().from(proposalMatches).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(proposalMatches.userId1, userId), (0, import_drizzle_orm2.eq)(proposalMatches.userId2, userId)),
            (0, import_drizzle_orm2.eq)(proposalMatches.status, "pending")
          )
        );
        if (pending.length === 0) return 0;
        await db.delete(proposalMatches).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(proposalMatches.userId1, userId), (0, import_drizzle_orm2.eq)(proposalMatches.userId2, userId)),
            (0, import_drizzle_orm2.eq)(proposalMatches.status, "pending")
          )
        );
        return pending.length;
      }
      async findExistingMatch(proposalId1, proposalId2) {
        const [match] = await db.select().from(proposalMatches).where(
          (0, import_drizzle_orm2.or)(
            (0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(proposalMatches.proposalId1, proposalId1), (0, import_drizzle_orm2.eq)(proposalMatches.proposalId2, proposalId2)),
            (0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(proposalMatches.proposalId1, proposalId2), (0, import_drizzle_orm2.eq)(proposalMatches.proposalId2, proposalId1))
          )
        );
        return match;
      }
      async expireOldProposals() {
        const now = /* @__PURE__ */ new Date();
        const result = await db.update(proposals).set({ status: "expired", updatedAt: now }).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.eq)(proposals.status, "active"),
            import_drizzle_orm2.sql`${proposals.expiresAt} IS NOT NULL`,
            (0, import_drizzle_orm2.lte)(proposals.expiresAt, now)
          )
        ).returning();
        if (result.length > 0) {
          const expiredIds = result.map((p) => p.id);
          await db.update(proposalMatches).set({ status: "expired" }).where(
            (0, import_drizzle_orm2.and)(
              (0, import_drizzle_orm2.eq)(proposalMatches.status, "pending"),
              import_drizzle_orm2.sql`${proposalMatches.proposalId1} = ANY(${expiredIds})`,
              import_drizzle_orm2.sql`${proposalMatches.proposalId2} = ANY(${expiredIds})`
            )
          );
        }
        return result.length;
      }
      async deleteExpiredProposals() {
        const expiredProposalsList = await db.select({ id: proposals.id }).from(proposals).where((0, import_drizzle_orm2.eq)(proposals.status, "expired"));
        if (expiredProposalsList.length === 0) return 0;
        const expiredIds = expiredProposalsList.map((p) => p.id);
        await db.delete(proposalMatches).where(
          (0, import_drizzle_orm2.or)(
            (0, import_drizzle_orm2.inArray)(proposalMatches.proposalId1, expiredIds),
            (0, import_drizzle_orm2.inArray)(proposalMatches.proposalId2, expiredIds)
          )
        );
        await db.delete(proposalParticipants).where(
          (0, import_drizzle_orm2.inArray)(proposalParticipants.proposalId, expiredIds)
        );
        const deleted = await db.delete(proposals).where((0, import_drizzle_orm2.eq)(proposals.status, "expired")).returning();
        return deleted.length;
      }
      async getConversations(userId) {
        const participantRows = await db.select().from(conversationParticipants).where((0, import_drizzle_orm2.eq)(conversationParticipants.userId, userId));
        if (participantRows.length === 0) return [];
        const convIds = participantRows.map((p) => p.conversationId);
        return db.select().from(conversations).where((0, import_drizzle_orm2.inArray)(conversations.id, convIds)).orderBy((0, import_drizzle_orm2.desc)(conversations.updatedAt));
      }
      async getAllConversations() {
        return db.select().from(conversations).orderBy((0, import_drizzle_orm2.desc)(conversations.updatedAt));
      }
      async getConversation(id) {
        const [conv] = await db.select().from(conversations).where((0, import_drizzle_orm2.eq)(conversations.id, id)).limit(1);
        return conv;
      }
      async createConversation(data) {
        const [conv] = await db.insert(conversations).values(data).returning();
        return conv;
      }
      async deleteConversation(id) {
        await db.delete(messages).where((0, import_drizzle_orm2.eq)(messages.conversationId, id));
        await db.delete(conversationParticipants).where((0, import_drizzle_orm2.eq)(conversationParticipants.conversationId, id));
        await db.delete(conversations).where((0, import_drizzle_orm2.eq)(conversations.id, id));
      }
      async getConversationParticipants(conversationId) {
        return db.select().from(conversationParticipants).where((0, import_drizzle_orm2.eq)(conversationParticipants.conversationId, conversationId));
      }
      async addConversationParticipant(data) {
        const [participant] = await db.insert(conversationParticipants).values(data).returning();
        return participant;
      }
      async getMessages(conversationId, limit = 50, offset = 0) {
        return db.select().from(messages).where((0, import_drizzle_orm2.eq)(messages.conversationId, conversationId)).orderBy((0, import_drizzle_orm2.desc)(messages.createdAt)).limit(limit).offset(offset);
      }
      async createMessage(data) {
        const [message] = await db.insert(messages).values(data).returning();
        return message;
      }
      async updateConversationLastRead(conversationId, userId) {
        await db.update(conversationParticipants).set({ lastReadAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(conversationParticipants.conversationId, conversationId), (0, import_drizzle_orm2.eq)(conversationParticipants.userId, userId)));
      }
      async updateConversationTimestamp(conversationId) {
        await db.update(conversations).set({ updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(conversations.id, conversationId));
      }
      async getRoutes(userId) {
        return db.select().from(routes).where((0, import_drizzle_orm2.eq)(routes.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(routes.createdAt));
      }
      async getAllRoutes() {
        return db.select().from(routes).orderBy((0, import_drizzle_orm2.desc)(routes.createdAt));
      }
      async getRoute(id) {
        const [route] = await db.select().from(routes).where((0, import_drizzle_orm2.eq)(routes.id, id)).limit(1);
        return route;
      }
      async createRoute(data) {
        const [route] = await db.insert(routes).values(data).returning();
        return route;
      }
      async updateRoute(id, data) {
        const [route] = await db.update(routes).set(data).where((0, import_drizzle_orm2.eq)(routes.id, id)).returning();
        return route;
      }
      async getRoutePoints(routeId) {
        return db.select().from(routePoints).where((0, import_drizzle_orm2.eq)(routePoints.routeId, routeId)).orderBy((0, import_drizzle_orm2.asc)(routePoints.timestamp));
      }
      async createRoutePoints(data) {
        if (data.length === 0) return [];
        return db.insert(routePoints).values(data).returning();
      }
      async getPhotoContestEntries(weekNumber, year) {
        return db.select().from(photoContestEntries).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(photoContestEntries.weekNumber, weekNumber), (0, import_drizzle_orm2.eq)(photoContestEntries.year, year))).orderBy((0, import_drizzle_orm2.desc)(photoContestEntries.votesCount));
      }
      async createPhotoContestEntry(data) {
        const [entry] = await db.insert(photoContestEntries).values(data).returning();
        return entry;
      }
      async deletePhotoContestEntry(id) {
        await db.delete(photoContestEntries).where((0, import_drizzle_orm2.eq)(photoContestEntries.id, id));
      }
      async createPhotoVote(data) {
        const [vote] = await db.insert(photoVotes).values(data).returning();
        return vote;
      }
      async getPhotoVote(entryId, userId) {
        const [vote] = await db.select().from(photoVotes).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(photoVotes.entryId, entryId), (0, import_drizzle_orm2.eq)(photoVotes.userId, userId))).limit(1);
        return vote;
      }
      async getDailyVoteCount(userId, voteDate) {
        const [row] = await db.select().from(dailyVoteCounts).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(dailyVoteCounts.userId, userId), (0, import_drizzle_orm2.eq)(dailyVoteCounts.voteDate, voteDate))).limit(1);
        return row;
      }
      async upsertDailyVoteCount(userId, voteDate) {
        await db.insert(dailyVoteCounts).values({ userId, voteDate, count: 1 }).onConflictDoUpdate({
          target: [dailyVoteCounts.userId, dailyVoteCounts.voteDate],
          set: { count: import_drizzle_orm2.sql`${dailyVoteCounts.count} + 1` }
        });
      }
      async incrementEntryVotes(entryId) {
        await db.update(photoContestEntries).set({ votesCount: import_drizzle_orm2.sql`${photoContestEntries.votesCount} + 1` }).where((0, import_drizzle_orm2.eq)(photoContestEntries.id, entryId));
      }
      async getPhotoWinners() {
        return db.select().from(photoWinners).orderBy((0, import_drizzle_orm2.desc)(photoWinners.year), (0, import_drizzle_orm2.desc)(photoWinners.weekNumber));
      }
      async createPhotoWinner(data) {
        const [winner] = await db.insert(photoWinners).values(data).returning();
        return winner;
      }
      async getWorkshops(approved) {
        if (approved !== void 0) {
          return db.select().from(workshops).where((0, import_drizzle_orm2.eq)(workshops.isApproved, approved));
        }
        return db.select().from(workshops);
      }
      async getWorkshop(id) {
        const [workshop] = await db.select().from(workshops).where((0, import_drizzle_orm2.eq)(workshops.id, id)).limit(1);
        return workshop;
      }
      async createWorkshop(data) {
        const [workshop] = await db.insert(workshops).values(data).returning();
        return workshop;
      }
      async updateWorkshop(id, data) {
        const [workshop] = await db.update(workshops).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(workshops.id, id)).returning();
        return workshop;
      }
      async createWorkshopContact(data) {
        const [contact] = await db.insert(workshopContacts).values(data).returning();
        return contact;
      }
      async getEasterEggs(active) {
        if (active !== void 0) {
          return db.select().from(easterEggs).where((0, import_drizzle_orm2.eq)(easterEggs.isActive, active));
        }
        return db.select().from(easterEggs);
      }
      async getEasterEgg(id) {
        const [egg] = await db.select().from(easterEggs).where((0, import_drizzle_orm2.eq)(easterEggs.id, id)).limit(1);
        return egg;
      }
      async createEasterEgg(data) {
        const [egg] = await db.insert(easterEggs).values(data).returning();
        return egg;
      }
      async updateEasterEgg(id, data) {
        const [egg] = await db.update(easterEggs).set(data).where((0, import_drizzle_orm2.eq)(easterEggs.id, id)).returning();
        return egg;
      }
      async collectEasterEgg(data) {
        const [collected] = await db.insert(collectedEasterEggs).values(data).returning();
        return collected;
      }
      async getCollectedEasterEggs(userId) {
        return db.select().from(collectedEasterEggs).where((0, import_drizzle_orm2.eq)(collectedEasterEggs.userId, userId));
      }
      async hasCollectedEasterEgg(easterEggId, userId) {
        const [row] = await db.select().from(collectedEasterEggs).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(collectedEasterEggs.easterEggId, easterEggId), (0, import_drizzle_orm2.eq)(collectedEasterEggs.userId, userId))).limit(1);
        return !!row;
      }
      async getReports(status) {
        if (status) {
          return db.select().from(reports).where((0, import_drizzle_orm2.eq)(reports.status, status)).orderBy((0, import_drizzle_orm2.desc)(reports.createdAt));
        }
        return db.select().from(reports).orderBy((0, import_drizzle_orm2.desc)(reports.createdAt));
      }
      async createReport(data) {
        const [report] = await db.insert(reports).values(data).returning();
        return report;
      }
      async updateReport(id, data) {
        const [report] = await db.update(reports).set(data).where((0, import_drizzle_orm2.eq)(reports.id, id)).returning();
        return report;
      }
      async createModeratorLog(data) {
        const [log2] = await db.insert(moderatorLogs).values(data).returning();
        return log2;
      }
      async getActiveCampaigns() {
        return db.select().from(adCampaigns).where((0, import_drizzle_orm2.eq)(adCampaigns.isActive, true));
      }
      async getActiveAdsByUserType(userType) {
        return db.select().from(adCampaigns).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(adCampaigns.isActive, true), (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(adCampaigns.targetUserType, userType), (0, import_drizzle_orm2.eq)(adCampaigns.targetUserType, "tutti")))).orderBy((0, import_drizzle_orm2.asc)(adCampaigns.sortOrder));
      }
      async createAdCampaign(data) {
        const [campaign] = await db.insert(adCampaigns).values(data).returning();
        return campaign;
      }
      async updateAdCampaign(id, data) {
        const [campaign] = await db.update(adCampaigns).set(data).where((0, import_drizzle_orm2.eq)(adCampaigns.id, id)).returning();
        return campaign;
      }
      async createAdClick(data) {
        const [click] = await db.insert(adClicks).values(data).returning();
        return click;
      }
      async incrementCampaignImpressions(id) {
        await db.update(adCampaigns).set({ impressions: import_drizzle_orm2.sql`${adCampaigns.impressions} + 1` }).where((0, import_drizzle_orm2.eq)(adCampaigns.id, id));
      }
      async getNotifications(userId) {
        return db.select().from(notifications).where((0, import_drizzle_orm2.eq)(notifications.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(notifications.createdAt));
      }
      async createNotification(data) {
        const [notification] = await db.insert(notifications).values(data).returning();
        return notification;
      }
      async markNotificationRead(id) {
        await db.update(notifications).set({ isRead: true }).where((0, import_drizzle_orm2.eq)(notifications.id, id));
      }
      async getInvitationCodes() {
        return db.select().from(invitationCodes).orderBy((0, import_drizzle_orm2.desc)(invitationCodes.createdAt));
      }
      async getInvitationCode(code) {
        const [row] = await db.select().from(invitationCodes).where((0, import_drizzle_orm2.eq)(invitationCodes.code, code)).limit(1);
        return row;
      }
      async getInvitationCodeById(id) {
        const [row] = await db.select().from(invitationCodes).where((0, import_drizzle_orm2.eq)(invitationCodes.id, id)).limit(1);
        return row;
      }
      async createInvitationCode(data) {
        const [code] = await db.insert(invitationCodes).values(data).returning();
        return code;
      }
      async updateInvitationCode(id, data) {
        const [updated] = await db.update(invitationCodes).set(data).where((0, import_drizzle_orm2.eq)(invitationCodes.id, id)).returning();
        return updated;
      }
      async deleteInvitationCode(id) {
        await db.delete(invitationCodes).where((0, import_drizzle_orm2.eq)(invitationCodes.id, id));
      }
      async incrementInvitationCodeUses(id) {
        await db.update(invitationCodes).set({ currentUses: import_drizzle_orm2.sql`${invitationCodes.currentUses} + 1` }).where((0, import_drizzle_orm2.eq)(invitationCodes.id, id));
      }
      async countUsersWithInvitationCode() {
        const [row] = await db.select({ count: import_drizzle_orm2.sql`count(*)` }).from(users).where(import_drizzle_orm2.sql`${users.invitationCode} IS NOT NULL AND ${users.invitationCode} != ''`);
        return Number(row?.count ?? 0);
      }
      async countUsersByInvitationCode(code) {
        const [row] = await db.select({ count: import_drizzle_orm2.sql`count(*)` }).from(users).where((0, import_drizzle_orm2.eq)(users.invitationCode, code));
        return Number(row?.count ?? 0);
      }
      async getFeedbackTickets() {
        return db.select().from(feedbackTickets).orderBy((0, import_drizzle_orm2.desc)(feedbackTickets.createdAt));
      }
      async createFeedbackTicket(data) {
        const [ticket] = await db.insert(feedbackTickets).values(data).returning();
        return ticket;
      }
      async getAppSetting(key) {
        const [setting] = await db.select().from(appSettings).where((0, import_drizzle_orm2.eq)(appSettings.key, key)).limit(1);
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
      async getNearbyUsers(lat, lng, radiusKm, countries) {
        const conditions = [
          (0, import_drizzle_orm2.eq)(users.status, "active"),
          (0, import_drizzle_orm2.eq)(users.ghostMode, false),
          (0, import_drizzle_orm2.notInArray)(users.role, ["admin", "moderator", "moderatore"]),
          import_drizzle_orm2.sql`${userProfiles.latitude} IS NOT NULL`,
          import_drizzle_orm2.sql`${userProfiles.longitude} IS NOT NULL`
        ];
        if (countries && countries.length > 0) {
          conditions.push((0, import_drizzle_orm2.or)((0, import_drizzle_orm2.inArray)(users.country, countries), import_drizzle_orm2.sql`${users.country} IS NULL`));
        }
        const results = await db.select({
          user: users,
          profile: userProfiles,
          distance: import_drizzle_orm2.sql`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance")
        }).from(userProfiles).innerJoin(users, (0, import_drizzle_orm2.eq)(users.id, userProfiles.userId)).where((0, import_drizzle_orm2.and)(...conditions)).orderBy(import_drizzle_orm2.sql`distance`);
        return results;
      }
      async getUserMotorcycle(id) {
        const [moto] = await db.select().from(userMotorcycles).where((0, import_drizzle_orm2.eq)(userMotorcycles.id, id)).limit(1);
        return moto;
      }
      async getUserPhoto(id) {
        const [photo] = await db.select().from(userPhotos).where((0, import_drizzle_orm2.eq)(userPhotos.id, id)).limit(1);
        return photo;
      }
      async getAllUsers() {
        return db.select().from(users).orderBy((0, import_drizzle_orm2.desc)(users.createdAt));
      }
      async getModeratorLogs() {
        return db.select().from(moderatorLogs).orderBy((0, import_drizzle_orm2.desc)(moderatorLogs.createdAt));
      }
      async getAllCampaigns() {
        return db.select().from(adCampaigns).orderBy((0, import_drizzle_orm2.desc)(adCampaigns.createdAt));
      }
      async deleteEasterEgg(id) {
        await db.delete(easterEggs).where((0, import_drizzle_orm2.eq)(easterEggs.id, id));
      }
      async deleteWorkshop(id) {
        await db.delete(workshops).where((0, import_drizzle_orm2.eq)(workshops.id, id));
      }
      async deleteCampaign(id) {
        await db.delete(adCampaigns).where((0, import_drizzle_orm2.eq)(adCampaigns.id, id));
      }
      async getAllAppSettings() {
        return db.select().from(appSettings);
      }
      async getWorkshopContactsByPeriod(startDate, endDate) {
        return db.select().from(workshopContacts).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.gte)(workshopContacts.createdAt, startDate), (0, import_drizzle_orm2.lte)(workshopContacts.createdAt, endDate)));
      }
      async countUsers() {
        const result = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(users);
        return result[0]?.count ?? 0;
      }
      async countActiveUsers(since) {
        const result = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(users).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(users.status, "active"), (0, import_drizzle_orm2.eq)(users.isFake, false), (0, import_drizzle_orm2.gte)(users.lastLoginAt, since)));
        return result[0]?.count ?? 0;
      }
      async countOnlineUsers(since, countries) {
        const conditions = [(0, import_drizzle_orm2.eq)(users.status, "active"), (0, import_drizzle_orm2.gte)(users.lastLoginAt, since), (0, import_drizzle_orm2.eq)(users.ghostMode, false)];
        if (countries && countries.length > 0) conditions.push((0, import_drizzle_orm2.inArray)(users.country, countries));
        const result = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(users).where((0, import_drizzle_orm2.and)(...conditions));
        return result[0]?.count ?? 0;
      }
      async countAvailableUsers(since) {
        const conditions = [(0, import_drizzle_orm2.eq)(users.status, "active"), (0, import_drizzle_orm2.eq)(userProfiles.isAvailable, true), (0, import_drizzle_orm2.eq)(users.ghostMode, false)];
        if (since) conditions.push((0, import_drizzle_orm2.gte)(users.lastLoginAt, since));
        const result = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(userProfiles).innerJoin(users, (0, import_drizzle_orm2.eq)(users.id, userProfiles.userId)).where((0, import_drizzle_orm2.and)(...conditions));
        return result[0]?.count ?? 0;
      }
      async getOnlineUsersList(since, lat, lng, countries) {
        const distanceExpr = lat != null && lng != null ? import_drizzle_orm2.sql`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance") : import_drizzle_orm2.sql`0`.as("distance");
        const conditions = [(0, import_drizzle_orm2.eq)(users.status, "active"), (0, import_drizzle_orm2.gte)(users.lastLoginAt, since), (0, import_drizzle_orm2.eq)(users.ghostMode, false), (0, import_drizzle_orm2.notInArray)(users.role, ["admin", "moderator", "moderatore"])];
        if (countries && countries.length > 0) {
          conditions.push((0, import_drizzle_orm2.inArray)(users.country, countries));
        }
        const results = await db.select({ user: users, profile: userProfiles, distance: distanceExpr }).from(users).leftJoin(userProfiles, (0, import_drizzle_orm2.eq)(userProfiles.userId, users.id)).where((0, import_drizzle_orm2.and)(...conditions)).orderBy(import_drizzle_orm2.sql`distance`);
        return results;
      }
      async getAvailableUsersList(since, lat, lng) {
        const distanceExpr = lat != null && lng != null ? import_drizzle_orm2.sql`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance") : import_drizzle_orm2.sql`0`.as("distance");
        const results = await db.select({ user: users, profile: userProfiles, distance: distanceExpr }).from(userProfiles).innerJoin(users, (0, import_drizzle_orm2.eq)(users.id, userProfiles.userId)).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(users.status, "active"), (0, import_drizzle_orm2.eq)(userProfiles.isAvailable, true), (0, import_drizzle_orm2.gte)(users.lastLoginAt, since), (0, import_drizzle_orm2.eq)(users.ghostMode, false))).orderBy(import_drizzle_orm2.sql`distance`);
        return results;
      }
      async getUnapprovedUserPhotos() {
        return db.select().from(userPhotos).where((0, import_drizzle_orm2.eq)(userPhotos.isApproved, false)).orderBy((0, import_drizzle_orm2.asc)(userPhotos.createdAt));
      }
      async updateUserPhotoApproval(id, approved) {
        const [photo] = await db.update(userPhotos).set({ isApproved: approved }).where((0, import_drizzle_orm2.eq)(userPhotos.id, id)).returning();
        return photo;
      }
      async getUnapprovedContestEntries() {
        return db.select().from(photoContestEntries).where((0, import_drizzle_orm2.eq)(photoContestEntries.isApproved, false)).orderBy((0, import_drizzle_orm2.asc)(photoContestEntries.createdAt));
      }
      async updateContestEntryApproval(id, approved) {
        const [entry] = await db.update(photoContestEntries).set({ isApproved: approved }).where((0, import_drizzle_orm2.eq)(photoContestEntries.id, id)).returning();
        return entry;
      }
      async getPhotoContestEntry(id) {
        const [entry] = await db.select().from(photoContestEntries).where((0, import_drizzle_orm2.eq)(photoContestEntries.id, id)).limit(1);
        return entry;
      }
      async getPhoneSharedCount(conversationId, userId) {
        const [row] = await db.select().from(phoneSharingTracker).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(phoneSharingTracker.conversationId, conversationId), (0, import_drizzle_orm2.eq)(phoneSharingTracker.userId, userId))).limit(1);
        return row?.sharedCount ?? 0;
      }
      async incrementPhoneSharedCount(conversationId, userId) {
        await db.insert(phoneSharingTracker).values({ conversationId, userId, sharedCount: 1 }).onConflictDoUpdate({
          target: [phoneSharingTracker.conversationId, phoneSharingTracker.userId],
          set: { sharedCount: import_drizzle_orm2.sql`${phoneSharingTracker.sharedCount} + 1` }
        });
      }
      async createPasswordResetToken(userId, token, expiresAt) {
        await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
      }
      async getPasswordResetToken(token) {
        const [row] = await db.select().from(passwordResetTokens).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(passwordResetTokens.token, token), (0, import_drizzle_orm2.eq)(passwordResetTokens.used, false))).limit(1);
        return row;
      }
      async getPasswordResetTokenByCode(userId, code) {
        const [row] = await db.select().from(passwordResetTokens).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(passwordResetTokens.userId, userId), (0, import_drizzle_orm2.eq)(passwordResetTokens.token, code), (0, import_drizzle_orm2.eq)(passwordResetTokens.used, false))).limit(1);
        return row;
      }
      async markPasswordResetTokenUsed(token) {
        await db.update(passwordResetTokens).set({ used: true }).where((0, import_drizzle_orm2.eq)(passwordResetTokens.token, token));
      }
      async markPasswordResetTokenUsedById(id) {
        await db.update(passwordResetTokens).set({ used: true }).where((0, import_drizzle_orm2.eq)(passwordResetTokens.id, id));
      }
      async deletePasswordResetTokens(userId) {
        await db.delete(passwordResetTokens).where((0, import_drizzle_orm2.eq)(passwordResetTokens.userId, userId));
      }
      async getMotorcyclePhotos(motorcycleId) {
        return db.select().from(motorcyclePhotos).where((0, import_drizzle_orm2.eq)(motorcyclePhotos.motorcycleId, motorcycleId)).orderBy((0, import_drizzle_orm2.asc)(motorcyclePhotos.sortOrder));
      }
      async addMotorcyclePhoto(data) {
        const [photo] = await db.insert(motorcyclePhotos).values(data).returning();
        return photo;
      }
      async deleteMotorcyclePhoto(id) {
        await db.delete(motorcyclePhotos).where((0, import_drizzle_orm2.eq)(motorcyclePhotos.id, id));
      }
      async getMotorcyclePhotoCount(motorcycleId) {
        const result = await db.select({ count: import_drizzle_orm2.sql`count(*)` }).from(motorcyclePhotos).where((0, import_drizzle_orm2.eq)(motorcyclePhotos.motorcycleId, motorcycleId));
        return Number(result[0]?.count ?? 0);
      }
      async getWishlist(userId) {
        const [wl] = await db.select().from(zavarrinaWishlists).where((0, import_drizzle_orm2.eq)(zavarrinaWishlists.userId, userId)).limit(1);
        return wl;
      }
      async createOrUpdateWishlist(userId, description) {
        const existing = await this.getWishlist(userId);
        if (existing) {
          const [wl2] = await db.update(zavarrinaWishlists).set({ description, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(zavarrinaWishlists.id, existing.id)).returning();
          return wl2;
        }
        const [wl] = await db.insert(zavarrinaWishlists).values({ userId, description }).returning();
        return wl;
      }
      async getWishlistPhotos(wishlistId) {
        return db.select().from(zavarrinaWishlistPhotos).where((0, import_drizzle_orm2.eq)(zavarrinaWishlistPhotos.wishlistId, wishlistId)).orderBy((0, import_drizzle_orm2.asc)(zavarrinaWishlistPhotos.sortOrder));
      }
      async addWishlistPhoto(data) {
        const [photo] = await db.insert(zavarrinaWishlistPhotos).values(data).returning();
        return photo;
      }
      async deleteWishlistPhoto(id) {
        await db.delete(zavarrinaWishlistPhotos).where((0, import_drizzle_orm2.eq)(zavarrinaWishlistPhotos.id, id));
      }
      async getWishlistPhotoCount(wishlistId) {
        const result = await db.select({ count: import_drizzle_orm2.sql`count(*)` }).from(zavarrinaWishlistPhotos).where((0, import_drizzle_orm2.eq)(zavarrinaWishlistPhotos.wishlistId, wishlistId));
        return Number(result[0]?.count ?? 0);
      }
      async getWishlistMoto(id) {
        const [moto] = await db.select().from(zavarrinaWishlistMotos).where((0, import_drizzle_orm2.eq)(zavarrinaWishlistMotos.id, id)).limit(1);
        return moto;
      }
      async getWishlistMotos(wishlistId) {
        return db.select().from(zavarrinaWishlistMotos).where((0, import_drizzle_orm2.eq)(zavarrinaWishlistMotos.wishlistId, wishlistId));
      }
      async addWishlistMoto(data) {
        const [moto] = await db.insert(zavarrinaWishlistMotos).values(data).returning();
        return moto;
      }
      async updateWishlistMoto(id, data) {
        const [moto] = await db.update(zavarrinaWishlistMotos).set(data).where((0, import_drizzle_orm2.eq)(zavarrinaWishlistMotos.id, id)).returning();
        return moto;
      }
      async deleteWishlistMoto(id) {
        await db.delete(zavarrinaWishlistMotos).where((0, import_drizzle_orm2.eq)(zavarrinaWishlistMotos.id, id));
      }
      async getWishlistMotoCount(wishlistId) {
        const result = await db.select({ count: import_drizzle_orm2.sql`count(*)` }).from(zavarrinaWishlistMotos).where((0, import_drizzle_orm2.eq)(zavarrinaWishlistMotos.wishlistId, wishlistId));
        return Number(result[0]?.count ?? 0);
      }
      async findMatchingWishlistMotos(brand, model, ridingStyle, motorcycleType) {
        const brandModelMatch = (0, import_drizzle_orm2.and)(
          import_drizzle_orm2.sql`${zavarrinaWishlistMotos.brand} IS NOT NULL AND ${zavarrinaWishlistMotos.brand} != ''`,
          import_drizzle_orm2.sql`${zavarrinaWishlistMotos.model} IS NOT NULL AND ${zavarrinaWishlistMotos.model} != ''`,
          import_drizzle_orm2.sql`LOWER(${zavarrinaWishlistMotos.brand}) = LOWER(${brand})`,
          import_drizzle_orm2.sql`(LOWER(${zavarrinaWishlistMotos.model}) LIKE '%' || LOWER(${model}) || '%' OR LOWER(${model}) LIKE '%' || LOWER(${zavarrinaWishlistMotos.model}) || '%')`,
          import_drizzle_orm2.sql`LOWER(${zavarrinaWishlistMotos.ridingStyle}) = LOWER(${ridingStyle})`
        );
        const typeMatch = (0, import_drizzle_orm2.and)(
          import_drizzle_orm2.sql`(${zavarrinaWishlistMotos.brand} IS NULL OR ${zavarrinaWishlistMotos.brand} = '')`,
          import_drizzle_orm2.sql`(${zavarrinaWishlistMotos.model} IS NULL OR ${zavarrinaWishlistMotos.model} = '')`,
          import_drizzle_orm2.sql`${zavarrinaWishlistMotos.motorcycleType} IS NOT NULL AND ${zavarrinaWishlistMotos.motorcycleType} != ''`,
          import_drizzle_orm2.sql`LOWER(${zavarrinaWishlistMotos.motorcycleType}) = LOWER(${motorcycleType})`,
          import_drizzle_orm2.sql`LOWER(${zavarrinaWishlistMotos.ridingStyle}) = LOWER(${ridingStyle})`
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
        }).from(zavarrinaWishlistMotos).innerJoin(zavarrinaWishlists, (0, import_drizzle_orm2.eq)(zavarrinaWishlistMotos.wishlistId, zavarrinaWishlists.id)).where((0, import_drizzle_orm2.or)(brandModelMatch, typeMatch));
        return results;
      }
      async findMatchingBikerMotos(brand, model, ridingStyle, motorcycleType) {
        if (brand && model) {
          return db.select().from(userMotorcycles).where((0, import_drizzle_orm2.and)(
            import_drizzle_orm2.sql`LOWER(${userMotorcycles.brand}) = LOWER(${brand})`,
            import_drizzle_orm2.sql`(LOWER(${userMotorcycles.model}) LIKE '%' || LOWER(${model}) || '%' OR LOWER(${model}) LIKE '%' || LOWER(${userMotorcycles.model}) || '%')`,
            import_drizzle_orm2.sql`LOWER(${userMotorcycles.ridingStyle}) = LOWER(${ridingStyle})`
          ));
        }
        if (motorcycleType) {
          return db.select().from(userMotorcycles).where((0, import_drizzle_orm2.and)(
            import_drizzle_orm2.sql`LOWER(${userMotorcycles.motorcycleType}) = LOWER(${motorcycleType})`,
            import_drizzle_orm2.sql`LOWER(${userMotorcycles.ridingStyle}) = LOWER(${ridingStyle})`
          ));
        }
        return [];
      }
      async createMatch(data) {
        const [match] = await db.insert(bikerZavarrinaMatches).values(data).onConflictDoNothing().returning();
        return match ?? null;
      }
      async getMatchesForUser(userId) {
        return db.select().from(bikerZavarrinaMatches).where(
          (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.bikerId, userId), (0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.zavarrinaId, userId))
        ).orderBy(
          import_drizzle_orm2.sql`CASE WHEN ${bikerZavarrinaMatches.status} = 'accepted' THEN 0 WHEN ${bikerZavarrinaMatches.status} = 'new' THEN 1 ELSE 2 END`,
          (0, import_drizzle_orm2.desc)(bikerZavarrinaMatches.createdAt)
        ).limit(200);
      }
      async getGarageMatch(id) {
        const [match] = await db.select().from(bikerZavarrinaMatches).where((0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.id, id));
        return match;
      }
      async updateGarageMatch(id, data) {
        const [updated] = await db.update(bikerZavarrinaMatches).set(data).where((0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.id, id)).returning();
        return updated;
      }
      async deleteGarageMatch(id, userId) {
        const [match] = await db.select().from(bikerZavarrinaMatches).where((0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.id, id));
        if (!match) return false;
        if (match.bikerId !== userId && match.zavarrinaId !== userId) return false;
        await db.delete(bikerZavarrinaMatches).where((0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.id, id));
        return true;
      }
      async resetGarageMatchToNew(id, userId) {
        const [match] = await db.select().from(bikerZavarrinaMatches).where((0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.id, id));
        if (!match) return false;
        if (match.bikerId !== userId && match.zavarrinaId !== userId) return false;
        await this.updateGarageMatch(id, { status: "new" });
        return true;
      }
      async deleteRejectedGarageMatches(userId) {
        const rejected = await db.select().from(bikerZavarrinaMatches).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.bikerId, userId), (0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.zavarrinaId, userId)),
            (0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.status, "rejected")
          )
        );
        if (rejected.length === 0) return 0;
        await db.delete(bikerZavarrinaMatches).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.bikerId, userId), (0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.zavarrinaId, userId)),
            (0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.status, "rejected")
          )
        );
        return rejected.length;
      }
      async deleteNewGarageMatches(userId) {
        const newMatches = await db.select().from(bikerZavarrinaMatches).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.bikerId, userId), (0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.zavarrinaId, userId)),
            (0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.status, "new")
          )
        );
        if (newMatches.length === 0) return 0;
        await db.delete(bikerZavarrinaMatches).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.bikerId, userId), (0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.zavarrinaId, userId)),
            (0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.status, "new")
          )
        );
        return newMatches.length;
      }
      async getAllWishlistMotosWithUsers(countries) {
        let query = db.select({
          wishlistMoto: zavarrinaWishlistMotos,
          userId: zavarrinaWishlists.userId
        }).from(zavarrinaWishlistMotos).innerJoin(zavarrinaWishlists, (0, import_drizzle_orm2.eq)(zavarrinaWishlists.id, zavarrinaWishlistMotos.wishlistId)).innerJoin(users, (0, import_drizzle_orm2.eq)(users.id, zavarrinaWishlists.userId));
        if (countries && countries.length > 0) {
          return query.where((0, import_drizzle_orm2.inArray)(users.country, countries));
        }
        return query;
      }
      async getAllBikerMotorcyclesWithUsers(countries) {
        const baseCondition = (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(users.userType, "biker"), (0, import_drizzle_orm2.eq)(users.userType, "coppia"));
        const condition = countries && countries.length > 0 ? (0, import_drizzle_orm2.and)(baseCondition, (0, import_drizzle_orm2.inArray)(users.country, countries)) : baseCondition;
        const results = await db.select({
          motorcycle: userMotorcycles,
          userId: userMotorcycles.userId
        }).from(userMotorcycles).innerJoin(users, (0, import_drizzle_orm2.eq)(users.id, userMotorcycles.userId)).where(condition);
        return results;
      }
      async findExistingBikerZavarrinaMatch(bikerId, zavarrinaId, bikerMotorcycleId, wishlistMotoId) {
        const [match] = await db.select().from(bikerZavarrinaMatches).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.bikerId, bikerId),
            (0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.zavarrinaId, zavarrinaId),
            (0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.bikerMotorcycleId, bikerMotorcycleId),
            (0, import_drizzle_orm2.eq)(bikerZavarrinaMatches.wishlistMotoId, wishlistMotoId)
          )
        ).limit(1);
        return match;
      }
      async getAllExistingBikerZavarrinaMatchKeys() {
        const rows = await db.select({
          bikerId: bikerZavarrinaMatches.bikerId,
          zavarrinaId: bikerZavarrinaMatches.zavarrinaId,
          bikerMotorcycleId: bikerZavarrinaMatches.bikerMotorcycleId,
          wishlistMotoId: bikerZavarrinaMatches.wishlistMotoId
        }).from(bikerZavarrinaMatches);
        const keys = /* @__PURE__ */ new Set();
        for (const r of rows) {
          keys.add(`${r.bikerId}:${r.zavarrinaId}:${r.bikerMotorcycleId}:${r.wishlistMotoId}`);
        }
        return keys;
      }
      async getAllExistingProposalMatchKeys() {
        const rows = await db.select({
          proposalId1: proposalMatches.proposalId1,
          proposalId2: proposalMatches.proposalId2
        }).from(proposalMatches);
        const keys = /* @__PURE__ */ new Set();
        for (const r of rows) {
          keys.add(`${r.proposalId1}:${r.proposalId2}`);
          keys.add(`${r.proposalId2}:${r.proposalId1}`);
        }
        return keys;
      }
      async countAvailableBikers(since, countries) {
        const conditions = [
          (0, import_drizzle_orm2.eq)(users.status, "active"),
          (0, import_drizzle_orm2.eq)(userProfiles.isAvailable, true),
          (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(users.userType, "biker"), (0, import_drizzle_orm2.eq)(users.userType, "coppia")),
          (0, import_drizzle_orm2.eq)(users.ghostMode, false),
          (0, import_drizzle_orm2.gte)(users.lastLoginAt, since)
        ];
        if (countries && countries.length > 0) conditions.push((0, import_drizzle_orm2.inArray)(users.country, countries));
        const result = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(userProfiles).innerJoin(users, (0, import_drizzle_orm2.eq)(users.id, userProfiles.userId)).where((0, import_drizzle_orm2.and)(...conditions));
        return result[0]?.count ?? 0;
      }
      async countAvailableZavorrine(since, countries) {
        const conditions = [
          (0, import_drizzle_orm2.eq)(users.status, "active"),
          (0, import_drizzle_orm2.eq)(userProfiles.isAvailable, true),
          (0, import_drizzle_orm2.eq)(users.userType, "zavorrina"),
          (0, import_drizzle_orm2.eq)(users.ghostMode, false),
          (0, import_drizzle_orm2.gte)(users.lastLoginAt, since)
        ];
        if (countries && countries.length > 0) conditions.push((0, import_drizzle_orm2.inArray)(users.country, countries));
        const result = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(userProfiles).innerJoin(users, (0, import_drizzle_orm2.eq)(users.id, userProfiles.userId)).where((0, import_drizzle_orm2.and)(...conditions));
        return result[0]?.count ?? 0;
      }
      async getAvailableBikersList(since, lat, lng, countries) {
        const distanceExpr = lat != null && lng != null ? import_drizzle_orm2.sql`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance") : import_drizzle_orm2.sql`0`.as("distance");
        const conditions = [
          (0, import_drizzle_orm2.eq)(users.status, "active"),
          (0, import_drizzle_orm2.eq)(userProfiles.isAvailable, true),
          (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(users.userType, "biker"), (0, import_drizzle_orm2.eq)(users.userType, "coppia")),
          (0, import_drizzle_orm2.eq)(users.ghostMode, false),
          (0, import_drizzle_orm2.gte)(users.lastLoginAt, since)
        ];
        if (countries && countries.length > 0) {
          conditions.push((0, import_drizzle_orm2.inArray)(users.country, countries));
        }
        return db.select({ user: users, profile: userProfiles, distance: distanceExpr }).from(userProfiles).innerJoin(users, (0, import_drizzle_orm2.eq)(users.id, userProfiles.userId)).where((0, import_drizzle_orm2.and)(...conditions)).orderBy(import_drizzle_orm2.sql`distance`);
      }
      async getAvailableZavorrinaList(since, lat, lng, countries) {
        const distanceExpr = lat != null && lng != null ? import_drizzle_orm2.sql`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance") : import_drizzle_orm2.sql`0`.as("distance");
        const conditions = [
          (0, import_drizzle_orm2.eq)(users.status, "active"),
          (0, import_drizzle_orm2.eq)(userProfiles.isAvailable, true),
          (0, import_drizzle_orm2.eq)(users.userType, "zavorrina"),
          (0, import_drizzle_orm2.eq)(users.ghostMode, false),
          (0, import_drizzle_orm2.gte)(users.lastLoginAt, since)
        ];
        if (countries && countries.length > 0) {
          conditions.push((0, import_drizzle_orm2.inArray)(users.country, countries));
        }
        return db.select({ user: users, profile: userProfiles, distance: distanceExpr }).from(userProfiles).innerJoin(users, (0, import_drizzle_orm2.eq)(users.id, userProfiles.userId)).where((0, import_drizzle_orm2.and)(...conditions)).orderBy(import_drizzle_orm2.sql`distance`);
      }
      async createEmailVerificationToken(userId, token, expiresAt) {
        await db.insert(emailVerificationTokens).values({ userId, token, expiresAt });
      }
      async getEmailVerificationToken(token) {
        const [row] = await db.select().from(emailVerificationTokens).where((0, import_drizzle_orm2.eq)(emailVerificationTokens.token, token)).limit(1);
        return row;
      }
      async deleteEmailVerificationTokens(userId) {
        await db.delete(emailVerificationTokens).where((0, import_drizzle_orm2.eq)(emailVerificationTokens.userId, userId));
      }
      async markUserEmailVerified(userId) {
        await db.update(users).set({ emailVerified: true }).where((0, import_drizzle_orm2.eq)(users.id, userId));
      }
      async requestUserDeletion(userId) {
        const now = /* @__PURE__ */ new Date();
        const scheduledFor = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1e3);
        await db.update(users).set({
          deletionRequestedAt: now,
          deletionScheduledFor: scheduledFor
        }).where((0, import_drizzle_orm2.eq)(users.id, userId));
      }
      async cancelUserDeletion(userId) {
        await db.update(users).set({
          deletionRequestedAt: null,
          deletionScheduledFor: null
        }).where((0, import_drizzle_orm2.eq)(users.id, userId));
      }
      async deleteUser(userId) {
        await db.delete(users).where((0, import_drizzle_orm2.eq)(users.id, userId));
      }
      async recordFakeUserInteraction(fakeUserId, realUserId, interactionType) {
        await db.insert(fakeUserInteractions).values({ fakeUserId, realUserId, interactionType });
      }
      async getFakeUserStats(limit = 50, offset = 0, type = "tutti") {
        const baseCondition = (0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(users.isFake, true), import_drizzle_orm2.sql`${users.nickname} != 'BikerLink_Official'`);
        const typeCondition = type !== "tutti" ? (0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(users.isFake, true), import_drizzle_orm2.sql`${users.nickname} != 'BikerLink_Official'`, (0, import_drizzle_orm2.eq)(users.userType, type)) : baseCondition;
        const [[{ total }], [statsRow], fakeUsers] = await Promise.all([
          db.select({ total: import_drizzle_orm2.sql`count(*)::int` }).from(users).where(typeCondition),
          db.select({
            total: import_drizzle_orm2.sql`count(*)::int`,
            biker: import_drizzle_orm2.sql`count(*) filter (where ${users.userType} = 'biker')::int`,
            zavorrina: import_drizzle_orm2.sql`count(*) filter (where ${users.userType} = 'zavorrina')::int`,
            coppia: import_drizzle_orm2.sql`count(*) filter (where ${users.userType} = 'coppia')::int`
          }).from(users).where(baseCondition),
          db.select().from(users).where(typeCondition).orderBy((0, import_drizzle_orm2.desc)(users.createdAt)).limit(limit).offset(offset)
        ]);
        const userIds = fakeUsers.map((u) => u.id);
        const [profiles, interactionCounts] = await Promise.all([
          userIds.length > 0 ? db.select().from(userProfiles).where((0, import_drizzle_orm2.inArray)(userProfiles.userId, userIds)) : Promise.resolve([]),
          userIds.length > 0 ? db.select({
            fakeUserId: fakeUserInteractions.fakeUserId,
            profileViews: import_drizzle_orm2.sql`count(*) filter (where ${fakeUserInteractions.interactionType} = 'profile_view')::int`,
            chatRequests: import_drizzle_orm2.sql`count(*) filter (where ${fakeUserInteractions.interactionType} = 'chat_request')::int`,
            chatMessages: import_drizzle_orm2.sql`count(*) filter (where ${fakeUserInteractions.interactionType} = 'chat_message')::int`
          }).from(fakeUserInteractions).where((0, import_drizzle_orm2.inArray)(fakeUserInteractions.fakeUserId, userIds)).groupBy(fakeUserInteractions.fakeUserId) : Promise.resolve([])
        ]);
        const profileMap = new Map(profiles.map((p) => [p.userId, p]));
        const countsMap = new Map(interactionCounts.map((r) => [r.fakeUserId, r]));
        const result = fakeUsers.map((u) => {
          const { password: _, ...safeUser } = u;
          const counts = countsMap.get(u.id);
          return {
            ...safeUser,
            profile: profileMap.get(u.id) ?? null,
            profileViews: counts?.profileViews ?? 0,
            chatRequests: counts?.chatRequests ?? 0,
            chatMessages: counts?.chatMessages ?? 0
          };
        });
        return {
          users: result,
          total,
          hasMore: offset + fakeUsers.length < total,
          stats: {
            total: statsRow?.total ?? 0,
            biker: statsRow?.biker ?? 0,
            zavorrina: statsRow?.zavorrina ?? 0,
            coppia: statsRow?.coppia ?? 0
          }
        };
      }
      async getFakeUsers() {
        return db.select().from(users).where(
          (0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(users.isFake, true), import_drizzle_orm2.sql`${users.nickname} != 'BikerLink_Official'`)
        ).orderBy((0, import_drizzle_orm2.desc)(users.createdAt));
      }
      async deleteFakeUser(id) {
        const fakeCondition = (0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(users.id, id), (0, import_drizzle_orm2.eq)(users.isFake, true), import_drizzle_orm2.sql`${users.nickname} != 'BikerLink_Official'`);
        const [fakeUser] = await db.select({ id: users.id }).from(users).where(fakeCondition).limit(1);
        if (!fakeUser) return;
        await db.transaction(async (tx) => {
          await tx.delete(userMotorcycles).where((0, import_drizzle_orm2.eq)(userMotorcycles.userId, id));
          await tx.delete(users).where(fakeCondition);
        });
      }
      async deleteAllFakeUsers() {
        const condition = (0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(users.isFake, true), import_drizzle_orm2.sql`${users.nickname} != 'BikerLink_Official'`);
        const [{ count: count3 }] = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(users).where(condition);
        console.log(`[Admin] deleteAllFakeUsers: trovati ${count3} utenti fake da eliminare`);
        if (count3 === 0) return 0;
        await db.transaction(async (tx) => {
          await tx.execute(import_drizzle_orm2.sql`
        DELETE FROM user_motorcycles
        WHERE user_id IN (
          SELECT id FROM users WHERE is_fake = true AND nickname != 'BikerLink_Official'
        )
      `);
          console.log(`[Admin] deleteAllFakeUsers: eliminate moto associate agli utenti fake`);
          await tx.delete(users).where(condition);
          console.log(`[Admin] deleteAllFakeUsers: eliminati ${count3} utenti fake`);
          await tx.execute(import_drizzle_orm2.sql`
        DELETE FROM conversations
        WHERE id IN (
          SELECT c.id FROM conversations c
          LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
          WHERE c.conversation_type != 'motoclub'
          GROUP BY c.id
          HAVING count(cp.id) = 0
        )
      `);
          const officialUser = await tx.select({ id: users.id }).from(users).where(import_drizzle_orm2.sql`${users.nickname} = 'BikerLink_Official'`).limit(1);
          if (officialUser.length > 0) {
            await tx.execute(import_drizzle_orm2.sql`
          DELETE FROM conversations
          WHERE id IN (
            SELECT c.id FROM conversations c
            INNER JOIN conversation_participants cp ON cp.conversation_id = c.id
            WHERE c.conversation_type != 'motoclub'
            GROUP BY c.id
            HAVING count(cp.id) = 1
              AND max(cp.user_id) = ${officialUser[0].id}
          )
        `);
          }
        });
        console.log(`[Admin] deleteAllFakeUsers: pulizia conversation orfane completata`);
        return count3;
      }
      async toggleFakeZavorrineAvailability() {
        const globalToggle = await this.getAppSetting("fake_users_enabled");
        if (globalToggle && globalToggle.value === "false") {
          return;
        }
        const fakeZavorrine2 = await db.select({ id: users.id, profileUserId: userProfiles.userId, adminOverrideUntil: userProfiles.adminOverrideUntil }).from(users).innerJoin(userProfiles, (0, import_drizzle_orm2.eq)(userProfiles.userId, users.id)).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(users.isFake, true), (0, import_drizzle_orm2.eq)(users.userType, "zavorrina")));
        const now = /* @__PURE__ */ new Date();
        for (const z3 of fakeZavorrine2) {
          if (z3.adminOverrideUntil && new Date(z3.adminOverrideUntil) > now) continue;
          const available = Math.random() < 0.55;
          await db.update(userProfiles).set({ isAvailable: available }).where((0, import_drizzle_orm2.eq)(userProfiles.userId, z3.id));
          if (available) {
            await db.update(users).set({ lastLoginAt: now }).where((0, import_drizzle_orm2.eq)(users.id, z3.id));
          }
        }
        const fakeBikers2 = await db.select({ id: users.id, profileUserId: userProfiles.userId, adminOverrideUntil: userProfiles.adminOverrideUntil }).from(users).innerJoin(userProfiles, (0, import_drizzle_orm2.eq)(userProfiles.userId, users.id)).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(users.isFake, true), (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(users.userType, "biker"), (0, import_drizzle_orm2.eq)(users.userType, "coppia"))));
        for (const b of fakeBikers2) {
          if (b.adminOverrideUntil && new Date(b.adminOverrideUntil) > now) continue;
          const available = Math.random() < 0.55;
          await db.update(userProfiles).set({ isAvailable: available }).where((0, import_drizzle_orm2.eq)(userProfiles.userId, b.id));
          if (available) {
            await db.update(users).set({ lastLoginAt: now }).where((0, import_drizzle_orm2.eq)(users.id, b.id));
          }
        }
      }
      async getFakeUserConversations(fakeUserId) {
        const participantRows = await db.select().from(conversationParticipants).where((0, import_drizzle_orm2.eq)(conversationParticipants.userId, fakeUserId));
        if (participantRows.length === 0) return [];
        const convIds = participantRows.map((p) => p.conversationId);
        const convs = await db.select().from(conversations).where(import_drizzle_orm2.sql`${conversations.id} = ANY(${convIds})`).orderBy((0, import_drizzle_orm2.desc)(conversations.updatedAt));
        const result = [];
        for (const conv of convs) {
          const parts = await this.getConversationParticipants(conv.id);
          const partUsers = [];
          for (const p of parts) {
            const u = await this.getUser(p.userId);
            if (u) partUsers.push({ id: u.id, nickname: u.nickname, userType: u.userType, isFake: u.isFake });
          }
          const msgs = await this.getMessages(conv.id, 1, 0);
          const totalMsgs = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(messages).where((0, import_drizzle_orm2.eq)(messages.conversationId, conv.id));
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
        return db.select().from(customRoutes).where((0, import_drizzle_orm2.eq)(customRoutes.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(customRoutes.createdAt));
      }
      async getPublicCustomRoutes() {
        return db.select().from(customRoutes).where((0, import_drizzle_orm2.eq)(customRoutes.isPublic, true)).orderBy((0, import_drizzle_orm2.desc)(customRoutes.createdAt));
      }
      async getCustomRoute(id) {
        const [route] = await db.select().from(customRoutes).where((0, import_drizzle_orm2.eq)(customRoutes.id, id)).limit(1);
        return route;
      }
      async createCustomRoute(data) {
        const [route] = await db.insert(customRoutes).values(data).returning();
        return route;
      }
      async updateCustomRoute(id, data) {
        const [route] = await db.update(customRoutes).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(customRoutes.id, id)).returning();
        return route;
      }
      async deleteCustomRoute(id) {
        await db.delete(customRoutes).where((0, import_drizzle_orm2.eq)(customRoutes.id, id));
      }
      async getCustomRouteWaypoints(routeId) {
        return db.select().from(customRouteWaypoints).where((0, import_drizzle_orm2.eq)(customRouteWaypoints.routeId, routeId)).orderBy((0, import_drizzle_orm2.asc)(customRouteWaypoints.orderIndex));
      }
      async createCustomRouteWaypoint(data) {
        const [wp] = await db.insert(customRouteWaypoints).values(data).returning();
        return wp;
      }
      async updateCustomRouteWaypoint(id, data) {
        const [wp] = await db.update(customRouteWaypoints).set(data).where((0, import_drizzle_orm2.eq)(customRouteWaypoints.id, id)).returning();
        return wp;
      }
      async deleteCustomRouteWaypoint(id) {
        await db.delete(customRouteWaypoints).where((0, import_drizzle_orm2.eq)(customRouteWaypoints.id, id));
      }
      async createSosRequest(data) {
        const [req] = await db.insert(sosRequests).values(data).returning();
        return req;
      }
      async getSosRequest(id) {
        const [req] = await db.select().from(sosRequests).where((0, import_drizzle_orm2.eq)(sosRequests.id, id)).limit(1);
        return req;
      }
      async getActiveSosRequestByUser(userId) {
        const [req] = await db.select().from(sosRequests).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(sosRequests.requesterId, userId), (0, import_drizzle_orm2.eq)(sosRequests.status, "active"))).limit(1);
        return req;
      }
      async getActiveSosRequests() {
        return db.select().from(sosRequests).where((0, import_drizzle_orm2.eq)(sosRequests.status, "active")).orderBy((0, import_drizzle_orm2.desc)(sosRequests.createdAt));
      }
      async updateSosRequest(id, data) {
        const [req] = await db.update(sosRequests).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(sosRequests.id, id)).returning();
        return req;
      }
      async getBikerBikerMatchesForUser(userId) {
        return db.select().from(bikerBikerMatches).where(
          (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(bikerBikerMatches.biker1Id, userId), (0, import_drizzle_orm2.eq)(bikerBikerMatches.biker2Id, userId))
        ).orderBy(
          import_drizzle_orm2.sql`CASE WHEN ${bikerBikerMatches.status} = 'accepted' THEN 0 WHEN ${bikerBikerMatches.status} = 'new' THEN 1 ELSE 2 END`,
          (0, import_drizzle_orm2.asc)(bikerBikerMatches.id)
        ).limit(2e3);
      }
      async createBikerBikerMatch(data) {
        const idA = data.biker1Id < data.biker2Id ? data.biker1Id : data.biker2Id;
        const idB = data.biker1Id < data.biker2Id ? data.biker2Id : data.biker1Id;
        const isSupermatch = data.isSupermatch ?? false;
        const status = data.status || "new";
        const result = await pool.query(
          `INSERT INTO biker_biker_matches (id, biker1_id, biker2_id, motorcycle_brand, motorcycle_model, status, is_supermatch)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
       ON CONFLICT (LEAST(biker1_id, biker2_id), GREATEST(biker1_id, biker2_id), motorcycle_brand, motorcycle_model)
       DO UPDATE SET
         status = 'new',
         is_supermatch = EXCLUDED.is_supermatch
       WHERE biker_biker_matches.status = 'rejected'
       RETURNING *`,
          [idA, idB, data.motorcycleBrand, data.motorcycleModel, status, isSupermatch]
        );
        if (!result.rows || result.rows.length === 0) return void 0;
        const row = result.rows[0];
        return {
          id: row.id,
          biker1Id: row.biker1_id,
          biker2Id: row.biker2_id,
          motorcycleBrand: row.motorcycle_brand,
          motorcycleModel: row.motorcycle_model,
          status: row.status,
          isSupermatch: row.is_supermatch,
          createdAt: row.created_at
        };
      }
      async getBikerBikerMatch(id) {
        const [match] = await db.select().from(bikerBikerMatches).where((0, import_drizzle_orm2.eq)(bikerBikerMatches.id, id));
        return match;
      }
      async updateBikerBikerMatch(id, data) {
        const [updated] = await db.update(bikerBikerMatches).set(data).where((0, import_drizzle_orm2.eq)(bikerBikerMatches.id, id)).returning();
        return updated;
      }
      async resetBikerBikerMatchToNew(id, userId) {
        const [match] = await db.select().from(bikerBikerMatches).where((0, import_drizzle_orm2.eq)(bikerBikerMatches.id, id));
        if (!match) return false;
        if (match.biker1Id !== userId && match.biker2Id !== userId) return false;
        const newStatus = match.status === "accepted" ? "rejected" : "new";
        await db.update(bikerBikerMatches).set({ status: newStatus }).where((0, import_drizzle_orm2.eq)(bikerBikerMatches.id, id));
        return true;
      }
      async deleteRejectedBikerBikerMatches(userId) {
        const rejected = await db.select().from(bikerBikerMatches).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(bikerBikerMatches.biker1Id, userId), (0, import_drizzle_orm2.eq)(bikerBikerMatches.biker2Id, userId)),
            (0, import_drizzle_orm2.eq)(bikerBikerMatches.status, "rejected")
          )
        );
        if (rejected.length === 0) return 0;
        await db.delete(bikerBikerMatches).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(bikerBikerMatches.biker1Id, userId), (0, import_drizzle_orm2.eq)(bikerBikerMatches.biker2Id, userId)),
            (0, import_drizzle_orm2.eq)(bikerBikerMatches.status, "rejected")
          )
        );
        return rejected.length;
      }
      async deleteNewBikerBikerMatches(userId) {
        const newMatches = await db.select().from(bikerBikerMatches).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(bikerBikerMatches.biker1Id, userId), (0, import_drizzle_orm2.eq)(bikerBikerMatches.biker2Id, userId)),
            (0, import_drizzle_orm2.eq)(bikerBikerMatches.status, "new")
          )
        );
        if (newMatches.length === 0) return 0;
        await db.delete(bikerBikerMatches).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(bikerBikerMatches.biker1Id, userId), (0, import_drizzle_orm2.eq)(bikerBikerMatches.biker2Id, userId)),
            (0, import_drizzle_orm2.eq)(bikerBikerMatches.status, "new")
          )
        );
        return newMatches.length;
      }
      async getAcceptedBikerBikerPairKeys(userId) {
        const rows = await db.select({
          biker1Id: bikerBikerMatches.biker1Id,
          biker2Id: bikerBikerMatches.biker2Id
        }).from(bikerBikerMatches).where(
          (0, import_drizzle_orm2.and)(
            (0, import_drizzle_orm2.or)((0, import_drizzle_orm2.eq)(bikerBikerMatches.biker1Id, userId), (0, import_drizzle_orm2.eq)(bikerBikerMatches.biker2Id, userId)),
            (0, import_drizzle_orm2.eq)(bikerBikerMatches.status, "accepted")
          )
        );
        const keys = /* @__PURE__ */ new Set();
        for (const r of rows) {
          const idA = r.biker1Id < r.biker2Id ? r.biker1Id : r.biker2Id;
          const idB = r.biker1Id < r.biker2Id ? r.biker2Id : r.biker1Id;
          keys.add(`${idA}:${idB}`);
        }
        return keys;
      }
      async blockUser(blockerId, blockedId) {
        const [block] = await db.insert(userBlocks).values({ blockerId, blockedId }).returning();
        return block;
      }
      async unblockUser(blockerId, blockedId) {
        const result = await db.delete(userBlocks).where(
          (0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(userBlocks.blockerId, blockerId), (0, import_drizzle_orm2.eq)(userBlocks.blockedId, blockedId))
        ).returning();
        return result.length > 0;
      }
      async isBlocked(userId1, userId2) {
        const [row] = await db.select().from(userBlocks).where(
          (0, import_drizzle_orm2.or)(
            (0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(userBlocks.blockerId, userId1), (0, import_drizzle_orm2.eq)(userBlocks.blockedId, userId2)),
            (0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(userBlocks.blockerId, userId2), (0, import_drizzle_orm2.eq)(userBlocks.blockedId, userId1))
          )
        ).limit(1);
        return !!row;
      }
      async hasBlockedUser(blockerId, blockedId) {
        const [row] = await db.select().from(userBlocks).where(
          (0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(userBlocks.blockerId, blockerId), (0, import_drizzle_orm2.eq)(userBlocks.blockedId, blockedId))
        ).limit(1);
        return !!row;
      }
      async getBlockedUserIds(userId) {
        const rows = await db.select().from(userBlocks).where(
          (0, import_drizzle_orm2.or)(
            (0, import_drizzle_orm2.eq)(userBlocks.blockerId, userId),
            (0, import_drizzle_orm2.eq)(userBlocks.blockedId, userId)
          )
        );
        return rows.map((r) => r.blockerId === userId ? r.blockedId : r.blockerId);
      }
      async getAllBlockedPairs() {
        const rows = await db.select({ blockerId: userBlocks.blockerId, blockedId: userBlocks.blockedId }).from(userBlocks);
        return rows;
      }
      async deleteBikerBikerMatchesBetween(userId1, userId2) {
        const result = await db.delete(bikerBikerMatches).where(
          (0, import_drizzle_orm2.or)(
            (0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(bikerBikerMatches.biker1Id, userId1), (0, import_drizzle_orm2.eq)(bikerBikerMatches.biker2Id, userId2)),
            (0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(bikerBikerMatches.biker1Id, userId2), (0, import_drizzle_orm2.eq)(bikerBikerMatches.biker2Id, userId1))
          )
        ).returning();
        return result.length;
      }
    };
    storage = new DatabaseStorage();
  }
});

// server/mass-seed-data.ts
function randOffset() {
  return (Math.random() - 0.5) * 2;
}
function randBirthYear() {
  return 1970 + Math.floor(Math.random() * 36);
}
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickRandomN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
function getMotoYear() {
  return 2016 + Math.floor(Math.random() * 9);
}
function getBio(type, sex) {
  if (type === "biker" && sex === "M") return pickRandom(BIKER_M_BIOS);
  if (type === "biker" && sex === "F") return pickRandom(BIKER_F_BIOS);
  if (type === "zavorrina" && sex === "F") return pickRandom(ZAV_F_BIOS);
  if (type === "zavorrina" && sex === "M") return pickRandom(ZAV_M_BIOS);
  return pickRandom(COUPLE_BIOS);
}
function getWelcomeMessage(type, sex) {
  if (type === "biker" && sex === "F") return pickRandom(WELCOME_MESSAGES.biker_f);
  if (type === "biker") return pickRandom(WELCOME_MESSAGES.biker_m);
  if (type === "zavorrina" && sex === "M") return pickRandom(WELCOME_MESSAGES.zav_m);
  if (type === "zavorrina") return pickRandom(WELCOME_MESSAGES.zav_f);
  return pickRandom(WELCOME_MESSAGES.couple);
}
function distributeUniformly(total, regionCount) {
  const base = Math.floor(total / regionCount);
  const remainder = total % regionCount;
  return Array.from({ length: regionCount }, (_, i) => base + (i < remainder ? 1 : 0));
}
function generateUniqueNickname(sex, usedNicknames) {
  const names = sex === "F" ? FEMALE_NAMES : MALE_NAMES;
  for (let attempt = 0; attempt < 100; attempt++) {
    const name = pickRandom(names);
    const surname = pickRandom(SURNAMES);
    const suffix = Math.floor(Math.random() * 999);
    const nick = `${name}${surname}${suffix}`;
    if (!usedNicknames.has(nick.toLowerCase())) {
      usedNicknames.add(nick.toLowerCase());
      return nick;
    }
  }
  const fallback = `User${Date.now()}${Math.floor(Math.random() * 9999)}`;
  usedNicknames.add(fallback.toLowerCase());
  return fallback;
}
function generateUniqueEmail(nickname, usedEmails) {
  const domains = ["gmail.com", "yahoo.it", "libero.it", "hotmail.it", "outlook.com", "alice.it", "tiscali.it"];
  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = attempt === 0 ? "" : `${Math.floor(Math.random() * 9999)}`;
    const email2 = `${nickname.toLowerCase()}${suffix}@${pickRandom(domains)}`;
    if (!usedEmails.has(email2)) {
      usedEmails.add(email2);
      return email2;
    }
  }
  const email = `${nickname.toLowerCase()}.${Date.now()}@${pickRandom(domains)}`;
  usedEmails.add(email);
  return email;
}
var EUROPEAN_ZONES, MALE_NAMES, FEMALE_NAMES, SURNAMES, MOTORCYCLES, BIKER_M_BIOS, BIKER_F_BIOS, ZAV_F_BIOS, ZAV_M_BIOS, COUPLE_BIOS, WELCOME_MESSAGES;
var init_mass_seed_data = __esm({
  "server/mass-seed-data.ts"() {
    "use strict";
    EUROPEAN_ZONES = [
      // ── ITALIA (20 regioni) ───────────────────────────────────────────────────────
      { region: "Lombardia", country: "IT", lat: 45.46, lng: 9.19, spokenLanguages: ["Italiano"] },
      { region: "Piemonte", country: "IT", lat: 45.07, lng: 7.69, spokenLanguages: ["Italiano"] },
      { region: "Veneto", country: "IT", lat: 45.44, lng: 12.31, spokenLanguages: ["Italiano"] },
      { region: "Emilia-Romagna", country: "IT", lat: 44.5, lng: 11.34, spokenLanguages: ["Italiano"] },
      { region: "Toscana", country: "IT", lat: 43.77, lng: 11.25, spokenLanguages: ["Italiano"] },
      { region: "Lazio", country: "IT", lat: 41.9, lng: 12.5, spokenLanguages: ["Italiano"] },
      { region: "Campania", country: "IT", lat: 40.85, lng: 14.27, spokenLanguages: ["Italiano"] },
      { region: "Puglia", country: "IT", lat: 41.12, lng: 16.87, spokenLanguages: ["Italiano"] },
      { region: "Calabria", country: "IT", lat: 38.91, lng: 16.59, spokenLanguages: ["Italiano"] },
      { region: "Sicilia", country: "IT", lat: 37.6, lng: 14.02, spokenLanguages: ["Italiano"] },
      { region: "Sardegna", country: "IT", lat: 39.22, lng: 9.12, spokenLanguages: ["Italiano"] },
      { region: "Liguria", country: "IT", lat: 44.41, lng: 8.93, spokenLanguages: ["Italiano"] },
      { region: "Marche", country: "IT", lat: 43.62, lng: 13.52, spokenLanguages: ["Italiano"] },
      { region: "Umbria", country: "IT", lat: 43.11, lng: 12.39, spokenLanguages: ["Italiano"] },
      { region: "Abruzzo", country: "IT", lat: 42.35, lng: 13.4, spokenLanguages: ["Italiano"] },
      { region: "Trentino-Alto Adige", country: "IT", lat: 46.07, lng: 11.12, spokenLanguages: ["Italiano"] },
      { region: "Friuli Venezia Giulia", country: "IT", lat: 46.06, lng: 13.23, spokenLanguages: ["Italiano"] },
      { region: "Basilicata", country: "IT", lat: 40.64, lng: 15.8, spokenLanguages: ["Italiano"] },
      { region: "Molise", country: "IT", lat: 41.56, lng: 14.66, spokenLanguages: ["Italiano"] },
      { region: "Valle d'Aosta", country: "IT", lat: 45.74, lng: 7.43, spokenLanguages: ["Italiano"] },
      // ── GERMANIA (11 Länder) ───────────────────────────────────────────────────────
      { region: "Bayern", country: "DE", lat: 48.14, lng: 11.58, spokenLanguages: ["Deutsch"] },
      { region: "Nordrhein-Westfalen", country: "DE", lat: 51.23, lng: 6.78, spokenLanguages: ["Deutsch"] },
      { region: "Baden-W\xFCrttemberg", country: "DE", lat: 48.78, lng: 9.18, spokenLanguages: ["Deutsch"] },
      { region: "Berlin", country: "DE", lat: 52.52, lng: 13.41, spokenLanguages: ["Deutsch"] },
      { region: "Hamburg", country: "DE", lat: 53.55, lng: 9.99, spokenLanguages: ["Deutsch"] },
      { region: "Niedersachsen", country: "DE", lat: 52.37, lng: 9.73, spokenLanguages: ["Deutsch"] },
      { region: "Hessen", country: "DE", lat: 50.11, lng: 8.68, spokenLanguages: ["Deutsch"] },
      { region: "Sachsen", country: "DE", lat: 51.05, lng: 13.74, spokenLanguages: ["Deutsch"] },
      { region: "Rheinland-Pfalz", country: "DE", lat: 49.99, lng: 8.27, spokenLanguages: ["Deutsch"] },
      { region: "Th\xFCringen", country: "DE", lat: 50.98, lng: 11.03, spokenLanguages: ["Deutsch"] },
      { region: "Brandenburg", country: "DE", lat: 52.4, lng: 12.97, spokenLanguages: ["Deutsch"] },
      // ── FRANCIA (11 regioni) ───────────────────────────────────────────────────────
      { region: "\xCEle-de-France", country: "FR", lat: 48.86, lng: 2.35, spokenLanguages: ["Fran\xE7ais"] },
      { region: "Provence-Alpes-C\xF4te d'Azur", country: "FR", lat: 43.3, lng: 5.37, spokenLanguages: ["Fran\xE7ais"] },
      { region: "Occitanie", country: "FR", lat: 43.6, lng: 1.44, spokenLanguages: ["Fran\xE7ais"] },
      { region: "Bretagne", country: "FR", lat: 48.11, lng: -1.68, spokenLanguages: ["Fran\xE7ais"] },
      { region: "Grand Est", country: "FR", lat: 48.57, lng: 7.75, spokenLanguages: ["Fran\xE7ais"] },
      { region: "Auvergne-Rh\xF4ne-Alpes", country: "FR", lat: 45.76, lng: 4.83, spokenLanguages: ["Fran\xE7ais"] },
      { region: "Hauts-de-France", country: "FR", lat: 50.63, lng: 3.06, spokenLanguages: ["Fran\xE7ais"] },
      { region: "Nouvelle-Aquitaine", country: "FR", lat: 44.84, lng: -0.58, spokenLanguages: ["Fran\xE7ais"] },
      { region: "Normandie", country: "FR", lat: 49.18, lng: -0.36, spokenLanguages: ["Fran\xE7ais"] },
      { region: "Pays de la Loire", country: "FR", lat: 47.22, lng: -1.55, spokenLanguages: ["Fran\xE7ais"] },
      { region: "Bourgogne-Franche-Comt\xE9", country: "FR", lat: 47.32, lng: 5.04, spokenLanguages: ["Fran\xE7ais"] },
      // ── SPAGNA (8 comunità) ───────────────────────────────────────────────────────
      { region: "Catalu\xF1a", country: "ES", lat: 41.39, lng: 2.17, spokenLanguages: ["Espa\xF1ol"] },
      { region: "Comunidad de Madrid", country: "ES", lat: 40.42, lng: -3.7, spokenLanguages: ["Espa\xF1ol"] },
      { region: "Andaluc\xEDa", country: "ES", lat: 37.39, lng: -5.98, spokenLanguages: ["Espa\xF1ol"] },
      { region: "Pa\xEDs Vasco", country: "ES", lat: 43.26, lng: -2.93, spokenLanguages: ["Espa\xF1ol"] },
      { region: "Comunidad Valenciana", country: "ES", lat: 39.47, lng: -0.38, spokenLanguages: ["Espa\xF1ol"] },
      { region: "Galicia", country: "ES", lat: 42.88, lng: -8.54, spokenLanguages: ["Espa\xF1ol"] },
      { region: "Arag\xF3n", country: "ES", lat: 41.65, lng: -0.88, spokenLanguages: ["Espa\xF1ol"] },
      { region: "Castilla y Le\xF3n", country: "ES", lat: 41.65, lng: -4.72, spokenLanguages: ["Espa\xF1ol"] },
      // ── POLONIA (3 voivodati) ───────────────────────────────────────────────────────
      { region: "Mazowieckie", country: "PL", lat: 52.23, lng: 21.01, spokenLanguages: ["English"] },
      { region: "Ma\u0142opolskie", country: "PL", lat: 50.06, lng: 19.94, spokenLanguages: ["English"] },
      { region: "\u015Al\u0105skie", country: "PL", lat: 50.26, lng: 19.03, spokenLanguages: ["English"] },
      // ── PAESI BASSI (3 province) ───────────────────────────────────────────────────
      { region: "Noord-Holland", country: "NL", lat: 52.37, lng: 4.9, spokenLanguages: ["Nederlands"] },
      { region: "Zuid-Holland", country: "NL", lat: 51.92, lng: 4.48, spokenLanguages: ["Nederlands"] },
      { region: "Noord-Brabant", country: "NL", lat: 51.56, lng: 5.08, spokenLanguages: ["Nederlands"] },
      // ── BELGIO (2 regioni) ─────────────────────────────────────────────────────────
      { region: "Bruxelles", country: "BE", lat: 50.85, lng: 4.35, spokenLanguages: ["Fran\xE7ais"] },
      { region: "Antwerpen", country: "BE", lat: 51.22, lng: 4.4, spokenLanguages: ["Nederlands"] },
      // ── SVIZZERA (2 cantoni) ───────────────────────────────────────────────────────
      { region: "Z\xFCrich", country: "CH", lat: 47.38, lng: 8.54, spokenLanguages: ["Deutsch"] },
      { region: "Gen\xE8ve", country: "CH", lat: 46.2, lng: 6.15, spokenLanguages: ["Fran\xE7ais"] },
      // ── AUSTRIA (3 Länder) ─────────────────────────────────────────────────────────
      { region: "Wien", country: "AT", lat: 48.21, lng: 16.37, spokenLanguages: ["Deutsch"] },
      { region: "Tirol", country: "AT", lat: 47.26, lng: 11.39, spokenLanguages: ["Deutsch"] },
      { region: "Steiermark", country: "AT", lat: 47.07, lng: 15.44, spokenLanguages: ["Deutsch"] },
      // ── SVEZIA (3 regioni) ─────────────────────────────────────────────────────────
      { region: "Stockholm", country: "SE", lat: 59.33, lng: 18.07, spokenLanguages: ["English"] },
      { region: "G\xF6teborg", country: "SE", lat: 57.71, lng: 11.97, spokenLanguages: ["English"] },
      { region: "Sk\xE5ne", country: "SE", lat: 55.6, lng: 13, spokenLanguages: ["English"] },
      // ── PORTOGALLO (2 regioni) ─────────────────────────────────────────────────────
      { region: "Lisboa", country: "PT", lat: 38.72, lng: -9.14, spokenLanguages: ["Portugu\xEAs"] },
      { region: "Norte", country: "PT", lat: 41.15, lng: -8.61, spokenLanguages: ["Portugu\xEAs"] },
      // ── GRECIA (2 regioni) ─────────────────────────────────────────────────────────
      { region: "Attiki", country: "GR", lat: 37.98, lng: 23.73, spokenLanguages: ["Greek"] },
      { region: "Kentriki Makedonia", country: "GR", lat: 40.64, lng: 22.94, spokenLanguages: ["Greek"] },
      // ── REPUBBLICA CECA (2 regioni) ────────────────────────────────────────────────
      { region: "Praha", country: "CZ", lat: 50.08, lng: 14.44, spokenLanguages: ["English"] },
      { region: "Jihomoravsk\xFD", country: "CZ", lat: 49.2, lng: 16.61, spokenLanguages: ["English"] },
      // ── UNGHERIA ──────────────────────────────────────────────────────────────────
      { region: "Budapest", country: "HU", lat: 47.5, lng: 19.04, spokenLanguages: ["English"] },
      // ── ROMANIA (2 regioni) ────────────────────────────────────────────────────────
      { region: "Bucure\u0219ti", country: "RO", lat: 44.43, lng: 26.1, spokenLanguages: ["English"] },
      { region: "Cluj", country: "RO", lat: 46.77, lng: 23.59, spokenLanguages: ["English"] },
      // ── CROAZIA (2 regioni) ────────────────────────────────────────────────────────
      { region: "Zagreb", country: "HR", lat: 45.81, lng: 15.98, spokenLanguages: ["English"] },
      { region: "Splitsko-dalmatinska", country: "HR", lat: 43.51, lng: 16.44, spokenLanguages: ["English"] },
      // ── DANIMARCA ────────────────────────────────────────────────────────────────
      { region: "K\xF8benhavn", country: "DK", lat: 55.68, lng: 12.57, spokenLanguages: ["English"] },
      // ── FINLANDIA ────────────────────────────────────────────────────────────────
      { region: "Helsinki", country: "FI", lat: 60.17, lng: 24.94, spokenLanguages: ["English"] },
      // ── NORVEGIA (2 regioni) ───────────────────────────────────────────────────────
      { region: "Oslo", country: "NO", lat: 59.91, lng: 10.75, spokenLanguages: ["English"] },
      { region: "Vestland", country: "NO", lat: 60.39, lng: 5.33, spokenLanguages: ["English"] },
      // ── SLOVACCHIA ───────────────────────────────────────────────────────────────
      { region: "Bratislava", country: "SK", lat: 48.15, lng: 17.11, spokenLanguages: ["English"] },
      // ── SLOVENIA ─────────────────────────────────────────────────────────────────
      { region: "Ljubljana", country: "SI", lat: 46.06, lng: 14.51, spokenLanguages: ["English"] },
      // ── SERBIA (2 regioni) ─────────────────────────────────────────────────────────
      { region: "Beograd", country: "RS", lat: 44.79, lng: 20.45, spokenLanguages: ["English"] },
      { region: "Vojvodina", country: "RS", lat: 45.25, lng: 19.84, spokenLanguages: ["English"] },
      // ── IRLANDA ──────────────────────────────────────────────────────────────────
      { region: "Dublin", country: "IE", lat: 53.35, lng: -6.26, spokenLanguages: ["English"] }
    ];
    MALE_NAMES = [
      "Marco",
      "Luca",
      "Andrea",
      "Giuseppe",
      "Francesco",
      "Alessandro",
      "Antonio",
      "Giovanni",
      "Roberto",
      "Stefano",
      "Davide",
      "Matteo",
      "Federico",
      "Simone",
      "Daniele",
      "Paolo",
      "Fabio",
      "Riccardo",
      "Nicola",
      "Massimo",
      "Salvatore",
      "Vincenzo",
      "Domenico",
      "Filippo",
      "Gianluca",
      "Emanuele",
      "Cristian",
      "Lorenzo",
      "Tommaso",
      "Alberto",
      "Claudio",
      "Enrico",
      "Michele",
      "Angelo",
      "Sergio",
      "Giacomo",
      "Pietro",
      "Diego",
      "Raffaele",
      "Pasquale",
      "Mirko",
      "Ivan",
      "Edoardo",
      "Gabriele",
      "Aldo",
      "Bruno",
      "Carlo",
      "Dario",
      "Enzo",
      "Franco",
      "Gianni",
      "Luigi",
      "Mario",
      "Nino",
      "Oscar",
      "Piero",
      "Renato",
      "Sandro",
      "Tiziano",
      "Umberto",
      "Valerio",
      "Walter",
      "Adriano",
      "Agostino",
      "Alfredo",
      "Arturo",
      "Beppe",
      "Cesare",
      "Corrado",
      "Donato",
      "Elio",
      "Ernesto",
      "Fabrizio",
      "Gennaro",
      "Igor",
      "Italo",
      "Jacopo",
      "Luciano",
      "Marcello",
      "Mauro",
      "Nunzio",
      "Oreste",
      "Primo",
      "Rocco",
      "Ruggero",
      "Silvio",
      "Tancredi",
      "Tullio",
      "Ugo",
      "Vittorio",
      "Achille",
      "Armando",
      "Benito",
      "Carmelo",
      "Cosimo",
      "Emilio",
      "Flavio",
      "Gaetano",
      "Ignazio",
      "Ivano",
      "Lamberto",
      "Manlio",
      "Nello",
      "Ottavio",
      "Pellegrino",
      "Quirino",
      "Renzo",
      "Samuele",
      "Teo",
      "Vito",
      "Amedeo",
      "Biagio",
      "Clemente",
      "Dino",
      "Eugenio",
      "Ferruccio",
      "Guido",
      "Ivo",
      "Lauro",
      "Livio",
      "Massimiliano",
      "Nando",
      "Olindo",
      "Pompeo",
      "Raimondo",
      "Sebastiano",
      "Teodoro",
      "Ubaldo",
      "Venanzio",
      "Zeno",
      "Alessio",
      "Bernardo",
      "Camillo",
      "Duccio",
      "Erminio",
      "Fulvio",
      "Gaspare",
      "Hugo",
      "Isidoro",
      "Juri",
      "Kevin",
      "Leo",
      "Mattia",
      "Nicholas",
      "Omar",
      "Patrizio",
      "Quinto",
      "Romeo",
      "Samuel",
      "Tomas",
      "Ulisse",
      "Vladimiro",
      "William",
      "Xavier",
      "Yuri",
      "Zaccaria",
      "Adelmo",
      "Basilio",
      "Celestino",
      "Demetrio",
      "Efisio",
      "Fausto",
      "Gilberto",
      "Ippolito",
      "Leandro",
      "Modesto",
      "Norberto",
      "Oronzo",
      "Pancrazio",
      "Raniero",
      "Stanislao",
      "Tranquillo",
      "Urbano",
      "Valentino",
      "Wladimiro",
      "Zairo",
      "Alan",
      "Boris",
      "Cristiano",
      "Denis",
      "Ettore",
      "Fernando",
      "Gino",
      "Hans",
      "Ian",
      "Jonathan",
      "Karim",
      "Lino",
      "Manuel",
      "Neri",
      "Osvaldo",
      "Pino",
      "Rafael",
      "Sauro",
      "Tino",
      "Ulrico",
      "Vigilio",
      "Werther",
      "Yosef",
      "Zoran"
    ];
    FEMALE_NAMES = [
      "Maria",
      "Anna",
      "Giulia",
      "Francesca",
      "Laura",
      "Sara",
      "Chiara",
      "Valentina",
      "Alessandra",
      "Silvia",
      "Elisa",
      "Federica",
      "Martina",
      "Simona",
      "Roberta",
      "Monica",
      "Paola",
      "Elena",
      "Claudia",
      "Daniela",
      "Cristina",
      "Stefania",
      "Barbara",
      "Ilaria",
      "Angela",
      "Rosa",
      "Teresa",
      "Lucia",
      "Concetta",
      "Grazia",
      "Antonella",
      "Patrizia",
      "Giovanna",
      "Aurora",
      "Ginevra",
      "Alice",
      "Beatrice",
      "Camilla",
      "Diana",
      "Emma",
      "Flavia",
      "Gloria",
      "Irene",
      "Jasmine",
      "Karen",
      "Letizia",
      "Marta",
      "Noemi",
      "Ornella",
      "Perla",
      "Rachele",
      "Sofia",
      "Tiziana",
      "Ursula",
      "Viola",
      "Wanda",
      "Xenia",
      "Ylenia",
      "Zoe",
      "Agata",
      "Bianca",
      "Carla",
      "Debora",
      "Eva",
      "Fiammetta",
      "Gaia",
      "Helena",
      "Isabella",
      "Jolanda",
      "Katia",
      "Lara",
      "Margherita",
      "Natalia",
      "Olga",
      "Piera",
      "Rita",
      "Sabrina",
      "Tamara",
      "Vanessa",
      "Ada",
      "Bruna",
      "Cinzia",
      "Donatella",
      "Eleonora",
      "Fabiana",
      "Gemma",
      "Ida",
      "Jenny",
      "Lorena",
      "Mirella",
      "Nadia",
      "Orietta",
      "Pina",
      "Renata",
      "Silvana",
      "Tina",
      "Vera",
      "Wilma",
      "Adriana",
      "Benedetta",
      "Cecilia",
      "Daria",
      "Emanuela",
      "Fulvia",
      "Graziella",
      "Immacolata",
      "Liliana",
      "Manuela",
      "Nicoletta",
      "Ottavia",
      "Pamela",
      "Romina",
      "Serena",
      "Tatiana",
      "Umberta",
      "Virginia",
      "Arianna",
      "Brenda",
      "Costanza",
      "Delia",
      "Eugenia",
      "Fiorella",
      "Giuseppina",
      "Ivana",
      "Luciana",
      "Marcella",
      "Nunzia",
      "Palmira",
      "Rosalba",
      "Susanna",
      "Tecla",
      "Viviana",
      "Assunta",
      "Berenice",
      "Clelia",
      "Edda",
      "Fortunata",
      "Gertrude",
      "Isotta",
      "Leonilda",
      "Maddalena",
      "Nella",
      "Ottilia",
      "Pia",
      "Rosaria",
      "Serafina",
      "Tosca",
      "Verdiana",
      "Amalia",
      "Brigida",
      "Consolata",
      "Domitilla",
      "Enrichetta",
      "Filomena",
      "Giuditta",
      "Iginia",
      "Lorella",
      "Milena",
      "Norma",
      "Ofelia",
      "Prisca",
      "Raffaella",
      "Smeralda",
      "Teodora",
      "Vittoria",
      "Alma",
      "Bettina",
      "Clarissa",
      "Diletta",
      "Elvira",
      "Fernanda",
      "Gigliola",
      "Ines",
      "Leda",
      "Miranda",
      "Nives",
      "Ondina",
      "Penelope",
      "Rosella",
      "Samanta",
      "Tania",
      "Valeria",
      "Zelda",
      "Agostina",
      "Carmela",
      "Erika",
      "Greta",
      "Luana",
      "Marilena",
      "Rossana",
      "Sonia",
      "Lidia",
      "Dina",
      "Franca",
      "Greca",
      "Ivonne",
      "Lisa",
      "Melania",
      "Nunziata"
    ];
    SURNAMES = [
      "Rossi",
      "Russo",
      "Ferrari",
      "Esposito",
      "Bianchi",
      "Romano",
      "Colombo",
      "Ricci",
      "Marino",
      "Greco",
      "Bruno",
      "Gallo",
      "Conti",
      "DeLuca",
      "Mancini",
      "Costa",
      "Giordano",
      "Rizzo",
      "Lombardi",
      "Moretti",
      "Barbieri",
      "Fontana",
      "Santoro",
      "Mariani",
      "Rinaldi",
      "Caruso",
      "Ferrara",
      "Galli",
      "Martini",
      "Leone",
      "Longo",
      "Gentile",
      "Martinelli",
      "Vitale",
      "Lombardo",
      "Serra",
      "Coppola",
      "DeSantis",
      "DAngelis",
      "Marchetti",
      "Fabbri",
      "Pellegrini",
      "Palumbo",
      "Sanna",
      "Farina",
      "Rizzi",
      "Monti",
      "Cattaneo",
      "Morandi",
      "Guerra",
      "Valentini",
      "Sala",
      "Grasso",
      "Ferri",
      "Testa",
      "Silvestri",
      "Giuliani",
      "Benedetti",
      "Barone",
      "Orlando",
      "Conte",
      "Marini",
      "Grassi",
      "Bianco",
      "Parisi",
      "Neri",
      "DiMaio",
      "Basile",
      "Ferraro",
      "Pellegrino",
      "Amato",
      "Sorrentino",
      "Messina",
      "Gatti",
      "Ruggiero",
      "Bernardi",
      "Vitali",
      "Marchese",
      "DiPietro",
      "Riva",
      "Piras",
      "Palmieri",
      "Montanari",
      "Caputo",
      "Donati",
      "Pagano",
      "Negri",
      "Mazza",
      "DeRosa",
      "Battaglia",
      "Sartori",
      "Carbone",
      "Poli",
      "Rossetti",
      "DiMarco",
      "Damiani",
      "Oliva",
      "Pugliese",
      "Arena",
      "Pinto",
      "Ferretti",
      "DAmico",
      "Falcone",
      "Fiore",
      "Moro",
      "Ceccarelli",
      "Verdi",
      "Piazza",
      "Capasso",
      "Marotta",
      "Maggio",
      "Mantovani",
      "DiStefano",
      "Perna",
      "DAgostino",
      "Genovese",
      "Fiorini",
      "Gambino",
      "Alberti",
      "Rosso",
      "Massa",
      "Bellini",
      "Bruni",
      "Franco",
      "Ruggeri",
      "Napoli",
      "Angelini",
      "Romagnoli",
      "Volpe",
      "Mori",
      "Costanzo",
      "Romani",
      "Taviani",
      "Lucchesi",
      "Colucci",
      "Mazzola",
      "Innocenti",
      "Catalano",
      "Carnevale",
      "Valenti",
      "Bucci",
      "Quaranta",
      "Lauro",
      "Zanetti",
      "Moroni",
      "Trevisan",
      "Ventura",
      "Giannini",
      "Ardito",
      "Cecconi",
      "Padovano",
      "Ferrante",
      "Giuliani",
      "Maffei",
      "Pozzi",
      "Crespi",
      "DelVecchio",
      "Marchi",
      "Viviani",
      "Zanella",
      "Orsini",
      "Berti",
      "Pisano",
      "Russo",
      "Mauri",
      "Corti",
      "Pandolfi",
      "Fumagalli",
      "Landi",
      "Bottoni",
      "Gabrielli",
      "Marra",
      "Santini",
      "Pizzo",
      "Piacenti",
      "Ranieri",
      "Manfredi",
      "Tedeschi",
      "Baldi",
      "Bosco",
      "Carrara",
      "Fusco",
      "Guarnieri",
      "Mele",
      "Pavan",
      "Scarpa",
      "Sordi",
      "Tosi",
      "Venturi",
      "Zani",
      "Bertini",
      "Capra",
      "Drago",
      "Ferro",
      "Merlini",
      "Pastore",
      "Righi",
      "Sassi",
      "Ugolini",
      "Valli"
    ];
    MOTORCYCLES = [
      { brand: "Ducati", model: "Monster 821", displacement: 821, type: "Naked", style: "Sportiva" },
      { brand: "Ducati", model: "Monster 937", displacement: 937, type: "Naked", style: "Sportiva" },
      { brand: "Ducati", model: "Multistrada V4", displacement: 1158, type: "Adventure", style: "Turistica" },
      { brand: "Ducati", model: "Multistrada V2", displacement: 937, type: "Adventure", style: "Turistica" },
      { brand: "Ducati", model: "Scrambler Icon", displacement: 803, type: "Naked", style: "Allegra" },
      { brand: "Ducati", model: "Panigale V2", displacement: 955, type: "Sport", style: "Sportiva" },
      { brand: "Ducati", model: "Diavel V4", displacement: 1158, type: "Cruiser", style: "Sportiva" },
      { brand: "Ducati", model: "DesertX", displacement: 937, type: "Enduro", style: "Allegra" },
      { brand: "Yamaha", model: "MT-09", displacement: 890, type: "Naked", style: "Sportiva" },
      { brand: "Yamaha", model: "MT-07", displacement: 689, type: "Naked", style: "Allegra" },
      { brand: "Yamaha", model: "MT-03", displacement: 321, type: "Naked", style: "Allegra" },
      { brand: "Yamaha", model: "Tracer 9", displacement: 890, type: "Touring", style: "Turistica" },
      { brand: "Yamaha", model: "Tracer 7", displacement: 689, type: "Touring", style: "Turistica" },
      { brand: "Yamaha", model: "T\xE9n\xE9r\xE9 700", displacement: 689, type: "Adventure", style: "Allegra" },
      { brand: "Yamaha", model: "XSR 900", displacement: 890, type: "Naked", style: "Allegra" },
      { brand: "Honda", model: "Africa Twin", displacement: 1100, type: "Adventure", style: "Turistica" },
      { brand: "Honda", model: "CB 650R", displacement: 649, type: "Naked", style: "Tranquilla" },
      { brand: "Honda", model: "CB 500F", displacement: 471, type: "Naked", style: "Tranquilla" },
      { brand: "Honda", model: "Rebel 500", displacement: 471, type: "Cruiser", style: "Tranquilla" },
      { brand: "Honda", model: "NC 750X", displacement: 745, type: "Adventure", style: "Tranquilla" },
      { brand: "Honda", model: "Gold Wing", displacement: 1833, type: "Touring", style: "Turistica" },
      { brand: "Honda", model: "CBR 650R", displacement: 649, type: "Sport", style: "Sportiva" },
      { brand: "BMW", model: "R 1250 GS", displacement: 1254, type: "Adventure", style: "Turistica" },
      { brand: "BMW", model: "R 1250 RT", displacement: 1254, type: "Touring", style: "Turistica" },
      { brand: "BMW", model: "F 850 GS", displacement: 853, type: "Adventure", style: "Allegra" },
      { brand: "BMW", model: "F 900 R", displacement: 895, type: "Naked", style: "Sportiva" },
      { brand: "BMW", model: "S 1000 RR", displacement: 999, type: "Sport", style: "Sportiva" },
      { brand: "BMW", model: "R nineT", displacement: 1170, type: "Naked", style: "Allegra" },
      { brand: "KTM", model: "790 Duke", displacement: 790, type: "Naked", style: "Sportiva" },
      { brand: "KTM", model: "390 Adventure", displacement: 373, type: "Adventure", style: "Allegra" },
      { brand: "KTM", model: "890 Adventure", displacement: 889, type: "Adventure", style: "Turistica" },
      { brand: "KTM", model: "1290 Super Duke", displacement: 1290, type: "Naked", style: "Sportiva" },
      { brand: "KTM", model: "690 Enduro", displacement: 690, type: "Enduro", style: "Sportiva" },
      { brand: "Aprilia", model: "Tuono V4", displacement: 1077, type: "Naked", style: "Sportiva" },
      { brand: "Aprilia", model: "RS 660", displacement: 659, type: "Sport", style: "Sportiva" },
      { brand: "Aprilia", model: "Tuono 660", displacement: 659, type: "Naked", style: "Allegra" },
      { brand: "Triumph", model: "Tiger 900", displacement: 888, type: "Adventure", style: "Turistica" },
      { brand: "Triumph", model: "Street Triple", displacement: 765, type: "Naked", style: "Sportiva" },
      { brand: "Triumph", model: "Bonneville T120", displacement: 1200, type: "Naked", style: "Tranquilla" },
      { brand: "Triumph", model: "Speed Triple", displacement: 1160, type: "Naked", style: "Sportiva" },
      { brand: "Triumph", model: "Scrambler 900", displacement: 900, type: "Naked", style: "Allegra" },
      { brand: "Kawasaki", model: "Z900", displacement: 948, type: "Naked", style: "Sportiva" },
      { brand: "Kawasaki", model: "Z650", displacement: 649, type: "Naked", style: "Allegra" },
      { brand: "Kawasaki", model: "Versys 650", displacement: 649, type: "Touring", style: "Turistica" },
      { brand: "Kawasaki", model: "Ninja 650", displacement: 649, type: "Sport", style: "Sportiva" },
      { brand: "Kawasaki", model: "Vulcan S", displacement: 649, type: "Cruiser", style: "Tranquilla" },
      { brand: "Harley-Davidson", model: "Iron 883", displacement: 883, type: "Cruiser", style: "Tranquilla" },
      { brand: "Harley-Davidson", model: "Sportster S", displacement: 1252, type: "Cruiser", style: "Allegra" },
      { brand: "Harley-Davidson", model: "Fat Boy", displacement: 1868, type: "Cruiser", style: "Tranquilla" },
      { brand: "Harley-Davidson", model: "Road King", displacement: 1868, type: "Touring", style: "Turistica" },
      { brand: "Moto Guzzi", model: "V85 TT", displacement: 853, type: "Adventure", style: "Turistica" },
      { brand: "Moto Guzzi", model: "V7", displacement: 744, type: "Naked", style: "Tranquilla" },
      { brand: "Moto Guzzi", model: "V100 Mandello", displacement: 1042, type: "Touring", style: "Turistica" },
      { brand: "Benelli", model: "TRK 502", displacement: 500, type: "Adventure", style: "Turistica" },
      { brand: "Benelli", model: "Leoncino 500", displacement: 500, type: "Naked", style: "Allegra" },
      { brand: "Suzuki", model: "V-Strom 650", displacement: 645, type: "Adventure", style: "Turistica" },
      { brand: "Suzuki", model: "GSX-S750", displacement: 749, type: "Naked", style: "Sportiva" },
      { brand: "Suzuki", model: "SV650", displacement: 645, type: "Naked", style: "Allegra" },
      { brand: "Royal Enfield", model: "Himalayan 450", displacement: 452, type: "Adventure", style: "Tranquilla" },
      { brand: "Royal Enfield", model: "Interceptor 650", displacement: 648, type: "Naked", style: "Tranquilla" }
    ];
    BIKER_M_BIOS = [
      "Biker della domenica, ma in sella mi sento un campione! Cerco compagni per bei giri",
      "Amo le curve e le strade di montagna. Weekend = moto, sempre!",
      "La moto \xE8 libert\xE0. Punto. Cerco gente con la stessa passione",
      "Chilometri su chilometri, non mi fermo mai. Chi viene con me?",
      "Motociclista da sempre, le due ruote sono la mia vita",
      "Giro per tutta Italia appena posso. Le strade belle non finiscono mai",
      "Appassionato di moto e buon cibo. Meglio se insieme!",
      "Cerco compagni per giri nei weekend. No perditempo, solo passione vera",
      "La mia moto \xE8 la mia migliore amica. Cercasi altri amici su due ruote",
      "Ogni curva \xE8 un'emozione. Ogni viaggio un'avventura. Vieni?",
      "Nato in sella, morir\xF2 in sella. Nel frattempo cerco buona compagnia",
      "Weekend in moto, birra al tramonto. Cosa c'\xE8 di meglio?",
      "Strade panoramiche e tornanti: il mio habitat naturale",
      "Motociclista esperto, cerco gruppo per viaggi lunghi e avventure",
      "Due ruote, una passione infinita. Scrivetemi se condividete!"
    ];
    BIKER_F_BIOS = [
      "Motociclista e fiera di esserlo! Le ragazze in moto sono le migliori",
      "Chi dice che la moto \xE8 roba da uomini non ha mai visto me in sella!",
      "Amo la libert\xE0 della strada e il vento tra i capelli (sotto il casco!)",
      "Biker girl con la passione per i viaggi lunghi. Chi mi segue?",
      "La moto mi ha cambiato la vita. Cerco altre biker per condividere la passione",
      "Guido da sola ma preferisco la compagnia. Ragazze biker, dove siete?",
      "Strade, curve, tramonti e la mia moto. Cos'altro serve?",
      "Non lasciatevi ingannare dal look: in moto sono una furia!",
      "Weekend in sella, giorni feriali sogno la prossima uscita",
      "La moto \xE8 il mio antistress. Cerco anime affini per bei giri"
    ];
    ZAV_F_BIOS = [
      "Cerco un biker che mi porti a scoprire posti nuovi! Sono simpatica e avventurosa",
      "Sogno un giro in moto da sempre. Chi mi porta?",
      "Mi piace stare in moto dietro e godermi il panorama. Cercasi pilota!",
      "Avventurosa e senza paura: cercasi biker per belle esperienze",
      "La moto mi affascina ma non guido. Cerco qualcuno che mi porti a fare un giro",
      "Amo la velocit\xE0 e il vento in faccia. Chi mi offre un passaggio?",
      "Cercasi biker affidabile per giri nel weekend. Sono buona compagnia!",
      "Un giro in moto \xE8 sempre una bella avventura. Mi offro come passeggera ideale!",
      "Sognatrice con la passione per le due ruote. Cercasi cavaliere motorizzato",
      "Mi piacerebbe provare l'emozione della moto. Chi mi accompagna?"
    ];
    ZAV_M_BIOS = [
      "S\xEC, sono un ragazzo zavorrina! La guida la lascio a chi \xE8 pi\xF9 bravo",
      "Mi piace stare dietro e godermi il viaggio. Cerco bikers esperti!",
      "Non ho la patente A ma amo la moto. Cercasi pilota per bei giri",
      "Passeggero per passione! La moto mi piace ma preferisco non guidare",
      "Cerco biker per condividere l'esperienza su due ruote, io dietro ovviamente!"
    ];
    COUPLE_BIOS = [
      "Coppia unita dalla passione per la moto. Viaggiamo insieme ovunque!",
      "In moto insieme da anni, cerchiamo altri amici motociclisti",
      "Due cuori e una moto. Cerchiamo compagni per giri di gruppo",
      "La moto ci ha fatto incontrare e non ci ha pi\xF9 separato!",
      "Coppia on the road: cerchiamo altri per condividere avventure su due ruote",
      "Sempre insieme in sella. Le strade europee sono il nostro parco giochi",
      "La nostra storia d'amore \xE8 iniziata su una moto. Il resto \xE8 storia!",
      "Due persone, una moto, mille avventure. Chi si unisce?"
    ];
    WELCOME_MESSAGES = {
      biker_m: [
        "Benvenuto su BikerLink! \u{1F3CD}\uFE0F Qui troverai altri motociclisti della tua zona. Completa il profilo e inizia a cercare compagni di viaggio!",
        "Ciao biker! Benvenuto nella community di BikerLink. Aggiungi le tue moto al garage e fatti trovare dagli altri motociclisti!"
      ],
      biker_f: [
        "Benvenuta su BikerLink! \u{1F3CD}\uFE0F Qui troverai altri motociclisti della tua zona. Completa il profilo e inizia a cercare compagni di viaggio!",
        "Ciao biker! Benvenuta nella community di BikerLink. Aggiungi le tue moto al garage e fatti trovare!"
      ],
      zav_f: [
        "Benvenuta su BikerLink! \u{1F6F5} Come zavorrina potrai trovare biker disponibili nella tua zona. Compila la tua lista desideri per trovare il passaggio perfetto!",
        "Ciao! Benvenuta su BikerLink. Qui potrai trovare biker che offrono passaggi nella tua zona. Aggiungi le tue preferenze!"
      ],
      zav_m: [
        "Benvenuto su BikerLink! \u{1F6F5} Come zavorrina potrai trovare biker disponibili nella tua zona. Compila la tua lista desideri!",
        "Ciao! Benvenuto su BikerLink. Qui potrai trovare biker che offrono passaggi. Aggiungi le tue preferenze!"
      ],
      couple: [
        "Benvenuti su BikerLink! \u{1F3CD}\uFE0F Come coppia potrete trovare altri motociclisti e gruppi nella vostra zona. Completate il profilo!",
        "Ciao coppia! Benvenuti nella community. Aggiungete le vostre moto al garage e trovate compagni di viaggio!"
      ]
    };
  }
});

// server/uptime.ts
var uptime_exports = {};
__export(uptime_exports, {
  SERVER_START_TIME: () => SERVER_START_TIME,
  appendUptimeLog: () => appendUptimeLog,
  initUptimeTracking: () => initUptimeTracking,
  startMetroMonitor: () => startMetroMonitor,
  uptimeState: () => uptimeState
});
function ensureLogsDir() {
  if (!fs6.existsSync(LOGS_DIR)) fs6.mkdirSync(LOGS_DIR, { recursive: true });
}
function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1e3);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor(totalSec % 3600 / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
function appendUptimeLog(line) {
  try {
    ensureLogsDir();
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    fs6.appendFileSync(UPTIME_LOG, `${ts} ${line}
`, "utf-8");
  } catch {
  }
}
function readLastStartTime() {
  try {
    if (!fs6.existsSync(STATE_FILE)) return null;
    const raw = fs6.readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.startedAt === "number") return parsed.startedAt;
    return null;
  } catch {
    return null;
  }
}
function writeStartTime(ts) {
  try {
    ensureLogsDir();
    fs6.writeFileSync(STATE_FILE, JSON.stringify({ startedAt: ts }), "utf-8");
  } catch {
  }
}
function initUptimeTracking() {
  const now = SERVER_START_TIME;
  const lastStart = readLastStartTime();
  let reason;
  if (lastStart !== null) {
    const prevUptime = formatDuration(now - lastStart);
    appendUptimeLog(`BACKEND RESTART \u2014 previous uptime: ${prevUptime}`);
    reason = "restart";
  } else {
    appendUptimeLog("BACKEND UP (cold start)");
    reason = "cold_start";
  }
  writeStartTime(now);
  db.insert(serverRestarts).values({ startedAt: new Date(now), reason }).catch((err) => {
    console.warn("[uptime] Could not record server restart:", err);
  });
}
function startMetroMonitor() {
  const METRO_PORT = 8081;
  const INTERVAL_MS = 3e4;
  const checkMetro = () => {
    const req = http.get(
      { hostname: "localhost", port: METRO_PORT, path: "/status", timeout: 5e3 },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          const isRunning = body.includes("packager-status:running");
          if (isRunning) {
            uptimeState.metroLastSeenAt = Date.now();
          }
          if (isRunning && !uptimeState.metroOnline) {
            uptimeState.metroStartTime = Date.now();
            uptimeState.metroOnline = true;
            if (uptimeState.frontendStartTime === 0) {
              uptimeState.frontendStartTime = uptimeState.metroStartTime;
            }
            appendUptimeLog("METRO UP");
          } else if (!isRunning && uptimeState.metroOnline) {
            const uptime = uptimeState.metroStartTime > 0 ? formatDuration(Date.now() - uptimeState.metroStartTime) : "unknown";
            uptimeState.metroOnline = false;
            appendUptimeLog(`METRO DOWN \u2014 uptime: ${uptime}`);
          }
        });
      }
    );
    req.on("error", () => {
      if (uptimeState.metroOnline) {
        const uptime = uptimeState.metroStartTime > 0 ? formatDuration(Date.now() - uptimeState.metroStartTime) : "unknown";
        uptimeState.metroOnline = false;
        appendUptimeLog(`METRO DOWN \u2014 uptime: ${uptime}`);
      }
    });
    req.on("timeout", () => {
      req.destroy();
    });
  };
  setInterval(checkMetro, INTERVAL_MS);
  setTimeout(checkMetro, 5e3);
}
var fs6, path6, http, SERVER_START_TIME, uptimeState, LOGS_DIR, UPTIME_LOG, STATE_FILE;
var init_uptime = __esm({
  "server/uptime.ts"() {
    "use strict";
    fs6 = __toESM(require("fs"));
    path6 = __toESM(require("path"));
    http = __toESM(require("http"));
    init_db();
    init_schema();
    SERVER_START_TIME = Date.now();
    uptimeState = {
      metroStartTime: 0,
      metroLastSeenAt: 0,
      metroOnline: false,
      frontendStartTime: 0
    };
    LOGS_DIR = path6.resolve(process.cwd(), "logs");
    UPTIME_LOG = path6.join(LOGS_DIR, "uptime-resets.log");
    STATE_FILE = path6.join(LOGS_DIR, "backend-uptime-state.json");
  }
});

// server/mass-seed.ts
var mass_seed_exports = {};
__export(mass_seed_exports, {
  getMassSeedStatus: () => getMassSeedStatus,
  massSeedFakeUsers: () => massSeedFakeUsers
});
async function getMassSeedStatus() {
  if (!massSeedStatus.running && massSeedStatus.created === 0) {
    try {
      const checkpoint = await storage.getAppSetting("mass_seed_created_checkpoint");
      if (checkpoint?.value) {
        const saved = parseInt(checkpoint.value, 10);
        if (!isNaN(saved) && saved > 0) {
          return { ...massSeedStatus, created: saved, total: 5e3 };
        }
      }
    } catch {
    }
  }
  return { ...massSeedStatus };
}
function logSeedError(context, err) {
  const msg = err instanceof Error ? err.message : String(err);
  const entry = `[${context}] ${msg}`;
  seedErrors.push(entry);
  console.error(`[mass-seed] ${entry}`);
}
function buildSpecs() {
  const specs = [];
  const categories = [
    { userType: "biker", sex: "M", coupleSexConfig: null, count: 3e3 },
    { userType: "biker", sex: "F", coupleSexConfig: null, count: 500 },
    { userType: "coppia", sex: "M", coupleSexConfig: "M+F", count: 300 },
    { userType: "coppia", sex: "M", coupleSexConfig: "M+M", count: 150 },
    { userType: "coppia", sex: "F", coupleSexConfig: "F+F", count: 50 },
    { userType: "zavorrina", sex: "F", coupleSexConfig: null, count: 850 },
    { userType: "zavorrina", sex: "M", coupleSexConfig: null, count: 150 }
  ];
  const zoneCount = EUROPEAN_ZONES.length;
  for (const cat of categories) {
    const distribution = distributeUniformly(cat.count, zoneCount);
    let catIndex = 0;
    for (let r = 0; r < zoneCount; r++) {
      const zone = EUROPEAN_ZONES[r];
      for (let i = 0; i < distribution[r]; i++) {
        const csc = cat.coupleSexConfig ?? "none";
        specs.push({
          userType: cat.userType,
          sex: cat.sex,
          coupleSexConfig: cat.coupleSexConfig,
          region: zone.region,
          country: zone.country,
          lat: zone.lat,
          lng: zone.lng,
          spokenLanguages: zone.spokenLanguages,
          specKey: `${cat.userType}_${cat.sex}_${csc}_${zone.region}_${catIndex}`
        });
        catIndex++;
      }
    }
  }
  return specs;
}
async function ensureOfficialAccount() {
  const existing = await storage.getUserByNickname("BikerLink_Official");
  if (existing) {
    if (!existing.isFake) {
      await storage.updateUser(existing.id, { isFake: true });
    }
    return existing.id;
  }
  const noLoginPw = await import_bcryptjs2.default.hash(`__system_nologin__${Date.now()}__${Math.random()}`, 12);
  const user = await storage.createUser({
    nickname: "BikerLink_Official",
    email: "noreply-system@bikerlink.internal",
    password: noLoginPw,
    userType: "biker",
    sex: "M",
    role: "user",
    status: "active",
    isFake: true,
    region: "Lombardia",
    birthYear: 2e3,
    emailVerified: false,
    eulaAccepted: false
  });
  return user.id;
}
async function cleanupOldSeedUsers() {
  const allOldUsers = [];
  for (const tag of OLD_SEED_TAGS) {
    const tagged = await db.select({ id: users.id }).from(users).where((0, import_drizzle_orm7.eq)(users.invitationCode, tag));
    allOldUsers.push(...tagged);
  }
  const oldTaggedUsers = allOldUsers;
  if (oldTaggedUsers.length === 0) return;
  console.log(`[mass-seed] Cleaning up ${oldTaggedUsers.length} old seed users (tags: ${OLD_SEED_TAGS.join(", ")})...`);
  const CLEANUP_BATCH = 100;
  for (let i = 0; i < oldTaggedUsers.length; i += CLEANUP_BATCH) {
    const batch = oldTaggedUsers.slice(i, i + CLEANUP_BATCH);
    const ids = batch.map((u) => u.id);
    for (const uid of ids) {
      try {
        await db.delete(zavarrinaWishlistMotos).where(import_drizzle_orm7.sql`${zavarrinaWishlistMotos.wishlistId} IN (SELECT id FROM zavorrina_wishlists WHERE user_id = ${uid})`);
        await db.delete(zavarrinaWishlists).where((0, import_drizzle_orm7.eq)(zavarrinaWishlists.userId, uid));
        await db.delete(userMotorcycles).where((0, import_drizzle_orm7.eq)(userMotorcycles.userId, uid));
        const userConvs = await db.select({ convId: conversationParticipants.conversationId }).from(conversationParticipants).where((0, import_drizzle_orm7.eq)(conversationParticipants.userId, uid));
        for (const c of userConvs) {
          await db.delete(messages).where((0, import_drizzle_orm7.eq)(messages.conversationId, c.convId));
          await db.delete(conversationParticipants).where((0, import_drizzle_orm7.eq)(conversationParticipants.conversationId, c.convId));
          await db.delete(conversations).where((0, import_drizzle_orm7.eq)(conversations.id, c.convId));
        }
        await db.delete(userProfiles).where((0, import_drizzle_orm7.eq)(userProfiles.userId, uid));
        await db.delete(users).where((0, import_drizzle_orm7.eq)(users.id, uid));
      } catch (err) {
        logSeedError(`cleanup-old-user-${uid}`, err);
      }
    }
    if (i % (CLEANUP_BATCH * 5) === 0 && i > 0) {
      console.log(`[mass-seed] Cleanup progress: ${i}/${oldTaggedUsers.length}`);
    }
  }
  console.log(`[mass-seed] Cleanup complete: removed ${oldTaggedUsers.length} old seed users`);
}
async function reconcileExistingUsers(officialId) {
  const taggedUsers = await db.select({
    id: users.id,
    userType: users.userType,
    sex: users.sex,
    nickname: users.nickname
  }).from(users).where((0, import_drizzle_orm7.eq)(users.invitationCode, SEED_TAG));
  if (taggedUsers.length === 0) return;
  console.log(`[mass-seed] Reconcile bulk start for ${taggedUsers.length} users...`);
  const taggedIds = taggedUsers.map((u) => u.id);
  const [existingProfiles, existingMotoRows, existingWishlists, officialConvRows] = await Promise.all([
    db.select({ userId: userProfiles.userId }).from(userProfiles).where((0, import_drizzle_orm7.inArray)(userProfiles.userId, taggedIds)),
    db.select({ userId: userMotorcycles.userId }).from(userMotorcycles).where((0, import_drizzle_orm7.inArray)(userMotorcycles.userId, taggedIds)),
    db.select({ userId: zavarrinaWishlists.userId }).from(zavarrinaWishlists).where((0, import_drizzle_orm7.inArray)(zavarrinaWishlists.userId, taggedIds)),
    db.select({ convId: conversationParticipants.conversationId }).from(conversationParticipants).where((0, import_drizzle_orm7.eq)(conversationParticipants.userId, officialId))
  ]);
  const profileUserIds = new Set(existingProfiles.map((p) => p.userId));
  const motoCountByUser = /* @__PURE__ */ new Map();
  for (const row of existingMotoRows) {
    motoCountByUser.set(row.userId, (motoCountByUser.get(row.userId) ?? 0) + 1);
  }
  const wishlistUserIds = new Set(existingWishlists.map((w) => w.userId));
  const officialConvSet = new Set(officialConvRows.map((c) => c.convId));
  const taggedUserConvRows = await db.select({
    convId: conversationParticipants.conversationId,
    userId: conversationParticipants.userId
  }).from(conversationParticipants).where((0, import_drizzle_orm7.inArray)(conversationParticipants.userId, taggedIds));
  const usersWithOfficialConv = /* @__PURE__ */ new Set();
  for (const row of taggedUserConvRows) {
    if (officialConvSet.has(row.convId)) {
      usersWithOfficialConv.add(row.userId);
    }
  }
  const missingProfileRows = [];
  const missingMotoRows = [];
  for (const u of taggedUsers) {
    if (!profileUserIds.has(u.id)) {
      const zone = pickRandom(EUROPEAN_ZONES);
      missingProfileRows.push({
        userId: u.id,
        isAvailable: Math.random() > 0.3,
        latitude: zone.lat + randOffset(),
        longitude: zone.lng + randOffset(),
        maxPickupDistance: 20 + Math.floor(Math.random() * 80),
        bio: getBio(u.userType, u.sex)
      });
    }
    if (u.userType === "biker" || u.userType === "coppia") {
      const count3 = motoCountByUser.get(u.id) ?? 0;
      if (count3 < 2) {
        const motos = pickRandomN(MOTORCYCLES, 2 - count3);
        for (const moto of motos) {
          missingMotoRows.push({
            userId: u.id,
            brand: moto.brand,
            model: moto.model,
            year: getMotoYear(),
            displacement: moto.displacement,
            motorcycleType: moto.type,
            ridingStyle: moto.style
          });
        }
      }
    }
  }
  if (missingProfileRows.length > 0) {
    try {
      await db.insert(userProfiles).values(missingProfileRows).onConflictDoNothing();
    } catch (err) {
      logSeedError("reconcile-bulk-profiles", err);
    }
  }
  if (missingMotoRows.length > 0) {
    try {
      await db.insert(userMotorcycles).values(missingMotoRows);
    } catch (err) {
      logSeedError("reconcile-bulk-motos", err);
    }
  }
  const zavarrine = taggedUsers.filter((u) => u.userType === "zavorrina" && !wishlistUserIds.has(u.id));
  for (const u of zavarrine) {
    try {
      const wishlist = await storage.createOrUpdateWishlist(u.id, "Cerco un biker per bei giri in moto");
      const desiredMotos = pickRandomN(MOTORCYCLES, 2 + Math.floor(Math.random() * 2));
      const wishlistMotoValues = desiredMotos.map((m) => ({
        wishlistId: wishlist.id,
        brand: m.brand,
        model: m.model,
        motorcycleType: m.type,
        ridingStyle: m.style
      }));
      await db.insert(zavarrinaWishlistMotos).values(wishlistMotoValues);
    } catch (err) {
      logSeedError(`reconcile-wishlist-${u.id}`, err);
    }
  }
  const usersNeedingConv = taggedUsers.filter((u) => !usersWithOfficialConv.has(u.id));
  const CONV_BATCH = 100;
  for (let i = 0; i < usersNeedingConv.length; i += CONV_BATCH) {
    const batch = usersNeedingConv.slice(i, i + CONV_BATCH);
    try {
      const convRows = batch.map(() => ({ conversationType: "private" }));
      const createdConvs = await db.insert(conversations).values(convRows).returning();
      const participantRows = [];
      const messageRows = [];
      for (let j = 0; j < createdConvs.length; j++) {
        const conv = createdConvs[j];
        const u = batch[j];
        participantRows.push(
          { conversationId: conv.id, userId: officialId },
          { conversationId: conv.id, userId: u.id }
        );
        messageRows.push({
          conversationId: conv.id,
          senderId: officialId,
          content: getWelcomeMessage(u.userType, u.sex),
          messageType: "text"
        });
      }
      if (participantRows.length > 0) {
        await db.insert(conversationParticipants).values(participantRows).onConflictDoNothing();
      }
      if (messageRows.length > 0) {
        await db.insert(messages).values(messageRows);
      }
    } catch (err) {
      logSeedError(`reconcile-conv-batch-${i}`, err);
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  console.log(`[mass-seed] Reconcile complete: ${taggedUsers.length} users checked, ${missingProfileRows.length} profiles added, ${usersNeedingConv.length} convs added`);
}
async function massSeedFakeUsers() {
  if (massSeedStatus.running) return;
  seedErrors.length = 0;
  const allSpecs = buildSpecs();
  const TARGET = allSpecs.length;
  massSeedStatus = { running: true, created: 0, total: TARGET, error: null };
  const usedNicknames = /* @__PURE__ */ new Set();
  const usedEmails = /* @__PURE__ */ new Set();
  try {
    await storage.upsertAppSetting("skip_fake_user_seed", "false");
    await cleanupOldSeedUsers();
    const officialId = await ensureOfficialAccount();
    const existingTagged = await db.select({
      userType: users.userType,
      sex: users.sex,
      coupleSexConfig: users.coupleSexConfig,
      region: users.region
    }).from(users).where((0, import_drizzle_orm7.eq)(users.invitationCode, SEED_TAG));
    if (existingTagged.length > 0) {
      console.log(`[mass-seed] Found ${existingTagged.length} existing tagged users, reconciling...`);
      await reconcileExistingUsers(officialId);
    }
    const existingCounts = /* @__PURE__ */ new Map();
    for (const u of existingTagged) {
      const csc = u.coupleSexConfig ?? "none";
      const key = `${u.userType}_${u.sex}_${csc}_${u.region}`;
      existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
    }
    const specsToCreate = [];
    const specCountNeeded = /* @__PURE__ */ new Map();
    for (const spec of allSpecs) {
      const csc = spec.coupleSexConfig ?? "none";
      const catRegionKey = `${spec.userType}_${spec.sex}_${csc}_${spec.region}`;
      const alreadyCreated = existingCounts.get(catRegionKey) ?? 0;
      const alreadyAccounted = specCountNeeded.get(catRegionKey) ?? 0;
      if (alreadyAccounted < alreadyCreated) {
        specCountNeeded.set(catRegionKey, alreadyAccounted + 1);
      } else {
        specsToCreate.push(spec);
        specCountNeeded.set(catRegionKey, alreadyAccounted + 1);
      }
    }
    if (specsToCreate.length === 0) {
      massSeedStatus = { running: false, created: TARGET, total: TARGET, error: null };
      return;
    }
    massSeedStatus.created = existingTagged.length;
    if (existingTagged.length > 0) {
      storage.upsertAppSetting("mass_seed_created_checkpoint", existingTagged.length.toString()).catch(() => {
      });
    }
    const existingUsers = await db.select({ nickname: users.nickname, email: users.email }).from(users);
    for (const u of existingUsers) {
      usedNicknames.add(u.nickname.toLowerCase());
      usedEmails.add(u.email.toLowerCase());
    }
    const hashedPw = await import_bcryptjs2.default.hash("FakeUser2024!", 10);
    for (let batchStart = 0; batchStart < specsToCreate.length; batchStart += BATCH_SIZE) {
      const batch = specsToCreate.slice(batchStart, batchStart + BATCH_SIZE);
      const userRows = [];
      const specMeta = [];
      for (const spec of batch) {
        const nickname = generateUniqueNickname(spec.sex, usedNicknames);
        const email = generateUniqueEmail(nickname, usedEmails);
        const userLat = spec.lat + randOffset();
        const userLng = spec.lng + randOffset();
        userRows.push({
          nickname,
          email,
          password: hashedPw,
          userType: spec.userType,
          sex: spec.sex,
          coupleSexConfig: spec.coupleSexConfig,
          role: "user",
          status: "active",
          isFake: true,
          region: spec.region,
          birthYear: randBirthYear(),
          emailVerified: true,
          eulaAccepted: true,
          country: spec.country,
          spokenLanguages: spec.spokenLanguages,
          lastLoginAt: /* @__PURE__ */ new Date(),
          invitationCode: SEED_TAG,
          firstLoginLat: userLat,
          firstLoginLng: userLng
        });
        specMeta.push({ nickname, email, spec, lat: userLat, lng: userLng });
      }
      let insertedUsers;
      try {
        insertedUsers = await db.insert(users).values(userRows).onConflictDoNothing().returning();
      } catch (err) {
        logSeedError("batch-user-insert", err);
        insertedUsers = [];
        for (const row of userRows) {
          try {
            const [u] = await db.insert(users).values(row).onConflictDoNothing().returning();
            if (u) insertedUsers.push(u);
          } catch (innerErr) {
            logSeedError("single-user-insert", innerErr);
          }
        }
      }
      const profileRows = [];
      const motoRows = [];
      const wishlistInserts = [];
      const convInserts = [];
      for (const newUser of insertedUsers) {
        const meta = specMeta.find((m) => m.nickname === newUser.nickname);
        const spec = meta?.spec;
        if (!spec || !meta) continue;
        profileRows.push({
          userId: newUser.id,
          isAvailable: Math.random() > 0.3,
          latitude: meta.lat,
          longitude: meta.lng,
          maxPickupDistance: 20 + Math.floor(Math.random() * 80),
          bio: getBio(spec.userType, spec.sex)
        });
        if (spec.userType === "biker" || spec.userType === "coppia") {
          const motos = pickRandomN(MOTORCYCLES, 2 + Math.floor(Math.random() * 2));
          for (const moto of motos) {
            motoRows.push({
              userId: newUser.id,
              brand: moto.brand,
              model: moto.model,
              year: getMotoYear(),
              displacement: moto.displacement,
              motorcycleType: moto.type,
              ridingStyle: moto.style
            });
          }
        }
        if (spec.userType === "zavorrina") {
          wishlistInserts.push({ userId: newUser.id, spec });
        }
        convInserts.push({ userId: newUser.id, spec });
      }
      if (profileRows.length > 0) {
        try {
          await db.insert(userProfiles).values(profileRows).onConflictDoNothing();
        } catch (err) {
          logSeedError("batch-profile-insert", err);
          for (const row of profileRows) {
            try {
              await db.insert(userProfiles).values(row).onConflictDoNothing();
            } catch (innerErr) {
              logSeedError("single-profile-insert", innerErr);
            }
          }
        }
      }
      if (motoRows.length > 0) {
        try {
          await db.insert(userMotorcycles).values(motoRows);
        } catch (err) {
          logSeedError("batch-moto-insert", err);
          for (const row of motoRows) {
            try {
              await db.insert(userMotorcycles).values(row);
            } catch (innerErr) {
              logSeedError("single-moto-insert", innerErr);
            }
          }
        }
      }
      for (const wl of wishlistInserts) {
        try {
          const wishlist = await storage.createOrUpdateWishlist(wl.userId, "Cerco un biker per bei giri in moto");
          const desiredMotos = pickRandomN(MOTORCYCLES, 2 + Math.floor(Math.random() * 2));
          const wishlistMotoValues = desiredMotos.map((m) => ({
            wishlistId: wishlist.id,
            brand: m.brand,
            model: m.model,
            motorcycleType: m.type,
            ridingStyle: m.style
          }));
          await db.insert(zavarrinaWishlistMotos).values(wishlistMotoValues);
        } catch (err) {
          logSeedError(`wishlist-insert-${wl.userId}`, err);
        }
      }
      if (convInserts.length > 0) {
        try {
          const convRows = convInserts.map(() => ({ conversationType: "private" }));
          const createdConvs = await db.insert(conversations).values(convRows).returning();
          const participantRows = [];
          const messageRows = [];
          for (let i = 0; i < createdConvs.length; i++) {
            const conv = createdConvs[i];
            const ci = convInserts[i];
            participantRows.push(
              { conversationId: conv.id, userId: officialId },
              { conversationId: conv.id, userId: ci.userId }
            );
            messageRows.push({
              conversationId: conv.id,
              senderId: officialId,
              content: getWelcomeMessage(ci.spec.userType, ci.spec.sex),
              messageType: "text"
            });
          }
          if (participantRows.length > 0) {
            await db.insert(conversationParticipants).values(participantRows).onConflictDoNothing();
          }
          if (messageRows.length > 0) {
            await db.insert(messages).values(messageRows);
          }
        } catch (err) {
          logSeedError("batch-conv-insert", err);
          for (const ci of convInserts) {
            try {
              const [conv] = await db.insert(conversations).values({ conversationType: "private" }).returning();
              await db.insert(conversationParticipants).values([
                { conversationId: conv.id, userId: officialId },
                { conversationId: conv.id, userId: ci.userId }
              ]).onConflictDoNothing();
              await db.insert(messages).values({
                conversationId: conv.id,
                senderId: officialId,
                content: getWelcomeMessage(ci.spec.userType, ci.spec.sex),
                messageType: "text"
              });
            } catch (innerErr) {
              logSeedError(`single-conv-insert-${ci.userId}`, innerErr);
            }
          }
        }
      }
      if (insertedUsers.length > 0) {
        try {
          const approvedClubs = await db.select({ id: motoClubs.id, conversationId: motoClubs.conversationId, clubType: motoClubs.clubType, region: motoClubs.region }).from(motoClubs).innerJoin(conversations, (0, import_drizzle_orm7.eq)(motoClubs.conversationId, conversations.id)).where((0, import_drizzle_orm7.and)((0, import_drizzle_orm7.eq)(motoClubs.isApproved, true), (0, import_drizzle_orm7.eq)(motoClubs.clubType, "brand")));
          const approvedRegionalClubs = await db.select({ id: motoClubs.id, conversationId: motoClubs.conversationId, region: motoClubs.region }).from(motoClubs).innerJoin(conversations, (0, import_drizzle_orm7.eq)(motoClubs.conversationId, conversations.id)).where((0, import_drizzle_orm7.and)((0, import_drizzle_orm7.eq)(motoClubs.isApproved, true), (0, import_drizzle_orm7.eq)(motoClubs.clubType, "region")));
          const regionalClubByRegion = new Map(approvedRegionalClubs.map((c) => [c.region, c]));
          const clubMemberRows = [];
          const convParticipantRows = [];
          for (const newUser of insertedUsers) {
            const meta = specMeta.find((m) => m.nickname === newUser.nickname);
            const spec = meta?.spec;
            if (approvedClubs.length > 0) {
              const count3 = 1 + Math.floor(Math.random() * 2);
              const shuffled = [...approvedClubs].sort(() => Math.random() - 0.5).slice(0, count3);
              for (const club of shuffled) {
                clubMemberRows.push({ clubId: club.id, userId: newUser.id, role: "member", status: "active" });
                if (club.conversationId) {
                  convParticipantRows.push({ conversationId: club.conversationId, userId: newUser.id });
                }
              }
            }
            if (spec?.region && spec.country === "IT") {
              const regionalClub = regionalClubByRegion.get(spec.region);
              if (regionalClub) {
                clubMemberRows.push({ clubId: regionalClub.id, userId: newUser.id, role: "member", status: "active" });
                if (regionalClub.conversationId) {
                  convParticipantRows.push({ conversationId: regionalClub.conversationId, userId: newUser.id });
                }
              }
            }
          }
          if (clubMemberRows.length > 0) {
            try {
              await db.insert(motoClubMembers).values(clubMemberRows).onConflictDoNothing();
            } catch (err) {
              logSeedError("batch-club-member-insert", err);
            }
          }
          if (convParticipantRows.length > 0) {
            try {
              await db.insert(conversationParticipants).values(convParticipantRows).onConflictDoNothing();
            } catch (err) {
              logSeedError("batch-conv-participant-insert", err);
            }
          }
        } catch (err) {
          logSeedError("batch-club-query", err);
        }
      }
      massSeedStatus.created += insertedUsers.length;
      if (batchStart > 0 && batchStart % (BATCH_SIZE * 5) === 0) {
        console.log(`[mass-seed] Progress: ${massSeedStatus.created}/${massSeedStatus.total}`);
        storage.upsertAppSetting("mass_seed_created_checkpoint", massSeedStatus.created.toString()).catch(() => {
        });
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    const errorSummary = seedErrors.length > 0 ? `Completato con ${seedErrors.length} errori parziali` : null;
    massSeedStatus.error = errorSummary;
    storage.upsertAppSetting("mass_seed_created_checkpoint", massSeedStatus.created.toString()).catch(() => {
    });
    console.log(`[mass-seed] Complete: ${massSeedStatus.created} users created, ${seedErrors.length} errors`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Errore sconosciuto";
    massSeedStatus.error = msg;
    console.error("[mass-seed] Fatal error:", error);
  } finally {
    massSeedStatus.running = false;
  }
}
var import_bcryptjs2, import_drizzle_orm7, SEED_TAG, OLD_SEED_TAGS, massSeedStatus, BATCH_SIZE, seedErrors;
var init_mass_seed = __esm({
  "server/mass-seed.ts"() {
    "use strict";
    import_bcryptjs2 = __toESM(require("bcryptjs"));
    init_db();
    init_storage();
    init_schema();
    import_drizzle_orm7 = require("drizzle-orm");
    init_mass_seed_data();
    SEED_TAG = "mass_seed_5k_v1";
    OLD_SEED_TAGS = ["mass_seed_eu_v1", "mass_seed_2420"];
    massSeedStatus = { running: false, created: 0, total: 0, error: null };
    BATCH_SIZE = 50;
    seedErrors = [];
  }
});

// server/objectStorage.ts
function getClient() {
  if (!_client) {
    _client = new import_object_storage.Client();
  }
  return _client;
}
async function uploadBuffer(objectPath, buffer, contentType) {
  const client = getClient();
  const result = await client.uploadFromBytes(objectPath, buffer, {
    headers: { "Content-Type": contentType }
  });
  if (!result.ok) {
    throw new Error(`Upload fallito per ${objectPath}: ${result.error?.message}`);
  }
}
async function downloadBuffer(objectPath) {
  const client = getClient();
  const result = await client.downloadAsBytes(objectPath);
  if (!result.ok) {
    throw new Error(`Download fallito per ${objectPath}: ${result.error?.message}`);
  }
  return Buffer.from(result.value);
}
async function deleteObject(objectPath) {
  const client = getClient();
  const result = await client.delete(objectPath);
  if (!result.ok) {
    throw new Error(`Eliminazione fallita per ${objectPath}: ${result.error?.message}`);
  }
}
async function listObjects(prefix) {
  const client = getClient();
  const result = await client.list({ prefix });
  if (!result.ok) {
    return [];
  }
  const objects = result.value ?? [];
  return objects.map((obj) => ({
    name: obj.name,
    size: obj.size ?? 0,
    createdTime: obj.createdAt?.toISOString?.() ?? (/* @__PURE__ */ new Date()).toISOString()
  }));
}
var import_object_storage, _client;
var init_objectStorage = __esm({
  "server/objectStorage.ts"() {
    "use strict";
    import_object_storage = require("@replit/object-storage");
    _client = null;
  }
});

// server/backup-service.ts
var backup_service_exports = {};
__export(backup_service_exports, {
  backupDatabase: () => backupDatabase,
  backupMedia: () => backupMedia,
  downloadBackupBuffer: () => downloadBackupBuffer,
  getBackupStatus: () => getBackupStatus,
  listBackups: () => listBackups,
  purgeOldBackups: () => purgeOldBackups,
  restoreDatabase: () => restoreDatabase,
  setAutoBackupEnabled: () => setAutoBackupEnabled,
  startScheduler: () => startScheduler,
  stopScheduler: () => stopScheduler
});
function addMs(ms) {
  return new Date(Date.now() + ms);
}
async function deriveLastBackup(prefix) {
  try {
    const files = await listObjects(prefix);
    if (files.length === 0) return null;
    files.sort((a, b) => b.createdTime.localeCompare(a.createdTime));
    const latest = files[0];
    return { timestamp: latest.createdTime, size: latest.size };
  } catch {
    return null;
  }
}
async function getBackupStatus() {
  const [lastDbBackup, lastMediaBackup] = await Promise.all([
    deriveLastBackup(DB_PREFIX),
    deriveLastBackup(MEDIA_PREFIX)
  ]);
  return {
    scheduled: dbSchedulerTimer !== null,
    lastDbBackup,
    lastMediaBackup,
    isBackingUp,
    isRestoringDb,
    nextScheduled: dbNextAt?.toISOString() ?? null,
    nextMediaScheduled: mediaNextAt?.toISOString() ?? null,
    configured: true
  };
}
async function startScheduler() {
  await startDbScheduler();
  await startMediaScheduler();
}
async function startDbScheduler() {
  if (dbSchedulerTimer) return;
  const enabled = await isAutoBackupEnabled();
  if (!enabled) return;
  dbNextAt = addMs(INTERVAL_DB_MS);
  dbSchedulerTimer = setInterval(async () => {
    try {
      const stillEnabled = await isAutoBackupEnabled();
      if (!stillEnabled) {
        stopDbScheduler();
        return;
      }
      await backupDatabase();
      await purgeOldBackups();
      dbNextAt = addMs(INTERVAL_DB_MS);
    } catch (err) {
      console.error("[backup-service] Scheduled DB backup failed:", err);
      dbNextAt = addMs(INTERVAL_DB_MS);
    }
  }, INTERVAL_DB_MS);
  console.log("[backup-service] DB scheduler started (every 24h)");
}
async function startMediaScheduler() {
  if (mediaSchedulerTimer) return;
  const enabled = await isAutoBackupEnabled();
  if (!enabled) return;
  mediaNextAt = addMs(INTERVAL_MEDIA_MS);
  mediaSchedulerTimer = setInterval(async () => {
    try {
      const stillEnabled = await isAutoBackupEnabled();
      if (!stillEnabled) {
        stopMediaScheduler();
        return;
      }
      await backupMedia();
      await purgeOldBackups();
      mediaNextAt = addMs(INTERVAL_MEDIA_MS);
    } catch (err) {
      console.error("[backup-service] Scheduled media backup failed:", err);
      mediaNextAt = addMs(INTERVAL_MEDIA_MS);
    }
  }, INTERVAL_MEDIA_MS);
  console.log("[backup-service] Media scheduler started (every 7 days)");
}
function stopDbScheduler() {
  if (dbSchedulerTimer) {
    clearInterval(dbSchedulerTimer);
    dbSchedulerTimer = null;
    dbNextAt = null;
    console.log("[backup-service] DB scheduler stopped");
  }
}
function stopMediaScheduler() {
  if (mediaSchedulerTimer) {
    clearInterval(mediaSchedulerTimer);
    mediaSchedulerTimer = null;
    mediaNextAt = null;
    console.log("[backup-service] Media scheduler stopped");
  }
}
function stopScheduler() {
  stopDbScheduler();
  stopMediaScheduler();
}
async function isAutoBackupEnabled() {
  if (process.env.BACKUP_AUTO_ENABLED === "false") return false;
  if (process.env.BACKUP_AUTO_ENABLED === "true") return true;
  try {
    const rows = await db.select().from(appSettings).where((0, import_drizzle_orm8.eq)(appSettings.key, "backup_auto_enabled"));
    if (rows.length === 0) return true;
    return rows[0].value !== "false";
  } catch {
    return true;
  }
}
async function setAutoBackupEnabled(enabled) {
  try {
    const existing = await db.select().from(appSettings).where((0, import_drizzle_orm8.eq)(appSettings.key, "backup_auto_enabled"));
    if (existing.length > 0) {
      await db.update(appSettings).set({ value: enabled ? "true" : "false" }).where((0, import_drizzle_orm8.eq)(appSettings.key, "backup_auto_enabled"));
    } else {
      await db.insert(appSettings).values({
        key: "backup_auto_enabled",
        value: enabled ? "true" : "false",
        description: "Backup automatico (Replit Object Storage)"
      });
    }
    if (enabled) {
      await startScheduler();
    } else {
      stopScheduler();
    }
  } catch (err) {
    console.error("[backup-service] setAutoBackupEnabled error:", err);
    throw err;
  }
}
function getObjectPath(type, fileName) {
  const now = /* @__PURE__ */ new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const prefix = type === "db" ? DB_PREFIX : MEDIA_PREFIX;
  return `${prefix}/${year}/${month}/${fileName}`;
}
function getTimestamp() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}
async function backupDatabase() {
  if (isBackingUp) throw new Error("Backup gi\xE0 in corso");
  isBackingUp = true;
  const ts = getTimestamp();
  const tmpSql = import_path6.default.join(import_os.default.tmpdir(), `bikerlink_db_${ts}.sql`);
  const tmpGz = tmpSql + ".gz";
  try {
    const dbUrl = process.env.DATABASE_URL;
    await execAsync(`pg_dump "${dbUrl}" --clean --if-exists -f "${tmpSql}" --no-password`);
    await new Promise((resolve3, reject) => {
      const inp = import_fs6.default.createReadStream(tmpSql);
      const out = import_fs6.default.createWriteStream(tmpGz);
      const gz = import_zlib.default.createGzip({ level: 9 });
      inp.pipe(gz).pipe(out);
      out.on("finish", resolve3);
      out.on("error", reject);
      inp.on("error", reject);
    });
    const buf = import_fs6.default.readFileSync(tmpGz);
    const fileName = `bikerlink_db_${ts}.sql.gz`;
    const objectPath = getObjectPath("db", fileName);
    await uploadBuffer(objectPath, buf, "application/gzip");
    console.log(`[backup-service] DB backup salvato: ${objectPath} (${buf.length} bytes)`);
    return { path: objectPath, name: fileName, size: buf.length };
  } finally {
    isBackingUp = false;
    try {
      import_fs6.default.unlinkSync(tmpSql);
    } catch {
    }
    try {
      import_fs6.default.unlinkSync(tmpGz);
    } catch {
    }
  }
}
async function backupMedia() {
  if (isBackingUp) throw new Error("Backup gi\xE0 in corso");
  isBackingUp = true;
  const ts = getTimestamp();
  const tmpZip = import_path6.default.join(import_os.default.tmpdir(), `bikerlink_media_${ts}.zip`);
  try {
    const mediaDir = process.env.MEDIA_UPLOAD_DIR || process.env.UPLOAD_DIR || import_path6.default.join(process.cwd(), ".data", "uploads");
    const zipBuffer = await new Promise((resolve3, reject) => {
      const output = import_fs6.default.createWriteStream(tmpZip);
      const archive = (0, import_archiver.default)("zip", { zlib: { level: 6 } });
      archive.pipe(output);
      if (import_fs6.default.existsSync(mediaDir)) {
        archive.directory(mediaDir, false);
      } else {
        archive.append("(nessun file media)", { name: "README.txt" });
      }
      archive.finalize();
      output.on("close", () => resolve3(import_fs6.default.readFileSync(tmpZip)));
      archive.on("error", reject);
    });
    const fileName = `bikerlink_media_${ts}.zip`;
    const objectPath = getObjectPath("media", fileName);
    await uploadBuffer(objectPath, zipBuffer, "application/zip");
    console.log(`[backup-service] Media backup salvato: ${objectPath} (${zipBuffer.length} bytes)`);
    return { path: objectPath, name: fileName, size: zipBuffer.length };
  } finally {
    isBackingUp = false;
    try {
      import_fs6.default.unlinkSync(tmpZip);
    } catch {
    }
  }
}
async function restoreDatabase(objectPath) {
  if (isRestoringDb) throw new Error("Ripristino gi\xE0 in corso");
  isRestoringDb = true;
  const tmpGz = import_path6.default.join(import_os.default.tmpdir(), `bikerlink_restore_${Date.now()}.sql.gz`);
  const tmpSql = tmpGz.replace(".sql.gz", ".sql");
  try {
    const buf = await downloadBuffer(objectPath);
    import_fs6.default.writeFileSync(tmpGz, buf);
    await new Promise((resolve3, reject) => {
      const inp = import_fs6.default.createReadStream(tmpGz);
      const out = import_fs6.default.createWriteStream(tmpSql);
      const gz = import_zlib.default.createGunzip();
      inp.pipe(gz).pipe(out);
      out.on("finish", resolve3);
      out.on("error", reject);
      inp.on("error", reject);
    });
    const dbUrl = process.env.DATABASE_URL;
    await execAsync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -f "${tmpSql}" --no-password`);
    console.log("[backup-service] Database ripristinato con successo");
  } finally {
    isRestoringDb = false;
    try {
      import_fs6.default.unlinkSync(tmpGz);
    } catch {
    }
    try {
      import_fs6.default.unlinkSync(tmpSql);
    } catch {
    }
  }
}
async function listBackups() {
  const [dbFiles, mediaFiles] = await Promise.all([
    listObjects(DB_PREFIX).catch(() => []),
    listObjects(MEDIA_PREFIX).catch(() => [])
  ]);
  const toBackupFile = (f) => ({
    ...f,
    path: f.name,
    name: f.name.split("/").pop() ?? f.name
  });
  const db2 = dbFiles.map(toBackupFile).sort((a, b) => b.createdTime.localeCompare(a.createdTime));
  const media = mediaFiles.map(toBackupFile).sort((a, b) => b.createdTime.localeCompare(a.createdTime));
  return { db: db2, media };
}
async function purgeOldBackups() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1e3);
  const all = await listBackups();
  const toDelete = [...all.db, ...all.media].filter(
    (f) => new Date(f.createdTime) < cutoff
  );
  let deleted = 0;
  for (const f of toDelete) {
    try {
      await deleteObject(f.path);
      deleted++;
      console.log(`[backup-service] Eliminato backup vecchio: ${f.name}`);
    } catch (err) {
      console.error(`[backup-service] Impossibile eliminare ${f.name}:`, err);
    }
  }
  return deleted;
}
async function downloadBackupBuffer(objectPath) {
  return downloadBuffer(objectPath);
}
var import_child_process, import_util, import_zlib, import_archiver, import_fs6, import_os, import_path6, import_drizzle_orm8, execAsync, DB_PREFIX, MEDIA_PREFIX, RETENTION_DAYS, dbSchedulerTimer, mediaSchedulerTimer, dbNextAt, mediaNextAt, isBackingUp, isRestoringDb, INTERVAL_DB_MS, INTERVAL_MEDIA_MS;
var init_backup_service = __esm({
  "server/backup-service.ts"() {
    "use strict";
    import_child_process = require("child_process");
    import_util = require("util");
    import_zlib = __toESM(require("zlib"));
    import_archiver = __toESM(require("archiver"));
    import_fs6 = __toESM(require("fs"));
    import_os = __toESM(require("os"));
    import_path6 = __toESM(require("path"));
    init_objectStorage();
    init_db();
    init_schema();
    import_drizzle_orm8 = require("drizzle-orm");
    execAsync = (0, import_util.promisify)(import_child_process.exec);
    DB_PREFIX = "backup/database";
    MEDIA_PREFIX = "backup/media";
    RETENTION_DAYS = 90;
    dbSchedulerTimer = null;
    mediaSchedulerTimer = null;
    dbNextAt = null;
    mediaNextAt = null;
    isBackingUp = false;
    isRestoringDb = false;
    INTERVAL_DB_MS = 24 * 60 * 60 * 1e3;
    INTERVAL_MEDIA_MS = 7 * 24 * 60 * 60 * 1e3;
  }
});

// server/index.ts
var import_express21 = __toESM(require("express"));
var import_http_proxy_middleware = require("http-proxy-middleware");

// server/routes.ts
var import_node_http = require("node:http");
var import_node_path = __toESM(require("node:path"));
var import_node_fs = __toESM(require("node:fs"));

// server/init-state.ts
var initState = {
  initializing: true
};

// server/routes.ts
var import_express_session = __toESM(require("express-session"));
var import_connect_pg_simple = __toESM(require("connect-pg-simple"));
var import_multer4 = __toESM(require("multer"));
init_db();
init_storage();

// server/routes/auth.ts
var import_express2 = require("express");
var import_bcryptjs = __toESM(require("bcryptjs"));
var import_crypto = __toESM(require("crypto"));
var import_express_rate_limit = __toESM(require("express-rate-limit"));
init_schema();
init_storage();

// server/email.ts
var import_nodemailer = __toESM(require("nodemailer"));
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_sharp = __toESM(require("sharp"));
init_storage();
async function getEmailCredentials() {
  try {
    const userSetting = await storage.getAppSetting("gmail_user");
    const passSetting = await storage.getAppSetting("gmail_app_password");
    if (userSetting?.value && passSetting?.value) {
      return { user: userSetting.value, pass: passSetting.value };
    }
  } catch (e) {
  }
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (user && pass) {
    return { user, pass };
  }
  return null;
}
async function createTransporter() {
  const creds = await getEmailCredentials();
  if (!creds) {
    console.warn("[EMAIL] Credenziali Gmail non configurate. Email non inviata.");
    return null;
  }
  return import_nodemailer.default.createTransport({
    service: "gmail",
    auth: {
      user: creds.user,
      pass: creds.pass
    }
  });
}
async function sendEmail(to, subject, html) {
  const transporter = await createTransporter();
  if (!transporter) return false;
  const creds = await getEmailCredentials();
  if (!creds) return false;
  try {
    await transporter.sendMail({
      from: `"BikerLink" <${creds.user}>`,
      to,
      subject,
      html
    });
    console.log(`[EMAIL] Email inviata a ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error(`[EMAIL] Errore invio email a ${to}:`, error);
    return false;
  }
}
async function sendVerificationEmail(to, nickname, token) {
  const subject = "BikerLink - Codice di verifica email";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #FF6B35; margin: 0; font-size: 28px;">\u{1F3CD}\uFE0F BikerLink</h1>
        <p style="color: #888; font-size: 14px; margin-top: 4px;">U'll never ride alone</p>
      </div>

      <div style="background: #1a1a2e; border-radius: 12px; padding: 30px; color: #fff;">
        <h2 style="margin-top: 0; font-size: 20px;">Ciao ${nickname}!</h2>
        <p style="color: #ccc; line-height: 1.6;">
          Benvenuto su BikerLink! Per completare la registrazione, inserisci il seguente codice di verifica nell'app:
        </p>

        <div style="background: #FF6B35; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #fff;">${token}</span>
        </div>

        <p style="color: #999; font-size: 13px; line-height: 1.5;">
          Il codice scade tra 30 minuti.<br/>
          Se non hai richiesto questa verifica, ignora questa email.
        </p>
      </div>

      <p style="text-align: center; color: #666; font-size: 12px; margin-top: 20px;">
        \xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} BikerLink \u2014 Tutti i diritti riservati
      </p>
    </div>
  `;
  return sendEmail(to, subject, html);
}
async function sendInvitationGiftEmail(to, code, imageUrl, giftMessage, expiryDate) {
  const transporter = await createTransporter();
  if (!transporter) return false;
  const creds = await getEmailCredentials();
  if (!creds) return false;
  const expiryStr = expiryDate.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Rome"
  });
  const expiryTime = expiryDate.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome"
  });
  const expiryLabel = `Scade il ${expiryStr} alle ${expiryTime}`;
  let imageAttachment = null;
  let imageHtml = "";
  if (imageUrl) {
    try {
      const filePath = import_path.default.join(process.cwd(), imageUrl);
      if (import_fs.default.existsSync(filePath)) {
        const inputBuffer = import_fs.default.readFileSync(filePath);
        const meta = await (0, import_sharp.default)(inputBuffer).metadata();
        const imgWidth = meta.width ?? 600;
        const imgHeight = meta.height ?? 400;
        const overlayHeight = 54;
        const overlayY = imgHeight - overlayHeight;
        const svgOverlay = `
          <svg xmlns="http://www.w3.org/2000/svg" width="${imgWidth}" height="${imgHeight}">
            <rect x="0" y="${overlayY}" width="${imgWidth}" height="${overlayHeight}" fill="rgba(0,0,0,0.65)"/>
            <text
              x="${imgWidth / 2}"
              y="${overlayY + 34}"
              font-family="Arial, sans-serif"
              font-size="22"
              font-weight="bold"
              fill="white"
              text-anchor="middle"
            >${expiryLabel}</text>
          </svg>`;
        const outputBuffer = await (0, import_sharp.default)(inputBuffer).composite([{ input: Buffer.from(svgOverlay), blend: "over" }]).jpeg({ quality: 85 }).toBuffer();
        imageAttachment = {
          filename: "gadget.jpg",
          content: outputBuffer,
          cid: "gadget"
        };
        imageHtml = `<img src="cid:gadget" alt="Il tuo gadget" style="width:100%;max-width:480px;border-radius:10px;display:block;margin:20px auto 0;" />`;
      }
    } catch (err) {
      console.warn("[EMAIL] Errore compositing immagine gadget:", err);
    }
  }
  const subject = `BikerLink \u2014 Il tuo gadget omaggio ti aspetta!`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
      <div style="text-align:center;margin-bottom:30px;">
        <h1 style="color:#FF6B35;margin:0;font-size:28px;">\u{1F3CD}\uFE0F BikerLink</h1>
        <p style="color:#888;font-size:14px;margin-top:4px;">U'll never ride alone</p>
      </div>
      <div style="background:#1a1a2e;border-radius:12px;padding:30px;color:#fff;">
        <h2 style="margin-top:0;font-size:20px;">Benvenuto su BikerLink!</h2>
        <p style="color:#ccc;line-height:1.6;">
          Hai usato il codice <strong style="color:#FF6B35;">${code}</strong> al momento della registrazione.<br/>
          Il tuo gadget omaggio \xE8 pronto per te!
        </p>
        ${imageHtml}
        <div style="background:#FF6B35;border-radius:10px;padding:18px;text-align:center;margin:24px 0 0;">
          <span style="font-size:17px;font-weight:bold;color:#fff;">\u{1F381} Riscatta il tuo gadget entro 5 giorni!</span>
        </div>
        ${giftMessage ? `<p style="color:#bbb;font-size:14px;line-height:1.6;margin-top:20px;">${giftMessage}</p>` : ""}
      </div>
      <p style="text-align:center;color:#666;font-size:12px;margin-top:20px;">
        \xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} BikerLink \u2014 Tutti i diritti riservati
      </p>
    </div>
  `;
  try {
    const mailOptions = {
      from: `"BikerLink" <${creds.user}>`,
      to,
      subject,
      html,
      ...imageAttachment ? { attachments: [imageAttachment] } : {}
    };
    await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] Gift email inviata a ${to} per codice ${code}`);
    return true;
  } catch (error) {
    console.error(`[EMAIL] Errore invio gift email a ${to}:`, error);
    return false;
  }
}
async function sendPasswordResetEmail(to, nickname, code) {
  const subject = "BikerLink - Recupero password";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #FF6B35; margin: 0; font-size: 28px;">\u{1F3CD}\uFE0F BikerLink</h1>
        <p style="color: #888; font-size: 14px; margin-top: 4px;">U'll never ride alone</p>
      </div>

      <div style="background: #1a1a2e; border-radius: 12px; padding: 30px; color: #fff;">
        <h2 style="margin-top: 0; font-size: 20px;">Ciao ${nickname}!</h2>
        <p style="color: #ccc; line-height: 1.6;">
          Hai richiesto il recupero della password del tuo account BikerLink.<br/>
          Inserisci il seguente codice nell'app per reimpostare la password:
        </p>

        <div style="background: #FF6B35; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #fff;">${code}</span>
        </div>

        <p style="color: #999; font-size: 13px; line-height: 1.5;">
          Il codice scade tra 1 ora.<br/>
          Se non hai richiesto il recupero password, ignora questa email. Il tuo account \xE8 al sicuro.
        </p>
      </div>

      <p style="text-align: center; color: #666; font-size: 12px; margin-top: 20px;">
        \xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} BikerLink \u2014 Tutti i diritti riservati
      </p>
    </div>
  `;
  return sendEmail(to, subject, html);
}
async function sendPasswordResetConfirmationEmail(to, nickname) {
  const subject = "BikerLink - Password aggiornata";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #FF6B35; margin: 0; font-size: 28px;">\u{1F3CD}\uFE0F BikerLink</h1>
        <p style="color: #888; font-size: 14px; margin-top: 4px;">U'll never ride alone</p>
      </div>

      <div style="background: #1a1a2e; border-radius: 12px; padding: 30px; color: #fff;">
        <h2 style="margin-top: 0; font-size: 20px;">Ciao ${nickname}!</h2>
        <p style="color: #ccc; line-height: 1.6;">
          La tua password \xE8 stata aggiornata con successo. Ora sei di nuovo in pista! \u{1F3CD}\uFE0F
        </p>
        <p style="color: #999; font-size: 13px; line-height: 1.5;">
          Se non hai effettuato questa modifica, contatta subito il supporto.
        </p>
      </div>

      <p style="text-align: center; color: #666; font-size: 12px; margin-top: 20px;">
        \xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} BikerLink \u2014 Tutti i diritti riservati
      </p>
    </div>
  `;
  return sendEmail(to, subject, html);
}

// server/routes/motoclubs.ts
var import_express = require("express");
init_db();
init_storage();
init_schema();
var import_drizzle_orm3 = require("drizzle-orm");
var router = (0, import_express.Router)();
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}
var SEED_BRANDS = [
  { name: "Ducati", brandName: "Ducati", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Ducati_red_logo.svg/200px-Ducati_red_logo.svg.png" },
  { name: "BMW Motorrad", brandName: "BMW", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/BMW.svg/200px-BMW.svg.png" },
  { name: "Harley-Davidson", brandName: "Harley-Davidson", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Harley-Davidson_logo.svg/200px-Harley-Davidson_logo.svg.png" },
  { name: "Honda", brandName: "Honda", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Honda.svg/200px-Honda.svg.png" },
  { name: "Yamaha", brandName: "Yamaha", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Yamaha_logo.svg/200px-Yamaha_logo.svg.png" },
  { name: "Kawasaki", brandName: "Kawasaki", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Kawasaki-logo.svg/200px-Kawasaki-logo.svg.png" },
  { name: "Suzuki", brandName: "Suzuki", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Suzuki_logo_2.svg/200px-Suzuki_logo_2.svg.png" },
  { name: "KTM", brandName: "KTM", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/KTM_Logo.svg/200px-KTM_Logo.svg.png" },
  { name: "Triumph", brandName: "Triumph", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Triumph_Motorcycles_logo.svg/200px-Triumph_Motorcycles_logo.svg.png" },
  { name: "Aprilia", brandName: "Aprilia", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Aprilia-logo.svg/200px-Aprilia-logo.svg.png" },
  { name: "Moto Guzzi", brandName: "Moto Guzzi", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Moto_Guzzi_logo.svg/200px-Moto_Guzzi_logo.svg.png" },
  { name: "MV Agusta", brandName: "MV Agusta", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/MV_Agusta_logo.svg/200px-MV_Agusta_logo.svg.png" },
  { name: "Royal Enfield", brandName: "Royal Enfield", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Royal-Enfield-Logo.svg/200px-Royal-Enfield-Logo.svg.png" },
  { name: "Indian Motorcycle", brandName: "Indian", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Indian_Motorcycle_logo.svg/200px-Indian_Motorcycle_logo.svg.png" },
  { name: "Benelli", brandName: "Benelli", logoUrl: null },
  { name: "Norton", brandName: "Norton", logoUrl: null },
  { name: "Husqvarna", brandName: "Husqvarna", logoUrl: null },
  { name: "Gas Gas", brandName: "Gas Gas", logoUrl: null },
  { name: "Moto Morini", brandName: "Moto Morini", logoUrl: null },
  { name: "Zero Motorcycles", brandName: "Zero", logoUrl: null }
];
var SEED_REGIONS = [
  { region: "Piemonte", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Coat_of_arms_of_Piedmont.svg/150px-Coat_of_arms_of_Piedmont.svg.png" },
  { region: "Valle d'Aosta", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Coat_of_arms_of_Aosta_Valley.svg/150px-Coat_of_arms_of_Aosta_Valley.svg.png" },
  { region: "Lombardia", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Coat_of_arms_of_Lombardy.svg/150px-Coat_of_arms_of_Lombardy.svg.png" },
  { region: "Trentino-Alto Adige", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Coat_of_Arms_of_Trentino-Alto_Adige.svg/150px-Coat_of_Arms_of_Trentino-Alto_Adige.svg.png" },
  { region: "Veneto", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Coat_of_arms_of_Veneto.svg/150px-Coat_of_arms_of_Veneto.svg.png" },
  { region: "Friuli-Venezia Giulia", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Coat_of_arms_of_Friuli-Venezia_Giulia.svg/150px-Coat_of_arms_of_Friuli-Venezia_Giulia.svg.png" },
  { region: "Liguria", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Coat_of_arms_of_Liguria.svg/150px-Coat_of_arms_of_Liguria.svg.png" },
  { region: "Emilia-Romagna", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Coat_of_arms_of_Emilia-Romagna.svg/150px-Coat_of_arms_of_Emilia-Romagna.svg.png" },
  { region: "Toscana", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Coat_of_arms_of_Tuscany.svg/150px-Coat_of_arms_of_Tuscany.svg.png" },
  { region: "Umbria", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Coat_of_arms_of_Umbria.svg/150px-Coat_of_arms_of_Umbria.svg.png" },
  { region: "Marche", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Coat_of_arms_of_Marche.svg/150px-Coat_of_arms_of_Marche.svg.png" },
  { region: "Lazio", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Coat_of_arms_of_Lazio.svg/150px-Coat_of_arms_of_Lazio.svg.png" },
  { region: "Abruzzo", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Coat_of_arms_of_Abruzzo.svg/150px-Coat_of_arms_of_Abruzzo.svg.png" },
  { region: "Molise", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Coat_of_arms_of_Molise.svg/150px-Coat_of_arms_of_Molise.svg.png" },
  { region: "Campania", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Coat_of_arms_of_Campania.svg/150px-Coat_of_arms_of_Campania.svg.png" },
  { region: "Puglia", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Coat_of_arms_of_Apulia.svg/150px-Coat_of_arms_of_Apulia.svg.png" },
  { region: "Basilicata", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Coat_of_arms_of_Basilicata.svg/150px-Coat_of_arms_of_Basilicata.svg.png" },
  { region: "Calabria", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Coat_of_arms_of_Calabria.svg/150px-Coat_of_arms_of_Calabria.svg.png" },
  { region: "Sicilia", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Coat_of_Arms_of_Sicily.svg/150px-Coat_of_Arms_of_Sicily.svg.png" },
  { region: "Sardegna", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Coat_of_arms_of_Sardinia.svg/150px-Coat_of_arms_of_Sardinia.svg.png" }
];
async function seedMotoclubs() {
  try {
    const [{ brandCount }] = await db.select({ brandCount: import_drizzle_orm3.sql`count(*)` }).from(motoClubs).where((0, import_drizzle_orm3.eq)(motoClubs.clubType, "brand"));
    const [{ regionCount }] = await db.select({ regionCount: import_drizzle_orm3.sql`count(*)` }).from(motoClubs).where((0, import_drizzle_orm3.eq)(motoClubs.clubType, "region"));
    if (Number(brandCount) === 0) {
      for (const b of SEED_BRANDS) {
        await db.insert(motoClubs).values({
          name: b.name,
          clubType: "brand",
          brandName: b.brandName,
          logoUrl: b.logoUrl ?? null,
          isApproved: true,
          activityScore: 0
        });
      }
      console.log("[Motoclub] Seed brand:", SEED_BRANDS.length, "club");
    }
    if (Number(regionCount) === 0) {
      for (const r of SEED_REGIONS) {
        await db.insert(motoClubs).values({
          name: `Motoclub ${r.region}`,
          clubType: "region",
          region: r.region,
          country: "IT",
          logoUrl: r.logoUrl,
          isApproved: true,
          activityScore: 0
        });
      }
      console.log("[Motoclub] Seed regionali:", SEED_REGIONS.length, "club");
    }
  } catch (e) {
    console.error("[Motoclub seed error]", e);
  }
}
async function createRegionalClubInvite(userId, region) {
  try {
    const user = await storage.getUser(userId);
    if (!user) return;
    const [regionalClub] = await db.select().from(motoClubs).where(
      (0, import_drizzle_orm3.and)(
        (0, import_drizzle_orm3.eq)(motoClubs.isApproved, true),
        (0, import_drizzle_orm3.eq)(motoClubs.clubType, "region"),
        (0, import_drizzle_orm3.eq)(motoClubs.region, region)
      )
    ).limit(1);
    if (!regionalClub) return;
    const isMember = await db.select().from(motoClubMembers).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, regionalClub.id), (0, import_drizzle_orm3.eq)(motoClubMembers.userId, userId))).limit(1);
    if (isMember.length > 0) return;
    const existingInvite = await db.select().from(motoClubInvites).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubInvites.clubId, regionalClub.id), (0, import_drizzle_orm3.eq)(motoClubInvites.userId, userId))).limit(1);
    if (existingInvite.length > 0) return;
    if (user.autoJoinClubs === false) {
      const inserted = await db.insert(motoClubInvites).values({ clubId: regionalClub.id, userId, status: "pending" }).onConflictDoNothing().returning({ id: motoClubInvites.id });
      if (inserted.length > 0) {
        await storage.createNotification({
          userId,
          title: "Invito al club regionale",
          body: `Sei stato invitato nel club "${regionalClub.name}"`,
          notificationType: "motoclub_invite",
          referenceType: "motoclub",
          referenceId: regionalClub.id
        });
      }
      return;
    }
    await db.insert(motoClubMembers).values({ clubId: regionalClub.id, userId, status: "active" }).onConflictDoNothing();
    let convId = regionalClub.conversationId;
    if (!convId) convId = await createClubConversation(regionalClub.id, regionalClub.name);
    if (convId) await addMemberToConversation(convId, userId);
    await db.update(motoClubs).set({ activityScore: import_drizzle_orm3.sql`activity_score + 2`, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.eq)(motoClubs.id, regionalClub.id));
    await storage.createNotification({
      userId,
      title: "Sei entrato nel club!",
      body: `Benvenuto nel club regionale "${regionalClub.name}" \u{1F3CD}\uFE0F`,
      notificationType: "motoclub_invite",
      referenceType: "motoclub",
      referenceId: regionalClub.id
    });
  } catch (e) {
    console.error("[createRegionalClubInvite error]", e);
  }
}
async function createClubInvitesForMoto(userId, brand, model) {
  try {
    const user = await storage.getUser(userId);
    if (!user) return;
    const matchingClubs = await db.select().from(motoClubs).where(
      (0, import_drizzle_orm3.and)(
        (0, import_drizzle_orm3.eq)(motoClubs.isApproved, true),
        (0, import_drizzle_orm3.eq)(motoClubs.clubType, "brand"),
        (0, import_drizzle_orm3.or)(
          (0, import_drizzle_orm3.ilike)(motoClubs.brandName, brand),
          import_drizzle_orm3.sql`${motoClubs.brandName} ilike ${"%" + brand + "%"}`,
          import_drizzle_orm3.sql`${brand} ilike '%' || ${motoClubs.brandName} || '%'`
        )
      )
    );
    for (const club of matchingClubs) {
      const isMember = await db.select().from(motoClubMembers).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, club.id), (0, import_drizzle_orm3.eq)(motoClubMembers.userId, userId))).limit(1);
      if (isMember.length > 0) continue;
      const existingInvite = await db.select().from(motoClubInvites).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubInvites.clubId, club.id), (0, import_drizzle_orm3.eq)(motoClubInvites.userId, userId))).limit(1);
      if (existingInvite.length > 0) continue;
      if (user.autoJoinClubs === false) {
        const inserted = await db.insert(motoClubInvites).values({ clubId: club.id, userId, status: "pending" }).onConflictDoNothing().returning({ id: motoClubInvites.id });
        if (inserted.length > 0) {
          await storage.createNotification({
            userId,
            title: "Invito al club",
            body: `Sei stato invitato nel club "${club.name}"`,
            notificationType: "motoclub_invite",
            referenceType: "motoclub",
            referenceId: club.id
          });
        }
        continue;
      }
      await db.insert(motoClubMembers).values({ clubId: club.id, userId, status: "active" }).onConflictDoNothing();
      let convId = club.conversationId;
      if (!convId) convId = await createClubConversation(club.id, club.name);
      if (convId) await addMemberToConversation(convId, userId);
      await db.update(motoClubs).set({ activityScore: import_drizzle_orm3.sql`activity_score + 2`, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.eq)(motoClubs.id, club.id));
      await storage.createNotification({
        userId,
        title: "Sei entrato nel club!",
        body: `Benvenuto nel club "${club.name}" \u2014 hai una ${brand} \u{1F3CD}\uFE0F`,
        notificationType: "motoclub_invite",
        referenceType: "motoclub",
        referenceId: club.id
      });
    }
  } catch (e) {
    console.error("[createClubInvites error]", e);
  }
}
async function createClubConversation(clubId, clubName) {
  const existing = await db.select().from(motoClubs).where((0, import_drizzle_orm3.eq)(motoClubs.id, clubId)).limit(1);
  if (!existing[0] || existing[0].conversationId) return existing[0]?.conversationId ?? null;
  const [conv] = await db.insert(conversations).values({
    conversationType: "motoclub",
    title: `Club ${clubName}`
  }).returning();
  await db.update(motoClubs).set({ conversationId: conv.id, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.eq)(motoClubs.id, clubId));
  return conv.id;
}
async function addMemberToConversation(conversationId, userId) {
  await db.insert(conversationParticipants).values({
    conversationId,
    userId
  }).onConflictDoNothing();
}
async function removeMemberFromConversation(conversationId, userId) {
  await db.delete(conversationParticipants).where((0, import_drizzle_orm3.and)(
    (0, import_drizzle_orm3.eq)(conversationParticipants.conversationId, conversationId),
    (0, import_drizzle_orm3.eq)(conversationParticipants.userId, userId)
  ));
}
async function notifyTopMembersOfNewJoin(clubId, newUserId, clubName) {
  try {
    const club = await db.select().from(motoClubs).where((0, import_drizzle_orm3.eq)(motoClubs.id, clubId)).limit(1);
    if (!club[0]?.conversationId) return;
    const convId = club[0].conversationId;
    const topSenders = await db.select({
      senderId: messages.senderId,
      count: import_drizzle_orm3.sql`count(*)::int`
    }).from(messages).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(messages.conversationId, convId), (0, import_drizzle_orm3.ne)(messages.senderId, newUserId))).groupBy(messages.senderId).orderBy((0, import_drizzle_orm3.desc)(import_drizzle_orm3.sql`count(*)`)).limit(3);
    const newUser = await storage.getUser(newUserId);
    for (const row of topSenders) {
      await storage.createNotification({
        userId: row.senderId,
        title: `Nuovo membro in ${clubName}!`,
        body: `${newUser?.nickname ?? "Un nuovo utente"} \xE8 entrato nel tuo club`,
        notificationType: "motoclub_join",
        referenceType: "motoclub",
        referenceId: clubId
      });
    }
  } catch (e) {
    console.error("[notifyTopMembers error]", e);
  }
}
router.get("/", requireAuth, async (req, res) => {
  try {
    const { type, search, country, region, language } = req.query;
    let query = db.select({
      club: motoClubs,
      memberCount: import_drizzle_orm3.sql`(select count(*) from moto_club_members m where m.club_id = moto_clubs.id and m.status = 'active')::int`
    }).from(motoClubs).where((0, import_drizzle_orm3.eq)(motoClubs.isApproved, true));
    const conditions = [(0, import_drizzle_orm3.eq)(motoClubs.isApproved, true)];
    if (type) conditions.push((0, import_drizzle_orm3.eq)(motoClubs.clubType, type));
    if (search) conditions.push((0, import_drizzle_orm3.or)((0, import_drizzle_orm3.ilike)(motoClubs.name, `%${search}%`), (0, import_drizzle_orm3.ilike)(motoClubs.brandName, `%${search}%`), (0, import_drizzle_orm3.ilike)(motoClubs.modelName, `%${search}%`)));
    const clubs = await db.select({
      club: motoClubs,
      memberCount: import_drizzle_orm3.sql`(select count(*) from moto_club_members m where m.club_id = moto_clubs.id and m.status = 'active')::int`
    }).from(motoClubs).where((0, import_drizzle_orm3.and)(...conditions)).orderBy(
      import_drizzle_orm3.sql`CASE ${motoClubs.clubType} WHEN 'brand' THEN 1 WHEN 'model' THEN 2 WHEN 'custom' THEN 3 WHEN 'region' THEN 4 ELSE 5 END`,
      (0, import_drizzle_orm3.desc)(motoClubs.activityScore),
      motoClubs.name
    );
    let result = clubs.map((r) => ({ ...r.club, memberCount: r.memberCount }));
    if (country || region || language) {
      const memberCountsByClub = {};
      const filteredClubIds = await Promise.all(
        result.map(async (club) => {
          const memberQuery = db.select({ u: users }).from(motoClubMembers).innerJoin(users, (0, import_drizzle_orm3.eq)(users.id, motoClubMembers.userId)).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, club.id), (0, import_drizzle_orm3.eq)(motoClubMembers.status, "active")));
          const members = await memberQuery;
          const filtered = members.filter(({ u }) => {
            if (country && u.country?.toUpperCase() !== country.toUpperCase()) return false;
            if (region && !u.region?.toLowerCase().includes(region.toLowerCase())) return false;
            if (language) {
              const langs = u.spokenLanguages ?? [];
              if (!langs.includes(language)) return false;
            }
            return true;
          });
          if (filtered.length === 0 && (country || region || language)) return null;
          memberCountsByClub[club.id] = filtered.length;
          return club.id;
        })
      );
      const validIds = new Set(filteredClubIds.filter(Boolean));
      result = result.filter((c) => validIds.has(c.id));
    }
    return res.json(result);
  } catch (e) {
    console.error("[GET /motoclubs]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});
router.get("/featured", requireAuth, async (_req, res) => {
  try {
    const [club] = await db.select({
      club: motoClubs,
      memberCount: import_drizzle_orm3.sql`(select count(*) from moto_club_members m where m.club_id = moto_clubs.id and m.status = 'active')::int`
    }).from(motoClubs).where((0, import_drizzle_orm3.eq)(motoClubs.isApproved, true)).orderBy((0, import_drizzle_orm3.desc)(motoClubs.activityScore)).limit(1);
    return res.json(club ? { ...club.club, memberCount: club.memberCount } : null);
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});
router.get("/invites", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const invites = await db.select({
      invite: motoClubInvites,
      club: motoClubs
    }).from(motoClubInvites).innerJoin(motoClubs, (0, import_drizzle_orm3.eq)(motoClubs.id, motoClubInvites.clubId)).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubInvites.userId, userId), (0, import_drizzle_orm3.eq)(motoClubInvites.status, "pending")));
    return res.json(invites.map((r) => ({ ...r.invite, club: r.club })));
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const clubId = req.params.id;
    const [club] = await db.select().from(motoClubs).where((0, import_drizzle_orm3.eq)(motoClubs.id, clubId)).limit(1);
    if (!club) return res.status(404).json({ message: "Club non trovato" });
    const membersRaw = await db.select({
      member: motoClubMembers,
      user: users,
      profile: userProfiles
    }).from(motoClubMembers).innerJoin(users, (0, import_drizzle_orm3.eq)(users.id, motoClubMembers.userId)).leftJoin(userProfiles, (0, import_drizzle_orm3.eq)(userProfiles.userId, motoClubMembers.userId)).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, clubId), (0, import_drizzle_orm3.eq)(motoClubMembers.status, "active")));
    const members = membersRaw.map((r) => ({
      userId: r.user.id,
      nickname: r.user.nickname,
      userType: r.user.userType,
      avatarUrl: r.user.avatarUrl,
      country: r.user.country,
      joinedAt: r.member.joinedAt
    }));
    return res.json({ ...club, members, memberCount: members.length });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});
router.get("/:id/marketplace", requireAuth, async (req, res) => {
  try {
    const { storage: storage2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
    const marketplaceSetting = await storage2.getAppSetting("marketplace_enabled");
    if (marketplaceSetting?.value === "false") {
      return res.json([]);
    }
    const clubId = req.params.id;
    const userId = req.session.userId;
    const [isMember] = await db.select({ userId: motoClubMembers.userId }).from(motoClubMembers).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, clubId), (0, import_drizzle_orm3.eq)(motoClubMembers.userId, userId), (0, import_drizzle_orm3.eq)(motoClubMembers.status, "active"))).limit(1);
    if (!isMember) return res.status(403).json({ message: "Devi essere membro del club" });
    const memberIds = await db.select({ userId: motoClubMembers.userId }).from(motoClubMembers).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, clubId), (0, import_drizzle_orm3.eq)(motoClubMembers.status, "active")));
    if (memberIds.length === 0) return res.json([]);
    const ids = memberIds.map((m) => m.userId);
    const motos = await db.select({
      moto: userMotorcycles,
      user: { id: users.id, nickname: users.nickname, avatarUrl: users.avatarUrl }
    }).from(userMotorcycles).innerJoin(users, (0, import_drizzle_orm3.eq)(users.id, userMotorcycles.userId)).where((0, import_drizzle_orm3.and)(
      (0, import_drizzle_orm3.eq)(userMotorcycles.isForSale, true),
      import_drizzle_orm3.sql`${userMotorcycles.userId} IN (${import_drizzle_orm3.sql.join(ids.map((id) => import_drizzle_orm3.sql`${id}`), import_drizzle_orm3.sql`, `)})`
    )).orderBy((0, import_drizzle_orm3.desc)(userMotorcycles.createdAt));
    const result = motos.map((r) => ({
      id: r.moto.id,
      brand: r.moto.brand,
      model: r.moto.model,
      year: r.moto.year,
      displacement: r.moto.displacement,
      motorcycleType: r.moto.motorcycleType,
      photoUrl: r.moto.photoUrl,
      saleDescription: r.moto.saleDescription,
      seller: r.user
    }));
    return res.json(result);
  } catch (e) {
    console.error("Club marketplace error:", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});
router.get("/:id/detail", requireAuth, async (req, res) => {
  try {
    const clubId = req.params.id;
    const userId = req.session.userId;
    const limit = Math.min(parseInt(String(req.query.limit ?? "30"), 10) || 30, 50);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const [club] = await db.select().from(motoClubs).where((0, import_drizzle_orm3.eq)(motoClubs.id, clubId)).limit(1);
    if (!club) return res.status(404).json({ message: "Club non trovato" });
    const [membership] = await db.select({ id: motoClubMembers.id }).from(motoClubMembers).where((0, import_drizzle_orm3.and)(
      (0, import_drizzle_orm3.eq)(motoClubMembers.clubId, clubId),
      (0, import_drizzle_orm3.eq)(motoClubMembers.userId, userId),
      (0, import_drizzle_orm3.eq)(motoClubMembers.status, "active")
    )).limit(1);
    if (!membership) return res.status(403).json({ message: "Non sei membro di questo club" });
    const [{ totalCount }] = await db.select({ totalCount: (0, import_drizzle_orm3.count)(motoClubMembers.id) }).from(motoClubMembers).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, clubId), (0, import_drizzle_orm3.eq)(motoClubMembers.status, "active")));
    const memberships = await db.select({
      profileId: motoClubMembers.userId,
      role: motoClubMembers.role,
      joinedAt: motoClubMembers.joinedAt,
      nickname: users.nickname,
      userType: users.userType,
      avatarUrl: users.avatarUrl,
      country: users.country
    }).from(motoClubMembers).innerJoin(users, (0, import_drizzle_orm3.eq)(motoClubMembers.userId, users.id)).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, clubId), (0, import_drizzle_orm3.eq)(motoClubMembers.status, "active"))).orderBy(motoClubMembers.joinedAt).limit(limit).offset(offset);
    const total = Number(totalCount);
    return res.json({ ...club, members: memberships, totalCount: total, hasMore: offset + limit < total });
  } catch (e) {
    console.error("[GET /:id/detail]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});
router.get("/:id/stats", requireAuth, async (req, res) => {
  try {
    const clubId = req.params.id;
    const members = await db.select({ userId: motoClubMembers.userId }).from(motoClubMembers).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, clubId), (0, import_drizzle_orm3.eq)(motoClubMembers.status, "active")));
    if (members.length === 0) return res.json({ totalKm: 0, totalRides: 0, memberCount: 0 });
    const memberIds = members.map((m) => m.userId);
    const stats = await db.select({
      totalKm: import_drizzle_orm3.sql`coalesce(sum(total_distance_km), 0)::float`,
      totalRides: import_drizzle_orm3.sql`count(*)::int`
    }).from(routes).where(import_drizzle_orm3.sql`user_id = ANY(${memberIds}) AND status = 'completed'`);
    return res.json({
      totalKm: Math.round((stats[0]?.totalKm ?? 0) * 10) / 10,
      totalRides: stats[0]?.totalRides ?? 0,
      memberCount: members.length
    });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});
router.post("/:id/join", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const clubId = req.params.id;
    const [club] = await db.select().from(motoClubs).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubs.id, clubId), (0, import_drizzle_orm3.eq)(motoClubs.isApproved, true))).limit(1);
    if (!club) return res.status(404).json({ message: "Club non trovato" });
    const existing = await db.select().from(motoClubMembers).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, clubId), (0, import_drizzle_orm3.eq)(motoClubMembers.userId, userId))).limit(1);
    if (existing.length > 0 && existing[0].status === "active") {
      return res.status(409).json({ message: "Sei gi\xE0 membro di questo club" });
    }
    if (existing.length > 0) {
      await db.update(motoClubMembers).set({ status: "active", joinedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, clubId), (0, import_drizzle_orm3.eq)(motoClubMembers.userId, userId)));
    } else {
      await db.insert(motoClubMembers).values({ clubId, userId, status: "active" });
    }
    await db.update(motoClubInvites).set({ status: "accepted" }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubInvites.clubId, clubId), (0, import_drizzle_orm3.eq)(motoClubInvites.userId, userId)));
    let convId = club.conversationId;
    const conversationWasNew = !convId;
    if (!convId) {
      convId = await createClubConversation(clubId, club.name);
    }
    if (convId) {
      await addMemberToConversation(convId, userId);
      if (conversationWasNew) {
        const existingMembers = await db.select({ userId: motoClubMembers.userId }).from(motoClubMembers).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, clubId), (0, import_drizzle_orm3.eq)(motoClubMembers.status, "active")));
        const participantRows = existingMembers.filter((m) => m.userId !== userId).map((m) => ({ conversationId: convId, userId: m.userId }));
        if (participantRows.length > 0) {
          await db.insert(conversationParticipants).values(participantRows).onConflictDoNothing();
        }
      }
    }
    await db.update(motoClubs).set({ activityScore: import_drizzle_orm3.sql`activity_score + 2`, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.eq)(motoClubs.id, clubId));
    await notifyTopMembersOfNewJoin(clubId, userId, club.name);
    return res.json({ message: "Sei entrato nel club" });
  } catch (e) {
    console.error("[POST /motoclubs/:id/join]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});
router.post("/:id/leave", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const clubId = req.params.id;
    await db.update(motoClubMembers).set({ status: "left" }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, clubId), (0, import_drizzle_orm3.eq)(motoClubMembers.userId, userId)));
    const [club] = await db.select().from(motoClubs).where((0, import_drizzle_orm3.eq)(motoClubs.id, clubId)).limit(1);
    if (club?.conversationId) {
      await removeMemberFromConversation(club.conversationId, userId);
    }
    return res.json({ message: "Hai lasciato il club" });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});
router.put("/invites/:id/respond", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const inviteId = req.params.id;
    const { response } = req.body;
    if (!["accepted", "declined"].includes(response)) {
      return res.status(400).json({ message: "Risposta non valida" });
    }
    const [invite] = await db.select().from(motoClubInvites).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubInvites.id, inviteId), (0, import_drizzle_orm3.eq)(motoClubInvites.userId, userId))).limit(1);
    if (!invite) return res.status(404).json({ message: "Invito non trovato" });
    await db.update(motoClubInvites).set({ status: response }).where((0, import_drizzle_orm3.eq)(motoClubInvites.id, inviteId));
    if (response === "accepted") {
      const [club] = await db.select().from(motoClubs).where((0, import_drizzle_orm3.eq)(motoClubs.id, invite.clubId)).limit(1);
      if (club) {
        const existing = await db.select().from(motoClubMembers).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, invite.clubId), (0, import_drizzle_orm3.eq)(motoClubMembers.userId, userId))).limit(1);
        if (existing.length > 0) {
          await db.update(motoClubMembers).set({ status: "active", joinedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.clubId, invite.clubId), (0, import_drizzle_orm3.eq)(motoClubMembers.userId, userId)));
        } else {
          await db.insert(motoClubMembers).values({ clubId: invite.clubId, userId, status: "active" });
        }
        let convId = club.conversationId;
        if (!convId) convId = await createClubConversation(invite.clubId, club.name);
        if (convId) await addMemberToConversation(convId, userId);
        await db.update(motoClubs).set({ activityScore: import_drizzle_orm3.sql`activity_score + 2`, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm3.eq)(motoClubs.id, invite.clubId));
        await notifyTopMembersOfNewJoin(invite.clubId, userId, club.name);
      }
    }
    return res.json({ message: response === "accepted" ? "Sei entrato nel club!" : "Invito rifiutato" });
  } catch (e) {
    console.error("[PUT /invites/:id/respond]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});
router.post("/request", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { name, clubType, brandName, modelName } = req.body;
    if (!name || !clubType) return res.status(400).json({ message: "Nome e tipo obbligatori" });
    if (!["brand", "model"].includes(clubType)) return res.status(400).json({ message: "Tipo non valido" });
    if (clubType === "model" && (!brandName || !modelName)) {
      return res.status(400).json({ message: "Marca e modello richiesti per club By Model" });
    }
    const [request] = await db.insert(motoClubRequests).values({
      name,
      clubType,
      brandName: brandName || null,
      modelName: modelName || null,
      requestedBy: userId,
      status: "pending"
    }).returning();
    return res.status(201).json(request);
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});
router.get("/me/clubs", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const clubs = await db.select({
      club: motoClubs,
      member: motoClubMembers
    }).from(motoClubMembers).innerJoin(motoClubs, (0, import_drizzle_orm3.eq)(motoClubs.id, motoClubMembers.clubId)).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.userId, userId), (0, import_drizzle_orm3.eq)(motoClubMembers.status, "active")));
    return res.json(clubs.map((r) => ({ ...r.club, joinedAt: r.member.joinedAt, role: r.member.role })));
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});
router.post("/creation-request", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const creationEnabled = await storage.getAppSetting("motoclub_user_creation_enabled");
    if (creationEnabled?.value !== "true") {
      return res.status(403).json({ message: "Creazione motoclub non abilitata" });
    }
    const { name, parentClubId, latitude, longitude, inviteRadiusKm, inviteUserIds } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: "Nome obbligatorio (min 2 caratteri)" });
    }
    const user = await storage.getUser(userId);
    const [request] = await db.insert(motoClubRequests).values({
      name: name.trim(),
      clubType: "custom",
      requestedBy: userId,
      status: "pending",
      parentClubId: parentClubId ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      inviteRadiusKm: inviteRadiusKm ?? null,
      inviteUserIds: inviteUserIds && inviteUserIds.length > 0 ? JSON.stringify(inviteUserIds) : null
    }).returning();
    await db.insert(feedbackTickets).values({
      userId,
      ticketType: "suggestion",
      subject: `Richiesta creazione Motoclub: ${name}`,
      message: [
        `Utente: ${user?.nickname ?? userId}`,
        `Nome club: ${name}`,
        parentClubId ? `Sub-club di: ${parentClubId}` : "Elenco principale",
        latitude && longitude ? `Posizione: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}` : "Nessuna posizione",
        inviteRadiusKm ? `Raggio inviti: ${inviteRadiusKm} km` : "",
        inviteUserIds && inviteUserIds.length > 0 ? `Utenti invitati: ${inviteUserIds.length}` : "",
        `Request ID: ${request.id}`
      ].filter(Boolean).join("\n"),
      status: "open"
    });
    const adminEmail = process.env.ADMIN_EMAIL || "bikerlinkapp@gmail.com";
    await sendEmail(
      adminEmail,
      `[BikerLink] Nuova richiesta Motoclub: ${name}`,
      `<p>Un utente ha richiesto la creazione di un nuovo motoclub:</p>
      <ul>
        <li><strong>Utente:</strong> ${user?.nickname ?? userId}</li>
        <li><strong>Nome:</strong> ${name}</li>
        <li><strong>Tipo:</strong> ${parentClubId ? "Sub-club" : "Elenco principale"}</li>
        ${latitude && longitude ? `<li><strong>Posizione:</strong> ${latitude.toFixed(4)}, ${longitude.toFixed(4)}</li>` : ""}
        ${inviteRadiusKm ? `<li><strong>Raggio inviti:</strong> ${inviteRadiusKm} km</li>` : ""}
        ${inviteUserIds && inviteUserIds.length > 0 ? `<li><strong>Inviti manuali:</strong> ${inviteUserIds.length} utenti</li>` : ""}
        <li><strong>Request ID:</strong> ${request.id}</li>
      </ul>
      <p>Vai al pannello admin per approvare o rifiutare.</p>`
    ).catch((e) => console.error("[creation-request] email error:", e));
    return res.status(201).json({ success: true, requestId: request.id });
  } catch (e) {
    console.error("[POST /creation-request]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});
router.get("/creation-request/status", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const [request] = await db.select().from(motoClubRequests).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubRequests.requestedBy, userId), (0, import_drizzle_orm3.eq)(motoClubRequests.clubType, "custom"))).orderBy((0, import_drizzle_orm3.desc)(motoClubRequests.createdAt)).limit(1);
    if (!request) return res.json(null);
    return res.json({
      status: request.status,
      name: request.name,
      createdAt: request.createdAt,
      reviewNote: request.reviewNote
    });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});
router.post("/sync-garage", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "Utente non trovato" });
    const before = await db.select({ c: (0, import_drizzle_orm3.count)() }).from(motoClubMembers).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.userId, userId), (0, import_drizzle_orm3.eq)(motoClubMembers.status, "active")));
    const countBefore = Number(before[0]?.c ?? 0);
    if (user.userType === "zavorrina") {
      const wishlist = await storage.getWishlist(userId);
      if (wishlist) {
        const wishlistMotos = await storage.getWishlistMotos(wishlist.id);
        for (const moto of wishlistMotos) {
          if (moto.brand) {
            await createClubInvitesForMoto(userId, moto.brand, moto.model ?? "");
          }
        }
      }
    } else {
      const motos = await storage.getUserMotorcycles(userId);
      for (const moto of motos) {
        await createClubInvitesForMoto(userId, moto.brand, moto.model ?? "");
      }
    }
    if (user.region) {
      await createRegionalClubInvite(userId, user.region);
    }
    const after = await db.select({ c: (0, import_drizzle_orm3.count)() }).from(motoClubMembers).where((0, import_drizzle_orm3.and)((0, import_drizzle_orm3.eq)(motoClubMembers.userId, userId), (0, import_drizzle_orm3.eq)(motoClubMembers.status, "active")));
    const countAfter = Number(after[0]?.c ?? 0);
    const joined = countAfter - countBefore;
    return res.json({
      joined,
      message: joined > 0 ? `Iscritto a ${joined} club!` : "Nessun nuovo club trovato"
    });
  } catch (e) {
    console.error("[POST /sync-garage]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});
var motoclubs_default = router;

// server/routes/auth.ts
var router2 = (0, import_express2.Router)();
var loginLimiter = (0, import_express_rate_limit.default)({
  windowMs: 15 * 60 * 1e3,
  max: 5,
  message: { message: "Troppi tentativi. Riprova pi\xF9 tardi." },
  standardHeaders: true,
  legacyHeaders: false
});
var registerLimiter = (0, import_express_rate_limit.default)({
  windowMs: 60 * 60 * 1e3,
  max: 3,
  message: { message: "Troppi tentativi. Riprova pi\xF9 tardi." },
  standardHeaders: true,
  legacyHeaders: false
});
var forgotPasswordLimiter = (0, import_express_rate_limit.default)({
  windowMs: 60 * 60 * 1e3,
  max: 3,
  message: { message: "Troppi tentativi. Riprova pi\xF9 tardi." },
  standardHeaders: true,
  legacyHeaders: false
});
var resetPasswordLimiter = (0, import_express_rate_limit.default)({
  windowMs: 15 * 60 * 1e3,
  max: 10,
  message: { message: "Troppi tentativi. Riprova pi\xF9 tardi." },
  standardHeaders: true,
  legacyHeaders: false
});
var resendResetLimiter = (0, import_express_rate_limit.default)({
  windowMs: 60 * 60 * 1e3,
  max: 5,
  message: { message: "Troppi tentativi. Riprova pi\xF9 tardi." },
  standardHeaders: true,
  legacyHeaders: false
});
router2.post("/register", registerLimiter, async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const data = parsed.data;
    if (data.birthYear) {
      const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
      const age = currentYear - data.birthYear;
      if (age < 18) {
        return res.status(400).json({ message: "Devi avere almeno 18 anni per registrarti" });
      }
    }
    data.email = data.email.trim().toLowerCase();
    const existingEmail = await storage.getUserByEmail(data.email);
    if (existingEmail) {
      return res.status(409).json({ message: "Email gi\xE0 registrata" });
    }
    const reservedNicknames = ["admin", "administrator", "administrators", "amministratore", "amministratori", "mod", "moderator", "moderatore"];
    if (reservedNicknames.includes(data.nickname.toLowerCase())) {
      return res.status(400).json({ message: "Nickname non disponibile" });
    }
    const existingNickname = await storage.getUserByNickname(data.nickname);
    if (existingNickname) {
      return res.status(409).json({ message: "Nickname gi\xE0 in uso" });
    }
    let invitationGiftMessage = null;
    let invitationImageUrl = null;
    let invitationCodeStr = null;
    if (data.invitationCode) {
      const invitation = await storage.getInvitationCode(data.invitationCode);
      if (!invitation || !invitation.isActive || invitation.currentUses >= invitation.maxUses) {
        return res.status(400).json({ message: "Codice invito non valido" });
      }
      if (invitation.expiresAt && new Date(invitation.expiresAt) < /* @__PURE__ */ new Date()) {
        return res.status(400).json({ message: "Codice invito scaduto" });
      }
      await storage.incrementInvitationCodeUses(invitation.id);
      invitationGiftMessage = invitation.giftMessage ?? null;
      invitationImageUrl = invitation.imageUrl ?? null;
      invitationCodeStr = invitation.code;
    }
    const hashedPassword = await import_bcryptjs.default.hash(data.password, 12);
    const primalSetting = await storage.getAppSetting("primal_user_enabled");
    const isPrimal = primalSetting?.value === "true";
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
      country: data.country,
      eulaAccepted: true,
      privacyAccepted: true,
      consentAcceptedAt: /* @__PURE__ */ new Date(),
      invitationCode: data.invitationCode,
      isPrimal
    });
    await storage.createUserProfile({ userId: user.id });
    if (data.region) {
      createRegionalClubInvite(user.id, data.region).catch(() => {
      });
    }
    if (invitationCodeStr) {
      try {
        const registrationDate = /* @__PURE__ */ new Date();
        const expiryDate = new Date(registrationDate.getTime() + 5 * 24 * 60 * 60 * 1e3);
        await sendInvitationGiftEmail(user.email, invitationCodeStr, invitationImageUrl, invitationGiftMessage, expiryDate);
      } catch (e) {
        console.warn("[EMAIL] Errore invio gift email (non bloccante):", e);
      }
    }
    const emailVerifSetting = await storage.getAppSetting("email_verification_enabled");
    const emailVerificationEnabled = emailVerifSetting?.value === "true";
    if (emailVerificationEnabled && !isPrimal) {
      const token = import_crypto.default.randomBytes(3).toString("hex").toUpperCase();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1e3);
      await storage.createEmailVerificationToken(user.id, token, expiresAt);
      const emailSent = await sendVerificationEmail(user.email, user.nickname, token);
      if (emailSent) {
        console.log(`[EMAIL VERIFICATION] Email inviata a ${user.email}`);
      } else {
        console.warn(`[EMAIL VERIFICATION] Email NON inviata a ${user.email} - fallback notifica admin`);
      }
      try {
        const adminUser = await storage.getUserByNickname("admin");
        if (adminUser) {
          await storage.createNotification({
            userId: adminUser.id,
            title: "Nuova registrazione - Verifica Email",
            body: `L'utente ${user.nickname} (${user.email}) si \xE8 registrato. Codice verifica: ${token}${emailSent ? " (email inviata)" : " (email NON inviata - SMTP non configurato)"}`,
            notificationType: "system",
            referenceType: "user",
            referenceId: user.id
          });
        }
      } catch (e) {
        console.error("Failed to notify admin about email verification:", e);
      }
      const { password: _2, ...safeUser2 } = user;
      return res.status(201).json({ ...safeUser2, requiresEmailVerification: true, giftMessage: invitationGiftMessage });
    }
    if (isPrimal) {
      await storage.markUserEmailVerified(user.id);
    }
    req.session.userId = user.id;
    await new Promise((resolve3, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve3();
      });
    });
    const { password: _, ...safeUser } = user;
    return res.status(201).json({ ...safeUser, giftMessage: invitationGiftMessage });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.post("/login", loginLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const { identifier: rawIdentifier, password } = parsed.data;
    const identifier = rawIdentifier.trim();
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
    const emailVerifSetting = await storage.getAppSetting("email_verification_enabled");
    if (emailVerifSetting?.value === "true" && !user.emailVerified && !user.isPrimal && user.role !== "admin") {
      return res.status(403).json({ message: "Verifica la tua email prima di accedere. Controlla la tua casella di posta." });
    }
    const validPassword = await import_bcryptjs.default.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }
    const updateData = { lastLoginAt: /* @__PURE__ */ new Date() };
    if (!user.firstLoginAt) {
      updateData.firstLoginAt = /* @__PURE__ */ new Date();
    }
    await storage.updateUser(user.id, updateData);
    const effectiveRegion = user.region;
    const effectiveCountry = user.country;
    if (effectiveRegion && (!effectiveCountry || effectiveCountry === "IT")) {
      createRegionalClubInvite(user.id, effectiveRegion).catch(() => {
      });
    }
    const userRecord = await storage.getUser(user.id);
    if (!userRecord?.ghostMode) {
      await storage.upsertUserProfile(user.id, { isAvailable: true }).catch((e) => {
        console.warn("[login] upsertUserProfile failed:", e?.message);
      });
    }
    req.session.userId = user.id;
    await new Promise((resolve3, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve3();
      });
    });
    const { password: _, ...safeUser } = userRecord ?? user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Errore durante il logout" });
    }
    res.clearCookie("connect.sid");
    return res.json({ message: "Logout effettuato" });
  });
});
router2.get("/me", async (req, res) => {
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
router2.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Inserisci un'email valida" });
    }
    const user = await storage.getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.json({ message: "Se l'email \xE8 registrata, riceverai un codice di recupero" });
    }
    const expiresAt = new Date(Date.now() + 60 * 60 * 1e3);
    await storage.deletePasswordResetTokens(user.id);
    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      code = String(import_crypto.default.randomInt(1e7, 1e8));
      try {
        await storage.createPasswordResetToken(user.id, code, expiresAt);
        break;
      } catch (e) {
        if (attempt === 4) throw e;
      }
    }
    const emailSent = await sendPasswordResetEmail(user.email, user.nickname, code);
    if (emailSent) {
      console.log(`[PASSWORD RESET] Codice reset inviato a ${user.email}`);
    } else {
      console.warn(`[PASSWORD RESET] Email NON inviata a ${user.email}`);
    }
    return res.json({ message: "Se l'email \xE8 registrata, riceverai un codice di recupero" });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.post("/reset-password", resetPasswordLimiter, async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) {
      return res.status(400).json({ message: "Email, codice e password richiesti" });
    }
    if (!/^\d{8}$/.test(String(code).trim())) {
      return res.status(400).json({ message: "Il codice deve essere composto da 8 cifre" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "La password deve avere almeno 8 caratteri" });
    }
    const user = await storage.getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.status(400).json({ message: "Codice non valido o scaduto" });
    }
    if (user.status === "blocked" || user.status === "suspended") {
      return res.status(403).json({ message: "Account sospeso o bloccato" });
    }
    const resetToken = await storage.getPasswordResetTokenByCode(user.id, String(code).trim());
    if (!resetToken) {
      return res.status(400).json({ message: "Codice non valido o gi\xE0 utilizzato" });
    }
    if (new Date(resetToken.expiresAt) < /* @__PURE__ */ new Date()) {
      return res.status(400).json({ message: "Codice scaduto \u2014 richiedi un nuovo codice" });
    }
    const hashedPassword = await import_bcryptjs.default.hash(password, 12);
    await storage.updateUser(user.id, { password: hashedPassword });
    await storage.markPasswordResetTokenUsedById(resetToken.id);
    req.session.userId = user.id;
    await new Promise((resolve3, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve3();
      });
    });
    sendPasswordResetConfirmationEmail(user.email, user.nickname).catch(
      (e) => console.warn("[PASSWORD RESET] Confirmation email failed:", e)
    );
    const { password: _, ...safeUser } = user;
    return res.json({ ...safeUser, passwordReset: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.post("/resend-reset-code", resendResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email richiesta" });
    }
    const user = await storage.getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.json({ message: "Se l'email \xE8 registrata, riceverai un nuovo codice" });
    }
    const expiresAt = new Date(Date.now() + 60 * 60 * 1e3);
    await storage.deletePasswordResetTokens(user.id);
    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      code = String(import_crypto.default.randomInt(1e7, 1e8));
      try {
        await storage.createPasswordResetToken(user.id, code, expiresAt);
        break;
      } catch (e) {
        if (attempt === 4) throw e;
      }
    }
    const emailSent = await sendPasswordResetEmail(user.email, user.nickname, code);
    if (!emailSent) {
      console.warn(`[PASSWORD RESET] Resend: email NON inviata a ${user.email}`);
    }
    return res.json({ message: "Se l'email \xE8 registrata, riceverai un nuovo codice" });
  } catch (error) {
    console.error("Resend reset code error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.post("/verify-email", async (req, res) => {
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
    await new Promise((resolve3, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve3();
      });
    });
    const { password: _, ...safeUser } = user;
    return res.json({ ...safeUser, emailVerified: true });
  } catch (error) {
    console.error("Verify email error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.post("/resend-verification", async (req, res) => {
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
    const token = import_crypto.default.randomBytes(3).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1e3);
    await storage.createEmailVerificationToken(user.id, token, expiresAt);
    const emailSent = await sendVerificationEmail(user.email, user.nickname, token);
    if (!emailSent) {
      console.warn(`[EMAIL VERIFICATION] Resend: email NON inviata a ${user.email}`);
    }
    return res.json({ message: "Nuovo codice inviato" });
  } catch (error) {
    console.error("Resend verification error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router2.get("/email-configured", async (_req, res) => {
  try {
    const userSetting = await storage.getAppSetting("gmail_user");
    const passSetting = await storage.getAppSetting("gmail_app_password");
    const configured = !!(userSetting?.value && passSetting?.value || process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
    return res.json({ configured });
  } catch {
    return res.json({ configured: false });
  }
});
router2.post("/heartbeat", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ ok: false });
    await storage.updateUser(userId, { lastLoginAt: /* @__PURE__ */ new Date() });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});
var auth_default = router2;

// server/routes/users.ts
var import_express3 = require("express");
var import_multer = __toESM(require("multer"));
var import_path2 = __toESM(require("path"));
var import_fs2 = __toESM(require("fs"));
init_storage();

// server/constants.ts
var PROTECTED_NICKNAMES = ["BikerLink_Official"];
function isProtectedUser(nickname) {
  return PROTECTED_NICKNAMES.includes(nickname);
}

// server/routes/users.ts
var router3 = (0, import_express3.Router)();
async function captureFirstAvailabilityLocation(userId, requestLat, requestLng, profileLat, profileLng) {
  try {
    const currentUser = await storage.getUser(userId);
    if (!currentUser || currentUser.firstLoginLat !== null && currentUser.firstLoginLng !== null) return;
    const resolvedLat = requestLat ?? profileLat;
    const resolvedLng = requestLng ?? profileLng;
    if (typeof resolvedLat !== "number" || typeof resolvedLng !== "number") return;
    await storage.updateUser(userId, {
      firstLoginLat: resolvedLat,
      firstLoginLng: resolvedLng
    });
    if (!currentUser.region) {
      (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5e3);
        try {
          const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${resolvedLat}&lon=${resolvedLng}&format=json&accept-language=it`;
          const nomRes = await fetch(nomUrl, {
            headers: { "User-Agent": "BikerLink/1.0" },
            signal: controller.signal
          });
          if (nomRes.ok) {
            const nomData = await nomRes.json();
            const state = nomData.address?.state;
            const countryCode = nomData.address?.country_code;
            if (state && countryCode === "it") {
              await storage.updateUser(userId, { region: state });
              createRegionalClubInvite(userId, state).catch(() => {
              });
            }
          }
        } catch (geoErr) {
          console.warn("[captureFirstAvailabilityLocation] geocoding fallito:", geoErr);
        } finally {
          clearTimeout(timeout);
        }
      })();
    }
  } catch (err) {
    console.warn("[captureFirstAvailabilityLocation] fallita:", err);
  }
}
var uploadsDir = import_path2.default.join(process.cwd(), "uploads", "photos");
if (!import_fs2.default.existsSync(uploadsDir)) {
  import_fs2.default.mkdirSync(uploadsDir, { recursive: true });
}
var photoStorage = import_multer.default.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
    cb(null, uniqueSuffix + import_path2.default.extname(file.originalname));
  }
});
var upload = (0, import_multer.default)({
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
function requireAuth2(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}
router3.get("/", requireAuth2, async (req, res) => {
  try {
    const requesterId = req.session.userId;
    const blockedIds = await storage.getBlockedUserIds(requesterId);
    const blockedSet = new Set(blockedIds);
    const allUsers = await storage.getAllUsers();
    const results = allUsers.filter((u) => !blockedSet.has(u.id) && u.id !== requesterId).map((u) => ({
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
router3.get("/me", requireAuth2, async (req, res) => {
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
router3.put("/me", requireAuth2, async (req, res) => {
  try {
    const userId = req.session.userId;
    const allowedUserFields = ["nickname", "phone", "sex", "coupleSexConfig", "birthYear", "region", "country", "avatarUrl"];
    const userUpdate = {};
    for (const field of allowedUserFields) {
      if (req.body[field] !== void 0) {
        userUpdate[field] = req.body[field];
      }
    }
    if (Object.keys(userUpdate).length > 0) {
      if (userUpdate.nickname) {
        const reservedNicknames = ["admin", "administrator", "administrators", "amministratore", "amministratori", "mod", "moderator", "moderatore"];
        if (reservedNicknames.includes(userUpdate.nickname.toLowerCase())) {
          return res.status(400).json({ message: "Nickname non disponibile" });
        }
        const existing = await storage.getUserByNickname(userUpdate.nickname);
        if (existing && existing.id !== userId) {
          return res.status(409).json({ message: "Nickname gi\xE0 in uso" });
        }
      }
      await storage.updateUser(userId, userUpdate);
      if (req.body.region !== void 0 && typeof userUpdate.region === "string" && userUpdate.region.trim()) {
        createRegionalClubInvite(userId, userUpdate.region).catch((e) => console.error("[auto-join region error]", e));
      }
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
router3.get("/profile", requireAuth2, async (req, res) => {
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
router3.put("/profile/dynamic", requireAuth2, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { isAvailable, latitude, longitude, searchPreference, preferredMapStyle, emailChatNotifications } = req.body;
    const existingProfile = await storage.getUserProfile(userId);
    const updateData = {};
    if (typeof isAvailable === "boolean") updateData.isAvailable = isAvailable;
    if (latitude !== void 0) updateData.latitude = latitude;
    if (longitude !== void 0) updateData.longitude = longitude;
    if (searchPreference !== void 0) updateData.searchPreference = searchPreference;
    const validMapStyles = ["carto_light", "carto_dark", "esri_gray"];
    if (preferredMapStyle !== void 0) {
      if (preferredMapStyle !== null && !validMapStyles.includes(preferredMapStyle)) {
        return res.status(400).json({ message: "Stile mappa non valido" });
      }
      updateData.preferredMapStyle = preferredMapStyle;
    }
    if (typeof emailChatNotifications === "boolean") updateData.emailChatNotifications = emailChatNotifications;
    if (isAvailable === true) {
      await storage.updateUser(userId, { ghostMode: false });
      await captureFirstAvailabilityLocation(userId, latitude, longitude, existingProfile?.latitude, existingProfile?.longitude);
    }
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
router3.put("/me/ghost-mode", requireAuth2, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled deve essere un booleano" });
    }
    const ghostModeSetting = await storage.getAppSetting("ghost_mode_enabled");
    if (ghostModeSetting?.value !== "true") {
      return res.status(403).json({ message: "Ghost Mode non attivo su questa piattaforma" });
    }
    await storage.updateUser(userId, { ghostMode: enabled });
    if (enabled) {
      const existingProfile = await storage.getUserProfile(userId);
      if (existingProfile) {
        await storage.updateUserProfile(userId, { isAvailable: false });
      }
    }
    return res.json({ ghostMode: enabled });
  } catch (error) {
    console.error("Ghost mode toggle error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router3.put("/location", requireAuth2, async (req, res) => {
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
router3.put("/me/availability", requireAuth2, async (req, res) => {
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
    if (isAvailable === true) {
      await captureFirstAvailabilityLocation(userId, latitude, longitude, existingProfile?.latitude, existingProfile?.longitude);
    }
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
router3.get("/:id/public", requireAuth2, async (req, res) => {
  try {
    const userId = req.params.id;
    const requesterId = req.session.userId;
    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const isBlockedByTarget = await storage.hasBlockedUser(userId, requesterId);
    if (isBlockedByTarget && requesterId !== userId) {
      return res.status(403).json({ message: "Non puoi visualizzare questo profilo" });
    }
    if (targetUser.isFake && requesterId !== userId) {
      storage.recordFakeUserInteraction(userId, requesterId, "profile_view").catch(() => {
      });
    }
    const profile = await storage.getUserProfile(userId);
    const motorcycles = await storage.getUserMotorcycles(userId);
    const photos = await storage.getUserPhotos(userId);
    const approvedPhotos = photos.filter((p) => p.isApproved);
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    const isOnline = !targetUser.ghostMode && targetUser.lastLoginAt != null && new Date(targetUser.lastLoginAt) >= fifteenMinutesAgo;
    const isBlockedByMe = await storage.hasBlockedUser(requesterId, userId);
    return res.json({
      id: targetUser.id,
      nickname: targetUser.nickname,
      userType: targetUser.userType,
      sex: targetUser.sex,
      coupleSexConfig: targetUser.coupleSexConfig,
      birthYear: targetUser.birthYear,
      region: targetUser.region,
      country: targetUser.country,
      avatarUrl: targetUser.avatarUrl,
      bio: profile?.bio || null,
      motorcycles,
      photos: approvedPhotos,
      isOnline,
      isAvailable: (profile?.isAvailable || false) && !targetUser.ghostMode,
      isBlockedByMe
    });
  } catch (error) {
    console.error("Get public user profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router3.get("/online-count", requireAuth2, async (req, res) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    const countriesParam = req.query.countries ? req.query.countries.split(",").filter(Boolean) : void 0;
    const count3 = await storage.countOnlineUsers(fifteenMinutesAgo, countriesParam);
    return res.json({ count: count3 });
  } catch (error) {
    console.error("Online count error:", error);
    return res.json({ count: 0 });
  }
});
router3.get("/available-count", requireAuth2, async (req, res) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    const count3 = await storage.countAvailableUsers(fifteenMinutesAgo);
    return res.json({ count: count3 });
  } catch (error) {
    console.error("Available count error:", error);
    return res.json({ count: 0 });
  }
});
router3.get("/online-list", requireAuth2, async (req, res) => {
  try {
    const requesterId = req.session.userId;
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    const lat = req.query.lat ? parseFloat(req.query.lat) : void 0;
    const lng = req.query.lng ? parseFloat(req.query.lng) : void 0;
    const includeOffline = req.query.includeOffline === "true";
    const countriesParam = req.query.countries ? req.query.countries.split(",").filter(Boolean) : void 0;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const onlineResults = await storage.getOnlineUsersList(fifteenMinutesAgo, lat, lng, countriesParam);
    let allResults = onlineResults.filter((r) => !blockedIds.has(r.user.id));
    const onlineIdSet = new Set(allResults.map((r) => r.user.id));
    if (includeOffline) {
      const { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const { users: usersTable, userProfiles: profilesTable } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq11, and: and9, lt, or: or4, isNull: isNull2, inArray: inArr, notInArray: notInArr } = await import("drizzle-orm");
      const { sql: sqlTag } = await import("drizzle-orm");
      const distanceExpr = lat != null && lng != null ? sqlTag`(6371 * acos(cos(radians(${lat})) * cos(radians(${profilesTable.latitude})) * cos(radians(${profilesTable.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${profilesTable.latitude}))))`.as("distance") : sqlTag`0`.as("distance");
      const offlineConds = [eq11(usersTable.status, "active"), or4(lt(usersTable.lastLoginAt, fifteenMinutesAgo), isNull2(usersTable.lastLoginAt)), eq11(usersTable.ghostMode, false), notInArr(usersTable.role, ["admin", "moderator", "moderatore"])];
      if (countriesParam && countriesParam.length > 0) offlineConds.push(inArr(usersTable.country, countriesParam));
      const offlineResults = await db2.select({ user: usersTable, profile: profilesTable, distance: distanceExpr }).from(usersTable).leftJoin(profilesTable, eq11(profilesTable.userId, usersTable.id)).where(and9(...offlineConds)).orderBy(sqlTag`distance`);
      const offlineOnly = offlineResults.filter((r) => !onlineIdSet.has(r.user.id) && !blockedIds.has(r.user.id));
      allResults = [...allResults, ...offlineOnly];
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
        country: item.user.country,
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
router3.get("/available-list", requireAuth2, async (req, res) => {
  try {
    const requesterId = req.session.userId;
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1e3);
    const lat = req.query.lat ? parseFloat(req.query.lat) : void 0;
    const lng = req.query.lng ? parseFloat(req.query.lng) : void 0;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const allItems = await storage.getAvailableUsersList(threeMinutesAgo, lat, lng);
    const results = allItems.filter((r) => !blockedIds.has(r.user.id));
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
        country: item.user.country,
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
router3.get("/biker-available-count", requireAuth2, async (req, res) => {
  try {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1e3);
    const countriesParam = req.query.countries ? req.query.countries.split(",").filter(Boolean) : void 0;
    const count3 = await storage.countAvailableBikers(threeMinutesAgo, countriesParam);
    return res.json({ count: count3 });
  } catch (error) {
    console.error("Biker available count error:", error);
    return res.json({ count: 0 });
  }
});
router3.get("/zavorrine-available-count", requireAuth2, async (req, res) => {
  try {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1e3);
    const countriesParam = req.query.countries ? req.query.countries.split(",").filter(Boolean) : void 0;
    const count3 = await storage.countAvailableZavorrine(threeMinutesAgo, countriesParam);
    return res.json({ count: count3 });
  } catch (error) {
    console.error("Zavorrine available count error:", error);
    return res.json({ count: 0 });
  }
});
router3.get("/biker-available-list", requireAuth2, async (req, res) => {
  try {
    const requesterId = req.session.userId;
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1e3);
    const lat = req.query.lat ? parseFloat(req.query.lat) : void 0;
    const lng = req.query.lng ? parseFloat(req.query.lng) : void 0;
    const includeOffline = req.query.includeOffline === "true";
    const countriesParam = req.query.countries ? req.query.countries.split(",").filter(Boolean) : void 0;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const onlineResultsRaw = await storage.getAvailableBikersList(threeMinutesAgo, lat, lng, countriesParam);
    const onlineResults = onlineResultsRaw.filter((r) => !blockedIds.has(r.user.id));
    let allResults = onlineResults;
    if (includeOffline) {
      const { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const { users: usersTable, userProfiles: profilesTable } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq11, and: and9, or: or4, inArray: inArr } = await import("drizzle-orm");
      const { sql: sqlTag } = await import("drizzle-orm");
      const distanceExpr = lat != null && lng != null ? sqlTag`(6371 * acos(cos(radians(${lat})) * cos(radians(${profilesTable.latitude})) * cos(radians(${profilesTable.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${profilesTable.latitude}))))`.as("distance") : sqlTag`0`.as("distance");
      const bikerConds = [eq11(usersTable.status, "active"), or4(eq11(usersTable.userType, "biker"), eq11(usersTable.userType, "coppia")), eq11(usersTable.ghostMode, false)];
      if (countriesParam && countriesParam.length > 0) bikerConds.push(inArr(usersTable.country, countriesParam));
      const allBikers = await db2.select({ user: usersTable, profile: profilesTable, distance: distanceExpr }).from(profilesTable).innerJoin(usersTable, eq11(usersTable.id, profilesTable.userId)).where(and9(...bikerConds)).orderBy(sqlTag`distance`);
      const onlineIds = new Set(onlineResults.map((r) => r.user.id));
      const offlineOnly = allBikers.filter((r) => !onlineIds.has(r.user.id) && !blockedIds.has(r.user.id));
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
        country: item.user.country,
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
router3.get("/zavorrine-available-list", requireAuth2, async (req, res) => {
  try {
    const requesterId = req.session.userId;
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1e3);
    const lat = req.query.lat ? parseFloat(req.query.lat) : void 0;
    const lng = req.query.lng ? parseFloat(req.query.lng) : void 0;
    const includeOffline = req.query.includeOffline === "true";
    const countriesParam = req.query.countries ? req.query.countries.split(",").filter(Boolean) : void 0;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const onlineResultsRaw = await storage.getAvailableZavorrinaList(threeMinutesAgo, lat, lng, countriesParam);
    const onlineResults = onlineResultsRaw.filter((r) => !blockedIds.has(r.user.id));
    let allResults = onlineResults;
    if (includeOffline) {
      const { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const { users: usersTable, userProfiles: profilesTable } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq11, and: and9, inArray: inArr } = await import("drizzle-orm");
      const { sql: sqlTag } = await import("drizzle-orm");
      const distanceExpr = lat != null && lng != null ? sqlTag`(6371 * acos(cos(radians(${lat})) * cos(radians(${profilesTable.latitude})) * cos(radians(${profilesTable.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${profilesTable.latitude}))))`.as("distance") : sqlTag`0`.as("distance");
      const zavConds = [eq11(usersTable.status, "active"), eq11(usersTable.userType, "zavorrina"), eq11(usersTable.ghostMode, false)];
      if (countriesParam && countriesParam.length > 0) zavConds.push(inArr(usersTable.country, countriesParam));
      const allZav = await db2.select({ user: usersTable, profile: profilesTable, distance: distanceExpr }).from(profilesTable).innerJoin(usersTable, eq11(usersTable.id, profilesTable.userId)).where(and9(...zavConds)).orderBy(sqlTag`distance`);
      const onlineIds = new Set(onlineResults.map((r) => r.user.id));
      const offlineOnly = allZav.filter((r) => !onlineIds.has(r.user.id) && !blockedIds.has(r.user.id));
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
        country: item.user.country,
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
router3.get("/nearby", requireAuth2, async (req, res) => {
  try {
    const requesterId = req.session.userId;
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius) || 50;
    const countriesParam = req.query.countries ? req.query.countries.split(",").filter(Boolean) : void 0;
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ message: "Parametri lat e lng richiesti" });
    }
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const nearbyUsers = await storage.getNearbyUsers(lat, lng, radius, countriesParam);
    const results = nearbyUsers.filter((item) => !blockedIds.has(item.user.id)).map((item) => {
      return {
        id: item.user.id,
        nickname: item.user.nickname,
        userType: item.user.userType,
        sex: item.user.sex,
        birthYear: item.user.birthYear,
        region: item.user.region,
        country: item.user.country,
        avatarUrl: item.user.avatarUrl,
        latitude: item.profile?.latitude,
        longitude: item.profile?.longitude,
        isAvailable: item.profile?.isAvailable || false,
        bio: item.profile?.bio || null,
        distance: Math.round(item.distance * 10) / 10
      };
    }).filter((item) => item.latitude != null && item.longitude != null && !isNaN(item.latitude) && !isNaN(item.longitude));
    return res.json(results);
  } catch (error) {
    console.error("Nearby users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router3.get("/search", requireAuth2, async (req, res) => {
  try {
    const requesterId = req.session.userId;
    const q = (req.query.q || "").trim();
    if (q.length < 2) {
      return res.json([]);
    }
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const results = await storage.searchUsers(q);
    const safeResults = results.filter((item) => !blockedIds.has(item.user.id)).map((item) => {
      return {
        id: item.user.id,
        nickname: item.user.nickname,
        userType: item.user.userType,
        sex: item.user.sex,
        birthYear: item.user.birthYear,
        region: item.user.region,
        country: item.user.country,
        avatarUrl: item.user.avatarUrl,
        latitude: item.profile?.latitude || null,
        longitude: item.profile?.longitude || null,
        isAvailable: item.profile?.isAvailable || false,
        bio: item.profile?.bio || null
      };
    });
    return res.json(safeResults);
  } catch (error) {
    console.error("Search users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router3.post("/me/photos", requireAuth2, upload.single("photo"), async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    if (user.userType === "zavorrina") {
      const count3 = await storage.getUserPhotoCount(userId);
      if (count3 >= 3) {
        if (req.file) {
          import_fs2.default.unlinkSync(req.file.path);
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
router3.delete("/me/photos/:id", requireAuth2, async (req, res) => {
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
    const filePath = import_path2.default.join(process.cwd(), photo.photoUrl);
    if (import_fs2.default.existsSync(filePath)) {
      import_fs2.default.unlinkSync(filePath);
    }
    await storage.deleteUserPhoto(photoId);
    return res.json({ message: "Foto eliminata" });
  } catch (error) {
    console.error("Delete photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router3.post("/me/request-deletion", requireAuth2, async (req, res) => {
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
router3.post("/me/cancel-deletion", requireAuth2, async (req, res) => {
  try {
    const userId = req.session.userId;
    await storage.cancelUserDeletion(userId);
    return res.json({ message: "Richiesta di cancellazione annullata." });
  } catch (error) {
    console.error("Cancel deletion error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router3.post("/:id/block", requireAuth2, async (req, res) => {
  try {
    const blockerId = req.session.userId;
    const blockedId = req.params.id;
    if (blockerId === blockedId) {
      return res.status(400).json({ message: "Non puoi bloccare te stesso" });
    }
    const targetUser = await storage.getUser(blockedId);
    if (!targetUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    if (isProtectedUser(targetUser.nickname)) {
      return res.status(403).json({ message: "Utente di sistema non modificabile" });
    }
    const alreadyBlocked = await storage.isBlocked(blockerId, blockedId);
    if (alreadyBlocked) {
      return res.status(409).json({ message: "Utente gi\xE0 bloccato" });
    }
    await storage.blockUser(blockerId, blockedId);
    await storage.deleteBikerBikerMatchesBetween(blockerId, blockedId);
    return res.json({ message: "Utente bloccato con successo" });
  } catch (error) {
    console.error("Block user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router3.delete("/:id/block", requireAuth2, async (req, res) => {
  try {
    const blockerId = req.session.userId;
    const blockedId = req.params.id;
    if (blockerId === blockedId) {
      return res.status(400).json({ message: "Non puoi sbloccare te stesso" });
    }
    const success = await storage.unblockUser(blockerId, blockedId);
    if (!success) {
      return res.status(404).json({ message: "Blocco non trovato" });
    }
    return res.json({ message: "Utente sbloccato con successo" });
  } catch (error) {
    console.error("Unblock user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var users_default = router3;

// server/routes/motorcycles.ts
var import_express4 = require("express");
var import_path3 = __toESM(require("path"));
var import_fs3 = __toESM(require("fs"));
var import_drizzle_orm4 = require("drizzle-orm");
init_db();
init_schema();
init_storage();
var router4 = (0, import_express4.Router)();
var uploadsDir2 = import_path3.default.join(process.cwd(), "uploads", "motorcycles");
if (!import_fs3.default.existsSync(uploadsDir2)) {
  import_fs3.default.mkdirSync(uploadsDir2, { recursive: true });
}
function requireAuth3(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}
router4.get("/", requireAuth3, async (req, res) => {
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
router4.post("/", requireAuth3, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    if (user.userType !== "biker" && user.userType !== "coppia" && user.userType !== "admin") {
      return res.status(403).json({ message: "Solo biker, coppie e admin possono aggiungere moto" });
    }
    const { brand, model, year, displacement, motorcycleType, ridingStyle, photoUrl, isForSale, saleDescription, isDefault, motoDescription } = req.body;
    if (!brand || !model) {
      return res.status(400).json({ message: "Marca e modello sono obbligatori" });
    }
    const isDefaultBool = isDefault === true || isDefault === "true";
    const motorcycle = await storage.createUserMotorcycle({
      userId,
      brand,
      model,
      year: year || null,
      displacement: displacement || null,
      motorcycleType: motorcycleType || null,
      ridingStyle: ridingStyle || null,
      photoUrl: photoUrl || null,
      isDefault: isDefaultBool,
      isForSale: isForSale || false,
      saleDescription: saleDescription || null,
      motoDescription: motoDescription || null
    });
    if (isDefaultBool) {
      await db.update(userMotorcycles).set({ isDefault: false }).where((0, import_drizzle_orm4.and)((0, import_drizzle_orm4.eq)(userMotorcycles.userId, userId), (0, import_drizzle_orm4.ne)(userMotorcycles.id, motorcycle.id)));
    }
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
    if (brand) {
      createClubInvitesForMoto(userId, brand, model || "").catch((e) => console.error("[auto-join brand error]", e));
    }
    return res.status(201).json({ motorcycle, matches });
  } catch (error) {
    console.error("Create motorcycle error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.put("/:id", requireAuth3, async (req, res) => {
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
    const allowedFields = ["brand", "model", "year", "displacement", "motorcycleType", "ridingStyle", "photoUrl", "isForSale", "saleDescription", "isDefault", "motoDescription"];
    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== void 0) {
        updateData[field] = req.body[field];
      }
    }
    if (updateData.isDefault !== void 0) {
      updateData.isDefault = updateData.isDefault === true || updateData.isDefault === "true";
    }
    if (updateData.isDefault === true) {
      await db.update(userMotorcycles).set({ isDefault: false }).where((0, import_drizzle_orm4.and)((0, import_drizzle_orm4.eq)(userMotorcycles.userId, userId), (0, import_drizzle_orm4.ne)(userMotorcycles.id, motoId)));
    }
    const motorcycle = await storage.updateUserMotorcycle(motoId, updateData);
    return res.json(motorcycle);
  } catch (error) {
    console.error("Update motorcycle error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.delete("/:id", requireAuth3, async (req, res) => {
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
router4.get("/:id/photos", requireAuth3, async (req, res) => {
  try {
    const motoId = req.params.id;
    const photos = await storage.getMotorcyclePhotos(motoId);
    return res.json(photos);
  } catch (error) {
    console.error("Get motorcycle photos error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.post("/:id/photos", requireAuth3, async (req, res) => {
  try {
    const userId = req.session.userId;
    const motoId = req.params.id;
    const existing = await storage.getUserMotorcycle(motoId);
    if (!existing || existing.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    const count3 = await storage.getMotorcyclePhotoCount(motoId);
    if (count3 >= 3) {
      return res.status(400).json({ message: "Massimo 3 foto per moto" });
    }
    const { imageBase64, filename } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ message: "Nessuna immagine fornita" });
    }
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const ext = (filename || "photo.jpg").split(".").pop() || "jpg";
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const filePath = import_path3.default.join(uploadsDir2, uniqueName);
    import_fs3.default.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
    const photoUrl = `/uploads/motorcycles/${uniqueName}`;
    const photo = await storage.addMotorcyclePhoto({
      motorcycleId: motoId,
      photoUrl,
      sortOrder: count3
    });
    return res.status(201).json(photo);
  } catch (error) {
    console.error("Upload motorcycle photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router4.delete("/:id/photos/:photoId", requireAuth3, async (req, res) => {
  try {
    const photoId = req.params.photoId;
    await storage.deleteMotorcyclePhoto(photoId);
    return res.json({ message: "Foto eliminata" });
  } catch (error) {
    console.error("Delete motorcycle photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var motorcycles_default = router4;

// server/routes/proposals.ts
var import_express5 = require("express");
init_storage();
init_db();
init_schema();
var import_drizzle_orm5 = require("drizzle-orm");

// server/matching-engine.ts
init_storage();
function haversineDistance(lat1, lng1, lat2, lng2) {
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
  const distance = haversineDistance(
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
    if (activeProposals.length < 2) return 0;
    const existingKeys = await storage.getAllExistingProposalMatchKeys();
    let matchCount = 0;
    for (let i = 0; i < activeProposals.length; i++) {
      for (let j = i + 1; j < activeProposals.length; j++) {
        const p1 = activeProposals[i];
        const p2 = activeProposals[j];
        if (!areCompatible(p1, p2)) continue;
        if (existingKeys.has(`${p1.id}:${p2.id}`)) continue;
        await storage.createProposalMatch({
          proposalId1: p1.id,
          proposalId2: p2.id,
          userId1: p1.userId,
          userId2: p2.userId,
          status: "pending",
          acceptedByUser1: false,
          acceptedByUser2: false
        });
        existingKeys.add(`${p1.id}:${p2.id}`);
        existingKeys.add(`${p2.id}:${p1.id}`);
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
    const countriesSetting = await storage.getAppSetting("matching_countries");
    let matchingCountries;
    if (countriesSetting?.value) {
      try {
        matchingCountries = JSON.parse(countriesSetting.value);
      } catch {
      }
      if (!Array.isArray(matchingCountries) || matchingCountries.length === 0) matchingCountries = void 0;
    }
    const wishlistMotos = await storage.getAllWishlistMotosWithUsers(matchingCountries);
    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers(matchingCountries);
    const shuffledBikers = [...bikerMotorcycles].sort(() => Math.random() - 0.5);
    console.log(`[WishlistMatching] wishlist entries: ${wishlistMotos.length}, biker motorcycles: ${bikerMotorcycles.length}`);
    if (wishlistMotos.length === 0 || bikerMotorcycles.length === 0) {
      if (wishlistMotos.length === 0) console.warn("[WishlistMatching] WARN: nessuna wishlist trovata");
      if (bikerMotorcycles.length === 0) console.warn("[WishlistMatching] WARN: nessuna moto biker trovata \u2014 eseguire /api/admin/reconcile-fake-moto");
      return 0;
    }
    const existingKeys = await storage.getAllExistingBikerZavarrinaMatchKeys();
    let matchCount = 0;
    let skipCount = 0;
    const MAX_MATCHES_PER_RUN = 500;
    outer:
      for (const wm of wishlistMotos) {
        const zavarrinaId = wm.userId;
        const wish = wm.wishlistMoto;
        for (const bm of shuffledBikers) {
          if (matchCount >= MAX_MATCHES_PER_RUN) break outer;
          const bikerId = bm.userId;
          const moto = bm.motorcycle;
          if (bikerId === zavarrinaId) continue;
          let compatible = false;
          if (wish.brand) {
            if (moto.brand && wish.brand.toLowerCase() === moto.brand.toLowerCase()) {
              compatible = true;
            }
          } else if (wish.motorcycleType) {
            if (moto.motorcycleType && wish.motorcycleType.toLowerCase() === moto.motorcycleType.toLowerCase()) {
              compatible = true;
            }
          }
          if (!compatible) continue;
          const key = `${bikerId}:${zavarrinaId}:${moto.id}:${wish.id}`;
          if (existingKeys.has(key)) {
            skipCount++;
            continue;
          }
          const isSupermatch = !!(wish.brand && moto.brand && wish.brand.toLowerCase() === moto.brand.toLowerCase() && wish.model && moto.model && wish.model.toLowerCase() === moto.model.toLowerCase() && wish.motorcycleType && moto.motorcycleType && wish.motorcycleType.toLowerCase() === moto.motorcycleType.toLowerCase() && wish.ridingStyle && moto.ridingStyle && wish.ridingStyle.toLowerCase() === moto.ridingStyle.toLowerCase());
          await storage.createMatch({
            bikerId,
            zavarrinaId,
            bikerMotorcycleId: moto.id,
            wishlistMotoId: wish.id,
            status: "new",
            isSupermatch
          });
          existingKeys.add(key);
          matchCount++;
        }
      }
    console.log(`[WishlistMatching] nuovi match: ${matchCount}, saltati (gi\xE0 esistenti): ${skipCount}`);
    if (matchCount >= MAX_MATCHES_PER_RUN) {
      console.log(`[WishlistMatching] Cap raggiunto (${MAX_MATCHES_PER_RUN} match/ciclo). Riprender\xE0 al prossimo run.`);
    }
    return matchCount;
  } catch (error) {
    console.error("Wishlist matching error:", error);
    return 0;
  }
}
async function runBikerBikerMatching() {
  try {
    const countriesSetting = await storage.getAppSetting("matching_countries");
    let matchingCountries;
    if (countriesSetting?.value) {
      try {
        matchingCountries = JSON.parse(countriesSetting.value);
      } catch {
      }
      if (!Array.isArray(matchingCountries) || matchingCountries.length === 0) matchingCountries = void 0;
    }
    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers(matchingCountries);
    console.log(`[BikerBikerMatching] moto biker trovate: ${bikerMotorcycles.length}`);
    if (bikerMotorcycles.length < 2) {
      console.warn("[BikerBikerMatching] WARN: meno di 2 moto biker trovate, matching impossibile");
      return 0;
    }
    const buckets = /* @__PURE__ */ new Map();
    for (const bm of bikerMotorcycles) {
      if (!bm.motorcycle.brand) continue;
      const key = bm.motorcycle.brand.toLowerCase();
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({
        userId: bm.userId,
        brand: bm.motorcycle.brand,
        model: bm.motorcycle.model || "",
        motorcycleType: bm.motorcycle.motorcycleType || "",
        ridingStyle: bm.motorcycle.ridingStyle || ""
      });
    }
    const bucketsWithMultiple = [...buckets.values()].filter((m) => m.length > 1);
    console.log(`[BikerBikerMatching] bucket creati: ${buckets.size}, con pi\xF9 di 1 membro: ${bucketsWithMultiple.length}`);
    for (const [key, members] of buckets.entries()) {
      if (members.length > 1) {
        console.log(`[BikerBikerMatching] bucket "${key}" \u2192 ${members.length} utenti`);
      }
    }
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap((b) => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );
    const isPairBlocked = (id1, id2) => blockedSet.has(`${id1}:${id2}`);
    let matchCount = 0;
    let skipCount = 0;
    const MAX_MATCHES_PER_BUCKET = 100;
    const shuffledBuckets = [...buckets.values()].sort(() => Math.random() - 0.5);
    for (const members of shuffledBuckets) {
      if (members.length < 2) continue;
      const uniqueMembers = members.filter((m, idx) => members.findIndex((x) => x.userId === m.userId) === idx).sort(() => Math.random() - 0.5);
      if (uniqueMembers.length < 2) continue;
      let bucketCount = 0;
      const maxPairs = uniqueMembers.length * (uniqueMembers.length - 1) / 2;
      const bucketCap = Math.min(MAX_MATCHES_PER_BUCKET, maxPairs);
      outer:
        for (let i = 0; i < uniqueMembers.length; i++) {
          for (let j = i + 1; j < uniqueMembers.length; j++) {
            if (bucketCount >= bucketCap) break outer;
            const m1 = uniqueMembers[i];
            const m2 = uniqueMembers[j];
            const idA = m1.userId < m2.userId ? m1.userId : m2.userId;
            const idB = m1.userId < m2.userId ? m2.userId : m1.userId;
            if (isPairBlocked(m1.userId, m2.userId)) {
              skipCount++;
              continue;
            }
            const isSupermatch = !!(m1.model && m2.model && m1.model.toLowerCase() === m2.model.toLowerCase() && m1.motorcycleType && m2.motorcycleType && m1.motorcycleType.toLowerCase() === m2.motorcycleType.toLowerCase() && m1.ridingStyle && m2.ridingStyle && m1.ridingStyle.toLowerCase() === m2.ridingStyle.toLowerCase());
            const inserted = await storage.createBikerBikerMatch({
              biker1Id: idA,
              biker2Id: idB,
              motorcycleBrand: m1.brand,
              motorcycleModel: m1.model,
              status: "new",
              isSupermatch
            });
            if (inserted) {
              matchCount++;
              bucketCount++;
            } else skipCount++;
          }
        }
    }
    console.log(`[BikerBikerMatching] nuovi match: ${matchCount}, saltati (gi\xE0 esistenti): ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("Biker-biker matching error:", error);
    return 0;
  }
}
async function runMatchingForUser(userId) {
  try {
    const user = await storage.getUser(userId);
    if (!user) return { bikerBiker: 0, zavarrina: 0 };
    const countriesSetting = await storage.getAppSetting("matching_countries");
    let matchingCountries;
    if (countriesSetting?.value) {
      try {
        matchingCountries = JSON.parse(countriesSetting.value);
      } catch {
      }
      if (!Array.isArray(matchingCountries) || matchingCountries.length === 0) matchingCountries = void 0;
    }
    const isBiker = ["biker", "coppia"].includes(user.userType || "");
    const isZavarrina = user.userType === "zavorrina" || user.userType === "coppia";
    let bikerBikerCount = 0;
    let zavarrinaCount = 0;
    const blockedUserIds = new Set(await storage.getBlockedUserIds(userId));
    const allBikerMotos = await storage.getAllBikerMotorcyclesWithUsers(matchingCountries);
    const userMotos = allBikerMotos.filter((bm) => bm.userId === userId);
    if (isBiker && userMotos.length > 0) {
      const acceptedBikerPairs = await storage.getAcceptedBikerBikerPairKeys(userId);
      const userBrands = new Set(
        userMotos.map((bm) => bm.motorcycle.brand?.toLowerCase()).filter((b) => !!b)
      );
      for (const brand of userBrands) {
        const seen = /* @__PURE__ */ new Set();
        const compatibles = allBikerMotos.filter((bm) => {
          if (bm.userId === userId) return false;
          if (bm.motorcycle.brand?.toLowerCase() !== brand) return false;
          if (seen.has(bm.userId)) return false;
          if (blockedUserIds.has(bm.userId)) return false;
          seen.add(bm.userId);
          return true;
        });
        const userMotoBrand = userMotos.find((bm) => bm.motorcycle.brand?.toLowerCase() === brand);
        for (const other of compatibles) {
          const idA = userId < other.userId ? userId : other.userId;
          const idB = userId < other.userId ? other.userId : userId;
          if (acceptedBikerPairs.has(`${idA}:${idB}`)) continue;
          const isSupermatch = !!(userMotoBrand.motorcycle.model && other.motorcycle.model && userMotoBrand.motorcycle.model.toLowerCase() === other.motorcycle.model.toLowerCase() && userMotoBrand.motorcycle.motorcycleType && other.motorcycle.motorcycleType && userMotoBrand.motorcycle.motorcycleType.toLowerCase() === other.motorcycle.motorcycleType.toLowerCase() && userMotoBrand.motorcycle.ridingStyle && other.motorcycle.ridingStyle && userMotoBrand.motorcycle.ridingStyle.toLowerCase() === other.motorcycle.ridingStyle.toLowerCase());
          const inserted = await storage.createBikerBikerMatch({
            biker1Id: idA,
            biker2Id: idB,
            motorcycleBrand: userMotoBrand.motorcycle.brand,
            motorcycleModel: userMotoBrand.motorcycle.model || "",
            status: "new",
            isSupermatch
          });
          if (inserted) bikerBikerCount++;
        }
      }
      console.log(`[MatchingForUser] biker-biker per ${userId}: ${bikerBikerCount} nuovi match`);
    }
    if (isBiker && userMotos.length > 0) {
      const allWishlist = await storage.getAllWishlistMotosWithUsers(matchingCountries);
      const existingKeys = await storage.getAllExistingBikerZavarrinaMatchKeys();
      for (const moto of userMotos) {
        const bike = moto.motorcycle;
        if (!bike.id) continue;
        for (const wm of allWishlist) {
          if (wm.userId === userId) continue;
          const wish = wm.wishlistMoto;
          let compatible = false;
          if (wish.brand && bike.brand && wish.brand.toLowerCase() === bike.brand.toLowerCase()) {
            compatible = true;
          } else if (!wish.brand && wish.motorcycleType && bike.motorcycleType && wish.motorcycleType.toLowerCase() === bike.motorcycleType.toLowerCase()) {
            compatible = true;
          }
          if (!compatible) continue;
          const key = `${userId}:${wm.userId}:${bike.id}:${wish.id}`;
          if (existingKeys.has(key)) continue;
          const isSupermatch = !!(wish.brand && bike.brand && wish.brand.toLowerCase() === bike.brand.toLowerCase() && wish.model && bike.model && wish.model.toLowerCase() === bike.model.toLowerCase() && wish.motorcycleType && bike.motorcycleType && wish.motorcycleType.toLowerCase() === bike.motorcycleType.toLowerCase() && wish.ridingStyle && bike.ridingStyle && wish.ridingStyle.toLowerCase() === bike.ridingStyle.toLowerCase());
          const inserted = await storage.createMatch({
            bikerId: userId,
            zavarrinaId: wm.userId,
            bikerMotorcycleId: bike.id,
            wishlistMotoId: wish.id,
            status: "new",
            isSupermatch
          });
          if (inserted) {
            existingKeys.add(key);
            zavarrinaCount++;
          } else existingKeys.add(key);
        }
      }
    }
    if (isZavarrina) {
      const allWishlist = await storage.getAllWishlistMotosWithUsers(matchingCountries);
      const userWishes = allWishlist.filter((wm) => wm.userId === userId);
      if (userWishes.length > 0) {
        const existingKeys = await storage.getAllExistingBikerZavarrinaMatchKeys();
        for (const wm of userWishes) {
          const wish = wm.wishlistMoto;
          for (const bm of allBikerMotos) {
            if (bm.userId === userId) continue;
            const bike = bm.motorcycle;
            let compatible = false;
            if (wish.brand && bike.brand && wish.brand.toLowerCase() === bike.brand.toLowerCase()) {
              compatible = true;
            } else if (!wish.brand && wish.motorcycleType && bike.motorcycleType && wish.motorcycleType.toLowerCase() === bike.motorcycleType.toLowerCase()) {
              compatible = true;
            }
            if (!compatible) continue;
            const key = `${bm.userId}:${userId}:${bike.id}:${wish.id}`;
            if (existingKeys.has(key)) continue;
            const isSupermatch = !!(wish.brand && bike.brand && wish.brand.toLowerCase() === bike.brand.toLowerCase() && wish.model && bike.model && wish.model.toLowerCase() === bike.model.toLowerCase() && wish.motorcycleType && bike.motorcycleType && wish.motorcycleType.toLowerCase() === bike.motorcycleType.toLowerCase() && wish.ridingStyle && bike.ridingStyle && wish.ridingStyle.toLowerCase() === bike.ridingStyle.toLowerCase());
            const inserted2 = await storage.createMatch({
              bikerId: bm.userId,
              zavarrinaId: userId,
              bikerMotorcycleId: bike.id,
              wishlistMotoId: wish.id,
              status: "new",
              isSupermatch
            });
            if (inserted2) {
              existingKeys.add(key);
              zavarrinaCount++;
            } else existingKeys.add(key);
          }
        }
      }
    }
    console.log(`[MatchingForUser] userId ${userId}: ${bikerBikerCount} bb + ${zavarrinaCount} zav nuovi match`);
    return { bikerBiker: bikerBikerCount, zavarrina: zavarrinaCount };
  } catch (error) {
    console.error("[MatchingForUser] error:", error);
    return { bikerBiker: 0, zavarrina: 0 };
  }
}
async function runProposalMatchingForUser(userId) {
  try {
    const activeProposals = await storage.getActiveProposalsWithLocation();
    const userProposals = activeProposals.filter((p) => p.userId === userId);
    if (userProposals.length === 0) return 0;
    const existingKeys = await storage.getAllExistingProposalMatchKeys();
    let matchCount = 0;
    for (const up of userProposals) {
      for (const other of activeProposals) {
        if (other.userId === userId) continue;
        if (!areCompatible(up, other)) continue;
        const p1Id = up.id < other.id ? up.id : other.id;
        const p2Id = up.id < other.id ? other.id : up.id;
        if (existingKeys.has(`${p1Id}:${p2Id}`)) continue;
        const p1 = up.id < other.id ? up : other;
        const p2 = up.id < other.id ? other : up;
        await storage.createProposalMatch({
          proposalId1: p1.id,
          proposalId2: p2.id,
          userId1: p1.userId,
          userId2: p2.userId,
          status: "pending",
          acceptedByUser1: false,
          acceptedByUser2: false
        });
        existingKeys.add(`${p1Id}:${p2Id}`);
        existingKeys.add(`${p2Id}:${p1Id}`);
        matchCount++;
      }
    }
    console.log(`[ProposalMatchingForUser] userId ${userId}: ${matchCount} nuovi match proposta`);
    return matchCount;
  } catch (error) {
    console.error("[ProposalMatchingForUser] error:", error);
    return 0;
  }
}
var lastUserMatchingAt = /* @__PURE__ */ new Map();
var USER_MATCH_DEBOUNCE_MS = 2 * 60 * 1e3;
function triggerMatchingForUser(userId) {
  const now = Date.now();
  const last = lastUserMatchingAt.get(userId) ?? 0;
  if (now - last < USER_MATCH_DEBOUNCE_MS) return;
  lastUserMatchingAt.set(userId, now);
  (async () => {
    try {
      const { bikerBiker, zavarrina } = await runMatchingForUser(userId);
      if (bikerBiker > 0 || zavarrina > 0) {
        console.log(`[MatchingForUser] completato per ${userId}: ${bikerBiker} bb + ${zavarrina} zav`);
      }
    } catch (err) {
      console.error("[MatchingForUser] errore background:", err);
    }
  })();
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
var lastCycleMeta = null;
var lastMatchingRunAt = 0;
var isMatchingRunning = false;
var DEBOUNCE_MS = 5 * 60 * 1e3;
function getLastMatchingCycleMeta() {
  return lastCycleMeta;
}
function triggerMatchingRun() {
  const now = Date.now();
  if (isMatchingRunning) {
    return { started: false, reason: "already_running" };
  }
  if (now - lastMatchingRunAt < DEBOUNCE_MS) {
    const secondsAgo = Math.round((now - lastMatchingRunAt) / 1e3);
    return { started: false, reason: `debounced (last run ${secondsAgo}s ago, min interval ${DEBOUNCE_MS / 1e3}s)` };
  }
  isMatchingRunning = true;
  lastMatchingRunAt = now;
  (async () => {
    const cycleStart = Date.now();
    console.log("[Matching] Ciclo on-demand avviato");
    try {
      const expired = await runCleanup();
      if (expired > 0) console.log(`[Matching] Scadute ${expired} proposte`);
      try {
        const deleted = await storage.deleteExpiredProposals();
        if (deleted > 0) console.log(`[Matching] Eliminate ${deleted} proposte scadute`);
      } catch (err) {
        console.error("[Matching] Errore eliminazione proposte scadute:", err);
      }
      const autoMatchSetting = await storage.getAppSetting("auto_matching_enabled");
      const autoMatchEnabled = autoMatchSetting?.value !== "false";
      let garageMatches = 0;
      let bikerBikerMatchCount = 0;
      if (autoMatchEnabled) {
        const matches = await runMatching();
        if (matches > 0) console.log(`[Matching] Found ${matches} new proposal matches`);
        garageMatches = await runWishlistMatching();
        if (garageMatches > 0) console.log(`[Matching] Found ${garageMatches} new garage matches`);
        bikerBikerMatchCount = await runBikerBikerMatching();
        if (bikerBikerMatchCount > 0) console.log(`[Matching] Found ${bikerBikerMatchCount} new biker-biker matches`);
      } else {
        console.log("[Matching] Auto matching disabilitato dall'admin, skip");
      }
      const cycleDuration = Date.now() - cycleStart;
      lastCycleMeta = {
        completedAt: (/* @__PURE__ */ new Date()).toISOString(),
        durationMs: cycleDuration,
        zavarrinaMatchesNew: garageMatches,
        bikerBikerMatchesNew: bikerBikerMatchCount
      };
      console.log(`[Matching] Ciclo on-demand completato in ${(cycleDuration / 1e3).toFixed(1)}s`);
    } catch (err) {
      console.error("[Matching] Errore nel ciclo on-demand:", err);
    } finally {
      isMatchingRunning = false;
    }
  })();
  return { started: true };
}
var _engineTimers = [];
function startMatchingEngine() {
  console.log("[Matching] Engine avviato \u2014 modalit\xE0 on-demand (trigger da login utente)");
  (async () => {
    try {
      const fakeUsersSetting = await storage.getAppSetting("fake_users_enabled");
      const fakeUsersEnabled = fakeUsersSetting?.value === "true";
      if (!fakeUsersEnabled) {
        console.log("[Matching] Fake zavorrine rotation skipped (fake users disabled)");
      } else {
        runFakeZavorrineRotation();
        _engineTimers.push(setInterval(runFakeZavorrineRotation, 5 * 60 * 1e3));
        console.log("[Matching] Fake zavorrine availability rotation started (5min interval)");
      }
    } catch (err) {
      console.error("[Matching] Error checking fake_users_enabled for rotation \u2014 skipped (fake users disabled):", err);
    }
  })();
  _engineTimers.push(setInterval(async () => {
    try {
      const expired = await runCleanup();
      if (expired > 0) console.log(`[Cleanup] Scadute ${expired} proposte`);
      const deleted = await storage.deleteExpiredProposals();
      if (deleted > 0) console.log(`[Cleanup] Eliminate ${deleted} proposte scadute`);
    } catch (err) {
      console.error("[Cleanup] Errore pulizia oraria:", err);
    }
  }, 60 * 60 * 1e3));
  console.log("[Matching] Cleanup orario proposte scadute avviato");
}
function stopMatchingEngine() {
  for (const t of _engineTimers) clearInterval(t);
  _engineTimers.length = 0;
  console.log("[Matching] Engine fermato (graceful shutdown)");
}

// server/routes/proposals.ts
var router5 = (0, import_express5.Router)();
function requireAuth4(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}
var BIKER_SEARCH_TYPES = ["find_a_friend", "find_a_guest", "hitcher", "hitchhiker"];
var ZAVORRINA_SEARCH_TYPES = ["find_a_biker", "hitchhiker"];
router5.get("/", requireAuth4, async (req, res) => {
  try {
    const status = req.query.status || void 0;
    const proposalType = req.query.type;
    const filter = req.query.filter;
    const userId = req.session.userId;
    let allProposals = await storage.getProposals(status ? { status } : void 0);
    const userMemberships = await db.select({ clubId: motoClubMembers.clubId }).from(motoClubMembers).where((0, import_drizzle_orm5.and)((0, import_drizzle_orm5.eq)(motoClubMembers.userId, userId), (0, import_drizzle_orm5.eq)(motoClubMembers.status, "active")));
    const memberClubIds = new Set(userMemberships.map((m) => m.clubId));
    allProposals = allProposals.filter((p) => {
      if (!p.clubId) return true;
      return memberClubIds.has(p.clubId);
    });
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
router5.get("/matches", requireAuth4, async (req, res) => {
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
router5.get("/garage-matches", requireAuth4, async (req, res) => {
  try {
    const userId = req.session.userId;
    const blockedIds = new Set(await storage.getBlockedUserIds(userId));
    const garageMatches = await storage.getMatchesForUser(userId);
    const countrySetting = await storage.getAppSetting("matching_countries");
    let allowedCountries = [];
    try {
      allowedCountries = countrySetting?.value ? JSON.parse(countrySetting.value) : [];
    } catch {
      allowedCountries = [];
    }
    const filteredMatches = garageMatches.filter((match) => {
      const otherId = match.bikerId === userId ? match.zavarrinaId : match.bikerId;
      return !blockedIds.has(otherId);
    });
    const results = await Promise.all(
      filteredMatches.map(async (match) => {
        const biker = await storage.getUser(match.bikerId);
        const zavorrina = await storage.getUser(match.zavarrinaId);
        const bikerMoto = await storage.getUserMotorcycle(match.bikerMotorcycleId);
        const wishlistMoto = await storage.getWishlistMoto(match.wishlistMotoId);
        const isBiker = match.bikerId === userId;
        const otherUser = isBiker ? zavorrina : biker;
        if (allowedCountries.length > 0 && (!otherUser?.country || !allowedCountries.includes(otherUser.country))) {
          return null;
        }
        let otherLat = otherUser?.firstLoginLat ?? null;
        let otherLng = otherUser?.firstLoginLng ?? null;
        if ((otherLat == null || otherLng == null) && otherUser?.id) {
          const profile = await storage.getUserProfile(otherUser.id);
          otherLat = profile?.latitude ?? null;
          otherLng = profile?.longitude ?? null;
        }
        return {
          ...match,
          isSupermatch: match.isSupermatch ?? false,
          bikerNickname: biker?.nickname,
          bikerType: biker?.userType,
          zavarrinaNickname: zavorrina?.nickname,
          zavarrinaType: zavorrina?.userType,
          bikerMoto: bikerMoto ? { brand: bikerMoto.brand, model: bikerMoto.model, motorcycleType: bikerMoto.motorcycleType } : null,
          wishlistMoto: wishlistMoto ? { brand: wishlistMoto.brand, model: wishlistMoto.model, motorcycleType: wishlistMoto.motorcycleType } : null,
          otherLat,
          otherLng
        };
      })
    );
    const enriched = results.filter(Boolean);
    const bestByUser = /* @__PURE__ */ new Map();
    for (const m of enriched) {
      const isBiker = m.bikerId === userId;
      const otherUserId = isBiker ? m.zavarrinaId : m.bikerId;
      const existing = bestByUser.get(otherUserId);
      if (!existing) {
        bestByUser.set(otherUserId, m);
      } else {
        const mIsSuper = m.isSupermatch;
        const exIsSuper = existing.isSupermatch;
        if (mIsSuper && !exIsSuper) {
          bestByUser.set(otherUserId, m);
        } else if (mIsSuper === exIsSuper) {
          const mTime = m.createdAt ? new Date(m.createdAt).getTime() : 0;
          const exTime = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
          if (mTime > exTime) bestByUser.set(otherUserId, m);
        }
      }
    }
    return res.json([...bestByUser.values()]);
  } catch (error) {
    console.error("Get garage matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.post("/garage-matches/:id/accept", requireAuth4, async (req, res) => {
  try {
    const userId = req.session.userId;
    const matchId = req.params.id;
    if (!matchId) return res.status(400).json({ message: "ID match mancante" });
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
    if (!updated) return res.status(500).json({ message: "Aggiornamento match fallito" });
    return res.json(updated);
  } catch (error) {
    console.error("Accept garage match error:", error instanceof Error ? error.message : error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.post("/garage-matches/:id/reject", requireAuth4, async (req, res) => {
  try {
    const userId = req.session.userId;
    const matchId = req.params.id;
    if (!matchId) return res.status(400).json({ message: "ID match mancante" });
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
    if (!updated) return res.status(500).json({ message: "Aggiornamento match fallito" });
    return res.json(updated);
  } catch (error) {
    console.error("Reject garage match error:", error instanceof Error ? error.message : error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.post("/matches/:id/accept", requireAuth4, async (req, res) => {
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
router5.post("/matches/:id/reject", requireAuth4, async (req, res) => {
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
router5.get("/biker-matches", requireAuth4, async (req, res) => {
  try {
    const userId = req.session.userId;
    const blockedIds = new Set(await storage.getBlockedUserIds(userId));
    const bikerMatchesList = await storage.getBikerBikerMatchesForUser(userId);
    const countrySetting = await storage.getAppSetting("matching_countries");
    let allowedCountries = [];
    try {
      allowedCountries = countrySetting?.value ? JSON.parse(countrySetting.value) : [];
    } catch {
      allowedCountries = [];
    }
    const filteredMatches = bikerMatchesList.filter((match) => {
      const otherId = match.biker1Id === userId ? match.biker2Id : match.biker1Id;
      return !blockedIds.has(otherId);
    });
    const results = await Promise.all(
      filteredMatches.map(async (match) => {
        const biker1 = await storage.getUser(match.biker1Id);
        const biker2 = await storage.getUser(match.biker2Id);
        const isBiker1 = match.biker1Id === userId;
        const otherBiker = isBiker1 ? biker2 : biker1;
        if (allowedCountries.length > 0 && (!otherBiker?.country || !allowedCountries.includes(otherBiker.country))) {
          return null;
        }
        let otherLat = otherBiker?.firstLoginLat ?? null;
        let otherLng = otherBiker?.firstLoginLng ?? null;
        if ((otherLat == null || otherLng == null) && otherBiker?.id) {
          const profile = await storage.getUserProfile(otherBiker.id);
          otherLat = profile?.latitude ?? null;
          otherLng = profile?.longitude ?? null;
        }
        return {
          ...match,
          isSupermatch: match.isSupermatch ?? false,
          biker1Nickname: biker1?.nickname,
          biker2Nickname: biker2?.nickname,
          otherLat,
          otherLng
        };
      })
    );
    const enriched = results.filter(Boolean);
    const bestByUser = /* @__PURE__ */ new Map();
    for (const m of enriched) {
      const isBiker1 = m.biker1Id === userId;
      const otherUserId = isBiker1 ? m.biker2Id : m.biker1Id;
      const existing = bestByUser.get(otherUserId);
      if (!existing) {
        bestByUser.set(otherUserId, m);
      } else {
        const mIsSuper = m.isSupermatch;
        const exIsSuper = existing.isSupermatch;
        if (mIsSuper && !exIsSuper) {
          bestByUser.set(otherUserId, m);
        } else if (mIsSuper === exIsSuper) {
          const mTime = m.createdAt ? new Date(m.createdAt).getTime() : 0;
          const exTime = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
          if (mTime > exTime) bestByUser.set(otherUserId, m);
        }
      }
    }
    return res.json([...bestByUser.values()]);
  } catch (error) {
    console.error("Get biker-biker matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.post("/biker-matches/:id/accept", requireAuth4, async (req, res) => {
  try {
    const userId = req.session.userId;
    const matchId = req.params.id;
    if (!matchId) return res.status(400).json({ message: "ID match mancante" });
    const match = await storage.getBikerBikerMatch(matchId);
    if (!match) return res.status(404).json({ message: "Match non trovato" });
    if (match.biker1Id !== userId && match.biker2Id !== userId) return res.status(403).json({ message: "Non autorizzato" });
    if (match.status !== "new") return res.status(400).json({ message: "Match gi\xE0 gestito" });
    const updated = await storage.updateBikerBikerMatch(matchId, { status: "accepted" });
    if (!updated) return res.status(500).json({ message: "Aggiornamento match fallito" });
    return res.json(updated);
  } catch (error) {
    console.error("Accept biker-biker match error:", error instanceof Error ? error.message : error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.post("/biker-matches/:id/reject", requireAuth4, async (req, res) => {
  try {
    const userId = req.session.userId;
    const matchId = req.params.id;
    if (!matchId) return res.status(400).json({ message: "ID match mancante" });
    const match = await storage.getBikerBikerMatch(matchId);
    if (!match) return res.status(404).json({ message: "Match non trovato" });
    if (match.biker1Id !== userId && match.biker2Id !== userId) return res.status(403).json({ message: "Non autorizzato" });
    if (match.status !== "new") return res.status(400).json({ message: "Match gi\xE0 gestito" });
    const updated = await storage.updateBikerBikerMatch(matchId, { status: "rejected" });
    if (!updated) return res.status(500).json({ message: "Aggiornamento match fallito" });
    return res.json(updated);
  } catch (error) {
    console.error("Reject biker-biker match error:", error instanceof Error ? error.message : error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.delete("/biker-matches/rejected", requireAuth4, async (req, res) => {
  try {
    const userId = req.session.userId;
    const count3 = await storage.deleteRejectedBikerBikerMatches(userId);
    return res.json({ deleted: count3 });
  } catch (error) {
    console.error("Delete rejected biker-biker matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.delete("/biker-matches/:matchId", requireAuth4, async (req, res) => {
  try {
    const userId = req.session.userId;
    const ok = await storage.resetBikerBikerMatchToNew(req.params.matchId, userId);
    if (!ok) return res.status(404).json({ message: "Match non trovato o non autorizzato" });
    return res.json({ reset: true });
  } catch (error) {
    console.error("Reset biker-biker match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.post("/reset-and-rematch", requireAuth4, async (req, res) => {
  try {
    const userId = req.session.userId;
    const [deletedGarage, deletedBiker, deletedProposal] = await Promise.all([
      storage.deleteNewGarageMatches(userId),
      storage.deleteNewBikerBikerMatches(userId),
      storage.deletePendingProposalMatches(userId)
    ]);
    const totalDeleted = deletedGarage + deletedBiker + deletedProposal;
    console.log(`[ResetAndRematch] user=${userId} deleted: garage=${deletedGarage} biker=${deletedBiker} proposal=${deletedProposal}`);
    const [bikerResult, proposalCount] = await Promise.all([
      runMatchingForUser(userId),
      runProposalMatchingForUser(userId)
    ]);
    const totalCreated = bikerResult.bikerBiker + bikerResult.zavarrina + proposalCount;
    console.log(`[ResetAndRematch] user=${userId} created: bikerBiker=${bikerResult.bikerBiker} zavarrina=${bikerResult.zavarrina} proposal=${proposalCount}`);
    return res.json({
      deleted: { garage: deletedGarage, biker: deletedBiker, proposal: deletedProposal, total: totalDeleted },
      created: { bikerBiker: bikerResult.bikerBiker, zavarrina: bikerResult.zavarrina, proposal: proposalCount, total: totalCreated }
    });
  } catch (error) {
    console.error("Reset and rematch error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.get("/:id", requireAuth4, async (req, res) => {
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
router5.post("/", requireAuth4, async (req, res) => {
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
router5.put("/:id", requireAuth4, async (req, res) => {
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
router5.post("/:id/join", requireAuth4, async (req, res) => {
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
router5.delete("/matches/rejected", requireAuth4, async (req, res) => {
  try {
    const userId = req.session.userId;
    const count3 = await storage.deleteRejectedProposalMatches(userId);
    return res.json({ deleted: count3 });
  } catch (error) {
    console.error("Delete rejected proposal matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.delete("/matches/:matchId", requireAuth4, async (req, res) => {
  try {
    const userId = req.session.userId;
    const ok = await storage.deleteProposalMatch(req.params.matchId, userId);
    if (!ok) return res.status(404).json({ message: "Match non trovato o non autorizzato" });
    return res.json({ deleted: true });
  } catch (error) {
    console.error("Delete proposal match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.delete("/garage-matches/rejected", requireAuth4, async (req, res) => {
  try {
    const userId = req.session.userId;
    const count3 = await storage.deleteRejectedGarageMatches(userId);
    return res.json({ deleted: count3 });
  } catch (error) {
    console.error("Delete rejected garage matches error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.delete("/garage-matches/:matchId", requireAuth4, async (req, res) => {
  try {
    const userId = req.session.userId;
    const ok = await storage.resetGarageMatchToNew(req.params.matchId, userId);
    if (!ok) return res.status(404).json({ message: "Match non trovato o non autorizzato" });
    return res.json({ deleted: true });
  } catch (error) {
    console.error("Reset garage match error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router5.delete("/:id", requireAuth4, async (req, res) => {
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
var proposals_default = router5;

// server/routes/tracking.ts
var import_express6 = require("express");
init_storage();
var router6 = (0, import_express6.Router)();
function requireAuth5(req, res) {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}
router6.post("/", async (req, res) => {
  try {
    const userId = requireAuth5(req, res);
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
router6.post("/:id/points", async (req, res) => {
  try {
    const userId = requireAuth5(req, res);
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
router6.put("/:id/stop", async (req, res) => {
  try {
    const userId = requireAuth5(req, res);
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
router6.patch("/:id/stats", async (req, res) => {
  try {
    const userId = requireAuth5(req, res);
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
router6.get("/", async (req, res) => {
  try {
    const userId = requireAuth5(req, res);
    if (!userId) return;
    const userRoutes = await storage.getRoutes(userId);
    return res.json(userRoutes);
  } catch (error) {
    console.error("Get routes error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router6.get("/:id", async (req, res) => {
  try {
    const userId = requireAuth5(req, res);
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
router6.post("/:id/like", async (req, res) => {
  try {
    const userId = requireAuth5(req, res);
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
var tracking_default = router6;

// server/routes/wishlist.ts
var import_express7 = require("express");
var import_path4 = __toESM(require("path"));
var import_fs4 = __toESM(require("fs"));
init_storage();
var router7 = (0, import_express7.Router)();
var uploadsDir3 = import_path4.default.join(process.cwd(), "uploads", "wishlist");
if (!import_fs4.default.existsSync(uploadsDir3)) {
  import_fs4.default.mkdirSync(uploadsDir3, { recursive: true });
}
function requireAuth6(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}
router7.get("/", requireAuth6, async (req, res) => {
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
router7.put("/", requireAuth6, async (req, res) => {
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
router7.post("/photos", requireAuth6, async (req, res) => {
  try {
    const userId = req.session.userId;
    let wishlist = await storage.getWishlist(userId);
    if (!wishlist) {
      wishlist = await storage.createOrUpdateWishlist(userId, "");
    }
    const count3 = await storage.getWishlistPhotoCount(wishlist.id);
    if (count3 >= 3) {
      return res.status(400).json({ message: "Massimo 3 foto permesse" });
    }
    const { imageBase64, filename } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ message: "Nessuna immagine fornita" });
    }
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const ext = (filename || "photo.jpg").split(".").pop() || "jpg";
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const filePath = import_path4.default.join(uploadsDir3, uniqueName);
    import_fs4.default.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
    const photoUrl = `/uploads/wishlist/${uniqueName}`;
    const photo = await storage.addWishlistPhoto({
      wishlistId: wishlist.id,
      photoUrl,
      sortOrder: count3
    });
    return res.status(201).json(photo);
  } catch (error) {
    console.error("Upload wishlist photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router7.delete("/photos/:photoId", requireAuth6, async (req, res) => {
  try {
    const photoId = req.params.photoId;
    await storage.deleteWishlistPhoto(photoId);
    return res.json({ message: "Foto eliminata" });
  } catch (error) {
    console.error("Delete wishlist photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router7.post("/motos", requireAuth6, async (req, res) => {
  try {
    const userId = req.session.userId;
    let wishlist = await storage.getWishlist(userId);
    if (!wishlist) {
      wishlist = await storage.createOrUpdateWishlist(userId, "");
    }
    const count3 = await storage.getWishlistMotoCount(wishlist.id);
    if (count3 >= 5) {
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
    if (brand) {
      const includeZavSetting = await storage.getAppSetting("motoclub_include_zav");
      if (includeZavSetting?.value !== "false") {
        createClubInvitesForMoto(userId, brand, model || "").catch(() => {
        });
      }
    }
    return res.status(201).json({ moto, matches });
  } catch (error) {
    console.error("Add wishlist moto error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router7.put("/motos/:motoId", requireAuth6, async (req, res) => {
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
router7.delete("/motos/:motoId", requireAuth6, async (req, res) => {
  try {
    const motoId = req.params.motoId;
    await storage.deleteWishlistMoto(motoId);
    return res.json({ message: "Moto eliminata dalla wishlist" });
  } catch (error) {
    console.error("Delete wishlist moto error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var wishlist_default = router7;

// server/routes/feedback.ts
var import_express8 = require("express");
init_storage();
var ADMIN_EMAIL = "bikerlinkapp@gmail.com";
var TICKET_TYPE_LABELS = {
  bug: "Bug Report",
  suggestion: "Suggerimento",
  feedback: "Feedback",
  other: "Altro"
};
function buildFeedbackEmailHtml(nickname, ticketType, subject, message) {
  const typeLabel = TICKET_TYPE_LABELS[ticketType] || ticketType;
  const typeBadgeColor = ticketType === "bug" ? "#e74c3c" : ticketType === "suggestion" ? "#2ecc71" : "#FF6B35";
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #FF6B35; margin: 0; font-size: 28px;">&#x1F6E1;&#xFE0F; BikerLink</h1>
        <p style="color: #888; font-size: 14px; margin-top: 4px;">Nuovo ticket ricevuto</p>
      </div>
      <div style="background: #1a1a2e; border-radius: 12px; padding: 30px; color: #fff;">
        <div style="display: inline-block; background: ${typeBadgeColor}; border-radius: 6px; padding: 4px 12px; margin-bottom: 16px;">
          <span style="color: #fff; font-size: 13px; font-weight: bold;">${typeLabel}</span>
        </div>
        <h2 style="margin-top: 0; font-size: 20px; color: #FF6B35;">${subject}</h2>
        <p style="color: #aaa; font-size: 13px; margin-bottom: 4px;">Da: <strong style="color: #fff;">${nickname}</strong></p>
        <div style="background: #16162a; border-radius: 8px; padding: 16px; margin-top: 16px;">
          <p style="color: #ccc; line-height: 1.6; margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
      </div>
      <p style="text-align: center; color: #666; font-size: 12px; margin-top: 20px;">
        &copy; ${(/* @__PURE__ */ new Date()).getFullYear()} BikerLink &mdash; Notifica automatica
      </p>
    </div>
  `;
}
var router8 = (0, import_express8.Router)();
router8.post("/", async (req, res) => {
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
    try {
      const user = await storage.getUser(req.session.userId);
      const nickname = user?.nickname || "Utente sconosciuto";
      const type = ticketType || "feedback";
      const emailSubject = `[BikerLink] ${TICKET_TYPE_LABELS[type] || type}: ${subject}`;
      const html = buildFeedbackEmailHtml(nickname, type, subject, message);
      sendEmail(ADMIN_EMAIL, emailSubject, html).catch(
        (err) => console.error("[EMAIL] Errore invio notifica feedback:", err)
      );
    } catch (emailErr) {
      console.error("[EMAIL] Errore preparazione notifica feedback:", emailErr);
    }
    return res.status(201).json(ticket);
  } catch (error) {
    console.error("Feedback create error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router8.get("/", async (req, res) => {
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
var feedback_default = router8;

// server/routes/invitations.ts
var import_express9 = require("express");
init_storage();
var router9 = (0, import_express9.Router)();
router9.post("/generate", async (req, res) => {
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
      maxUses: maxUses || 100,
      expiresAt: expiresAt ? new Date(expiresAt) : void 0
    });
    return res.status(201).json(invitation);
  } catch (error) {
    console.error("Invitation generate error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router9.get("/", async (req, res) => {
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
router9.get("/placeholders", async (_req, res) => {
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
router9.get("/preview/:code", async (req, res) => {
  try {
    const { code } = req.params;
    if (!code) return res.status(400).json({ message: "Codice mancante" });
    const invitation = await storage.getInvitationCode(code.toUpperCase());
    if (!invitation || !invitation.isActive) {
      return res.status(404).json({ message: "Codice non valido" });
    }
    if (invitation.currentUses >= invitation.maxUses) {
      return res.status(404).json({ message: "Codice esaurito" });
    }
    if (invitation.expiresAt && new Date(invitation.expiresAt) < /* @__PURE__ */ new Date()) {
      return res.status(404).json({ message: "Codice scaduto" });
    }
    return res.json({
      code: invitation.code,
      label: invitation.label ?? null,
      giftMessage: invitation.giftMessage ?? null
    });
  } catch (error) {
    console.error("Invite preview error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var invitations_default = router9;

// server/routes/contest.ts
var import_express10 = require("express");
var import_path5 = __toESM(require("path"));
var import_fs5 = __toESM(require("fs"));
var import_multer2 = __toESM(require("multer"));
init_storage();
var router10 = (0, import_express10.Router)();
var uploadsDir4 = import_path5.default.join(process.cwd(), "uploads", "contest");
if (!import_fs5.default.existsSync(uploadsDir4)) {
  import_fs5.default.mkdirSync(uploadsDir4, { recursive: true });
}
var contestStorage = import_multer2.default.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir4);
  },
  filename: (_req, file, cb) => {
    const ext = import_path5.default.extname(file.originalname) || ".jpg";
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`;
    cb(null, uniqueName);
  }
});
var upload2 = (0, import_multer2.default)({
  storage: contestStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Solo immagini consentite"));
    }
  }
});
function requireAuth7(req, res) {
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
router10.post("/entries", upload2.single("photo"), async (req, res) => {
  try {
    const userId = requireAuth7(req, res);
    if (!userId) return;
    const caption = req.body.caption || null;
    const performanceData = req.body.performanceData || null;
    let photoUrl = null;
    if (req.file) {
      photoUrl = `/uploads/contest/${req.file.filename}`;
    } else if (req.body.photoUrl) {
      photoUrl = req.body.photoUrl;
    }
    if (!photoUrl && !performanceData) {
      return res.status(400).json({ message: "Foto o dati performance obbligatori" });
    }
    const now = /* @__PURE__ */ new Date();
    const weekNumber = getWeekNumber(now);
    const year = now.getFullYear();
    const entry = await storage.createPhotoContestEntry({
      userId,
      photoUrl,
      caption,
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
router10.get("/entries", async (req, res) => {
  try {
    const userId = requireAuth7(req, res);
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
router10.post("/entries/:id/vote", async (req, res) => {
  try {
    const userId = requireAuth7(req, res);
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
router10.delete("/entries/:id", async (req, res) => {
  try {
    const userId = requireAuth7(req, res);
    if (!userId) return;
    const { id } = req.params;
    const entry = await storage.getPhotoContestEntry(id);
    if (!entry) {
      return res.status(404).json({ message: "Foto non trovata" });
    }
    if (entry.userId !== userId) {
      return res.status(403).json({ message: "Non puoi eliminare questa foto" });
    }
    await storage.deletePhotoContestEntry(id);
    return res.json({ message: "Foto eliminata" });
  } catch (error) {
    console.error("Contest delete entry error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router10.get("/winners", async (req, res) => {
  try {
    const userId = requireAuth7(req, res);
    if (!userId) return;
    const winners = await storage.getPhotoWinners();
    return res.json(winners);
  } catch (error) {
    console.error("Contest winners error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var contest_default = router10;

// server/routes/ads.ts
var import_express11 = require("express");
init_storage();
var router11 = (0, import_express11.Router)();
router11.get("/active", async (req, res) => {
  try {
    const adsSetting = await storage.getAppSetting("ads_enabled");
    if (adsSetting?.value === "false") {
      return res.json([]);
    }
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
router11.get("/my-ads", async (req, res) => {
  try {
    const adsSetting = await storage.getAppSetting("ads_enabled");
    if (adsSetting?.value === "false") {
      return res.json([]);
    }
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
      const p = c.placement || "all";
      return p === "all" || p === "home";
    });
    return res.json(activeCampaigns);
  } catch (error) {
    console.error("Get my ads error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router11.get("/placement/:placement", async (req, res) => {
  try {
    const adsSetting = await storage.getAppSetting("ads_enabled");
    if (adsSetting?.value === "false") {
      return res.json([]);
    }
    const { placement } = req.params;
    const userId = req.session?.userId;
    let userType = "biker";
    if (userId) {
      const user = await storage.getUser(userId);
      if (user) userType = user.userType || "biker";
    }
    const campaigns = await storage.getActiveAdsByUserType(userType);
    const now = /* @__PURE__ */ new Date();
    const activeCampaigns = campaigns.filter((c) => {
      if (c.startDate && new Date(c.startDate) > now) return false;
      if (c.endDate && new Date(c.endDate) < now) return false;
      const cp = c.placement || "all";
      return cp === placement || cp === "all";
    });
    return res.json(activeCampaigns);
  } catch (error) {
    console.error("Get placement ads error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router11.post("/:id/click", async (req, res) => {
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
var ads_default = router11;

// server/routes/chat.ts
var import_express12 = require("express");
init_storage();
init_db();
init_schema();
var import_drizzle_orm6 = require("drizzle-orm");
function escapeHtml(text2) {
  return text2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
var router12 = (0, import_express12.Router)();
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
  const count3 = fakeBotMessageCounts.get(conversationId) || 0;
  fakeBotMessageCounts.set(conversationId, count3 + 1);
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
  if (count3 === 0 && isGreeting) {
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
  } else if (count3 === 0) {
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
  } else if (isShort && !isGreeting && !isPushing && !isMotoTalk && count3 > 0) {
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
  } else if (isPushing && count3 >= 5) {
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
  } else if (isCompliment && count3 > 0) {
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
    if (isZav && senderIsBiker && count3 < 4) {
      reply = pick([
        "Tu che moto hai? Sono curiosa",
        "Da quanto tempo guidi?",
        "Ti piace andare in giro?",
        `Io abito in ${region}, te di dove sei?`,
        "Ma tu giri da solo o con un gruppo?",
        "Che tipo di strade ti piacciono di pi\xF9?"
      ]);
    } else if (isBik && senderIsZav && count3 < 4) {
      reply = pick([
        "Sei mai salita in moto?",
        `Di dove sei? Io sono di ${region}`,
        "Ti piacciono le moto o \xE8 la prima volta?",
        bike ? `Se vuoi un giorno ti faccio fare un giro sulla ${bike}` : "Se vuoi un giorno ti faccio fare un giro",
        "Cosa ti ha fatto scaricare l'app?"
      ]);
    } else if (isBik && senderIsBiker && count3 < 4) {
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
function requireAuth8(req, res) {
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
router12.get("/unread-total", async (req, res) => {
  try {
    const userId = requireAuth8(req, res);
    if (!userId) return;
    const blockedIds = new Set(await storage.getBlockedUserIds(userId));
    const convs = await storage.getConversations(userId);
    let total = 0;
    for (const conv of convs) {
      const participants = await storage.getConversationParticipants(conv.id);
      const isDirectConv = conv.conversationType === "direct" || conv.conversationType === "private" || conv.conversationType === "contact";
      if (isDirectConv) {
        const otherParticipantIds = participants.filter((p) => p.userId !== userId).map((p) => p.userId);
        if (otherParticipantIds.some((id) => blockedIds.has(id))) {
          continue;
        }
      }
      const myParticipant = participants.find((p) => p.userId === userId);
      const msgs = await storage.getMessages(conv.id, 1, 0);
      const lastMessage = msgs[0] || null;
      if (lastMessage && lastMessage.senderId !== userId) {
        if (myParticipant?.lastReadAt) {
          if (new Date(lastMessage.createdAt) > new Date(myParticipant.lastReadAt)) {
            total++;
          }
        } else {
          total++;
        }
      }
    }
    return res.json({ count: total });
  } catch (error) {
    console.error("Get unread total error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router12.get("/conversations", async (req, res) => {
  try {
    const userId = requireAuth8(req, res);
    if (!userId) return;
    const blockedIds = await storage.getBlockedUserIds(userId);
    const blockedSet = new Set(blockedIds);
    const convs = await storage.getConversations(userId);
    const result = (await Promise.all(
      convs.map(async (conv) => {
        const participants = await storage.getConversationParticipants(conv.id);
        const msgs = await storage.getMessages(conv.id, 1, 0);
        const lastMessage = msgs[0] || null;
        const isDirectConv = conv.conversationType === "direct" || conv.conversationType === "private" || conv.conversationType === "contact";
        if (isDirectConv) {
          const otherParticipantIds = participants.filter((p) => p.userId !== userId).map((p) => p.userId);
          if (otherParticipantIds.some((id) => blockedSet.has(id))) {
            return null;
          }
        }
        const participantUsers = await Promise.all(
          participants.map(async (p) => {
            const user = await storage.getUser(p.userId);
            return user ? { id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl, userType: user.userType, sex: user.sex } : null;
          })
        );
        const myParticipant = participants.find((p) => p.userId === userId);
        const unreadCount = lastMessage && lastMessage.senderId !== userId ? myParticipant?.lastReadAt ? new Date(lastMessage.createdAt) > new Date(myParticipant.lastReadAt) ? 1 : 0 : 1 : 0;
        return {
          ...conv,
          participants: participantUsers.filter(Boolean),
          lastMessage,
          unreadCount
        };
      })
    )).filter(Boolean);
    return res.json(result);
  } catch (error) {
    console.error("Get conversations error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router12.post("/conversations", async (req, res) => {
  try {
    const userId = requireAuth8(req, res);
    if (!userId) return;
    const { conversationType, title, proposalId, participantIds } = req.body;
    if (participantIds?.length === 1) {
      const targetUserId = participantIds[0];
      const blocked = await storage.isBlocked(userId, targetUserId);
      if (blocked) {
        return res.status(403).json({ message: "Non puoi aprire una conversazione con questo utente" });
      }
    }
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
router12.delete("/conversations/:id", async (req, res) => {
  try {
    const userId = requireAuth8(req, res);
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
router12.get("/conversations/:id/messages", async (req, res) => {
  try {
    const userId = requireAuth8(req, res);
    if (!userId) return;
    const id = req.params.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const [conversation, participants] = await Promise.all([
      storage.getConversation(id),
      storage.getConversationParticipants(id)
    ]);
    if (!participants.find((p) => p.userId === userId)) {
      if (conversation?.conversationType === "motoclub") {
        const clubRow = await db.select({ id: motoClubs.id }).from(motoClubs).where((0, import_drizzle_orm6.eq)(motoClubs.conversationId, id)).limit(1);
        if (clubRow[0]) {
          const membership = await db.select({ userId: motoClubMembers.userId }).from(motoClubMembers).where((0, import_drizzle_orm6.and)(
            (0, import_drizzle_orm6.eq)(motoClubMembers.clubId, clubRow[0].id),
            (0, import_drizzle_orm6.eq)(motoClubMembers.userId, userId),
            (0, import_drizzle_orm6.eq)(motoClubMembers.status, "active")
          )).limit(1);
          if (membership[0]) {
            await storage.addConversationParticipant({ conversationId: id, userId });
          } else {
            return res.status(403).json({ message: "Non fai parte di questa conversazione" });
          }
        } else {
          return res.status(403).json({ message: "Non fai parte di questa conversazione" });
        }
      } else {
        return res.status(403).json({ message: "Non fai parte di questa conversazione" });
      }
    }
    const isDirectConv = conversation && (conversation.conversationType === "direct" || conversation.conversationType === "private" || conversation.conversationType === "contact");
    if (isDirectConv && participants.length === 2) {
      const otherParticipant = participants.find((p) => p.userId !== userId);
      if (otherParticipant) {
        const blocked = await storage.isBlocked(userId, otherParticipant.userId);
        if (blocked) {
          return res.status(403).json({ message: "Utente bloccato" });
        }
      }
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
router12.post("/conversations/:id/messages", async (req, res) => {
  try {
    const userId = requireAuth8(req, res);
    if (!userId) return;
    const id = req.params.id;
    const { messageType, content, imageUrl, latitude, longitude } = req.body;
    const [conversation, participants] = await Promise.all([
      storage.getConversation(id),
      storage.getConversationParticipants(id)
    ]);
    if (!participants.find((p) => p.userId === userId)) {
      if (conversation?.conversationType === "motoclub") {
        const clubRow = await db.select({ id: motoClubs.id }).from(motoClubs).where((0, import_drizzle_orm6.eq)(motoClubs.conversationId, id)).limit(1);
        if (clubRow[0]) {
          const membership = await db.select({ userId: motoClubMembers.userId }).from(motoClubMembers).where((0, import_drizzle_orm6.and)(
            (0, import_drizzle_orm6.eq)(motoClubMembers.clubId, clubRow[0].id),
            (0, import_drizzle_orm6.eq)(motoClubMembers.userId, userId),
            (0, import_drizzle_orm6.eq)(motoClubMembers.status, "active")
          )).limit(1);
          if (!membership[0]) {
            return res.status(403).json({ message: "Non fai parte di questa conversazione" });
          }
          await storage.addConversationParticipant({ conversationId: id, userId });
        } else {
          return res.status(403).json({ message: "Non fai parte di questa conversazione" });
        }
      } else {
        return res.status(403).json({ message: "Non fai parte di questa conversazione" });
      }
    }
    const isDirectConv = conversation && (conversation.conversationType === "direct" || conversation.conversationType === "private" || conversation.conversationType === "contact");
    if (isDirectConv && participants.length === 2) {
      const otherParticipant = participants.find((p) => p.userId !== userId);
      if (otherParticipant) {
        const blocked = await storage.isBlocked(userId, otherParticipant.userId);
        if (blocked) {
          return res.status(403).json({ message: "Utente bloccato" });
        }
      }
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
    const senderUser = await storage.getUser(userId);
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
        } else if (targetUser && !senderUser?.isFake) {
          const targetProfile = await storage.getUserProfile(p.userId);
          if (targetProfile?.emailChatNotifications && targetUser.email) {
            const lastLogin = targetUser.lastLoginAt ? new Date(targetUser.lastLoginAt) : null;
            const isOffline = !lastLogin || Date.now() - lastLogin.getTime() > 15 * 60 * 1e3;
            if (isOffline) {
              const senderNick = escapeHtml(senderUser?.nickname ?? "Un utente");
              let preview;
              if (messageType === "image") {
                preview = "\u{1F4F8} ha inviato una foto";
              } else if (messageType === "location") {
                preview = "\u{1F4CD} ha condiviso una posizione";
              } else {
                const rawText = finalContent ?? "";
                const truncated = rawText.length > 120 ? rawText.substring(0, 120) + "\u2026" : rawText;
                preview = escapeHtml(truncated);
              }
              const html = `
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
                  <div style="text-align:center;margin-bottom:24px;">
                    <h1 style="color:#FF6B35;margin:0;font-size:26px;">\u{1F3CD}\uFE0F BikerLink</h1>
                    <p style="color:#888;font-size:13px;margin-top:4px;">U'll never ride alone</p>
                  </div>
                  <div style="background:#1a1a2e;border-radius:12px;padding:24px;color:#fff;">
                    <h2 style="margin-top:0;font-size:18px;">Nuovo messaggio da ${senderNick}</h2>
                    ${preview ? `<div style="background:#22222e;border-radius:8px;padding:14px;margin:16px 0;color:#ddd;font-size:15px;line-height:1.5;">${preview}</div>` : ""}
                    <p style="color:#999;font-size:13px;line-height:1.5;margin-bottom:0;">
                      Apri BikerLink per rispondere.
                    </p>
                  </div>
                  <p style="text-align:center;color:#666;font-size:12px;margin-top:20px;">
                    &copy; ${(/* @__PURE__ */ new Date()).getFullYear()} BikerLink &mdash; Puoi disattivare questa notifica dal tab Chat dell'app.
                  </p>
                </div>
              `;
              sendEmail(targetUser.email, "Nuovo messaggio su BikerLink", html).catch((err) => console.error("[EMAIL] Invio notifica chat fallito:", err));
            }
          }
        }
      }
    }
    if (conversation?.conversationType === "motoclub") {
      const chatbotSetting = await storage.getAppSetting("chatbot_enabled");
      if (chatbotSetting?.value !== "false") {
        const clubRow = await db.select({ id: motoClubs.id }).from(motoClubs).where((0, import_drizzle_orm6.eq)(motoClubs.conversationId, id)).limit(1);
        if (clubRow[0]) {
          const fakeMembers = await db.select({ userId: motoClubMembers.userId }).from(motoClubMembers).innerJoin(users, (0, import_drizzle_orm6.eq)(motoClubMembers.userId, users.id)).where((0, import_drizzle_orm6.and)(
            (0, import_drizzle_orm6.eq)(motoClubMembers.clubId, clubRow[0].id),
            (0, import_drizzle_orm6.eq)(motoClubMembers.status, "active"),
            (0, import_drizzle_orm6.eq)(users.isFake, true),
            (0, import_drizzle_orm6.ne)(motoClubMembers.userId, userId)
          ));
          if (fakeMembers.length > 0) {
            const randomFake = fakeMembers[Math.floor(Math.random() * fakeMembers.length)];
            const fakeUserId = randomFake.userId;
            storage.recordFakeUserInteraction(fakeUserId, userId, "chat_message").catch(() => {
            });
            const fakeUser = await storage.getUser(fakeUserId);
            const fakeProfile = await storage.getUserProfile(fakeUserId);
            const fakeMotoList = await storage.getUserMotorcycles(fakeUserId);
            const firstMoto = fakeMotoList[0];
            const senderUserForCtx = await storage.getUser(userId);
            const fakeCtx = {
              nickname: fakeUser?.nickname || "Rider",
              region: fakeUser?.region || void 0,
              bio: fakeProfile?.bio || void 0,
              brand: firstMoto?.brand || void 0,
              model: firstMoto?.model || void 0,
              userType: fakeUser?.userType || void 0,
              sex: fakeUser?.sex || void 0,
              senderUserType: senderUserForCtx?.userType || void 0,
              senderSex: senderUserForCtx?.sex || void 0,
              senderNickname: senderUserForCtx?.nickname || void 0
            };
            const contentLen = finalContent?.length || 0;
            const delay = contentLen > 50 ? 2500 + Math.random() * 2e3 : 1500 + Math.random() * 2e3;
            setTimeout(async () => {
              try {
                const replyText = getFakeBotReply(finalContent || "", id, fakeCtx);
                await storage.createMessage({
                  conversationId: id,
                  senderId: fakeUserId,
                  messageType: "text",
                  content: replyText,
                  imageUrl: null,
                  latitude: null,
                  longitude: null,
                  isFiltered: false
                });
                await storage.updateConversationTimestamp(id);
              } catch (err) {
                console.error("Motoclub fake reply error:", err);
              }
            }, delay);
          }
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
var chat_default = router12;

// server/routes/notifications.ts
var import_express13 = require("express");
init_storage();
var router13 = (0, import_express13.Router)();
function requireAuth9(req, res) {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}
router13.get("/", async (req, res) => {
  try {
    const userId = requireAuth9(req, res);
    if (!userId) return;
    const notificationsList = await storage.getNotifications(userId);
    return res.json(notificationsList);
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router13.put("/:id/read", async (req, res) => {
  try {
    const userId = requireAuth9(req, res);
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
var notifications_default = router13;

// server/routes/reports.ts
var import_express14 = require("express");
var import_zod2 = require("zod");
init_storage();
var ADMIN_EMAIL2 = "bikerlinkapp@gmail.com";
function buildReportEmailHtml(reporterNickname, reportedNickname, reason, description) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #e74c3c; margin: 0; font-size: 28px;">&#x26A0;&#xFE0F; BikerLink</h1>
        <p style="color: #888; font-size: 14px; margin-top: 4px;">Segnalazione utente</p>
      </div>
      <div style="background: #1a1a2e; border-radius: 12px; padding: 30px; color: #fff;">
        <div style="display: inline-block; background: #e74c3c; border-radius: 6px; padding: 4px 12px; margin-bottom: 16px;">
          <span style="color: #fff; font-size: 13px; font-weight: bold;">Segnalazione</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <tr>
            <td style="color: #888; padding: 6px 0; font-size: 13px; vertical-align: top;">Segnalante:</td>
            <td style="color: #fff; padding: 6px 0; font-size: 14px; font-weight: bold;">${reporterNickname}</td>
          </tr>
          <tr>
            <td style="color: #888; padding: 6px 0; font-size: 13px; vertical-align: top;">Segnalato:</td>
            <td style="color: #e74c3c; padding: 6px 0; font-size: 14px; font-weight: bold;">${reportedNickname}</td>
          </tr>
          <tr>
            <td style="color: #888; padding: 6px 0; font-size: 13px; vertical-align: top;">Motivo:</td>
            <td style="color: #FF6B35; padding: 6px 0; font-size: 14px;">${reason}</td>
          </tr>
        </table>
        ${description ? `
        <div style="background: #16162a; border-radius: 8px; padding: 16px;">
          <p style="color: #aaa; font-size: 12px; margin: 0 0 6px 0;">Descrizione:</p>
          <p style="color: #ccc; line-height: 1.6; margin: 0; white-space: pre-wrap;">${description}</p>
        </div>
        ` : ""}
      </div>
      <p style="text-align: center; color: #666; font-size: 12px; margin-top: 20px;">
        &copy; ${(/* @__PURE__ */ new Date()).getFullYear()} BikerLink &mdash; Notifica automatica
      </p>
    </div>
  `;
}
var router14 = (0, import_express14.Router)();
function requireAuth10(req, res) {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}
var createReportSchema = import_zod2.z.object({
  reportedUserId: import_zod2.z.string().min(1, "ID utente segnalato obbligatorio"),
  reason: import_zod2.z.string().min(1, "Motivo obbligatorio").max(100),
  description: import_zod2.z.string().optional()
});
router14.post("/", async (req, res) => {
  try {
    const userId = requireAuth10(req, res);
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
    try {
      const reporter = await storage.getUser(userId);
      const reporterNickname = reporter?.nickname || "Utente sconosciuto";
      const reportedNickname = reportedUser.nickname || "Utente sconosciuto";
      const emailSubject = `[BikerLink] Segnalazione: ${reporterNickname} \u2192 ${reportedNickname}`;
      const html = buildReportEmailHtml(reporterNickname, reportedNickname, reason, description);
      sendEmail(ADMIN_EMAIL2, emailSubject, html).catch(
        (err) => console.error("[EMAIL] Errore invio notifica segnalazione:", err)
      );
    } catch (emailErr) {
      console.error("[EMAIL] Errore preparazione notifica segnalazione:", emailErr);
    }
    return res.status(201).json(report);
  } catch (error) {
    console.error("Create report error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router14.get("/", async (req, res) => {
  try {
    const userId = requireAuth10(req, res);
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
var reports_default = router14;

// server/routes/workshops.ts
var import_express15 = require("express");
init_storage();
var router15 = (0, import_express15.Router)();
router15.get("/", async (req, res) => {
  try {
    const workshops2 = await storage.getWorkshops(true);
    return res.json(workshops2);
  } catch (error) {
    console.error("Get workshops error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router15.get("/:id", async (req, res) => {
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
router15.post("/:id/contact", async (req, res) => {
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
var workshops_default = router15;

// server/routes/easter-eggs.ts
var import_express16 = require("express");
init_storage();
var router16 = (0, import_express16.Router)();
router16.get("/nearby", async (req, res) => {
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
      const distance = haversineDistance2(lat, lng, egg.latitude, egg.longitude);
      return { ...egg, distance, collected: collectedIds.has(egg.id) };
    }).filter((egg) => egg.distance <= egg.radius / 1e3).sort((a, b) => a.distance - b.distance);
    return res.json(nearbyEggs);
  } catch (error) {
    console.error("Get nearby easter eggs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router16.get("/collected", async (req, res) => {
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
router16.post("/:id/collect", async (req, res) => {
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
function haversineDistance2(lat1, lon1, lat2, lon2) {
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
var easter_eggs_default = router16;

// server/routes/admin.ts
var import_express17 = require("express");
var import_multer3 = __toESM(require("multer"));
var import_fs7 = __toESM(require("fs"));
var import_path7 = __toESM(require("path"));
var import_bcryptjs3 = __toESM(require("bcryptjs"));
init_storage();
init_db();
init_schema();
var import_drizzle_orm9 = require("drizzle-orm");
init_mass_seed_data();
init_uptime();
var router17 = (0, import_express17.Router)();
async function assignFakeUserToClubs(userId) {
  const stats = { assigned: 0, skipped: 0, failed: 0 };
  try {
    const approvedClubs = await db.select({ id: motoClubs.id }).from(motoClubs).where((0, import_drizzle_orm9.eq)(motoClubs.isApproved, true));
    if (approvedClubs.length === 0) return stats;
    const pickCount = Math.min(1 + Math.floor(Math.random() * 3), approvedClubs.length);
    const shuffled = approvedClubs.sort(() => Math.random() - 0.5).slice(0, pickCount);
    for (const club of shuffled) {
      try {
        const result = await db.insert(motoClubMembers).values({
          clubId: club.id,
          userId,
          role: "member",
          status: "active"
        }).onConflictDoNothing().returning({ id: motoClubMembers.id });
        if (result.length > 0) {
          stats.assigned++;
        } else {
          stats.skipped++;
        }
      } catch (err) {
        console.error("[assignFakeUserToClubs] insert error:", err);
        stats.failed++;
      }
    }
  } catch (err) {
    console.error("[assignFakeUserToClubs] error:", err);
    stats.failed++;
  }
  return stats;
}
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
  }).catch(() => {
    return res.status(500).json({ message: "Errore autenticazione admin" });
  });
}
router17.use(requireAdmin);
router17.post("/verify-password", async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || typeof password !== "string") {
      return res.status(400).json({ message: "Password mancante" });
    }
    const user = req.currentUser;
    const fullUser = await storage.getUser(user.id);
    if (!fullUser || !fullUser.password) {
      return res.status(403).json({ message: "Utente non trovato" });
    }
    const valid = await import_bcryptjs3.default.compare(password, fullUser.password);
    if (!valid) {
      return res.status(401).json({ message: "Password non corretta" });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Errore verifica password" });
  }
});
router17.get("/users", async (_req, res) => {
  try {
    const users2 = await storage.getAllUsers();
    const safeUsers = users2.map(({ password, ...u }) => u);
    return res.json(safeUsers);
  } catch (error) {
    console.error("Admin get users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/users/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;
    if (!["active", "suspended", "blocked"].includes(status)) {
      return res.status(400).json({ message: "Stato non valido" });
    }
    const targetUser = await storage.getUser(id);
    if (!targetUser) return res.status(404).json({ message: "Utente non trovato" });
    if (isProtectedUser(targetUser.nickname)) {
      return res.status(403).json({ message: "Utente di sistema non modificabile" });
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
router17.put("/users/:id/role", async (req, res) => {
  try {
    const id = req.params.id;
    const { role } = req.body;
    if (!["user", "moderator", "admin"].includes(role)) {
      return res.status(400).json({ message: "Ruolo non valido" });
    }
    const targetUser = await storage.getUser(id);
    if (!targetUser) return res.status(404).json({ message: "Utente non trovato" });
    if (isProtectedUser(targetUser.nickname)) {
      return res.status(403).json({ message: "Utente di sistema non modificabile" });
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
router17.put("/users/:id/email", async (req, res) => {
  try {
    const id = req.params.id;
    const { email } = req.body;
    if (!email || !email.includes("@")) {
      return res.status(400).json({ message: "Email non valida" });
    }
    const targetUser = await storage.getUser(id);
    if (!targetUser) return res.status(404).json({ message: "Utente non trovato" });
    if (isProtectedUser(targetUser.nickname)) {
      return res.status(403).json({ message: "Utente di sistema non modificabile" });
    }
    const user = await storage.updateUser(id, { email });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "update_email",
      targetType: "user",
      targetId: id,
      details: `Email aggiornata a ${email}`
    });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin update user email error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/users/:id/password", async (req, res) => {
  try {
    const id = req.params.id;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: "La password deve avere almeno 6 caratteri" });
    }
    const targetUser = await storage.getUser(id);
    if (!targetUser) return res.status(404).json({ message: "Utente non trovato" });
    if (isProtectedUser(targetUser.nickname)) {
      return res.status(403).json({ message: "Utente di sistema non modificabile" });
    }
    const hashedPassword = await import_bcryptjs3.default.hash(password, 12);
    const user = await storage.updateUser(id, { password: hashedPassword });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "reset_password",
      targetType: "user",
      targetId: id,
      details: "Password resettata dall'admin"
    });
    const { password: _pw, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin update user password error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/users/:id/primal", async (req, res) => {
  try {
    const id = req.params.id;
    const { isPrimal } = req.body;
    const user = await storage.updateUser(id, { isPrimal: !!isPrimal });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: isPrimal ? "assign_primal" : "remove_primal",
      targetType: "user",
      targetId: id,
      details: `Primal ${isPrimal ? "assegnato" : "rimosso"} a ${user.nickname}`
    });
    const { password: _pw, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin toggle primal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.delete("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    if (user.role === "admin" || user.role === "moderator") {
      return res.status(403).json({ message: "Impossibile eliminare un utente di sistema" });
    }
    if (isProtectedUser(user.nickname)) {
      return res.status(403).json({ message: "Utente di sistema non modificabile" });
    }
    await storage.deleteUser(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "delete_user",
      targetType: "user",
      targetId: id,
      details: `Utente eliminato: ${user.nickname}`
    });
    return res.json({ message: "Utente eliminato con successo" });
  } catch (error) {
    console.error("Admin delete user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/workshops", async (_req, res) => {
  try {
    const workshopsList = await storage.getWorkshops();
    return res.json(workshopsList);
  } catch (error) {
    console.error("Admin get workshops error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.post("/workshops", async (req, res) => {
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
router17.put("/workshops/:id", async (req, res) => {
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
router17.put("/workshops/:id/approve", async (req, res) => {
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
router17.delete("/workshops/:id", async (req, res) => {
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
router17.get("/easter-eggs", async (_req, res) => {
  try {
    const eggs = await storage.getEasterEggs();
    return res.json(eggs);
  } catch (error) {
    console.error("Admin get easter eggs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.post("/easter-eggs", async (req, res) => {
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
router17.post("/easter-eggs/batch", async (req, res) => {
  try {
    const count3 = parseInt(req.body.count) || 10;
    const radius = parseInt(req.body.radius) || 30;
    const points = parseInt(req.body.points) || 10;
    const existing = await storage.getEasterEggs();
    const startNum = existing.length + 1;
    const created = [];
    for (let i = 0; i < count3; i++) {
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
      details: `${count3} Easter Egg creati in batch`
    });
    return res.status(201).json(created);
  } catch (error) {
    console.error("Admin batch create easter eggs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/easter-eggs/:id", async (req, res) => {
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
router17.delete("/easter-eggs/:id", async (req, res) => {
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
router17.get("/easter-eggs/:id/stats", async (req, res) => {
  try {
    const id = req.params.id;
    const egg = await storage.getEasterEgg(id);
    if (!egg) {
      return res.status(404).json({ message: "Easter egg non trovato" });
    }
    const { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const { collectedEasterEggs: collectedEasterEggs2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const { eq: eq11, count: count3 } = await import("drizzle-orm");
    const [result] = await db2.select({ count: count3() }).from(collectedEasterEggs2).where(eq11(collectedEasterEggs2.easterEggId, id));
    return res.json({ eggId: id, collectionsCount: result?.count || 0 });
  } catch (error) {
    console.error("Admin get easter egg stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/easter-eggs-stats", async (_req, res) => {
  try {
    const { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const { collectedEasterEggs: collectedEasterEggs2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const { count: count3, sql: sql8 } = await import("drizzle-orm");
    const rows = await db2.select({
      easterEggId: collectedEasterEggs2.easterEggId,
      collectionsCount: count3()
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
router17.get("/campaigns", async (_req, res) => {
  try {
    const campaigns = await storage.getAllCampaigns();
    return res.json(campaigns);
  } catch (error) {
    console.error("Admin get campaigns error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.post("/campaigns", async (req, res) => {
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
router17.put("/campaigns/:id", async (req, res) => {
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
router17.delete("/campaigns/:id", async (req, res) => {
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
router17.get("/reports", async (req, res) => {
  try {
    const status = req.query.status;
    const reportsList = await storage.getReports(status);
    return res.json(reportsList);
  } catch (error) {
    console.error("Admin get reports error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/reports/:id/resolve", async (req, res) => {
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
router17.get("/analytics", async (_req, res) => {
  try {
    const now = /* @__PURE__ */ new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1e3);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1e3);
    const { pool: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const totalUsersResult = await pool2.query("SELECT count(*)::int as count FROM users WHERE is_fake = false");
    const totalUsers = totalUsersResult.rows[0]?.count ?? 0;
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1e3);
    const [onlineUsersNow, activeUsersWeek, workshopContacts2, campaigns, pendingReports] = await Promise.all([
      storage.countActiveUsers(fifteenMinutesAgo),
      storage.countActiveUsers(sevenDaysAgo),
      storage.getWorkshopContactsByPeriod(thirtyDaysAgo, now),
      storage.getAllCampaigns(),
      storage.getReports("pending")
    ]);
    const totalAdClicks = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);
    return res.json({
      totalUsers,
      onlineUsersNow,
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
router17.get("/analytics/export-csv", async (_req, res) => {
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
    for (const [workshopId, count3] of Object.entries(contactsByWorkshop)) {
      csv += `Officina,${workshopId},,${count3},,Ultimo mese
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
router17.get("/analytics/users-list", async (_req, res) => {
  try {
    const { pool: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const result = await pool2.query(
      'SELECT id, nickname, user_type as "userType", sex, region, created_at as "createdAt" FROM users WHERE is_fake = false ORDER BY created_at DESC'
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics users-list error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/analytics/active-users", async (req, res) => {
  try {
    const period = parseInt(req.query.period) || 30;
    const since = new Date(Date.now() - period * 24 * 60 * 60 * 1e3);
    const { pool: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const result = await pool2.query(
      `SELECT id, nickname, user_type as "userType", last_login_at as "lastLoginAt" FROM users WHERE is_fake = false AND status = 'active' AND last_login_at >= $1 ORDER BY last_login_at DESC`,
      [since]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics active-users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/analytics/online-now", async (_req, res) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    const { pool: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const result = await pool2.query(
      `SELECT id, nickname, user_type as "userType", last_login_at as "lastLoginAt" FROM users WHERE is_fake = false AND status = 'active' AND last_login_at >= $1 ORDER BY last_login_at DESC`,
      [fifteenMinutesAgo]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics online-now error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/analytics/ad-clicks", async (_req, res) => {
  try {
    const { pool: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const result = await pool2.query(
      `SELECT ac.id, ac.user_id as "userId", u.nickname, u.user_type as "userType", 
              camp.name as "adTitle", ac.created_at as "clickedAt"
       FROM ad_clicks ac
       LEFT JOIN users u ON ac.user_id = u.id
       LEFT JOIN ad_campaigns camp ON ac.campaign_id = camp.id
       ORDER BY ac.created_at DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics ad-clicks error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/analytics/pending-reports", async (_req, res) => {
  try {
    const { pool: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const result = await pool2.query(
      `SELECT ft.id, ft.ticket_type as "type", ft.subject as "title", ft.message as "description",
              u.nickname as "submittedBy", ft.created_at as "createdAt"
       FROM feedback_tickets ft
       LEFT JOIN users u ON ft.user_id = u.id
       WHERE ft.status = 'open'
       ORDER BY ft.created_at DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics pending-reports error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/settings", async (_req, res) => {
  try {
    const settings = await storage.getAllAppSettings();
    return res.json(settings);
  } catch (error) {
    console.error("Admin get settings error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/settings/email-config", async (_req, res) => {
  try {
    const userSetting = await storage.getAppSetting("gmail_user");
    const gmailUser = userSetting?.value || "";
    let masked = "";
    if (gmailUser) {
      const [local, domain] = gmailUser.split("@");
      if (local && domain) {
        masked = local.substring(0, 3) + "***@" + domain;
      } else {
        masked = gmailUser.substring(0, 3) + "***";
      }
    }
    const passSetting = await storage.getAppSetting("gmail_app_password");
    const configured = !!(gmailUser && passSetting?.value);
    return res.json({ configured, maskedEmail: masked });
  } catch (error) {
    console.error("Get email config error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/settings/email-config", async (req, res) => {
  try {
    const { gmailUser, gmailAppPassword, adminPassword } = req.body;
    if (!adminPassword) {
      return res.status(400).json({ message: "Password admin richiesta" });
    }
    const admin = req.currentUser;
    if (!admin) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const validPassword = await import_bcryptjs3.default.compare(adminPassword, admin.password);
    if (!validPassword) {
      return res.status(403).json({ message: "Password admin non corretta" });
    }
    if (gmailUser) {
      await storage.upsertAppSetting("gmail_user", gmailUser);
    }
    if (gmailAppPassword) {
      await storage.upsertAppSetting("gmail_app_password", gmailAppPassword);
    }
    return res.json({ message: "Configurazione email aggiornata" });
  } catch (error) {
    console.error("Update email config error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.post("/migrate/verify-real-users", async (_req, res) => {
  try {
    const allUsers = await storage.getAllUsers();
    const realUsers = allUsers.filter((u) => !u.isFake && !u.emailVerified);
    for (const user of realUsers) {
      await storage.markUserEmailVerified(user.id);
    }
    return res.json({ message: `${realUsers.length} utenti reali marcati come verificati` });
  } catch (error) {
    console.error("Migrate verify real users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/settings/toggle-protected", async (req, res) => {
  try {
    const { key, value, adminPassword } = req.body;
    const allowedKeys = ["email_verification_enabled", "ads_enabled", "syneco_branding_visible", "donation_enabled", "donation_text", "gps_required", "marketplace_enabled", "fake_users_enabled", "ghost_mode_enabled", "phone_field_enabled", "user_available_on_login"];
    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ message: "Chiave non valida" });
    }
    if (!adminPassword) {
      return res.status(400).json({ message: "Password admin richiesta" });
    }
    const admin = await storage.getUser(req.session.userId);
    if (!admin) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const validPassword = await import_bcryptjs3.default.compare(adminPassword, admin.password);
    if (!validPassword) {
      return res.status(403).json({ message: "Password admin non valida" });
    }
    const result = await storage.upsertAppSetting(key, value);
    await storage.createModeratorLog({
      moderatorId: admin.id,
      action: "update_setting",
      targetType: "setting",
      targetId: key,
      details: `${key} = ${value}`
    });
    return res.json(result);
  } catch (error) {
    console.error("Admin toggle-protected error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/settings/motoclub_include_zav", async (req, res) => {
  try {
    const { value } = req.body;
    const newEnabled = value !== "false";
    const current = await storage.getAppSetting("motoclub_include_zav");
    const wasEnabled = current?.value !== "false";
    const setting = await storage.upsertAppSetting("motoclub_include_zav", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "motoclub_include_zav",
      details: `motoclub_include_zav = ${value}`
    });
    if (wasEnabled && !newEnabled) {
      const zavarrinaUsers = await db.select({ id: users.id }).from(users).where((0, import_drizzle_orm9.eq)(users.userType, "zavorrina"));
      const zavIds = zavarrinaUsers.map((u) => u.id);
      if (zavIds.length > 0) {
        await db.delete(motoClubInvites).where((0, import_drizzle_orm9.inArray)(motoClubInvites.userId, zavIds));
        await db.delete(motoClubMembers).where((0, import_drizzle_orm9.inArray)(motoClubMembers.userId, zavIds));
      }
    } else if (!wasEnabled && newEnabled) {
      const wishlists = await db.select({ userId: zavarrinaWishlists.userId, id: zavarrinaWishlists.id }).from(zavarrinaWishlists);
      for (const wl of wishlists) {
        const motos = await db.select().from(zavarrinaWishlistMotos).where((0, import_drizzle_orm9.eq)(zavarrinaWishlistMotos.wishlistId, wl.id));
        for (const moto of motos) {
          if (moto.brand) {
            await createClubInvitesForMoto(wl.userId, moto.brand, moto.model || "").catch(() => {
            });
          }
        }
      }
    }
    return res.json(setting);
  } catch (error) {
    console.error("Admin motoclub_include_zav error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/settings/show_search_preference", async (req, res) => {
  try {
    const { value } = req.body;
    if (value !== "true" && value !== "false") {
      return res.status(400).json({ message: "Valore non valido: usare 'true' o 'false'" });
    }
    const setting = await storage.upsertAppSetting("show_search_preference", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "show_search_preference",
      details: `show_search_preference = ${value}`
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin show_search_preference error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/settings/maps_enabled", async (req, res) => {
  try {
    const { value } = req.body;
    if (value !== "true" && value !== "false") {
      return res.status(400).json({ message: "Valore non valido: usare 'true' o 'false'" });
    }
    const setting = await storage.upsertAppSetting("maps_enabled", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "maps_enabled",
      details: `maps_enabled = ${value}`
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin maps_enabled error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/settings/maps_provider", async (req, res) => {
  try {
    const { value } = req.body;
    const allowed = ["carto_light", "carto_dark", "esri_gray"];
    if (!allowed.includes(value)) {
      return res.status(400).json({ message: "Provider non valido" });
    }
    const setting = await storage.upsertAppSetting("maps_provider", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "maps_provider",
      details: `maps_provider = ${value}`
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin maps_provider error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/settings/maps_user_choice_enabled", async (req, res) => {
  try {
    const { value } = req.body;
    if (value !== "true" && value !== "false") {
      return res.status(400).json({ message: "Valore non valido: usare 'true' o 'false'" });
    }
    const setting = await storage.upsertAppSetting("maps_user_choice_enabled", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "maps_user_choice_enabled",
      details: `maps_user_choice_enabled = ${value}`
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin maps_user_choice_enabled error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/settings/matching_countries", async (_req, res) => {
  try {
    const setting = await storage.getAppSetting("matching_countries");
    let countries = [];
    try {
      countries = setting?.value ? JSON.parse(setting.value) || [] : [];
    } catch {
      countries = [];
    }
    return res.json({ countries });
  } catch (error) {
    console.error("Admin get matching_countries error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/settings/matching_countries", async (req, res) => {
  try {
    const { value } = req.body;
    let parsed;
    try {
      parsed = value ? JSON.parse(value) : [];
    } catch {
      return res.status(400).json({ message: "Formato JSON non valido" });
    }
    if (!Array.isArray(parsed) || !parsed.every((c) => typeof c === "string" && /^[A-Z]{2}$/i.test(c))) {
      return res.status(400).json({ message: "Deve essere un array di codici paese ISO a 2 lettere" });
    }
    const countries = parsed.map((c) => c.toUpperCase());
    const setting = await storage.upsertAppSetting("matching_countries", JSON.stringify(countries));
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "matching_countries",
      details: `Paesi matching aggiornati: ${countries.join(", ") || "nessuno (tutti)"}`
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin update matching_countries error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/settings/:key", async (req, res) => {
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
var adsDir = import_path7.default.join(process.cwd(), "uploads", "ads");
var inviteCodesDir = import_path7.default.join(process.cwd(), "uploads", "invitation-codes");
if (!import_fs7.default.existsSync(inviteCodesDir)) import_fs7.default.mkdirSync(inviteCodesDir, { recursive: true });
if (!import_fs7.default.existsSync(adsDir)) {
  import_fs7.default.mkdirSync(adsDir, { recursive: true });
}
var inviteCodeImageStorage = import_multer3.default.diskStorage({
  destination: (_req, _file, cb) => cb(null, inviteCodesDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
    cb(null, uniqueSuffix + import_path7.default.extname(file.originalname));
  }
});
var inviteCodeUpload = (0, import_multer3.default)({
  storage: inviteCodeImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Solo immagini JPEG o PNG"));
    }
  }
});
var adImageStorage = import_multer3.default.diskStorage({
  destination: (_req, _file, cb) => cb(null, adsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
    cb(null, uniqueSuffix + import_path7.default.extname(file.originalname));
  }
});
var adUpload = (0, import_multer3.default)({
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
router17.get("/advertisements", async (_req, res) => {
  try {
    const campaigns = await storage.getAllCampaigns();
    return res.json(campaigns);
  } catch (error) {
    console.error("Admin get advertisements error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.post("/advertisements", adUpload.single("image"), async (req, res) => {
  try {
    const { name, sponsor, linkUrl, description, targetUserType, rotationDuration, rotationMode, sortOrder, startDate, endDate, placement } = req.body;
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
      endDate: endDate ? new Date(endDate) : null,
      placement: placement || "all"
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
router17.put("/advertisements/:id", adUpload.single("image"), async (req, res) => {
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
    if (req.body.placement !== void 0) updates.placement = req.body.placement;
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
router17.delete("/advertisements/:id", async (req, res) => {
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
var eulaUpload = (0, import_multer3.default)({
  dest: import_path7.default.join(process.cwd(), "uploads", "tmp"),
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/plain") {
      cb(null, true);
    } else {
      cb(new Error("Solo file .txt (text/plain) sono accettati"));
    }
  }
});
router17.post("/settings/eula/upload", eulaUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Nessun file caricato" });
    }
    const content = import_fs7.default.readFileSync(req.file.path, "utf-8");
    import_fs7.default.unlinkSync(req.file.path);
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
    if (req.file && import_fs7.default.existsSync(req.file.path)) {
      import_fs7.default.unlinkSync(req.file.path);
    }
    console.error("Admin upload EULA error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.post("/settings/privacy-policy/upload", eulaUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Nessun file caricato" });
    }
    const content = import_fs7.default.readFileSync(req.file.path, "utf-8");
    import_fs7.default.unlinkSync(req.file.path);
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
    if (req.file && import_fs7.default.existsSync(req.file.path)) {
      import_fs7.default.unlinkSync(req.file.path);
    }
    console.error("Admin upload Privacy Policy error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/performance-records", async (_req, res) => {
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
router17.get("/logs", async (_req, res) => {
  try {
    const logs = await storage.getModeratorLogs();
    return res.json(logs);
  } catch (error) {
    console.error("Admin get logs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/fake-users", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const type = String(req.query.type ?? "tutti");
    const result = await storage.getFakeUserStats(limit, offset, type);
    return res.json(result);
  } catch (error) {
    console.error("Admin get fake users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.post("/fake-users", async (req, res) => {
  try {
    const { nickname, userType, sex, coupleSexConfig, birthYear, region, bio, moto, wishlistDescription, wishlistMotos } = req.body;
    if (!nickname || !userType) {
      return res.status(400).json({ message: "Nickname e tipo utente obbligatori" });
    }
    const email = `fake_${nickname.toLowerCase().replace(/[^a-z0-9]/g, "")}@fakeuser.bikerlink.it`;
    const hashedPassword = await import_bcryptjs3.default.hash("fakeuser2025!", 10);
    const country = req.body.country || "IT";
    const user = await storage.createUser({
      nickname,
      email,
      password: hashedPassword,
      userType,
      sex: sex || null,
      coupleSexConfig: coupleSexConfig || null,
      birthYear: birthYear || null,
      region: region || null,
      country,
      isFake: true,
      status: "active",
      emailVerified: true,
      eulaAccepted: true,
      lastLoginAt: /* @__PURE__ */ new Date()
    });
    const COUNTRY_CENTERS = {
      IT: { lat: 41.87, lng: 12.57 },
      DE: { lat: 51.17, lng: 10.45 },
      FR: { lat: 46.23, lng: 2.21 },
      ES: { lat: 40.46, lng: -3.75 },
      PT: { lat: 39.4, lng: -8.22 },
      AT: { lat: 47.52, lng: 14.55 },
      CH: { lat: 46.82, lng: 8.23 },
      BE: { lat: 50.5, lng: 4.47 },
      NL: { lat: 52.13, lng: 5.29 },
      PL: { lat: 51.92, lng: 19.15 },
      CZ: { lat: 49.82, lng: 15.47 },
      SK: { lat: 48.67, lng: 19.7 },
      HU: { lat: 47.16, lng: 19.5 },
      RO: { lat: 45.94, lng: 24.97 },
      GR: { lat: 39.07, lng: 21.82 },
      HR: { lat: 45.1, lng: 15.2 },
      SI: { lat: 46.12, lng: 14.8 },
      RS: { lat: 44.02, lng: 21.01 },
      BA: { lat: 44.17, lng: 17.91 },
      ME: { lat: 42.71, lng: 19.37 },
      MK: { lat: 41.61, lng: 21.75 },
      AL: { lat: 41.15, lng: 20.17 },
      BG: { lat: 42.73, lng: 25.49 },
      MD: { lat: 47.41, lng: 28.37 },
      UA: { lat: 48.38, lng: 31.17 },
      BY: { lat: 53.71, lng: 27.95 },
      LT: { lat: 55.17, lng: 23.88 },
      LV: { lat: 56.88, lng: 24.6 },
      EE: { lat: 58.6, lng: 25.01 },
      FI: { lat: 64.96, lng: 25.74 },
      SE: { lat: 60.13, lng: 18.64 },
      NO: { lat: 60.47, lng: 8.47 },
      DK: { lat: 56.26, lng: 9.5 },
      IE: { lat: 53.41, lng: -8.24 },
      GB: { lat: 55.38, lng: -3.44 },
      IS: { lat: 64.96, lng: -19.02 },
      LU: { lat: 49.82, lng: 6.13 },
      MT: { lat: 35.94, lng: 14.38 },
      CY: { lat: 35.13, lng: 33.43 },
      TR: { lat: 38.96, lng: 35.24 },
      AD: { lat: 42.55, lng: 1.6 },
      MC: { lat: 43.74, lng: 7.41 },
      SM: { lat: 43.94, lng: 12.46 },
      LI: { lat: 47.17, lng: 9.56 },
      XK: { lat: 42.6, lng: 20.9 }
    };
    const REGION_COORDS = {
      IT: {
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
      },
      DE: {
        "Baden-W\xFCrttemberg": { lat: 48.66, lng: 9.35 },
        "Bayern": { lat: 48.79, lng: 11.5 },
        "Berlin": { lat: 52.52, lng: 13.4 },
        "Brandenburg": { lat: 52.41, lng: 12.53 },
        "Bremen": { lat: 53.08, lng: 8.8 },
        "Hamburg": { lat: 53.55, lng: 10 },
        "Hessen": { lat: 50.65, lng: 9.17 },
        "Mecklenburg-Vorpommern": { lat: 53.61, lng: 12.43 },
        "Niedersachsen": { lat: 52.64, lng: 9.84 },
        "Nordrhein-Westfalen": { lat: 51.43, lng: 7.66 },
        "Rheinland-Pfalz": { lat: 49.91, lng: 7.45 },
        "Saarland": { lat: 49.4, lng: 7.02 },
        "Sachsen": { lat: 51.1, lng: 13.2 },
        "Sachsen-Anhalt": { lat: 51.95, lng: 11.69 },
        "Schleswig-Holstein": { lat: 54.22, lng: 9.69 },
        "Th\xFCringen": { lat: 50.91, lng: 11.03 }
      },
      FR: {
        "Auvergne-Rh\xF4ne-Alpes": { lat: 45.44, lng: 4.39 },
        "Bourgogne-Franche-Comt\xE9": { lat: 47.28, lng: 4.99 },
        "Bretagne": { lat: 48.2, lng: -2.93 },
        "Centre-Val de Loire": { lat: 47.75, lng: 1.67 },
        "Corse": { lat: 42.04, lng: 9.02 },
        "Grand Est": { lat: 48.7, lng: 6.18 },
        "Hauts-de-France": { lat: 50.48, lng: 2.79 },
        "\xCEle-de-France": { lat: 48.85, lng: 2.35 },
        "Normandie": { lat: 49.18, lng: 0.37 },
        "Nouvelle-Aquitaine": { lat: 44.83, lng: 0.58 },
        "Occitanie": { lat: 43.61, lng: 2.21 },
        "Pays de la Loire": { lat: 47.76, lng: -0.33 },
        "Provence-Alpes-C\xF4te d'Azur": { lat: 43.93, lng: 6.07 }
      },
      ES: {
        "Andaluc\xEDa": { lat: 37.38, lng: -5.97 },
        "Arag\xF3n": { lat: 41.65, lng: -0.88 },
        "Asturias": { lat: 43.36, lng: -5.86 },
        "Baleares": { lat: 39.57, lng: 2.65 },
        "Canarias": { lat: 28.1, lng: -15.41 },
        "Cantabria": { lat: 43.18, lng: -4.05 },
        "Castilla-La Mancha": { lat: 39.54, lng: -3 },
        "Castilla y Le\xF3n": { lat: 41.65, lng: -4.73 },
        "Catalu\xF1a": { lat: 41.59, lng: 1.52 },
        "Comunidad de Madrid": { lat: 40.42, lng: -3.7 },
        "Comunidad Valenciana": { lat: 39.48, lng: -0.75 },
        "Extremadura": { lat: 39.49, lng: -6.06 },
        "Galicia": { lat: 42.58, lng: -7.89 },
        "La Rioja": { lat: 42.29, lng: -2.54 },
        "Navarra": { lat: 42.82, lng: -1.65 },
        "Pa\xEDs Vasco": { lat: 43.04, lng: -2.34 },
        "Regi\xF3n de Murcia": { lat: 37.99, lng: -1.13 }
      },
      PT: {
        "Alentejo": { lat: 38.57, lng: -8 },
        "Algarve": { lat: 37.2, lng: -8.2 },
        "Centro": { lat: 40.21, lng: -8.43 },
        "Lisboa": { lat: 38.72, lng: -9.14 },
        "Norte": { lat: 41.55, lng: -8.43 },
        "A\xE7ores": { lat: 37.74, lng: -25.67 },
        "Madeira": { lat: 32.76, lng: -16.96 }
      },
      AT: {
        "Burgenland": { lat: 47.51, lng: 16.59 },
        "K\xE4rnten": { lat: 46.73, lng: 14.3 },
        "Nieder\xF6sterreich": { lat: 48.11, lng: 15.81 },
        "Ober\xF6sterreich": { lat: 48.03, lng: 13.98 },
        "Salzburg": { lat: 47.63, lng: 13.13 },
        "Steiermark": { lat: 47.36, lng: 15.12 },
        "Tirol": { lat: 47.26, lng: 11.39 },
        "Vorarlberg": { lat: 47.26, lng: 9.92 },
        "Wien": { lat: 48.21, lng: 16.37 }
      },
      CH: {
        "Bern": { lat: 46.95, lng: 7.45 },
        "Geneva": { lat: 46.2, lng: 6.15 },
        "Graub\xFCnden": { lat: 46.66, lng: 9.58 },
        "Luzern": { lat: 47.05, lng: 8.31 },
        "Ticino": { lat: 46.33, lng: 8.8 },
        "Valais": { lat: 46.23, lng: 7.61 },
        "Vaud": { lat: 46.57, lng: 6.52 },
        "Z\xFCrich": { lat: 47.38, lng: 8.54 }
      },
      GR: {
        "Attica": { lat: 37.97, lng: 23.73 },
        "Creta": { lat: 35.24, lng: 24.81 },
        "Macedonia": { lat: 40.64, lng: 22.94 },
        "Tessaglia": { lat: 39.64, lng: 22.42 },
        "Peloponneso": { lat: 37.5, lng: 22.37 },
        "Epiro": { lat: 39.66, lng: 20.85 },
        "Ionia": { lat: 38.9, lng: 20.69 },
        "Tracia": { lat: 41.15, lng: 25.41 }
      },
      PL: {
        "Mazowieckie": { lat: 52.07, lng: 21.02 },
        "Ma\u0142opolskie": { lat: 49.72, lng: 20.25 },
        "\u015Al\u0105skie": { lat: 50.26, lng: 19.02 },
        "Dolno\u015Bl\u0105skie": { lat: 51.11, lng: 17.04 },
        "Wielkopolskie": { lat: 52.41, lng: 16.93 },
        "Pomorskie": { lat: 54.35, lng: 18.65 },
        "\u0141\xF3d\u017A": { lat: 51.76, lng: 19.46 },
        "Lubelskie": { lat: 51.25, lng: 22.57 }
      },
      RO: {
        "Bucure\u0219ti": { lat: 44.43, lng: 26.1 },
        "Cluj": { lat: 46.77, lng: 23.6 },
        "Timi\u0219": { lat: 45.75, lng: 21.22 },
        "Bra\u0219ov": { lat: 45.65, lng: 25.61 },
        "Constan\u021Ba": { lat: 44.18, lng: 28.64 },
        "Ia\u0219i": { lat: 47.16, lng: 27.59 },
        "Sibiu": { lat: 45.8, lng: 24.15 },
        "Prahova": { lat: 45.14, lng: 25.99 }
      },
      TR: {
        "\u0130stanbul": { lat: 41.01, lng: 28.97 },
        "Ankara": { lat: 39.92, lng: 32.85 },
        "\u0130zmir": { lat: 38.42, lng: 27.14 },
        "Antalya": { lat: 36.9, lng: 30.69 },
        "Bursa": { lat: 40.19, lng: 29.06 },
        "Konya": { lat: 37.87, lng: 32.49 },
        "Adana": { lat: 37, lng: 35.32 },
        "Trabzon": { lat: 41, lng: 39.73 }
      },
      GB: {
        "Inghilterra": { lat: 52.35, lng: -1.17 },
        "Scozia": { lat: 56.49, lng: -4.2 },
        "Galles": { lat: 52.13, lng: -3.78 },
        "Irlanda del Nord": { lat: 54.61, lng: -6.69 }
      },
      SE: {
        "Stockholm": { lat: 59.33, lng: 18.07 },
        "V\xE4stra G\xF6taland": { lat: 57.71, lng: 12.01 },
        "Sk\xE5ne": { lat: 55.99, lng: 13.59 },
        "Uppsala": { lat: 59.86, lng: 17.64 },
        "\xD6sterg\xF6tland": { lat: 58.41, lng: 15.62 },
        "Norrbotten": { lat: 66.83, lng: 20.4 }
      },
      NO: {
        "Oslo": { lat: 59.91, lng: 10.75 },
        "Vestland": { lat: 60.39, lng: 5.32 },
        "Rogaland": { lat: 59, lng: 6.09 },
        "Tr\xF8ndelag": { lat: 63.43, lng: 10.39 },
        "Nordland": { lat: 67.28, lng: 14.41 },
        "Troms og Finnmark": { lat: 69.66, lng: 18.96 }
      },
      FI: {
        "Uusimaa": { lat: 60.25, lng: 24.84 },
        "Pirkanmaa": { lat: 61.5, lng: 23.77 },
        "Lappi": { lat: 67.73, lng: 26.6 },
        "Pohjois-Pohjanmaa": { lat: 65.01, lng: 25.47 },
        "Varsinais-Suomi": { lat: 60.44, lng: 22.26 },
        "Etel\xE4-Karjala": { lat: 61.05, lng: 28.19 }
      },
      HU: {
        "Budapest": { lat: 47.5, lng: 19.04 },
        "Pest": { lat: 47.45, lng: 19.48 },
        "Gy\u0151r-Moson-Sopron": { lat: 47.68, lng: 17.63 },
        "Hajd\xFA-Bihar": { lat: 47.53, lng: 21.63 },
        "Borsod-Aba\xFAj-Zempl\xE9n": { lat: 48.1, lng: 20.79 },
        "Baranya": { lat: 45.99, lng: 18.23 }
      },
      CZ: {
        "Praha": { lat: 50.08, lng: 14.43 },
        "Jihomoravsk\xFD": { lat: 49.19, lng: 16.61 },
        "Moravskoslezsk\xFD": { lat: 49.82, lng: 18.26 },
        "\xDAsteck\xFD": { lat: 50.66, lng: 13.88 },
        "Plze\u0148sk\xFD": { lat: 49.74, lng: 13.38 },
        "Jiho\u010Desk\xFD": { lat: 49, lng: 14.43 }
      },
      SK: {
        "Bratislavsk\xFD": { lat: 48.15, lng: 17.11 },
        "Ko\u0161ick\xFD": { lat: 48.72, lng: 21.26 },
        "Pre\u0161ovsk\xFD": { lat: 49, lng: 21.24 },
        "Banskobystrick\xFD": { lat: 48.74, lng: 19.15 },
        "\u017Dilinsk\xFD": { lat: 49.22, lng: 18.74 },
        "Nitriansk\xFD": { lat: 48.31, lng: 18.08 }
      },
      BG: {
        "Sofia": { lat: 42.7, lng: 23.32 },
        "Plovdiv": { lat: 42.15, lng: 24.75 },
        "Varna": { lat: 43.21, lng: 27.91 },
        "Burgas": { lat: 42.51, lng: 27.47 },
        "Stara Zagora": { lat: 42.43, lng: 25.64 },
        "Ruse": { lat: 43.85, lng: 25.95 }
      },
      UA: {
        "Kiev": { lat: 50.45, lng: 30.52 },
        "Leopoli": { lat: 49.84, lng: 24.03 },
        "Kharkiv": { lat: 49.99, lng: 36.23 },
        "Odessa": { lat: 46.49, lng: 30.73 },
        "Dnipropetrovsk": { lat: 48.47, lng: 35.05 },
        "Zakarpattia": { lat: 48.62, lng: 22.3 },
        "Mykolaiv": { lat: 46.97, lng: 31.99 },
        "Zaporizhzhia": { lat: 47.84, lng: 35.14 }
      },
      RS: {
        "Beograd": { lat: 44.82, lng: 20.46 },
        "Vojvodina": { lat: 45.26, lng: 19.83 },
        "\u0160umadija": { lat: 44.02, lng: 20.81 }
      },
      HR: {
        "Grad Zagreb": { lat: 45.81, lng: 15.97 },
        "Splitsko-dalmatinska": { lat: 43.51, lng: 16.44 },
        "Primorsko-goranska": { lat: 45.34, lng: 14.41 },
        "Istarska": { lat: 45.23, lng: 13.9 },
        "Osje\u010Dko-baranjska": { lat: 45.55, lng: 18.69 },
        "Zadarska": { lat: 44.12, lng: 15.23 },
        "Dubrova\u010Dko-neretvanska": { lat: 42.65, lng: 18.09 }
      }
    };
    const regionCoordsForCountry = REGION_COORDS[country] ?? {};
    const coordsEntry = region ? regionCoordsForCountry[region] ?? COUNTRY_CENTERS[country] ?? { lat: 41.87, lng: 12.57 } : COUNTRY_CENTERS[country] ?? { lat: 41.87, lng: 12.57 };
    const lat = coordsEntry.lat + (Math.random() - 0.5) * 0.5;
    const lng = coordsEntry.lng + (Math.random() - 0.5) * 0.5;
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
    await assignFakeUserToClubs(user.id);
    const { password: _, ...safeUser } = user;
    return res.status(201).json(safeUser);
  } catch (error) {
    console.error("Admin create fake user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/users/:id/stats", async (req, res) => {
  try {
    const userId = req.params.id;
    const { pool: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const userResult = await pool2.query(
      `SELECT u.id, u.nickname, u.email, u.user_type as "userType", u.role, u.status,
              u.created_at as "createdAt", u.last_login_at as "lastLoginAt",
              u.is_fake as "isFake", u.is_primal as "isPrimal",
              up.total_km as "totalKm", up.total_rides as "totalRides",
              up.is_available as "isAvailable", up.bio,
              up.latitude, up.longitude
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const user = userResult.rows[0];
    const [proposalsResult, conversationsResult, messagesResult, adClicksResult, reportsResult, motorcyclesResult] = await Promise.all([
      pool2.query(
        `SELECT COUNT(*)::int as count FROM proposals WHERE user_id = $1`,
        [userId]
      ),
      pool2.query(
        `SELECT COUNT(*)::int as count FROM conversation_participants WHERE user_id = $1`,
        [userId]
      ),
      pool2.query(
        `SELECT COUNT(*)::int as count FROM messages WHERE sender_id = $1`,
        [userId]
      ),
      pool2.query(
        `SELECT ac.id, camp.name as "adTitle", ac.created_at as "clickedAt"
         FROM ad_clicks ac
         LEFT JOIN ad_campaigns camp ON ac.campaign_id = camp.id
         WHERE ac.user_id = $1
         ORDER BY ac.created_at DESC
         LIMIT 20`,
        [userId]
      ),
      pool2.query(
        `SELECT COUNT(*)::int as "filed", 
                (SELECT COUNT(*)::int FROM reports WHERE reported_user_id = $1) as "received"
         FROM reports WHERE reporter_id = $1`,
        [userId]
      ),
      pool2.query(
        `SELECT brand, model, year, displacement, motorcycle_type as "motorcycleType", riding_style as "ridingStyle"
         FROM user_motorcycles WHERE user_id = $1`,
        [userId]
      )
    ]);
    const loginHistory = await pool2.query(
      `SELECT ml.action, ml.created_at as "createdAt", m.nickname as "moderatorNickname"
       FROM moderator_logs ml
       LEFT JOIN users m ON ml.moderator_id = m.id
       WHERE ml.target_id = $1
       ORDER BY ml.created_at DESC
       LIMIT 20`,
      [userId]
    );
    return res.json({
      user,
      stats: {
        proposalsCreated: proposalsResult.rows[0]?.count ?? 0,
        conversationsCount: conversationsResult.rows[0]?.count ?? 0,
        messagesSent: messagesResult.rows[0]?.count ?? 0,
        reportsFiled: reportsResult.rows[0]?.filed ?? 0,
        reportsReceived: reportsResult.rows[0]?.received ?? 0
      },
      adClicks: adClicksResult.rows,
      motorcycles: motorcyclesResult.rows,
      moderatorLogs: loginHistory.rows
    });
  } catch (error) {
    console.error("Admin user stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/fake-users/toggle-all", async (req, res) => {
  try {
    const { enabled, adminPassword } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "Il campo 'enabled' deve essere un booleano" });
    }
    if (!adminPassword) {
      return res.status(400).json({ message: "Password admin richiesta" });
    }
    const admin = await storage.getUser(req.session.userId);
    if (!admin) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const validPassword = await import_bcryptjs3.default.compare(adminPassword, admin.password);
    if (!validPassword) {
      return res.status(403).json({ message: "Password admin non valida" });
    }
    const { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const { users: usersTable, userProfiles: userProfiles2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const { eq: eq11 } = await import("drizzle-orm");
    await storage.upsertAppSetting("fake_users_enabled", enabled ? "true" : "false");
    const fakeUsers = await db2.select().from(usersTable).where(eq11(usersTable.isFake, true));
    const newLoginAt = enabled ? /* @__PURE__ */ new Date() : /* @__PURE__ */ new Date("2020-01-01");
    for (const fakeUser of fakeUsers) {
      await db2.update(userProfiles2).set({ isAvailable: enabled }).where(eq11(userProfiles2.userId, fakeUser.id));
      const userUpdate = { lastLoginAt: newLoginAt };
      if (enabled && !fakeUser.country) userUpdate.country = "IT";
      await db2.update(usersTable).set(userUpdate).where(eq11(usersTable.id, fakeUser.id));
    }
    return res.json({ message: `Tutti gli utenti fake sono stati ${enabled ? "abilitati" : "disabilitati"}`, count: fakeUsers.length });
  } catch (error) {
    console.error("Admin toggle all fake users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.delete("/fake-users", async (req, res) => {
  console.log("[Admin] DELETE /fake-users ricevuto");
  try {
    const count3 = await storage.deleteAllFakeUsers();
    await storage.upsertAppSetting("skip_fake_user_seed", "true");
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "delete_all_fake_users",
      targetType: "user",
      targetId: "",
      details: `Eliminati tutti gli utenti fake (${count3})`
    });
    console.log(`[Admin] DELETE /fake-users completato: ${count3} eliminati`);
    return res.json({ message: `${count3} utenti fake eliminati`, count: count3 });
  } catch (error) {
    console.error("[Admin] DELETE /fake-users ERRORE:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.delete("/fake-users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await storage.deleteFakeUser(id);
    return res.json({ message: "Utente finto eliminato" });
  } catch (error) {
    console.error("Admin delete fake user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/fake-users/:id/toggle-available", async (req, res) => {
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
router17.put("/fake-users/:id/toggle-online", async (req, res) => {
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
router17.get("/fake-users/:id/conversations", async (req, res) => {
  try {
    const id = req.params.id;
    const convs = await storage.getFakeUserConversations(id);
    return res.json(convs);
  } catch (error) {
    console.error("Admin get fake user conversations error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.delete("/fake-users/all-conversations", async (req, res) => {
  try {
    const fakeUsers = await db.select({ id: users.id, nickname: users.nickname }).from(users).where((0, import_drizzle_orm9.and)((0, import_drizzle_orm9.eq)(users.isFake, true), (0, import_drizzle_orm9.ne)(users.nickname, "BikerLink_Official")));
    let deleted = 0;
    for (const u of fakeUsers) {
      const convs = await storage.getFakeUserConversations(u.id);
      for (const conv of convs) {
        await storage.deleteConversation(String(conv.id));
        deleted++;
      }
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "delete_all_fake_chats",
      targetType: "system",
      targetId: "all",
      details: `Eliminate globalmente ${deleted} conversazioni di ${fakeUsers.length} utenti fake`
    });
    return res.json({ deleted, users: fakeUsers.length, message: `${deleted} conversazioni eliminate` });
  } catch (error) {
    console.error("Admin delete all fake conversations error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.delete("/fake-users/:id/conversations", async (req, res) => {
  try {
    const id = req.params.id;
    const user = await storage.getUser(id);
    if (!user || !user.isFake) {
      return res.status(404).json({ message: "Utente fake non trovato" });
    }
    const convs = await storage.getFakeUserConversations(id);
    let deleted = 0;
    for (const conv of convs) {
      await storage.deleteConversation(String(conv.id));
      deleted++;
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "delete_fake_user_chats",
      targetType: "user",
      targetId: id,
      details: `Eliminate ${deleted} conversazioni dell'utente fake ${user.nickname}`
    });
    return res.json({ deleted, message: `${deleted} conversazioni eliminate` });
  } catch (error) {
    console.error("Admin delete fake user conversations error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/fake-users/conversations/:convId/messages", async (req, res) => {
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
router17.get("/motoclubs", async (_req, res) => {
  try {
    const clubs = await db.select().from(motoClubs).orderBy((0, import_drizzle_orm9.desc)(motoClubs.createdAt));
    if (clubs.length === 0) return res.json([]);
    const memberCounts = await db.select({ clubId: motoClubMembers.clubId, memberCount: (0, import_drizzle_orm9.count)(motoClubMembers.id) }).from(motoClubMembers).where((0, import_drizzle_orm9.eq)(motoClubMembers.status, "active")).groupBy(motoClubMembers.clubId);
    const countMap = new Map(memberCounts.map((r) => [r.clubId, Number(r.memberCount)]));
    const result = clubs.map((c) => ({ ...c, memberCount: countMap.get(c.id) ?? 0 }));
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});
router17.delete("/motoclubs/:id", async (req, res) => {
  try {
    const adminId = req.session.userId;
    const clubId = req.params.id;
    await db.delete(motoClubs).where((0, import_drizzle_orm9.eq)(motoClubs.id, clubId));
    await db.insert(moderatorLogs).values({
      moderatorId: adminId,
      action: "delete_motoclub",
      targetType: "motoclub",
      targetId: clubId,
      details: "Club eliminato dall'admin"
    });
    return res.json({ message: "Club eliminato" });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});
router17.get("/motoclubs/requests", async (_req, res) => {
  try {
    const requests = await db.select().from(motoClubRequests).orderBy((0, import_drizzle_orm9.desc)(motoClubRequests.createdAt));
    return res.json(requests);
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});
router17.post("/motoclubs/requests/:id/approve", async (req, res) => {
  try {
    const adminId = req.session.userId;
    const requestId = req.params.id;
    const [request] = await db.select().from(motoClubRequests).where((0, import_drizzle_orm9.eq)(motoClubRequests.id, requestId)).limit(1);
    if (!request) return res.status(404).json({ message: "Richiesta non trovata" });
    await db.update(motoClubRequests).set({ status: "approved", reviewedBy: adminId, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm9.eq)(motoClubRequests.id, requestId));
    const [newClub] = await db.insert(motoClubs).values({
      name: request.name,
      clubType: request.clubType,
      brandName: request.brandName,
      modelName: request.modelName,
      isApproved: true,
      createdBy: request.requestedBy ?? null,
      parentClubId: request.parentClubId ?? null,
      latitude: request.latitude ?? null,
      longitude: request.longitude ?? null
    }).returning();
    const [conv] = await db.insert(conversations).values({
      conversationType: "motoclub",
      title: `Club ${request.name}`
    }).returning();
    await db.update(motoClubs).set({ conversationId: conv.id }).where((0, import_drizzle_orm9.eq)(motoClubs.id, newClub.id));
    const inviteRadiusKm = request.inviteRadiusKm;
    const inviteUserIdsJson = request.inviteUserIds;
    const invitedUserIds = /* @__PURE__ */ new Set();
    if (inviteRadiusKm && request.latitude != null && request.longitude != null) {
      const lat = request.latitude;
      const lng = request.longitude;
      const nearbyUsers = await db.select({ userId: userProfiles.userId }).from(userProfiles).where(
        import_drizzle_orm9.sql`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude})))) <= ${inviteRadiusKm}`
      ).limit(200);
      nearbyUsers.forEach((r) => {
        if (r.userId !== request.requestedBy) invitedUserIds.add(r.userId);
      });
    }
    if (inviteUserIdsJson) {
      try {
        const ids = JSON.parse(inviteUserIdsJson);
        ids.forEach((id) => {
          if (id !== request.requestedBy) invitedUserIds.add(id);
        });
      } catch {
      }
    }
    for (const uid of invitedUserIds) {
      try {
        await db.insert(motoClubInvites).values({ clubId: newClub.id, userId: uid, status: "pending" }).onConflictDoNothing();
        await storage.createNotification({
          userId: uid,
          title: "Sei stato invitato in un Motoclub!",
          body: `Sei invitato a unirti al club "${request.name}"`,
          notificationType: "motoclub_invite",
          referenceType: "motoclub",
          referenceId: newClub.id
        }).catch(() => {
        });
      } catch {
      }
    }
    if (request.requestedBy) {
      try {
        await storage.createNotification({
          userId: request.requestedBy,
          title: "Motoclub approvato!",
          body: `Il tuo motoclub "${request.name}" \xE8 stato approvato e creato! Puoi trovarlo nella sezione Motoclub.`,
          notificationType: "system",
          referenceType: "motoclub",
          referenceId: newClub.id
        });
      } catch (e) {
        console.error("[approve motoclub] notification error:", e);
      }
      await db.update(feedbackTickets).set({ status: "resolved", updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm9.and)(
        (0, import_drizzle_orm9.eq)(feedbackTickets.userId, request.requestedBy),
        (0, import_drizzle_orm9.eq)(feedbackTickets.status, "open"),
        import_drizzle_orm9.sql`${feedbackTickets.message} LIKE ${"%Request ID: " + requestId + "%"}`
      ));
    }
    await db.insert(moderatorLogs).values({
      moderatorId: adminId,
      action: "approve_motoclub_request",
      targetType: "motoclub_request",
      targetId: requestId,
      details: `Approvata richiesta: ${request.name} (${invitedUserIds.size} inviti inviati)`
    });
    return res.json({ message: "Richiesta approvata", club: newClub, invitesSent: invitedUserIds.size });
  } catch (e) {
    console.error("[approve motoclub request]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});
router17.post("/motoclubs/requests/:id/reject", async (req, res) => {
  try {
    const adminId = req.session.userId;
    const requestId = req.params.id;
    const { note } = req.body;
    const [request] = await db.select().from(motoClubRequests).where((0, import_drizzle_orm9.eq)(motoClubRequests.id, requestId)).limit(1);
    await db.update(motoClubRequests).set({ status: "rejected", reviewedBy: adminId, reviewNote: note ?? null, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm9.eq)(motoClubRequests.id, requestId));
    if (request?.requestedBy) {
      try {
        const noteText = note ? ` Motivazione: ${note}` : "";
        await storage.createNotification({
          userId: request.requestedBy,
          title: "Richiesta motoclub non approvata",
          body: `La richiesta di creazione del motoclub "${request.name}" non \xE8 stata approvata.${noteText}`,
          notificationType: "system",
          referenceType: "motoclub_request",
          referenceId: requestId
        });
      } catch (e) {
        console.error("[reject motoclub] notification error:", e);
      }
    }
    await db.insert(moderatorLogs).values({
      moderatorId: adminId,
      action: "reject_motoclub_request",
      targetType: "motoclub_request",
      targetId: requestId,
      details: note ?? "Richiesta rifiutata"
    });
    return res.json({ message: "Richiesta rifiutata" });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});
router17.get("/motoclubs/:id", async (req, res) => {
  try {
    const clubId = req.params.id;
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 50);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const [club] = await db.select().from(motoClubs).where((0, import_drizzle_orm9.eq)(motoClubs.id, clubId)).limit(1);
    if (!club) return res.status(404).json({ message: "Club non trovato" });
    const [{ totalCount }] = await db.select({ totalCount: (0, import_drizzle_orm9.count)(motoClubMembers.id) }).from(motoClubMembers).where((0, import_drizzle_orm9.and)((0, import_drizzle_orm9.eq)(motoClubMembers.clubId, clubId), (0, import_drizzle_orm9.eq)(motoClubMembers.status, "active")));
    const memberships = await db.select({
      membershipId: motoClubMembers.id,
      userId: motoClubMembers.userId,
      role: motoClubMembers.role,
      status: motoClubMembers.status,
      joinedAt: motoClubMembers.joinedAt,
      nickname: users.nickname,
      userType: users.userType,
      avatarUrl: users.avatarUrl,
      country: users.country,
      isFake: users.isFake
    }).from(motoClubMembers).innerJoin(users, (0, import_drizzle_orm9.eq)(motoClubMembers.userId, users.id)).where((0, import_drizzle_orm9.and)((0, import_drizzle_orm9.eq)(motoClubMembers.clubId, clubId), (0, import_drizzle_orm9.eq)(motoClubMembers.status, "active"))).orderBy(motoClubMembers.joinedAt).limit(limit).offset(offset);
    const total = Number(totalCount);
    return res.json({ ...club, members: memberships, totalCount: total, hasMore: offset + limit < total });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});
router17.delete("/motoclubs/:id/members/:userId", async (req, res) => {
  try {
    const adminId = req.session.userId;
    const { id: clubId, userId } = req.params;
    await db.delete(motoClubMembers).where((0, import_drizzle_orm9.and)((0, import_drizzle_orm9.eq)(motoClubMembers.clubId, clubId), (0, import_drizzle_orm9.eq)(motoClubMembers.userId, userId)));
    await db.insert(moderatorLogs).values({
      moderatorId: adminId,
      action: "remove_motoclub_member",
      targetType: "motoclub",
      targetId: clubId,
      details: `Rimosso membro ${userId} dal club ${clubId}`
    });
    return res.json({ message: "Membro rimosso" });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});
router17.post("/motoclubs/:id/simulate-activity", async (req, res) => {
  try {
    const { id: clubId } = req.params;
    const { message, count: count3 = 1 } = req.body;
    const [club] = await db.select().from(motoClubs).where((0, import_drizzle_orm9.eq)(motoClubs.id, clubId)).limit(1);
    if (!club) return res.status(404).json({ message: "Club non trovato" });
    if (!club.conversationId) return res.status(400).json({ message: "Il club non ha una conversazione associata" });
    const fakeMembers = await db.select({ userId: motoClubMembers.userId }).from(motoClubMembers).innerJoin(users, (0, import_drizzle_orm9.eq)(motoClubMembers.userId, users.id)).where((0, import_drizzle_orm9.and)((0, import_drizzle_orm9.eq)(motoClubMembers.clubId, clubId), (0, import_drizzle_orm9.eq)(motoClubMembers.status, "active"), (0, import_drizzle_orm9.eq)(users.isFake, true)));
    if (fakeMembers.length === 0) {
      return res.status(400).json({ message: "Nessun utente fake nel club" });
    }
    const CLUB_HASHTAGS = [
      "#touring",
      "#raduno",
      "#weekend",
      "#gita",
      "#escursione",
      "#motociclismo",
      "#club",
      "#ride",
      "#bikers"
    ];
    const CLUB_MESSAGES = [
      "Ciao a tutti! Qualcuno disponibile questo weekend per una gita?",
      "Ragazzi, chi viene al raduno il mese prossimo?",
      "Bella giornata per girare! Voi avete in programma qualcosa?",
      "Ho appena finito il tagliando, moto pronta per partire!",
      "Qualcuno conosce un bel percorso di montagna da fare insieme?",
      "Buonasera a tutto il club! Quando organizziamo la prossima uscita?",
      "Ho visto che il meteo questo fine settimana \xE8 ottimo, andiamo?",
      "Nuovo membro qui! Felice di far parte del club \u{1F919}",
      "Qualcuno ha gi\xE0 fatto il percorso del passo sabato scorso?",
      "Per chi \xE8 interessato, sto organizzando una piccola gita domenica."
    ];
    const safeCount = Math.min(Math.max(1, count3), 10);
    const shuffledFakes = [...fakeMembers].sort(() => Math.random() - 0.5);
    for (let i = 0; i < safeCount; i++) {
      const randomFake = shuffledFakes[i % shuffledFakes.length];
      const hashtag = CLUB_HASHTAGS[Math.floor(Math.random() * CLUB_HASHTAGS.length)];
      const baseMsg = CLUB_MESSAGES[Math.floor(Math.random() * CLUB_MESSAGES.length)];
      const finalText = message?.trim() || `${hashtag} ${baseMsg}`;
      const delay = i * 1500;
      const convId = club.conversationId;
      const senderId = randomFake.userId;
      setTimeout(async () => {
        try {
          await storage.createMessage({
            conversationId: convId,
            senderId,
            messageType: "text",
            content: finalText,
            imageUrl: null,
            latitude: null,
            longitude: null,
            isFiltered: false
          });
          await storage.updateConversationTimestamp(convId);
        } catch (e) {
          console.error("simulate-activity error:", e);
        }
      }, delay);
    }
    return res.json({ message: `Simulazione avviata: ${safeCount} messaggi in invio`, count: safeCount });
  } catch (e) {
    console.error("simulate-activity error:", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});
router17.post("/mass-seed-fake-users", async (_req, res) => {
  try {
    const { getMassSeedStatus: getMassSeedStatus2, massSeedFakeUsers: massSeedFakeUsers2 } = await Promise.resolve().then(() => (init_mass_seed(), mass_seed_exports));
    const status = await getMassSeedStatus2();
    if (status.running) {
      return res.status(409).json({ message: "Generazione gi\xE0 in corso", ...status });
    }
    massSeedFakeUsers2().catch((err) => console.error("[mass-seed] background error:", err));
    return res.json({ started: true });
  } catch (error) {
    console.error("Admin mass seed error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/mass-seed-status", async (_req, res) => {
  try {
    const { getMassSeedStatus: getMassSeedStatus2 } = await Promise.resolve().then(() => (init_mass_seed(), mass_seed_exports));
    return res.json(await getMassSeedStatus2());
  } catch (error) {
    console.error("Admin mass seed status error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.post("/force-matching", async (req, res) => {
  try {
    const adminId = req.session.userId;
    console.log("[Admin] Avvio force-matching richiesto dall'admin");
    const { bikerBiker: bbUser, zavarrina: zavUser } = await runMatchingForUser(adminId);
    const bbBulk = await runBikerBikerMatching();
    const zavBulk = await runWishlistMatching();
    const bikerBiker = bbUser + bbBulk;
    const zavarrina = zavUser + zavBulk;
    console.log(`[Admin] Force-matching completato: ${bikerBiker} biker-biker (${bbUser} mirati + ${bbBulk} bulk), ${zavarrina} zavarrina`);
    return res.json({ bikerBiker, zavarrina });
  } catch (error) {
    console.error("Admin force-matching error:", error);
    return res.status(500).json({ message: "Errore durante il matching" });
  }
});
router17.delete("/reset-matches", async (_req, res) => {
  try {
    const [bb] = await db.select({ count: (0, import_drizzle_orm9.count)() }).from(bikerBikerMatches);
    await db.delete(bikerBikerMatches);
    console.log(`[Admin] Reset biker-biker matches: eliminati ${bb?.count ?? 0} match`);
    return res.json({ deleted: Number(bb?.count ?? 0) });
  } catch (error) {
    console.error("Admin reset-matches error:", error);
    return res.status(500).json({ message: "Errore durante il reset" });
  }
});
router17.get("/invitation-codes/stats", async (_req, res) => {
  try {
    const totalUsers = await db.select({ count: import_drizzle_orm9.sql`count(*)` }).from(users).then((r) => Number(r[0]?.count ?? 0));
    const usersWithCode = await storage.countUsersWithInvitationCode();
    const codes = await storage.getInvitationCodes();
    const perCode = await Promise.all(
      codes.map(async (c) => ({
        code: c.code,
        label: c.label ?? c.code,
        count: await storage.countUsersByInvitationCode(c.code),
        isActive: c.isActive,
        currentUses: c.currentUses,
        maxUses: c.maxUses
      }))
    );
    return res.json({ totalUsers, usersWithCode, perCode });
  } catch (error) {
    console.error("Admin invitation stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/invitation-codes", async (_req, res) => {
  try {
    const codes = await storage.getInvitationCodes();
    return res.json(codes);
  } catch (error) {
    console.error("Admin invitation list error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.post("/invitation-codes", async (req, res) => {
  try {
    const { code, label, giftMessage, maxUses, expiresAt } = req.body;
    if (!code || typeof code !== "string" || code.trim().length < 2) {
      return res.status(400).json({ message: "Codice non valido (minimo 2 caratteri)" });
    }
    const created = await storage.createInvitationCode({
      code: code.trim().toUpperCase(),
      label: label?.trim() || null,
      giftMessage: giftMessage?.trim() || null,
      createdBy: req.currentUser?.id ?? null,
      maxUses: Number(maxUses) || 100,
      expiresAt: expiresAt ? new Date(expiresAt) : void 0
    });
    return res.status(201).json(created);
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Codice gi\xE0 esistente" });
    }
    console.error("Admin invitation create error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.put("/invitation-codes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { label, giftMessage, maxUses, isActive, expiresAt } = req.body;
    const existing = await storage.getInvitationCodeById(id);
    if (!existing) return res.status(404).json({ message: "Codice non trovato" });
    const updated = await storage.updateInvitationCode(id, {
      ...label !== void 0 && { label: label?.trim() || null },
      ...giftMessage !== void 0 && { giftMessage: giftMessage?.trim() || null },
      ...maxUses !== void 0 && { maxUses: Number(maxUses) },
      ...isActive !== void 0 && { isActive: Boolean(isActive) },
      ...expiresAt !== void 0 && { expiresAt: expiresAt ? new Date(expiresAt) : void 0 }
    });
    return res.json(updated);
  } catch (error) {
    console.error("Admin invitation update error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.delete("/invitation-codes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await storage.getInvitationCodeById(id);
    if (!existing) return res.status(404).json({ message: "Codice non trovato" });
    await storage.deleteInvitationCode(id);
    return res.json({ ok: true });
  } catch (error) {
    console.error("Admin invitation delete error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.post("/invitation-codes/:id/image", inviteCodeUpload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await storage.getInvitationCodeById(id);
    if (!existing) return res.status(404).json({ message: "Codice non trovato" });
    if (!req.file) return res.status(400).json({ message: "Nessuna immagine caricata" });
    const imageUrl = `/uploads/invitation-codes/${req.file.filename}`;
    const updated = await storage.updateInvitationCode(id, { imageUrl });
    return res.json(updated);
  } catch (error) {
    console.error("Admin invitation image upload error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/email-status", async (_req, res) => {
  try {
    const userSetting = await storage.getAppSetting("gmail_user");
    const passSetting = await storage.getAppSetting("gmail_app_password");
    const hasDbCreds = !!(userSetting?.value && passSetting?.value);
    const hasEnvCreds = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
    const configured = hasDbCreds || hasEnvCreds;
    const maskedEmail = hasDbCreds ? userSetting.value.replace(/(.{2}).*(@.*)/, "$1***$2") : hasEnvCreds ? process.env.GMAIL_USER.replace(/(.{2}).*(@.*)/, "$1***$2") : null;
    return res.json({ configured, maskedEmail });
  } catch (error) {
    console.error("Admin email status error:", error);
    return res.status(500).json({ configured: false, maskedEmail: null });
  }
});
router17.get("/db-stats", async (_req, res) => {
  try {
    const {
      users: usersTable,
      userProfiles: userProfiles2,
      conversations: conversations2,
      messages: messages3,
      motoClubs: motoClubs2,
      motoClubMembers: motoClubMembers2,
      motoClubRequests: motoClubRequests2,
      workshops: workshops2,
      reports: reports2,
      invitationCodes: invitationCodes2,
      proposals: proposals2,
      userMotorcycles: userMotorcycles2,
      easterEggs: easterEggs2,
      collectedEasterEggs: collectedEasterEggs2,
      adCampaigns: adCampaigns2,
      moderatorLogs: moderatorLogs2,
      notifications: notifications2,
      routes: routes2,
      feedbackTickets: feedbackTickets2
    } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const { count: countFn, desc: descFn } = await import("drizzle-orm");
    const [
      [usersCount],
      usersRecent,
      [userProfilesCount],
      userProfilesRecent,
      [conversationsCount],
      conversationsRecent,
      [messagesCount],
      messagesRecent,
      [motoClubsCount],
      motoClubsRecent,
      [motoClubMembersCount],
      motoClubMembersRecent,
      [motoClubRequestsCount],
      motoClubRequestsRecent,
      [workshopsCount],
      workshopsRecent,
      [reportsCount],
      reportsRecent,
      [invitationCodesCount],
      invitationCodesRecent,
      [proposalsCount],
      proposalsRecent,
      [userMotorcyclesCount],
      userMotorcyclesRecent,
      [easterEggsCount],
      easterEggsRecent,
      [collectedEasterEggsCount],
      collectedEasterEggsRecent,
      [adCampaignsCount],
      adCampaignsRecent,
      [moderatorLogsCount],
      moderatorLogsRecent,
      [notificationsCount],
      notificationsRecent,
      [routesCount],
      routesRecent,
      [feedbackTicketsCount],
      feedbackTicketsRecent
    ] = await Promise.all([
      db.select({ total: countFn() }).from(usersTable),
      db.select({ id: usersTable.id, createdAt: usersTable.createdAt, label: usersTable.nickname, email: usersTable.email, role: usersTable.role, status: usersTable.status }).from(usersTable).orderBy(descFn(usersTable.createdAt)).limit(5),
      db.select({ total: countFn() }).from(userProfiles2),
      db.select({ id: userProfiles2.id, createdAt: userProfiles2.updatedAt, label: userProfiles2.userId }).from(userProfiles2).orderBy(descFn(userProfiles2.updatedAt)).limit(5),
      db.select({ total: countFn() }).from(conversations2),
      db.select({ id: conversations2.id, createdAt: conversations2.createdAt, label: conversations2.title, conversationType: conversations2.conversationType }).from(conversations2).orderBy(descFn(conversations2.createdAt)).limit(5),
      db.select({ total: countFn() }).from(messages3),
      db.select({ id: messages3.id, createdAt: messages3.createdAt, label: messages3.content, messageType: messages3.messageType }).from(messages3).orderBy(descFn(messages3.createdAt)).limit(5),
      db.select({ total: countFn() }).from(motoClubs2),
      db.select({ id: motoClubs2.id, createdAt: motoClubs2.createdAt, label: motoClubs2.name, clubType: motoClubs2.clubType, isApproved: motoClubs2.isApproved }).from(motoClubs2).orderBy(descFn(motoClubs2.createdAt)).limit(5),
      db.select({ total: countFn() }).from(motoClubMembers2),
      db.select({ id: motoClubMembers2.id, createdAt: motoClubMembers2.joinedAt, label: motoClubMembers2.userId, clubId: motoClubMembers2.clubId, role: motoClubMembers2.role }).from(motoClubMembers2).orderBy(descFn(motoClubMembers2.joinedAt)).limit(5),
      db.select({ total: countFn() }).from(motoClubRequests2),
      db.select({ id: motoClubRequests2.id, createdAt: motoClubRequests2.createdAt, label: motoClubRequests2.name, status: motoClubRequests2.status }).from(motoClubRequests2).orderBy(descFn(motoClubRequests2.createdAt)).limit(5),
      db.select({ total: countFn() }).from(workshops2),
      db.select({ id: workshops2.id, createdAt: workshops2.createdAt, label: workshops2.name, isApproved: workshops2.isApproved }).from(workshops2).orderBy(descFn(workshops2.createdAt)).limit(5),
      db.select({ total: countFn() }).from(reports2),
      db.select({ id: reports2.id, createdAt: reports2.createdAt, label: reports2.reason, status: reports2.status }).from(reports2).orderBy(descFn(reports2.createdAt)).limit(5),
      db.select({ total: countFn() }).from(invitationCodes2),
      db.select({ id: invitationCodes2.id, createdAt: invitationCodes2.createdAt, label: invitationCodes2.code, isActive: invitationCodes2.isActive }).from(invitationCodes2).orderBy(descFn(invitationCodes2.createdAt)).limit(5),
      db.select({ total: countFn() }).from(proposals2),
      db.select({ id: proposals2.id, createdAt: proposals2.createdAt, label: proposals2.title, status: proposals2.status }).from(proposals2).orderBy(descFn(proposals2.createdAt)).limit(5),
      db.select({ total: countFn() }).from(userMotorcycles2),
      db.select({ id: userMotorcycles2.id, createdAt: userMotorcycles2.createdAt, label: userMotorcycles2.brand, model: userMotorcycles2.model }).from(userMotorcycles2).orderBy(descFn(userMotorcycles2.createdAt)).limit(5),
      db.select({ total: countFn() }).from(easterEggs2),
      db.select({ id: easterEggs2.id, createdAt: easterEggs2.createdAt, label: easterEggs2.name, isActive: easterEggs2.isActive }).from(easterEggs2).orderBy(descFn(easterEggs2.createdAt)).limit(5),
      db.select({ total: countFn() }).from(collectedEasterEggs2),
      db.select({ id: collectedEasterEggs2.id, createdAt: collectedEasterEggs2.collectedAt, label: collectedEasterEggs2.easterEggId, userId: collectedEasterEggs2.userId }).from(collectedEasterEggs2).orderBy(descFn(collectedEasterEggs2.collectedAt)).limit(5),
      db.select({ total: countFn() }).from(adCampaigns2),
      db.select({ id: adCampaigns2.id, createdAt: adCampaigns2.createdAt, label: adCampaigns2.name, isActive: adCampaigns2.isActive }).from(adCampaigns2).orderBy(descFn(adCampaigns2.createdAt)).limit(5),
      db.select({ total: countFn() }).from(moderatorLogs2),
      db.select({ id: moderatorLogs2.id, createdAt: moderatorLogs2.createdAt, label: moderatorLogs2.action, targetType: moderatorLogs2.targetType }).from(moderatorLogs2).orderBy(descFn(moderatorLogs2.createdAt)).limit(5),
      db.select({ total: countFn() }).from(notifications2),
      db.select({ id: notifications2.id, createdAt: notifications2.createdAt, label: notifications2.title, notificationType: notifications2.notificationType }).from(notifications2).orderBy(descFn(notifications2.createdAt)).limit(5),
      db.select({ total: countFn() }).from(routes2),
      db.select({ id: routes2.id, createdAt: routes2.createdAt, label: routes2.title, status: routes2.status }).from(routes2).orderBy(descFn(routes2.createdAt)).limit(5),
      db.select({ total: countFn() }).from(feedbackTickets2),
      db.select({ id: feedbackTickets2.id, createdAt: feedbackTickets2.createdAt, label: feedbackTickets2.subject, status: feedbackTickets2.status, ticketType: feedbackTickets2.ticketType }).from(feedbackTickets2).orderBy(descFn(feedbackTickets2.createdAt)).limit(5)
    ]);
    return res.json({
      tables: [
        { name: "users", label: "Utenti", total: Number(usersCount?.total ?? 0), recent: usersRecent },
        { name: "userProfiles", label: "Profili Utente", total: Number(userProfilesCount?.total ?? 0), recent: userProfilesRecent },
        { name: "conversations", label: "Conversazioni", total: Number(conversationsCount?.total ?? 0), recent: conversationsRecent },
        { name: "messages", label: "Messaggi", total: Number(messagesCount?.total ?? 0), recent: messagesRecent },
        { name: "motoClubs", label: "Motoclub", total: Number(motoClubsCount?.total ?? 0), recent: motoClubsRecent },
        { name: "motoClubMembers", label: "Membri Motoclub", total: Number(motoClubMembersCount?.total ?? 0), recent: motoClubMembersRecent },
        { name: "motoClubRequests", label: "Richieste Motoclub", total: Number(motoClubRequestsCount?.total ?? 0), recent: motoClubRequestsRecent },
        { name: "workshops", label: "Officine", total: Number(workshopsCount?.total ?? 0), recent: workshopsRecent },
        { name: "reports", label: "Segnalazioni", total: Number(reportsCount?.total ?? 0), recent: reportsRecent },
        { name: "invitationCodes", label: "Codici Invito", total: Number(invitationCodesCount?.total ?? 0), recent: invitationCodesRecent },
        { name: "proposals", label: "Proposte", total: Number(proposalsCount?.total ?? 0), recent: proposalsRecent },
        { name: "userMotorcycles", label: "Moto Utenti", total: Number(userMotorcyclesCount?.total ?? 0), recent: userMotorcyclesRecent },
        { name: "easterEggs", label: "Easter Eggs", total: Number(easterEggsCount?.total ?? 0), recent: easterEggsRecent },
        { name: "collectedEasterEggs", label: "Easter Eggs Raccolti", total: Number(collectedEasterEggsCount?.total ?? 0), recent: collectedEasterEggsRecent },
        { name: "adCampaigns", label: "Campagne Ad", total: Number(adCampaignsCount?.total ?? 0), recent: adCampaignsRecent },
        { name: "moderatorLogs", label: "Log Moderatori", total: Number(moderatorLogsCount?.total ?? 0), recent: moderatorLogsRecent },
        { name: "notifications", label: "Notifiche", total: Number(notificationsCount?.total ?? 0), recent: notificationsRecent },
        { name: "routes", label: "Percorsi", total: Number(routesCount?.total ?? 0), recent: routesRecent },
        { name: "feedbackTickets", label: "Feedback Ticket", total: Number(feedbackTicketsCount?.total ?? 0), recent: feedbackTicketsRecent }
      ]
    });
  } catch (error) {
    console.error("Admin db-stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.post("/fake-users/wake-all", async (_req, res) => {
  try {
    const now = /* @__PURE__ */ new Date();
    const fakeUserIds = db.select({ id: users.id }).from(users).where((0, import_drizzle_orm9.eq)(users.isFake, true));
    await db.update(users).set({ lastLoginAt: now }).where((0, import_drizzle_orm9.eq)(users.isFake, true));
    await db.update(users).set({ country: "IT" }).where((0, import_drizzle_orm9.and)((0, import_drizzle_orm9.eq)(users.isFake, true), (0, import_drizzle_orm9.or)((0, import_drizzle_orm9.isNull)(users.country), (0, import_drizzle_orm9.eq)(users.country, ""))));
    await db.update(userProfiles).set({ isAvailable: true }).where((0, import_drizzle_orm9.inArray)(userProfiles.userId, fakeUserIds));
    const [{ cnt }] = await db.select({ cnt: import_drizzle_orm9.sql`cast(count(*) as int)` }).from(users).where((0, import_drizzle_orm9.eq)(users.isFake, true));
    return res.json({ ok: true, count: cnt });
  } catch (error) {
    console.error("Admin wake-all fake users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.post("/fake-users/distribute-to-clubs", async (_req, res) => {
  try {
    const [fakeUsers, approvedClubs] = await Promise.all([
      db.select({ id: users.id }).from(users).where((0, import_drizzle_orm9.eq)(users.isFake, true)),
      db.select({ id: motoClubs.id }).from(motoClubs).where((0, import_drizzle_orm9.eq)(motoClubs.isApproved, true))
    ]);
    if (approvedClubs.length === 0) {
      return res.json({ ok: true, usersProcessed: fakeUsers.length, assigned: 0, skipped: 0, failed: 0 });
    }
    const rows = [];
    for (const fu of fakeUsers) {
      const pickCount = Math.min(1 + Math.floor(Math.random() * 3), approvedClubs.length);
      const shuffled = [...approvedClubs].sort(() => Math.random() - 0.5).slice(0, pickCount);
      for (const club of shuffled) {
        rows.push({ clubId: club.id, userId: fu.id, role: "member", status: "active" });
      }
    }
    let assigned = 0;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const result = await db.insert(motoClubMembers).values(rows.slice(i, i + CHUNK)).onConflictDoNothing().returning({ id: motoClubMembers.id });
      assigned += result.length;
      await new Promise((r) => setTimeout(r, 0));
    }
    const skipped = rows.length - assigned;
    return res.json({ ok: true, usersProcessed: fakeUsers.length, assigned, skipped, failed: 0 });
  } catch (error) {
    console.error("Admin distribute-to-clubs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/backup/status", async (_req, res) => {
  try {
    const { getBackupStatus: getBackupStatus2 } = await Promise.resolve().then(() => (init_backup_service(), backup_service_exports));
    return res.json(await getBackupStatus2());
  } catch (error) {
    console.error("Admin backup status error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/backup/list", async (_req, res) => {
  try {
    const { listBackups: listBackups2 } = await Promise.resolve().then(() => (init_backup_service(), backup_service_exports));
    const result = await listBackups2();
    return res.json(result);
  } catch (error) {
    console.error("Admin backup list error:", error);
    return res.status(500).json({ message: "Errore durante il recupero dei backup" });
  }
});
router17.post("/backup/db", async (_req, res) => {
  try {
    const { backupDatabase: backupDatabase2, purgeOldBackups: purgeOldBackups2 } = await Promise.resolve().then(() => (init_backup_service(), backup_service_exports));
    const result = await backupDatabase2();
    purgeOldBackups2().catch((e) => console.error("[backup] purge error:", e.message));
    await storage.createModeratorLog({
      moderatorId: _req.currentUser?.id || "system",
      action: "backup_db",
      targetType: "system",
      targetId: result.name.slice(0, 36),
      details: `Backup DB eseguito: ${result.name} (${result.size} bytes)`
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error("Admin backup db error:", error);
    return res.status(500).json({ message: error.message || "Errore durante il backup del database" });
  }
});
router17.post("/backup/media", async (_req, res) => {
  try {
    const { backupMedia: backupMedia2, purgeOldBackups: purgeOldBackups2 } = await Promise.resolve().then(() => (init_backup_service(), backup_service_exports));
    const result = await backupMedia2();
    purgeOldBackups2().catch((e) => console.error("[backup] purge error:", e.message));
    await storage.createModeratorLog({
      moderatorId: _req.currentUser?.id || "system",
      action: "backup_media",
      targetType: "system",
      targetId: result.name.slice(0, 36),
      details: `Backup media eseguito: ${result.name} (${result.size} bytes)`
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error("Admin backup media error:", error);
    return res.status(500).json({ message: error.message || "Errore durante il backup dei media" });
  }
});
router17.post("/backup/restore", async (req, res) => {
  try {
    const { filePath, adminPassword } = req.body;
    if (!filePath || !adminPassword) {
      return res.status(400).json({ message: "filePath e adminPassword sono obbligatori" });
    }
    const user = req.currentUser;
    const fullUser = await storage.getUser(user.id);
    if (!fullUser || !fullUser.password) {
      return res.status(403).json({ message: "Utente non trovato" });
    }
    const valid = await import_bcryptjs3.default.compare(adminPassword, fullUser.password);
    if (!valid) {
      return res.status(401).json({ message: "Password non corretta" });
    }
    const { restoreDatabase: restoreDatabase2 } = await Promise.resolve().then(() => (init_backup_service(), backup_service_exports));
    await restoreDatabase2(filePath);
    const backupName = filePath.split("/").pop() ?? filePath;
    await storage.createModeratorLog({
      moderatorId: user.id,
      action: "restore_db",
      targetType: "system",
      targetId: backupName.slice(0, 36),
      details: `Database ripristinato dal backup: ${filePath}`
    });
    return res.json({ ok: true, message: "Database ripristinato con successo" });
  } catch (error) {
    console.error("Admin restore db error:", error);
    return res.status(500).json({ message: error.message || "Errore durante il ripristino del database" });
  }
});
router17.get("/backup/download", async (req, res) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ message: "Parametro path mancante" });
    }
    if (!filePath.startsWith("backup/")) {
      return res.status(400).json({ message: "Path non valido" });
    }
    const { downloadBackupBuffer: downloadBackupBuffer2 } = await Promise.resolve().then(() => (init_backup_service(), backup_service_exports));
    const buf = await downloadBackupBuffer2(filePath);
    const fileName = filePath.split("/").pop() ?? "backup";
    const contentType = fileName.endsWith(".gz") ? "application/gzip" : "application/zip";
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", buf.length);
    return res.send(buf);
  } catch (error) {
    console.error("Admin backup download error:", error);
    return res.status(500).json({ message: error.message || "Errore durante il download" });
  }
});
router17.put("/backup/schedule", async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled deve essere un booleano" });
    }
    const { setAutoBackupEnabled: setAutoBackupEnabled2 } = await Promise.resolve().then(() => (init_backup_service(), backup_service_exports));
    await setAutoBackupEnabled2(enabled);
    return res.json({ ok: true, enabled });
  } catch (error) {
    console.error("Admin backup schedule error:", error);
    return res.status(500).json({ message: error.message || "Errore durante la configurazione del backup" });
  }
});
router17.post("/reconcile-club-invites", async (req, res) => {
  try {
    const userId = req.body.userId || req.session.userId;
    const userMotos = await db.select().from(userMotorcycles).where((0, import_drizzle_orm9.eq)(userMotorcycles.userId, userId));
    if (userMotos.length === 0) {
      return res.json({ motorsChecked: 0, pendingInvites: 0, message: "Nessuna moto nel garage" });
    }
    for (const moto of userMotos) {
      await createClubInvitesForMoto(userId, moto.brand, moto.model);
    }
    const invites = await db.select().from(motoClubInvites).where((0, import_drizzle_orm9.and)((0, import_drizzle_orm9.eq)(motoClubInvites.userId, userId), (0, import_drizzle_orm9.eq)(motoClubInvites.status, "pending")));
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "reconcile_club_invites",
      targetType: "user",
      targetId: userId,
      details: `Riconciliati inviti club per ${userMotos.length} moto, ${invites.length} inviti pending`
    });
    return res.json({
      motorsChecked: userMotos.length,
      pendingInvites: invites.length,
      message: invites.length > 0 ? `${invites.length} inviti club pending per ${userMotos.length} moto` : "Tutti gli inviti club gi\xE0 presenti o accettati"
    });
  } catch (error) {
    console.error("Reconcile club invites error:", error);
    return res.status(500).json({ message: "Errore durante la riconciliazione inviti" });
  }
});
router17.post("/reconcile-fake-moto", async (req, res) => {
  try {
    const fakeUsersWithoutMoto = await db.select({ id: users.id }).from(users).where(
      (0, import_drizzle_orm9.and)(
        (0, import_drizzle_orm9.eq)(users.isFake, true),
        import_drizzle_orm9.sql`${users.userType} IN ('biker', 'coppia')`,
        (0, import_drizzle_orm9.notExists)(
          db.select({ id: userMotorcycles.id }).from(userMotorcycles).where((0, import_drizzle_orm9.eq)(userMotorcycles.userId, users.id))
        )
      )
    );
    let reconciledCount = 0;
    const BATCH_SIZE2 = 50;
    if (fakeUsersWithoutMoto.length > 0) {
      for (let i = 0; i < fakeUsersWithoutMoto.length; i += BATCH_SIZE2) {
        const batch = fakeUsersWithoutMoto.slice(i, i + BATCH_SIZE2);
        const motoRows = [];
        for (const u of batch) {
          const motos = pickRandomN(MOTORCYCLES, 2 + Math.floor(Math.random() * 2));
          for (const moto of motos) {
            motoRows.push({
              userId: u.id,
              brand: moto.brand,
              model: moto.model,
              year: getMotoYear(),
              displacement: moto.displacement,
              motorcycleType: moto.type,
              ridingStyle: moto.style
            });
          }
          reconciledCount++;
        }
        if (motoRows.length > 0) {
          await db.insert(userMotorcycles).values(motoRows).onConflictDoNothing();
        }
      }
      console.log(`[ReconcileFakeMoto] Riconciliati ${reconciledCount} utenti fake senza moto`);
    }
    const allFakeBikers = await db.select({ id: users.id }).from(users).where(
      (0, import_drizzle_orm9.and)(
        (0, import_drizzle_orm9.eq)(users.isFake, true),
        import_drizzle_orm9.sql`${users.userType} IN ('biker', 'coppia')`
      )
    );
    let clubJoins = 0;
    const brandClubsCache = /* @__PURE__ */ new Map();
    for (let i = 0; i < allFakeBikers.length; i += BATCH_SIZE2) {
      const batch = allFakeBikers.slice(i, i + BATCH_SIZE2);
      for (const u of batch) {
        const userMotos = await db.select().from(userMotorcycles).where((0, import_drizzle_orm9.eq)(userMotorcycles.userId, u.id));
        const seenClubIds = /* @__PURE__ */ new Set();
        for (const moto of userMotos) {
          const brandKey = moto.brand.toLowerCase();
          if (!brandClubsCache.has(brandKey)) {
            const clubs2 = await db.select({ id: motoClubs.id, name: motoClubs.name }).from(motoClubs).where((0, import_drizzle_orm9.and)((0, import_drizzle_orm9.eq)(motoClubs.isApproved, true), (0, import_drizzle_orm9.eq)(motoClubs.clubType, "brand"), (0, import_drizzle_orm9.ilike)(motoClubs.brandName, moto.brand)));
            brandClubsCache.set(brandKey, clubs2);
          }
          const clubs = brandClubsCache.get(brandKey) || [];
          for (const club of clubs) {
            if (seenClubIds.has(club.id)) continue;
            seenClubIds.add(club.id);
            const result = await db.insert(motoClubMembers).values({
              clubId: club.id,
              userId: u.id,
              role: "member",
              status: "active"
            }).onConflictDoNothing().returning({ id: motoClubMembers.id });
            if (result.length > 0) clubJoins++;
          }
        }
      }
    }
    console.log(`[ReconcileFakeMoto] Auto-join brand clubs: ${clubJoins} for ${allFakeBikers.length} fake bikers`);
    await storage.createModeratorLog({
      moderatorId: req.session.userId,
      action: "reconcile_fake_moto",
      targetType: "system",
      targetId: "matching",
      details: `Moto: ${reconciledCount} nuove, Club: ${clubJoins} iscrizioni brand (${allFakeBikers.length} fake)`
    });
    return res.json({
      reconciled: reconciledCount,
      clubJoins,
      fakeBikersProcessed: allFakeBikers.length,
      message: `Moto inserite per ${reconciledCount} fake biker, ${clubJoins} iscrizioni brand club (${allFakeBikers.length} fake processati)`
    });
  } catch (error) {
    console.error("Reconcile fake moto error:", error);
    return res.status(500).json({ message: "Errore durante il reconcile" });
  }
});
router17.get("/matching-stats", async (_req, res) => {
  try {
    const [totalMotoResult, zavarrinaMatchResult, bikerBikerMatchResult] = await Promise.all([
      db.select({ count: (0, import_drizzle_orm9.count)() }).from(userMotorcycles),
      db.select({ count: (0, import_drizzle_orm9.count)() }).from(bikerZavarrinaMatches),
      db.select({ count: (0, import_drizzle_orm9.count)() }).from(bikerBikerMatches)
    ]);
    const totalMotorcycles = Number(totalMotoResult[0]?.count ?? 0);
    const totalZavarrinaMatches = Number(zavarrinaMatchResult[0]?.count ?? 0);
    const totalBikerBikerMatches = Number(bikerBikerMatchResult[0]?.count ?? 0);
    const fakeBikersWithoutMoto = await db.select({ id: users.id }).from(users).where(
      (0, import_drizzle_orm9.and)(
        (0, import_drizzle_orm9.eq)(users.isFake, true),
        import_drizzle_orm9.sql`${users.userType} IN ('biker', 'coppia')`,
        (0, import_drizzle_orm9.notExists)(
          db.select({ id: userMotorcycles.id }).from(userMotorcycles).where((0, import_drizzle_orm9.eq)(userMotorcycles.userId, users.id))
        )
      )
    );
    const lastCycle = getLastMatchingCycleMeta();
    return res.json({
      totalMotorcycles,
      totalZavarrinaMatches,
      totalBikerBikerMatches,
      fakeBikersWithoutMoto: fakeBikersWithoutMoto.length,
      lastCycle
    });
  } catch (error) {
    console.error("Matching stats error:", error);
    return res.status(500).json({ message: "Errore durante il recupero delle statistiche" });
  }
});
router17.get("/restart-history", async (_req, res) => {
  try {
    const rows = await db.select().from(serverRestarts).orderBy((0, import_drizzle_orm9.desc)(serverRestarts.startedAt));
    return res.json({ total: rows.length, restarts: rows });
  } catch (error) {
    console.error("Admin restart-history error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router17.get("/system-health", async (_req, res) => {
  try {
    const now = Date.now();
    const backendUptimeSec = Math.floor((now - SERVER_START_TIME) / 1e3);
    const metroUptimeSec = uptimeState.metroOnline && uptimeState.metroStartTime > 0 ? Math.floor((now - uptimeState.metroStartTime) / 1e3) : 0;
    const LOGS_DIR2 = import_path7.default.resolve(process.cwd(), "logs");
    const UPTIME_LOG2 = import_path7.default.join(LOGS_DIR2, "uptime-resets.log");
    let events = [];
    if (import_fs7.default.existsSync(UPTIME_LOG2)) {
      const raw = import_fs7.default.readFileSync(UPTIME_LOG2, "utf-8");
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);
      const last50 = lines.slice(-50);
      events = last50.reverse().map((line) => {
        const spaceIdx = line.indexOf(" ");
        const ts = spaceIdx !== -1 ? line.substring(0, spaceIdx) : "";
        const msg = spaceIdx !== -1 ? line.substring(spaceIdx + 1) : line;
        let type = "OTHER";
        if (msg.includes("BACKEND RESTART")) type = "BACKEND_RESTART";
        else if (msg.includes("BACKEND UP") && msg.includes("cold start")) type = "COLD_START";
        else if (msg.includes("METRO UP")) type = "METRO_UP";
        else if (msg.includes("METRO DOWN")) type = "METRO_DOWN";
        return { timestamp: ts, message: msg, type };
      });
    }
    return res.json({
      backendStartedAt: SERVER_START_TIME,
      backendUptimeSec,
      metroOnline: uptimeState.metroOnline,
      metroStartedAt: uptimeState.metroStartTime,
      metroUptimeSec,
      events
    });
  } catch (error) {
    console.error("Admin system-health error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var admin_default = router17;

// server/routes/moderator.ts
var import_express18 = require("express");
init_storage();
var router18 = (0, import_express18.Router)();
function requireAuth11(req, res) {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}
async function requireModerator(req, res) {
  const userId = requireAuth11(req, res);
  if (!userId) return null;
  const user = await storage.getUser(userId);
  if (!user || user.role !== "admin" && user.role !== "moderator") {
    res.status(403).json({ message: "Accesso non autorizzato" });
    return null;
  }
  return userId;
}
router18.get("/photos", async (req, res) => {
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
router18.put("/photos/:id/approve", async (req, res) => {
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
router18.put("/photos/:id/reject", async (req, res) => {
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
router18.get("/logs", async (req, res) => {
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
var moderator_default = router18;

// server/routes/custom-routes.ts
var import_express19 = require("express");
init_storage();
var router19 = (0, import_express19.Router)();
router19.get("/api/custom-routes", async (req, res) => {
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
router19.post("/api/custom-routes", async (req, res) => {
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
router19.get("/api/custom-routes/:id", async (req, res) => {
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
router19.put("/api/custom-routes/:id", async (req, res) => {
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
router19.delete("/api/custom-routes/:id", async (req, res) => {
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
router19.post("/api/custom-routes/:id/waypoints", async (req, res) => {
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
router19.put("/api/custom-routes/:id/waypoints/:waypointId", async (req, res) => {
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
router19.delete("/api/custom-routes/:id/waypoints/:waypointId", async (req, res) => {
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
router19.get("/api/users/:userId/custom-routes", async (req, res) => {
  try {
    const sessionUserId = req.session?.userId;
    if (!sessionUserId) return res.status(401).json({ error: "Non autenticato" });
    const { userId } = req.params;
    const routesRaw = await storage.getCustomRoutes(userId);
    const publicRoutes = routesRaw.filter((r) => r.isPublic);
    const enriched = await Promise.all(
      publicRoutes.map(async (route) => {
        const waypoints = await storage.getCustomRouteWaypoints(route.id);
        return {
          ...route,
          waypointCount: waypoints.length
        };
      })
    );
    res.json({ routes: enriched });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
var custom_routes_default = router19;

// server/routes/sos.ts
var import_express20 = require("express");
init_storage();
var router20 = (0, import_express20.Router)();
function requireAuth12(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}
router20.use(requireAuth12);
router20.post("/", async (req, res) => {
  try {
    const userId = req.session.userId;
    const { reason, latitude, longitude, radiusKm } = req.body;
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return res.status(400).json({ message: "Motivo richiesto" });
    }
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({ message: "Posizione GPS richiesta" });
    }
    const radius = typeof radiusKm === "number" && radiusKm > 0 ? radiusKm : 10;
    const sosEnabled = await storage.getAppSetting("sos_enabled");
    if (sosEnabled?.value === "false") {
      return res.status(403).json({ message: "Funzione SOS disabilitata" });
    }
    const existing = await storage.getActiveSosRequestByUser(userId);
    if (existing) {
      return res.status(409).json({ message: "Hai gi\xE0 una richiesta SOS attiva" });
    }
    const sosRequest = await storage.createSosRequest({
      requesterId: userId,
      reason: reason.trim(),
      latitude,
      longitude,
      radiusKm: radius,
      status: "active"
    });
    try {
      const currentUser = await storage.getUser(userId);
      await Promise.all([
        storage.updateUserProfile(userId, { isAvailable: true }),
        ...currentUser?.ghostMode ? [storage.updateUser(userId, { ghostMode: false })] : []
      ]);
    } catch (updateErr) {
      console.error("SOS availability update failed (non-fatal):", updateErr);
    }
    return res.status(201).json(sosRequest);
  } catch (error) {
    console.error("SOS create error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router20.get("/active", async (req, res) => {
  try {
    const sosEnabled = await storage.getAppSetting("sos_enabled");
    if (sosEnabled?.value === "false") {
      return res.json([]);
    }
    const requests = await storage.getActiveSosRequests();
    const enriched = await Promise.all(
      requests.map(async (r) => {
        const requester = await storage.getUser(r.requesterId);
        return {
          ...r,
          requesterNickname: requester?.nickname || "Sconosciuto",
          requesterType: requester?.userType || "biker"
        };
      })
    );
    return res.json(enriched);
  } catch (error) {
    console.error("SOS get active error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router20.get("/my", async (req, res) => {
  try {
    const userId = req.session.userId;
    const active = await storage.getActiveSosRequestByUser(userId);
    return res.json(active || null);
  } catch (error) {
    console.error("SOS get my error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router20.put("/:id/cancel", async (req, res) => {
  try {
    const userId = req.session.userId;
    const sosRequest = await storage.getSosRequest(req.params.id);
    if (!sosRequest) {
      return res.status(404).json({ message: "Richiesta SOS non trovata" });
    }
    if (sosRequest.requesterId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    if (sosRequest.status !== "active") {
      return res.status(400).json({ message: "Richiesta gi\xE0 chiusa" });
    }
    const updated = await storage.updateSosRequest(sosRequest.id, { status: "cancelled" });
    return res.json(updated);
  } catch (error) {
    console.error("SOS cancel error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
router20.put("/:id/accept", async (req, res) => {
  try {
    const userId = req.session.userId;
    const sosRequest = await storage.getSosRequest(req.params.id);
    if (!sosRequest) {
      return res.status(404).json({ message: "Richiesta SOS non trovata" });
    }
    if (sosRequest.status !== "active") {
      return res.status(400).json({ message: "Richiesta non pi\xF9 attiva" });
    }
    if (sosRequest.requesterId === userId) {
      return res.status(400).json({ message: "Non puoi accettare la tua stessa richiesta" });
    }
    const conv = await storage.createConversation({
      conversationType: "private",
      title: `SOS: ${sosRequest.reason}`,
      proposalId: null
    });
    await storage.addConversationParticipant({
      conversationId: conv.id,
      userId: sosRequest.requesterId
    });
    await storage.addConversationParticipant({
      conversationId: conv.id,
      userId
    });
    const helper = await storage.getUser(userId);
    await storage.createMessage({
      conversationId: conv.id,
      senderId: userId,
      content: `${helper?.nickname || "Un utente"} ha accettato la tua richiesta SOS: "${sosRequest.reason}". Posizione condivisa.`,
      messageType: "text"
    });
    await storage.createMessage({
      conversationId: conv.id,
      senderId: sosRequest.requesterId,
      content: "\u{1F4CD} La mia posizione SOS",
      messageType: "location",
      latitude: sosRequest.latitude,
      longitude: sosRequest.longitude
    });
    const updated = await storage.updateSosRequest(sosRequest.id, {
      status: "accepted",
      helperId: userId,
      conversationId: conv.id
    });
    return res.json({ sosRequest: updated, conversationId: conv.id });
  } catch (error) {
    console.error("SOS accept error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});
var sos_default = router20;

// server/routes.ts
init_db();
init_schema();
var import_drizzle_orm10 = require("drizzle-orm");
async function requireAdmin2(req, res, next) {
  const session2 = req.session;
  if (!session2?.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  const user = await storage.getUser(session2.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Accesso non autorizzato" });
  }
  req.adminUser = user;
  next();
}
async function registerRoutes(app2) {
  const PgStore = (0, import_connect_pg_simple.default)(import_express_session.default);
  app2.use(
    (0, import_express_session.default)({
      store: new PgStore({
        pool,
        tableName: "session",
        createTableIfMissing: true
      }),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1e3,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        // Dev: no SameSite attribute (false) → compatible with HTTP localhost, curl, and React Native native client
        // Prod: SameSite=Lax → CSRF protection for browser, React Native ignores SameSite anyway
        sameSite: process.env.NODE_ENV === "production" ? "lax" : false
      }
    })
  );
  app2.use(async (req, _res, next) => {
    if (req.session?.userId) {
      try {
        const user = await storage.getUser(req.session.userId);
        if (user && user.lastLoginAt) {
          const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1e3);
          if (new Date(user.lastLoginAt) < fiveMinAgo) {
            await storage.updateUser(req.session.userId, { lastLoginAt: /* @__PURE__ */ new Date() });
          }
        }
      } catch {
      }
    }
    next();
  });
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
  app2.use("/api/sos", sos_default);
  app2.use("/api/motoclubs", motoclubs_default);
  app2.get("/api/updates/check", async (_req, res) => {
    return res.json({ hasUpdate: false, version: null, releaseNotes: null, manifestUrl: null });
  });
  app2.get("/privacy-policy", (_req, res) => {
    const templatePath = import_node_path.default.resolve(
      process.cwd(),
      "server",
      "templates",
      "privacy-policy.html"
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });
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
  app2.get("/api/settings/ads-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ads_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
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
  app2.get("/api/settings/fake-users-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("fake_users_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });
  app2.get("/api/settings/sos-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("sos_enabled");
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
  app2.get("/api/settings/primal-user", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("primal_user_enabled");
      const enabled = setting?.value === "true";
      res.json({ enabled });
    } catch {
      res.json({ enabled: false });
    }
  });
  app2.get("/api/settings/paypal", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("paypal_email");
      const email = setting?.value || "";
      res.json({ email });
    } catch {
      res.json({ email: "" });
    }
  });
  app2.get("/api/settings/ghost-mode-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ghost_mode_enabled");
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
    }
  });
  app2.get("/api/settings/marketplace-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("marketplace_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });
  app2.get("/api/settings/gps-required", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("gps_required");
      res.json({ required: setting?.value !== "false" });
    } catch {
      res.json({ required: true });
    }
  });
  app2.get("/api/settings/motoclub-include-zav", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("motoclub_include_zav");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });
  app2.get("/api/settings/motoclub-user-creation", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("motoclub_user_creation_enabled");
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
    }
  });
  app2.get("/api/settings/show-search-preference", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("show_search_preference");
      res.json({ enabled: setting?.value === "true" });
    } catch {
      res.json({ enabled: false });
    }
  });
  app2.get("/api/users/search", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Non autenticato" });
    try {
      const { q } = req.query;
      if (!q || q.trim().length < 2) return res.json([]);
      const results = await db.select({ id: users.id, nickname: users.nickname, userType: users.userType }).from(users).where((0, import_drizzle_orm10.ilike)(users.nickname, `%${q.trim()}%`)).limit(30);
      return res.json(results);
    } catch {
      return res.status(500).json({ message: "Errore interno" });
    }
  });
  app2.get("/api/settings/phone-field-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("phone_field_enabled");
      const enabled = setting?.value === "true";
      res.json({ enabled });
    } catch {
      res.json({ enabled: false });
    }
  });
  app2.get("/api/settings/user-available-on-login", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("user_available_on_login");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });
  app2.get("/api/settings/home-message", async (_req, res) => {
    try {
      const [enabledSetting, textSetting] = await Promise.all([
        storage.getAppSetting("home_message_enabled"),
        storage.getAppSetting("home_message_text")
      ]);
      res.json({
        enabled: enabledSetting?.value === "true",
        text: textSetting?.value || ""
      });
    } catch {
      res.json({ enabled: false, text: "" });
    }
  });
  app2.get("/api/settings/donation", async (_req, res) => {
    try {
      const [enabledSetting, textSetting, paypalSetting] = await Promise.all([
        storage.getAppSetting("donation_enabled"),
        storage.getAppSetting("donation_text"),
        storage.getAppSetting("paypal_email")
      ]);
      res.json({
        enabled: enabledSetting?.value !== "false",
        text: textSetting?.value || "",
        paypalEmail: paypalSetting?.value || ""
      });
    } catch {
      res.json({ enabled: true, text: "", paypalEmail: "" });
    }
  });
  app2.get("/api/settings/splash", async (_req, res) => {
    try {
      const [modeSetting, messageSetting, listSetting] = await Promise.all([
        storage.getAppSetting("splash_message_mode"),
        storage.getAppSetting("splash_message"),
        storage.getAppSetting("splash_messages_list")
      ]);
      const mode = modeSetting?.value || "single";
      const message = messageSetting?.value || "";
      let list = [];
      try {
        list = JSON.parse(listSetting?.value || "[]");
      } catch {
      }
      res.json({ mode, message, list });
    } catch {
      res.json({ mode: "single", message: "", list: [] });
    }
  });
  app2.get("/api/settings/maps", async (_req, res) => {
    try {
      const [enabledSetting, providerSetting, userChoiceSetting] = await Promise.all([
        storage.getAppSetting("maps_enabled"),
        storage.getAppSetting("maps_provider"),
        storage.getAppSetting("maps_user_choice_enabled")
      ]);
      res.json({
        enabled: enabledSetting?.value !== "false",
        provider: providerSetting?.value || "carto_light",
        userChoiceEnabled: userChoiceSetting?.value !== "false"
      });
    } catch {
      res.json({ enabled: true, provider: "carto_light", userChoiceEnabled: true });
    }
  });
  app2.get("/api/settings/maps-user-choice", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("maps_user_choice_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });
  app2.get("/api/settings/maps-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("maps_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });
  app2.get("/api/settings/maps-provider", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("maps_provider");
      res.json({ provider: setting?.value || "carto_light" });
    } catch {
      res.json({ provider: "carto_light" });
    }
  });
  app2.get("/api/settings/all", async (_req, res) => {
    try {
      const [syneco, emailVerification, chatbot, autoMatching, customRoutes2, paypal, sosEnabled, mapsEnabled, mapsProvider] = await Promise.all([
        storage.getAppSetting("syneco_branding_visible"),
        storage.getAppSetting("email_verification_enabled"),
        storage.getAppSetting("chatbot_enabled"),
        storage.getAppSetting("auto_matching_enabled"),
        storage.getAppSetting("custom_routes_enabled"),
        storage.getAppSetting("paypal_email"),
        storage.getAppSetting("sos_enabled"),
        storage.getAppSetting("maps_enabled"),
        storage.getAppSetting("maps_provider")
      ]);
      res.json({
        synecoBranding: syneco?.value === "true",
        emailVerification: emailVerification?.value === "true",
        chatbotEnabled: chatbot?.value !== "false",
        autoMatching: autoMatching?.value !== "false",
        customRoutes: customRoutes2?.value !== "false",
        paypalEmail: paypal?.value || "",
        sosEnabled: sosEnabled?.value !== "false",
        mapsEnabled: mapsEnabled?.value !== "false",
        mapsProvider: mapsProvider?.value || "carto_light"
      });
    } catch {
      res.json({
        synecoBranding: false,
        emailVerification: false,
        chatbotEnabled: true,
        autoMatching: true,
        customRoutes: true,
        paypalEmail: "",
        sosEnabled: true,
        mapsEnabled: true,
        mapsProvider: "carto_light"
      });
    }
  });
  const MANUAL_PATH = import_node_path.default.resolve(process.cwd(), "server/public/bikerlink-manual.pdf");
  const MANUAL_DIR = import_node_path.default.dirname(MANUAL_PATH);
  const EULA_PDF_PATH = import_node_path.default.resolve(process.cwd(), "server/public/bikerlink-eula.pdf");
  const PRIVACY_PDF_PATH = import_node_path.default.resolve(process.cwd(), "server/public/bikerlink-privacy-policy.pdf");
  app2.get("/api/manual/download", (_req, res) => {
    if (!import_node_fs.default.existsSync(MANUAL_PATH)) {
      return res.status(404).json({ message: "Manuale non disponibile" });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-Manual.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = import_node_fs.default.createReadStream(MANUAL_PATH);
    stream.on("error", (err) => {
      console.error("Manual stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Errore lettura file" });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  });
  app2.get("/api/manual/info", (_req, res) => {
    if (!import_node_fs.default.existsSync(MANUAL_PATH)) {
      return res.json({ available: false });
    }
    const stats = import_node_fs.default.statSync(MANUAL_PATH);
    res.json({
      available: true,
      fileName: "BikerLink-Manual.pdf",
      fileSize: stats.size,
      lastModified: stats.mtime.toISOString()
    });
  });
  const manualUpload = (0, import_multer4.default)({
    storage: import_multer4.default.diskStorage({
      destination: (_req, _file, cb) => {
        if (!import_node_fs.default.existsSync(MANUAL_DIR)) import_node_fs.default.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-manual.pdf")
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 }
  });
  app2.post("/api/admin/manual/upload", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Accesso non autorizzato" });
    manualUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || "Errore upload" });
      if (!req.file) return res.status(400).json({ message: "Nessun file caricato" });
      const stats = import_node_fs.default.statSync(MANUAL_PATH);
      res.json({
        message: "Manuale aggiornato con successo",
        fileName: "BikerLink-Manual.pdf",
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString()
      });
    });
  });
  const eulaUpload2 = (0, import_multer4.default)({
    storage: import_multer4.default.diskStorage({
      destination: (_req, _file, cb) => {
        if (!import_node_fs.default.existsSync(MANUAL_DIR)) import_node_fs.default.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-eula.pdf")
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 }
  });
  const privacyUpload = (0, import_multer4.default)({
    storage: import_multer4.default.diskStorage({
      destination: (_req, _file, cb) => {
        if (!import_node_fs.default.existsSync(MANUAL_DIR)) import_node_fs.default.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-privacy-policy.pdf")
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 }
  });
  app2.get("/api/eula/download", (_req, res) => {
    if (!import_node_fs.default.existsSync(EULA_PDF_PATH)) {
      return res.status(404).json({ message: "EULA non disponibile" });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-EULA.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = import_node_fs.default.createReadStream(EULA_PDF_PATH);
    stream.on("error", (err) => {
      console.error("EULA stream error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Errore lettura file" });
      else res.end();
    });
    stream.pipe(res);
  });
  app2.get("/api/eula/info", (_req, res) => {
    if (!import_node_fs.default.existsSync(EULA_PDF_PATH)) return res.json({ available: false });
    const stats = import_node_fs.default.statSync(EULA_PDF_PATH);
    res.json({ available: true, fileName: "BikerLink-EULA.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
  });
  app2.post("/api/admin/eula/upload", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Accesso non autorizzato" });
    eulaUpload2.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || "Errore upload" });
      if (!req.file) return res.status(400).json({ message: "Nessun file caricato" });
      const stats = import_node_fs.default.statSync(EULA_PDF_PATH);
      res.json({ message: "EULA aggiornato con successo", fileName: "BikerLink-EULA.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
    });
  });
  app2.get("/api/privacy-policy/download", (_req, res) => {
    if (!import_node_fs.default.existsSync(PRIVACY_PDF_PATH)) {
      return res.status(404).json({ message: "Privacy Policy non disponibile" });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-PrivacyPolicy.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = import_node_fs.default.createReadStream(PRIVACY_PDF_PATH);
    stream.on("error", (err) => {
      console.error("Privacy Policy stream error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Errore lettura file" });
      else res.end();
    });
    stream.pipe(res);
  });
  app2.get("/api/privacy-policy/info", (_req, res) => {
    if (!import_node_fs.default.existsSync(PRIVACY_PDF_PATH)) return res.json({ available: false });
    const stats = import_node_fs.default.statSync(PRIVACY_PDF_PATH);
    res.json({ available: true, fileName: "BikerLink-PrivacyPolicy.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
  });
  app2.post("/api/admin/privacy-policy/upload", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Accesso non autorizzato" });
    privacyUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || "Errore upload" });
      if (!req.file) return res.status(400).json({ message: "Nessun file caricato" });
      const stats = import_node_fs.default.statSync(PRIVACY_PDF_PATH);
      res.json({ message: "Privacy Policy aggiornata con successo", fileName: "BikerLink-PrivacyPolicy.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
    });
  });
  app2.get("/api/user/export-data", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(404).json({ message: "Utente non trovato" });
    const userId = user.id;
    const [photos, gpsRoutes, sentMessagesResult, contestResult] = await Promise.all([
      storage.getUserPhotos(userId),
      storage.getRoutes(userId),
      pool.query(
        `SELECT m.id AS message_id, m.conversation_id, m.message_type, m.content,
                m.image_url, m.latitude, m.longitude, m.created_at
         FROM messages m
         WHERE m.sender_id = $1
         ORDER BY m.created_at DESC`,
        [userId]
      ),
      pool.query(
        `SELECT id, photo_url, caption, week_number, year, votes_count, is_approved, created_at
         FROM photo_contest_entries
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      )
    ]);
    const exportData = {
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        phone: user.phone ?? null,
        userType: user.userType,
        sex: user.sex ?? null,
        birthYear: user.birthYear ?? null,
        country: user.country ?? null,
        region: user.region ?? null,
        role: user.role,
        status: user.status,
        eulaAccepted: user.eulaAccepted,
        privacyAccepted: user.privacyAccepted,
        consentAcceptedAt: user.consentAcceptedAt ?? null,
        createdAt: user.createdAt ?? null
      },
      photos: photos.map((p) => ({
        id: p.id,
        photoUrl: p.photoUrl,
        sortOrder: p.sortOrder,
        isApproved: p.isApproved,
        uploadedAt: p.createdAt
      })),
      gpsRoutes: gpsRoutes.map((r) => ({
        id: r.id,
        title: r.title ?? null,
        status: r.status,
        totalDistanceKm: r.totalDistanceKm ?? 0,
        durationSeconds: r.durationSeconds ?? 0,
        startedAt: r.startedAt,
        stoppedAt: r.stoppedAt ?? null,
        createdAt: r.createdAt
      })),
      sentMessages: sentMessagesResult.rows.map((m) => ({
        id: m.message_id,
        conversationId: m.conversation_id,
        messageType: m.message_type,
        content: m.content ?? null,
        imageUrl: m.image_url ?? null,
        latitude: m.latitude ?? null,
        longitude: m.longitude ?? null,
        sentAt: m.created_at
      })),
      contestEntries: contestResult.rows.map((e) => ({
        id: e.id,
        photoUrl: e.photo_url ?? null,
        caption: e.caption ?? null,
        weekNumber: e.week_number,
        year: e.year,
        votesReceived: e.votes_count,
        isApproved: e.is_approved,
        submittedAt: e.created_at
      }))
    };
    const json = JSON.stringify(exportData, null, 2);
    const filename = `BikerLink-UserData-${user.nickname}-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.send(json);
  });
  app2.post("/api/matching/trigger", (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const userId = req.session.userId;
    triggerMatchingForUser(userId);
    const result = triggerMatchingRun();
    res.json({ ok: true, ...result });
  });
  app2.get("/api/health", (_req, res) => {
    res.json({ status: "ok", initializing: initState.initializing });
  });
  app2.get("/api/admin/uptime", requireAdmin2, async (_req, res) => {
    const { SERVER_START_TIME: SERVER_START_TIME2, uptimeState: uptimeState2 } = await Promise.resolve().then(() => (init_uptime(), uptime_exports));
    res.json({
      backendStartedAt: SERVER_START_TIME2,
      metroStartedAt: uptimeState2.metroStartTime,
      metroLastSeenAt: uptimeState2.metroLastSeenAt,
      metroOnline: uptimeState2.metroOnline,
      frontendStartTime: uptimeState2.frontendStartTime,
      serverNow: Date.now()
    });
  });
  const httpServer = (0, import_node_http.createServer)(app2);
  Promise.resolve().then(() => (init_backup_service(), backup_service_exports)).then(({ startScheduler: startScheduler2 }) => {
    startScheduler2().catch((err) => {
      console.error("[backup-service] Failed to start scheduler:", err);
    });
  }).catch(() => {
  });
  return httpServer;
}

// server/auto-seed.ts
var import_bcryptjs4 = __toESM(require("bcryptjs"));
init_db();
init_schema();
var import_drizzle_orm11 = require("drizzle-orm");
var essentialUsers = [
  {
    nickname: "admin",
    email: "admin@bikerlink.it",
    password: "admin2025!",
    role: "admin",
    userType: "biker",
    sex: "M"
  },
  {
    nickname: "moderatore",
    email: "mod@bikerlink.it",
    password: "mod2025!",
    role: "moderator",
    userType: "biker",
    sex: "M"
  }
];
async function autoSeedEssentialUsers() {
  try {
    for (const userData of essentialUsers) {
      const existing = await db.select().from(users).where((0, import_drizzle_orm11.eq)(users.email, userData.email)).limit(1);
      if (existing.length > 0) {
        continue;
      }
      const hashedPassword = await import_bcryptjs4.default.hash(userData.password, 12);
      const [user] = await db.insert(users).values({
        nickname: userData.nickname,
        email: userData.email,
        password: hashedPassword,
        role: userData.role,
        userType: userData.userType,
        sex: userData.sex,
        eulaAccepted: true
      }).returning();
      await db.insert(userProfiles).values({ userId: user.id });
      console.log(`Auto-seeded essential user: ${user.nickname} (${user.role})`);
    }
  } catch (err) {
    console.error("Auto-seed essential users failed:", err);
  }
}
var regionCoords = {
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
function randOffset2() {
  return (Math.random() - 0.5) * 0.5;
}
var fakeBikers = [
  { nickname: "RobyThunder", sex: "M", birthYear: 1985, region: "Lombardia", brand: "Ducati", model: "Monster 821", year: 2019, displacement: 821, motoType: "Naked", ridingStyle: "Sportiva", bio: "Biker della domenica, ma sulla Monster mi sento un campione! Hmu se ti va un giro sui laghi" },
  { nickname: "TonyRomano", sex: "M", birthYear: 1978, region: "Lazio", brand: "Aprilia", model: "Tuono V4", year: 2021, displacement: 1077, motoType: "Naked", ridingStyle: "Sportiva", bio: "A Roma co er traffico ce vole coraggio... ma io c'ho la Tuono e nun me ferma nessuno!" },
  { nickname: "SalvatoreVento", sex: "M", birthYear: 1982, region: "Campania", brand: "Yamaha", model: "MT-09", year: 2020, displacement: 890, motoType: "Naked", ridingStyle: "Allegra", bio: "Aggio fatto 200mila km cu a mia MT... chi sal a moto con me nun scende cchiu!" },
  { nickname: "PeppeSud", sex: "M", birthYear: 1990, region: "Calabria", brand: "Honda", model: "Africa Twin", year: 2022, displacement: 1100, motoType: "Adventure", ridingStyle: "Turistica", bio: "Sugnu calabrisi e giro cu l'Africa Twin pe tutta a costa. Veniti cu mia!" },
  { nickname: "MarcoBiella", sex: "M", birthYear: 1975, region: "Piemonte", brand: "BMW", model: "R 1250 GS", year: 2021, displacement: 1254, motoType: "Adventure", ridingStyle: "Turistica", bio: "Piemontese doc, passo i weekend sulle strade alpine con la mia GS. Cerco compagni di viaggio" },
  { nickname: "LucaTrieste", sex: "M", birthYear: 1988, region: "Friuli Venezia Giulia", brand: "KTM", model: "790 Duke", year: 2020, displacement: 790, motoType: "Naked", ridingStyle: "Allegra", bio: "Dal Carso al mare, sempre in sella. La Duke \xE8 la mia compagna di vita ormai" },
  { nickname: "FrancoSardo", sex: "M", birthYear: 1980, region: "Sardegna", brand: "Triumph", model: "Tiger 900", year: 2021, displacement: 888, motoType: "Adventure", ridingStyle: "Turistica", bio: "In Sardegna le strade sono bellissime ma vuote... cerco qualcuno pe f\xE0 compagnia!" },
  { nickname: "AndreaVeneto", sex: "M", birthYear: 1995, region: "Veneto", brand: "Kawasaki", model: "Z900", year: 2022, displacement: 948, motoType: "Naked", ridingStyle: "Sportiva", bio: "Veneto de Padova, giro co a Z900 tuti i finesettimana. Se te vol vegner, scrivi!" },
  { nickname: "GianlucaMarche", sex: "M", birthYear: 1983, region: "Marche", brand: "Moto Guzzi", model: "V85 TT", year: 2020, displacement: 853, motoType: "Adventure", ridingStyle: "Tranquilla", bio: "Marchigiano tranquillo, mi piace girare per le colline con la mia Guzzi senza fretta" },
  { nickname: "NinoEtna", sex: "M", birthYear: 1992, region: "Sicilia", brand: "Ducati", model: "Multistrada V4", year: 2023, displacement: 1158, motoType: "Adventure", ridingStyle: "Turistica", bio: "Minchia chi bellu andari n moto! Cerco qualcuno pi fari un giro fino all'Etna e ritorno" },
  { nickname: "DavideBO", sex: "M", birthYear: 1987, region: "Emilia-Romagna", brand: "Aprilia", model: "RS 660", year: 2022, displacement: 659, motoType: "Sport", ridingStyle: "Sportiva", bio: "Emiliano DOC, la domenica \xE8 sacra: tortellini e poi via in moto verso l'Appennino" },
  { nickname: "MatteoUmbro", sex: "M", birthYear: 1970, region: "Umbria", brand: "Honda", model: "CB 650R", year: 2021, displacement: 649, motoType: "Naked", ridingStyle: "Tranquilla", bio: "Giro per l'Umbria da 30 anni, conosco ogni curva. Venite che ve porto io" },
  { nickname: "GiuseppeBari", sex: "M", birthYear: 1993, region: "Puglia", brand: "Yamaha", model: "Tracer 9", year: 2022, displacement: 890, motoType: "Touring", ridingStyle: "Turistica", bio: "Barese verace, giro la Puglia in lungo e in largo. Le strade del Gargano so na meraviglia" },
  { nickname: "AldoTrentino", sex: "M", birthYear: 1976, region: "Trentino-Alto Adige", brand: "BMW", model: "F 850 GS", year: 2020, displacement: 853, motoType: "Enduro", ridingStyle: "Allegra", bio: "Tra le Dolomiti con la mia GS, estate e inverno. Il Passo Stelvio \xE8 casa mia" },
  { nickname: "EnzoCampobasso", sex: "M", birthYear: 1998, region: "Molise", brand: "KTM", model: "390 Adventure", year: 2021, displacement: 373, motoType: "Adventure", ridingStyle: "Allegra", bio: "Il Molise esiste e ha strade bellissime! Venite a scoprirlo con me e la mia KTM" },
  { nickname: "PaoloLigure", sex: "M", birthYear: 2e3, region: "Liguria", brand: "Harley-Davidson", model: "Iron 883", year: 2019, displacement: 883, motoType: "Cruiser", ridingStyle: "Tranquilla", bio: "Sulla costiera ligure con la mia Harley, piano piano... tanto la vista \xE8 troppo bella per correre" },
  { nickname: "FilippoToscano", sex: "M", birthYear: 1986, region: "Toscana", brand: "Triumph", model: "Street Triple", year: 2021, displacement: 765, motoType: "Naked", ridingStyle: "Sportiva", bio: "Firenze-Siena andata e ritorno ogni weekend, la Crete Senesi in moto son qualcosa di unico" },
  { nickname: "IvanVDA", sex: "M", birthYear: 2003, region: "Valle d'Aosta", brand: "Kawasaki", model: "Versys 650", year: 2022, displacement: 649, motoType: "Touring", ridingStyle: "Turistica", bio: "Il pi\xF9 giovane del gruppo ma il pi\xF9 matto! Passo del Gran San Bernardo ogni domenica" },
  { nickname: "ChiaraBiker", sex: "F", birthYear: 1991, region: "Basilicata", brand: "Ducati", model: "Scrambler Icon", year: 2021, displacement: 803, motoType: "Naked", ridingStyle: "Allegra", bio: "Lucana e fiera! Giro con la mia Scrambler tra i Sassi di Matera e le montagne" },
  { nickname: "ValentinaRide", sex: "F", birthYear: 1996, region: "Abruzzo", brand: "Honda", model: "Rebel 500", year: 2022, displacement: 471, motoType: "Cruiser", ridingStyle: "Tranquilla", bio: "Abruzzese, amo il Gran Sasso e le strade di montagna. Cerco compagnia pe gir\xE0 tranquilla" }
];
var fakeZavorrine = [
  { nickname: "RosaNapoli", sex: "F", birthYear: 1990, region: "Campania", bio: "Sto cercann nu biker serio pe f\xE0 n giro sulla costiera... sono simpatica e mi piace l'avventura!", personality: "avventurosa", isAvailable: true, wishlistDesc: "Cerco un biker con moto comoda per girare la costiera amalfitana", motos: [{ brand: "Ducati", model: "Multistrada", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "AntonellaCaserta", sex: "F", birthYear: 1985, region: "Campania", bio: "Aggio sempre sognato e gir\xE0 in moto ma nun tengo a patente... chi me porta?", personality: "sognatrice", isAvailable: true, wishlistDesc: "Sogno un giro in Ducati per le strade della Campania", motos: [{ brand: "Ducati", model: "Monster", motoType: "Naked", ridingStyle: "Allegra" }] },
  { nickname: "MariaGrazia_NA", sex: "F", birthYear: 1978, region: "Campania", bio: "So napulitana e me piac a velocit\xE0! Voglio sent\xEC o viento nfaccia", personality: "civetta", isAvailable: false, wishlistDesc: "Un biker che mi faccia sentire il vento sulla costiera", motos: [{ brand: "Yamaha", model: "MT-09", motoType: "Naked", ridingStyle: "Sportiva" }, { brand: "Aprilia", model: "Tuono", motoType: "Naked", ridingStyle: "Sportiva" }] },
  { nickname: "GiulianaSicilia", sex: "F", birthYear: 1993, region: "Sicilia", bio: "Minchia, vogghiu fari un giro in moto fino a Taormina! Chi mi porta?", personality: "avventurosa", isAvailable: true, wishlistDesc: "Un giro fino a Taormina su una moto potente", motos: [{ brand: "BMW", model: "R 1250 GS", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "ConcettaPA", sex: "F", birthYear: 2001, region: "Sicilia", bio: "Palermitana doc, cerco biker pi girari a costa. No perditempo pls", personality: "pratica", isAvailable: true, wishlistDesc: "Biker serio con moto sportiva per la costa siciliana", motos: [{ brand: "Kawasaki", model: "Ninja 650", motoType: "Sport", ridingStyle: "Sportiva" }] },
  { nickname: "SarettaCT", sex: "F", birthYear: 1997, region: "Sicilia", bio: "Catanisa e timida ma sulla moto divento un'altra! Scrivetemi senza paura", personality: "timida", isAvailable: false, wishlistDesc: "Cerco qualcuno tranquillo per un primo giro in moto", motos: [{ brand: "Honda", model: "CB 500F", motoType: "Naked", ridingStyle: "Tranquilla" }] },
  { nickname: "FrancescaRC", sex: "F", birthYear: 1989, region: "Calabria", bio: "Reggina e ironica, cerco un biker che non abbia paura delle curve calabresi!", personality: "ironica", isAvailable: true, wishlistDesc: "Voglio un biker coraggioso per le strade della Calabria", motos: [{ brand: "KTM", model: "890 Duke", motoType: "Naked", ridingStyle: "Sportiva" }] },
  { nickname: "MariaCZ", sex: "F", birthYear: 1995, region: "Calabria", bio: "Sugnu i Catanzaro e mi piaciaria girare nda Sila cu na moto grossa", personality: "sognatrice", isAvailable: true, wishlistDesc: "Un giro nella Sila su una adventure", motos: [{ brand: "Triumph", model: "Tiger 900", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "AngelaCosenza", sex: "F", birthYear: 2004, region: "Calabria", bio: "Giovanissima ma gi\xE0 pazza per le moto! Cerco qualcuno pe fare esperienza", personality: "avventurosa", isAvailable: true, wishlistDesc: "Prima esperienza in moto, voglio una cruiser comoda", motos: [{ brand: "Harley-Davidson", model: "Iron 883", motoType: "Cruiser", ridingStyle: "Tranquilla" }] },
  { nickname: "LuciaBari", sex: "F", birthYear: 1988, region: "Puglia", bio: "Barese e civetta, cerco un biker che mi porti a vedere il tramonto sul Gargano", personality: "civetta", isAvailable: true, wishlistDesc: "Tramonto sul Gargano in moto, chi viene?", motos: [{ brand: "Moto Guzzi", model: "V85 TT", motoType: "Adventure", ridingStyle: "Turistica" }, { brand: "BMW", model: "F 850 GS", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "ElenaLecce", sex: "F", birthYear: 1999, region: "Puglia", bio: "Salentina verace! Mi piace il vento tra i capeli e le strade dritte verso il mare", personality: "sognatrice", isAvailable: false, wishlistDesc: "Un giro nel Salento con una naked veloce", motos: [{ brand: "Yamaha", model: "MT-07", motoType: "Naked", ridingStyle: "Allegra" }] },
  { nickname: "GraziaFoggia", sex: "F", birthYear: 1982, region: "Puglia", bio: "Cerco compagnia seria pe girare la Puglia, no scherzi. S\xF2 de Foggia", personality: "pratica", isAvailable: true, wishlistDesc: "Biker affidabile per giri domenicali in Puglia", motos: [{ brand: "Honda", model: "Africa Twin", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "MonicaSassari", sex: "F", birthYear: 1994, region: "Sardegna", bio: "In Sardegna c'\xE8 troppo bello pe stare fermi! Cerco qualcuno che mi porti a scoprire le coste", personality: "avventurosa", isAvailable: true, wishlistDesc: "Costa Smeralda in moto, sogno ricorrente", motos: [{ brand: "Ducati", model: "Scrambler", motoType: "Naked", ridingStyle: "Allegra" }] },
  { nickname: "PaolaCagliari", sex: "F", birthYear: 1986, region: "Sardegna", bio: "Cagliaritana ironica, cerco un biker che sappia guidare e anche far ridere!", personality: "ironica", isAvailable: false, wishlistDesc: "Un biker simpatico con una touring comoda", motos: [{ brand: "Yamaha", model: "Tracer 9", motoType: "Touring", ridingStyle: "Tranquilla" }] },
  { nickname: "TeresaPZ", sex: "F", birthYear: 1991, region: "Basilicata", bio: "Da Potenza cerco un biker pe gir\xE0 verso Maratea... il mare lucano \xE8 sottovalutato!", personality: "pratica", isAvailable: true, wishlistDesc: "Un giro verso Maratea su una moto adventure", motos: [{ brand: "KTM", model: "790 Adventure", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "AnnaCB", sex: "F", birthYear: 2e3, region: "Molise", bio: "Il Molise esiste e io pure! Cerco biker avventurosi che vogliono scoprirlo", personality: "ironica", isAvailable: true, wishlistDesc: "Scoprite il Molise con me! Serve una moto comoda", motos: [{ brand: "BMW", model: "F 750 GS", motoType: "Adventure", ridingStyle: "Tranquilla" }] },
  { nickname: "SimonaAQ", sex: "F", birthYear: 1987, region: "Abruzzo", bio: "Aquilana, amo la montagna e le strade con le curve. Cercasi biker paiente", personality: "timida", isAvailable: false, wishlistDesc: "Giro tranquillo sulle montagne abruzzesi", motos: [{ brand: "Honda", model: "CB 650R", motoType: "Naked", ridingStyle: "Tranquilla" }] },
  { nickname: "FedericaPE", sex: "F", birthYear: 2003, region: "Abruzzo", bio: "Pescarese e un po pazza, voglio provare la moto per la prima volta! Chi si offre?", personality: "avventurosa", isAvailable: true, wishlistDesc: "Prima volta in moto! Qualcosa di tranquillo", motos: [{ brand: "Kawasaki", model: "Vulcan S", motoType: "Cruiser", ridingStyle: "Tranquilla" }, { brand: "Honda", model: "Rebel 500", motoType: "Cruiser", ridingStyle: "Tranquilla" }] },
  { nickname: "AlessiaRM", sex: "F", birthYear: 1992, region: "Lazio", bio: "Romana de Roma, cerco un biker che me porti fori dal raccordo annulare finalmente!", personality: "ironica", isAvailable: true, wishlistDesc: "Fuggire dal GRA su una naked potente", motos: [{ brand: "Aprilia", model: "Tuono 660", motoType: "Naked", ridingStyle: "Sportiva" }] },
  { nickname: "GiorgiaLT", sex: "F", birthYear: 1984, region: "Lazio", bio: "Da Latina, cerco compagnia per giri verso il Circeo e le isole pontine. S\xF2 tranquilla", personality: "tranquilla", isAvailable: true, wishlistDesc: "Giro costiero verso il Circeo su moto comoda", motos: [{ brand: "Triumph", model: "Bonneville", motoType: "Naked", ridingStyle: "Tranquilla" }] },
  { nickname: "ElisaToscana", sex: "F", birthYear: 1996, region: "Toscana", bio: "Fiorentina doc, le Crete Senesi in moto sono il paradiso. Cercasi compagno di strada", personality: "sognatrice", isAvailable: true, wishlistDesc: "Le colline toscane su una moto vintage", motos: [{ brand: "Moto Guzzi", model: "V7", motoType: "Naked", ridingStyle: "Tranquilla" }] },
  { nickname: "SaraSiena", sex: "F", birthYear: 2007, region: "Toscana", bio: "Appena 18 e gi\xE0 sogno di girare la Toscana in moto! Per ora cerco passaggio", personality: "sognatrice", isAvailable: false, wishlistDesc: "Primo giro in moto tra le colline senesi", motos: [{ brand: "Ducati", model: "Scrambler Icon", motoType: "Naked", ridingStyle: "Allegra" }] },
  { nickname: "ChiaraPG", sex: "F", birthYear: 1990, region: "Umbria", bio: "Perugina e un po hippie, cerco un biker pe girare l'Umbria verde senza freta", personality: "tranquilla", isAvailable: true, wishlistDesc: "Giro lento per borghi umbri su moto adventure", motos: [{ brand: "BMW", model: "R 1250 GS", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "LauraAN", sex: "F", birthYear: 1983, region: "Marche", bio: "Anconetana, il Conero in moto \xE8 spettacolare. Cerco qualcuno che conosce le strade giuste", personality: "pratica", isAvailable: true, wishlistDesc: "Il Conero e le colline marchigiane in moto", motos: [{ brand: "Yamaha", model: "Tracer 7", motoType: "Touring", ridingStyle: "Turistica" }] },
  { nickname: "MartinaMI", sex: "F", birthYear: 1998, region: "Lombardia", bio: "Milanese ma non troppo, il weekend scappo dalla citt\xE0. Cercasi biker con moto comoda!", personality: "civetta", isAvailable: true, wishlistDesc: "Fuga dal traffico milanese su una touring", motos: [{ brand: "BMW", model: "R 1250 RT", motoType: "Touring", ridingStyle: "Tranquilla" }] },
  { nickname: "GiuliaBG", sex: "F", birthYear: 2002, region: "Lombardia", bio: "Bergamasca e avventurosa, le Orobie in moto devono essere pazzesche! Chi mi ci porta?", personality: "avventurosa", isAvailable: true, wishlistDesc: "Le valli bergamasche su una enduro", motos: [{ brand: "KTM", model: "690 Enduro", motoType: "Enduro", ridingStyle: "Sportiva" }] },
  { nickname: "SilviaVR", sex: "F", birthYear: 1971, region: "Veneto", bio: "Veronese e romantica, cerco biker per giri sul Lago di Garda e le colline venete", personality: "sognatrice", isAvailable: false, wishlistDesc: "Giro romantico sul Garda con moto cruiser", motos: [{ brand: "Harley-Davidson", model: "Sportster", motoType: "Cruiser", ridingStyle: "Tranquilla" }, { brand: "Triumph", model: "Bonneville", motoType: "Naked", ridingStyle: "Tranquilla" }] },
  { nickname: "AuroraTorino", sex: "F", birthYear: 1994, region: "Piemonte", bio: "Torinese e pratica, cerco un biker per esplorare il Canavese e le Langhe nel weekend", personality: "pratica", isAvailable: true, wishlistDesc: "Le Langhe in moto con un biker esperto", motos: [{ brand: "Ducati", model: "Multistrada V2", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "RobertaBO", sex: "F", birthYear: 1989, region: "Emilia-Romagna", bio: "Bolognese e ironica, dopo i tortellini della nonna cerco un biker pe smaltirli in moto!", personality: "ironica", isAvailable: true, wishlistDesc: "Post-pranzo in moto sulle colline bolognesi", motos: [{ brand: "Aprilia", model: "RS 660", motoType: "Sport", ridingStyle: "Sportiva" }] },
  { nickname: "AndreaZav", sex: "M", birthYear: 1995, region: "Liguria", bio: "Si sono un ragazzo zavorrina! Mi piace stare in moto dietro, la guida la lascio a chi \xE8 pi\xF9 bravo", personality: "ironica", isAvailable: true, wishlistDesc: "Cerco bikers per giri sulla riviera ligure", motos: [{ brand: "Honda", model: "Gold Wing", motoType: "Touring", ridingStyle: "Turistica" }] }
];
var fakeCoppie = [
  { nickname: "Marco&Elena", region: "Lombardia", bio: "Coppia milanese, viaggiamo insieme da 10 anni! La moto \xE8 la nostra seconda casa", brand: "BMW", model: "R 1250 GS Adventure", year: 2022, displacement: 1254, motoType: "Adventure", ridingStyle: "Turistica" },
  { nickname: "Fabio&Laura", region: "Campania", bio: "Coppia napoletana, amma fatto tutt'Italia in moto! Cerchiamo amici pe viaggiare insieme", brand: "Ducati", model: "Multistrada V4 S", year: 2023, displacement: 1158, motoType: "Adventure", ridingStyle: "Turistica" }
];
async function autoSeedFakeUsers() {
  try {
    const seededFlag = await db.select().from(appSettings).where((0, import_drizzle_orm11.eq)(appSettings.key, "fake_users_seeded")).limit(1);
    if (seededFlag.length > 0 && seededFlag[0].value === "true") {
      console.log("Auto-seed fake users skipped (fake_users_seeded flag set)");
      return;
    }
    const skipSetting = await db.select().from(appSettings).where((0, import_drizzle_orm11.eq)(appSettings.key, "skip_fake_user_seed")).limit(1);
    if (skipSetting.length > 0 && skipSetting[0].value === "true") {
      console.log("Auto-seed fake users skipped (admin deleted all fake users)");
      return;
    }
    const massSeedTagged = await db.select({ id: users.id }).from(users).where(import_drizzle_orm11.sql`${users.invitationCode} IN ('mass_seed_2420', 'mass_seed_eu_v1')`).limit(1);
    if (massSeedTagged.length > 0) {
      console.log("Auto-seed fake users skipped (mass-seeded population exists)");
      await db.insert(appSettings).values({ key: "fake_users_seeded", value: "true" }).onConflictDoUpdate({ target: appSettings.key, set: { value: "true" } });
      return;
    }
    const existingFakes = await db.select().from(users).where((0, import_drizzle_orm11.eq)(users.isFake, true)).limit(11);
    if (existingFakes.length > 10) {
      await db.insert(appSettings).values({ key: "fake_users_seeded", value: "true" }).onConflictDoUpdate({ target: appSettings.key, set: { value: "true" } });
      return;
    }
    console.log("Auto-seeding fake users...");
    const hashedPassword = await import_bcryptjs4.default.hash("fakeuser2025!", 12);
    let seedSuccessCount = 0;
    for (const biker of fakeBikers) {
      try {
        const email = `fake_${biker.nickname.toLowerCase()}@fakeuser.bikerlink.it`;
        const coords = regionCoords[biker.region];
        const bikerLat = coords.lat + randOffset2();
        const bikerLng = coords.lng + randOffset2();
        const [user] = await db.insert(users).values({
          nickname: biker.nickname,
          email,
          password: hashedPassword,
          userType: "biker",
          sex: biker.sex,
          role: "user",
          status: "active",
          birthYear: biker.birthYear,
          region: biker.region,
          emailVerified: true,
          eulaAccepted: true,
          isFake: true,
          lastLoginAt: /* @__PURE__ */ new Date(),
          firstLoginLat: bikerLat,
          firstLoginLng: bikerLng
        }).returning();
        await db.insert(userProfiles).values({
          userId: user.id,
          isAvailable: true,
          latitude: bikerLat,
          longitude: bikerLng,
          bio: biker.bio
        });
        await db.insert(userMotorcycles).values({
          userId: user.id,
          brand: biker.brand,
          model: biker.model,
          year: biker.year,
          displacement: biker.displacement,
          motorcycleType: biker.motoType,
          ridingStyle: biker.ridingStyle
        });
        seedSuccessCount++;
      } catch (err) {
        console.error(`Failed to seed biker "${biker.nickname}":`, err.message);
      }
    }
    for (const zav of fakeZavorrine) {
      try {
        const email = `fake_${zav.nickname.toLowerCase()}@fakeuser.bikerlink.it`;
        const coords = regionCoords[zav.region];
        const zavLat = coords.lat + randOffset2();
        const zavLng = coords.lng + randOffset2();
        const [user] = await db.insert(users).values({
          nickname: zav.nickname,
          email,
          password: hashedPassword,
          userType: "zavorrina",
          sex: zav.sex,
          role: "user",
          status: "active",
          birthYear: zav.birthYear,
          region: zav.region,
          emailVerified: true,
          eulaAccepted: true,
          isFake: true,
          lastLoginAt: /* @__PURE__ */ new Date(),
          firstLoginLat: zavLat,
          firstLoginLng: zavLng
        }).returning();
        await db.insert(userProfiles).values({
          userId: user.id,
          isAvailable: zav.isAvailable,
          latitude: zavLat,
          longitude: zavLng,
          bio: zav.bio
        });
        const [wishlist] = await db.insert(zavarrinaWishlists).values({
          userId: user.id,
          description: zav.wishlistDesc
        }).returning();
        for (const moto of zav.motos) {
          await db.insert(zavarrinaWishlistMotos).values({
            wishlistId: wishlist.id,
            brand: moto.brand,
            model: moto.model,
            motorcycleType: moto.motoType,
            ridingStyle: moto.ridingStyle
          });
        }
        seedSuccessCount++;
      } catch (err) {
        console.error(`Failed to seed zavorrina "${zav.nickname}":`, err.message);
      }
    }
    for (const coppia of fakeCoppie) {
      try {
        const email = `fake_${coppia.nickname.toLowerCase().replace("&", "_")}@fakeuser.bikerlink.it`;
        const coords = regionCoords[coppia.region];
        const coppiaLat = coords.lat + randOffset2();
        const coppiaLng = coords.lng + randOffset2();
        const [user] = await db.insert(users).values({
          nickname: coppia.nickname,
          email,
          password: hashedPassword,
          userType: "coppia",
          sex: null,
          coupleSexConfig: "MF",
          role: "user",
          status: "active",
          region: coppia.region,
          emailVerified: true,
          eulaAccepted: true,
          isFake: true,
          lastLoginAt: /* @__PURE__ */ new Date(),
          firstLoginLat: coppiaLat,
          firstLoginLng: coppiaLng
        }).returning();
        await db.insert(userProfiles).values({
          userId: user.id,
          isAvailable: true,
          latitude: coppiaLat,
          longitude: coppiaLng,
          bio: coppia.bio
        });
        await db.insert(userMotorcycles).values({
          userId: user.id,
          brand: coppia.brand,
          model: coppia.model,
          year: coppia.year,
          displacement: coppia.displacement,
          motorcycleType: coppia.motoType,
          ridingStyle: coppia.ridingStyle
        });
        seedSuccessCount++;
      } catch (err) {
        console.error(`Failed to seed coppia "${coppia.nickname}":`, err.message);
      }
    }
    const totalExpected = fakeBikers.length + fakeZavorrine.length + fakeCoppie.length;
    console.log(`Auto-seeded fake users complete: ${seedSuccessCount}/${totalExpected} riusciti`);
    if (seedSuccessCount >= Math.floor(totalExpected / 2)) {
      await db.insert(appSettings).values({ key: "fake_users_seeded", value: "true" }).onConflictDoUpdate({ target: appSettings.key, set: { value: "true" } });
      console.log("fake_users_seeded flag scritto in app_settings");
    } else {
      console.warn(`Seed parziale (${seedSuccessCount}/${totalExpected}): flag NON scritto, sar\xE0 ritentato al prossimo riavvio`);
    }
  } catch (err) {
    console.error("Auto-seed fake users failed:", err);
  }
}

// server/index.ts
init_db();
var import_drizzle_orm12 = require("drizzle-orm");
init_schema();
var fs10 = __toESM(require("fs"));
var path10 = __toESM(require("path"));
init_uptime();
var app = (0, import_express21.default)();
var log = console.log;
app.set("trust proxy", 1);
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
    import_express21.default.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(import_express21.default.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path11 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path11.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path11} ${res.statusCode} in ${duration}ms`;
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
    const appJsonPath = path10.resolve(process.cwd(), "app.json");
    const appJsonContent = fs10.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
async function fetchMetroManifest(platform) {
  const http2 = await import("http");
  const data = await new Promise((resolve3, reject) => {
    const options = {
      hostname: "localhost",
      port: 8081,
      path: "/",
      method: "GET",
      headers: {
        "expo-platform": platform,
        "Accept": "application/expo+json,application/json",
        "Expo-Protocol-Version": "1",
        "Expo-API-Version": "1"
      },
      timeout: 1500
    };
    const metroReq = http2.default.request(options, (metroRes) => {
      let body = "";
      metroRes.on("data", (chunk) => {
        body += chunk;
      });
      metroRes.on("end", () => resolve3(body));
    });
    metroReq.on("error", reject);
    metroReq.on("timeout", () => {
      metroReq.destroy();
      reject(new Error("timeout"));
    });
    metroReq.end();
  });
  return JSON.parse(data);
}
function staticBundleExists(platform) {
  const manifestPath = path10.resolve(process.cwd(), "static-build", platform, "manifest.json");
  if (!fs10.existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(fs10.readFileSync(manifestPath, "utf-8"));
    const launchAsset = manifest.launchAsset;
    const bundleUrl = launchAsset?.url;
    if (!bundleUrl) return false;
    const urlPath = new URL(bundleUrl).pathname;
    const localPath = path10.resolve(process.cwd(), "static-build", urlPath.replace(/^\//, ""));
    return fs10.existsSync(localPath);
  } catch {
    return false;
  }
}
function readStaticManifest(platform) {
  const manifestPath = path10.resolve(process.cwd(), "static-build", platform, "manifest.json");
  return JSON.parse(fs10.readFileSync(manifestPath, "utf-8"));
}
async function serveExpoManifest(platform, req, res) {
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const forceLive = req.query["live"] === "true";
  if (!forceLive && staticBundleExists(platform)) {
    try {
      const manifest = readStaticManifest(platform);
      log(`[manifest] Serving local static bundle for ${platform}`);
      return res.send(JSON.stringify(manifest));
    } catch (err) {
      console.error("[manifest] static read error:", err);
    }
  }
  try {
    const manifest = await fetchMetroManifest(platform);
    log(`[manifest] Serving live Metro manifest for ${platform}`);
    return res.send(JSON.stringify(manifest));
  } catch {
  }
  return res.status(503).json({ error: `Bundle non disponibile per ${platform}. Riprova tra qualche secondo.` });
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
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path10.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs10.readFileSync(templatePath, "utf-8");
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
      return void serveExpoManifest(platform, req, res).catch((err) => {
        console.error("[manifest] error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Internal error" });
      });
    }
    if (req.path === "/") {
      const staticBuildIndex = path10.resolve(process.cwd(), "static-build", "index.html");
      const isProduction = process.env.NODE_ENV === "production" || !!process.env.REPLIT_INTERNAL_APP_DOMAIN;
      if (!isProduction && !fs10.existsSync(staticBuildIndex)) return next();
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", import_express21.default.static(path10.resolve(process.cwd(), "assets")));
  app2.use("/uploads", import_express21.default.static(path10.resolve(process.cwd(), "uploads")));
  app2.use(import_express21.default.static(path10.resolve(process.cwd(), "static-build")));
  const webBuildDir = path10.resolve(process.cwd(), "static-build", "web");
  const noCacheHtml = (res, filePath) => {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  };
  app2.use("/web", import_express21.default.static(webBuildDir, { setHeaders: noCacheHtml }));
  app2.use(import_express21.default.static(webBuildDir, { index: false, setHeaders: noCacheHtml }));
  app2.use("/web", (_req, res) => {
    const indexPath = path10.join(webBuildDir, "index.html");
    if (fs10.existsSync(indexPath)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Web build not available");
    }
  });
  const spaFallbackIndex = path10.resolve(process.cwd(), "static-build", "index.html");
  const isProductionMode = process.env.NODE_ENV === "production" || !!process.env.REPLIT_INTERNAL_APP_DOMAIN;
  const devProxyActive = !isProductionMode && !fs10.existsSync(spaFallbackIndex);
  if (isProductionMode) {
    log("Production mode \u2014 Metro proxy disabilitato");
  } else if (devProxyActive) {
    log("Dev proxy \u2192 Metro :8081 attivo (static-build non trovato)");
  }
  const metroProxy = devProxyActive ? (0, import_http_proxy_middleware.createProxyMiddleware)({
    target: "http://127.0.0.1:8081",
    changeOrigin: true,
    on: {
      error: (_err, _req, res) => {
        res.status(502).send(
          "Metro non disponibile. Avvia il workflow 'Start Frontend'."
        );
      }
    }
  }) : null;
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    if (req.path.startsWith("/uploads")) return next();
    if (fs10.existsSync(spaFallbackIndex)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      return res.sendFile(spaFallbackIndex);
    }
    if (metroProxy) return metroProxy(req, res, next);
    next();
  });
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
async function initMissingClubConversations() {
  try {
    const clubs = await db.select({ id: motoClubs.id, name: motoClubs.name, conversationId: motoClubs.conversationId }).from(motoClubs).where((0, import_drizzle_orm12.eq)(motoClubs.isApproved, true));
    let synced = 0;
    for (const club of clubs) {
      try {
        let convId = club.conversationId;
        if (convId) {
          const existing = await db.select({ id: conversations.id }).from(conversations).where((0, import_drizzle_orm12.eq)(conversations.id, convId)).limit(1);
          if (existing.length === 0) {
            convId = null;
            await db.update(motoClubs).set({ conversationId: null, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm12.eq)(motoClubs.id, club.id));
          }
        }
        if (!convId) {
          const [conv] = await db.insert(conversations).values({
            conversationType: "motoclub",
            title: `Club ${club.name}`
          }).returning();
          convId = conv.id;
          await db.update(motoClubs).set({ conversationId: convId, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm12.eq)(motoClubs.id, club.id));
        }
        const members = await db.select({ userId: motoClubMembers.userId }).from(motoClubMembers).where((0, import_drizzle_orm12.and)((0, import_drizzle_orm12.eq)(motoClubMembers.clubId, club.id), (0, import_drizzle_orm12.eq)(motoClubMembers.status, "active")));
        if (members.length > 0) {
          const rows = members.map((m) => ({ conversationId: convId, userId: m.userId }));
          await db.insert(conversationParticipants).values(rows).onConflictDoNothing();
        }
        synced++;
      } catch (clubErr) {
        console.warn(`[INIT] initMissingClubConversations error for club ${club.id}:`, clubErr);
      }
    }
    console.log(`[INIT] Club conversations synced for ${synced}/${clubs.length} approved clubs`);
  } catch (e) {
    console.warn("[INIT] initMissingClubConversations error:", e);
  }
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
  app.set("trust proxy", 1);
  app.get("/healthz", (_req, res) => {
    res.status(200).send("ok");
  });
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  const webBuildIndex = path10.join(path10.resolve(process.cwd(), "static-build", "web"), "index.html");
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api/")) return next();
    if (req.path === "/" || req.path === "/manifest" || req.path === "/healthz") return next();
    if (req.path.match(/\.\w+$/)) return next();
    if (fs10.existsSync(webBuildIndex)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      return res.sendFile(webBuildIndex);
    }
    next();
  });
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  const activeConnections = /* @__PURE__ */ new Set();
  let _shuttingDown = false;
  const gracefulShutdown = (signal) => {
    if (_shuttingDown) return;
    _shuttingDown = true;
    console.log(`[Shutdown] ${signal} ricevuto \u2014 chiusura pulita in corso...`);
    stopMatchingEngine();
    for (const socket of activeConnections) {
      socket.destroy();
    }
    activeConnections.clear();
    server.close(() => {
      console.log("[Shutdown] Server HTTP chiuso.");
      pool.end().then(() => {
        console.log("[Shutdown] Pool DB chiuso.");
        process.exit(0);
      }).catch(() => process.exit(0));
    });
    setTimeout(() => {
      console.log("[Shutdown] Timeout \u2014 uscita forzata.");
      process.exit(0);
    }, 8e3);
  };
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
      startMetroMonitor();
      (async () => {
        try {
          await db.execute(import_drizzle_orm12.sql`
            CREATE TABLE IF NOT EXISTS server_restarts (
              id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
              started_at TIMESTAMP NOT NULL DEFAULT NOW(),
              reason VARCHAR(50) NOT NULL DEFAULT 'restart'
            )
          `);
        } catch (e) {
          console.warn("[MIGRATION] server_restarts (pre-uptime):", e);
        }
        initUptimeTracking();
        try {
          await db.execute(import_drizzle_orm12.sql`ALTER TABLE invitation_codes ADD COLUMN IF NOT EXISTS image_url TEXT`);
        } catch (e) {
          console.warn("[MIGRATION] invitation_codes.image_url:", e);
        }
        try {
          await db.execute(import_drizzle_orm12.sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS placement VARCHAR(30) NOT NULL DEFAULT 'all'`);
        } catch (e) {
          console.warn("[MIGRATION] ad_campaigns.placement:", e);
        }
        try {
          await db.execute(import_drizzle_orm12.sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ghost_mode BOOLEAN NOT NULL DEFAULT false`);
        } catch (e) {
          console.warn("[MIGRATION] users.ghost_mode:", e);
        }
        try {
          await db.execute(import_drizzle_orm12.sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS preferred_map_style VARCHAR(20)`);
        } catch (e) {
          console.warn("[MIGRATION] user_profiles.preferred_map_style:", e);
        }
        try {
          await db.execute(import_drizzle_orm12.sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP`);
          await db.execute(import_drizzle_orm12.sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_lat DOUBLE PRECISION`);
          await db.execute(import_drizzle_orm12.sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_lng DOUBLE PRECISION`);
        } catch (e) {
          console.warn("[MIGRATION] users.first_login_at/lat/lng:", e);
        }
        try {
          await db.execute(import_drizzle_orm12.sql`ALTER TABLE moto_clubs ADD COLUMN IF NOT EXISTS region VARCHAR(100)`);
          await db.execute(import_drizzle_orm12.sql`ALTER TABLE moto_clubs ADD COLUMN IF NOT EXISTS country VARCHAR(2)`);
          await db.execute(import_drizzle_orm12.sql`ALTER TABLE moto_clubs ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false`);
          await db.execute(import_drizzle_orm12.sql`ALTER TABLE moto_clubs ADD COLUMN IF NOT EXISTS member_count INTEGER NOT NULL DEFAULT 0`);
          await db.execute(import_drizzle_orm12.sql`ALTER TABLE moto_clubs ADD COLUMN IF NOT EXISTS cover_url TEXT`);
        } catch (e) {
          console.warn("[MIGRATION] moto_clubs columns:", e);
        }
        try {
          await db.execute(import_drizzle_orm12.sql`
            CREATE TABLE IF NOT EXISTS user_blocks (
              id SERIAL PRIMARY KEY,
              blocker_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              blocked_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              created_at TIMESTAMP DEFAULT NOW()
            )
          `);
          await db.execute(import_drizzle_orm12.sql`CREATE UNIQUE INDEX IF NOT EXISTS user_blocks_unique_idx ON user_blocks (blocker_id, blocked_id)`);
          await db.execute(import_drizzle_orm12.sql`CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx ON user_blocks (blocker_id)`);
          await db.execute(import_drizzle_orm12.sql`CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id)`);
        } catch (e) {
          console.warn("[MIGRATION] user_blocks:", e);
        }
        try {
          await db.execute(import_drizzle_orm12.sql`
            CREATE TABLE IF NOT EXISTS ota_releases (
              id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
              version VARCHAR(50) NOT NULL,
              bundle_path TEXT,
              release_notes TEXT,
              scheduled_at TIMESTAMP,
              published_at TIMESTAMP,
              status VARCHAR(20) NOT NULL DEFAULT 'draft',
              created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(import_drizzle_orm12.sql`CREATE INDEX IF NOT EXISTS ota_releases_status_idx ON ota_releases (status)`);
        } catch (e) {
          console.warn("[MIGRATION] ota_releases:", e);
        }
        console.log("[INIT] Phase 1 migrations done \u2014 starting sequential heavy tasks");
        initState.initializing = false;
        const delay = (ms) => new Promise((resolve3) => setTimeout(resolve3, ms));
        await delay(2e3);
        startMatchingEngine();
        console.log("[INIT] Phase 2 matching engine started");
        await delay(2e3);
        try {
          await autoSeedEssentialUsers();
        } catch (e) {
          console.warn("[INIT] autoSeedEssentialUsers error:", e);
        }
        try {
          const { storage: storage2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
          const modeSetting = await storage2.getAppSetting("splash_message_mode");
          if (!modeSetting) await storage2.upsertAppSetting("splash_message_mode", "single");
          const listSetting = await storage2.getAppSetting("splash_messages_list");
          if (!listSetting) await storage2.upsertAppSetting("splash_messages_list", "[]");
          const motoclubZavSetting = await storage2.getAppSetting("motoclub_include_zav");
          if (!motoclubZavSetting) await storage2.upsertAppSetting("motoclub_include_zav", "true");
          const showSearchPrefSetting = await storage2.getAppSetting("show_search_preference");
          if (!showSearchPrefSetting) await storage2.upsertAppSetting("show_search_preference", "false");
          const mapsUserChoiceSetting = await storage2.getAppSetting("maps_user_choice_enabled");
          if (!mapsUserChoiceSetting) await storage2.upsertAppSetting("maps_user_choice_enabled", "true");
        } catch (e) {
          console.warn("[SEED] splash settings:", e);
        }
        console.log("[INIT] Phase 3 essential seed + settings done");
        await delay(2e3);
        try {
          const { storage: st } = await Promise.resolve().then(() => (init_storage(), storage_exports));
          const alreadyReset = await st.getAppSetting("motoclub_brand_region_v2").catch(() => null);
          if (!alreadyReset) {
            console.log("[MIGRATION] Pulizia completa motoclub in corso...");
            await db.execute(import_drizzle_orm12.sql`DELETE FROM moto_club_invites`);
            await db.execute(import_drizzle_orm12.sql`DELETE FROM moto_club_requests`);
            await db.execute(import_drizzle_orm12.sql`DELETE FROM moto_club_members`);
            await db.execute(import_drizzle_orm12.sql`DELETE FROM moto_clubs`);
            await st.upsertAppSetting("motoclub_brand_region_v2", "true");
            console.log("[MIGRATION] Motoclub svuotati \u2014 riseed brand+region avviato...");
          }
          await seedMotoclubs();
        } catch (e) {
          console.warn("[MIGRATION] cleanup/reseed motoclub:", e);
        }
        console.log("[INIT] Phase 4 motoclub seed done");
        await delay(2e3);
        try {
          const { storage: stPhase5 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
          const fakeUsersSetting = await stPhase5.getAppSetting("fake_users_enabled");
          const fakeUsersEnabled = fakeUsersSetting?.value === "true";
          if (!fakeUsersEnabled) {
            console.log("[INIT] Phase 5 fake user seed skipped (fake users disabled)");
          } else {
            await autoSeedFakeUsers();
            console.log("[INIT] Phase 5 fake user seed done");
          }
        } catch (e) {
          console.warn("[INIT] autoSeedFakeUsers error:", e);
        }
        await delay(2e3);
        try {
          await initMissingClubConversations();
        } catch (e) {
          console.warn("[INIT] initMissingClubConversations deferred error:", e);
        }
        console.log("[INIT] Phase 6 club conversation sync done");
      })().catch((err) => {
        console.error("[INIT] Startup phase chain error:", err);
        initState.initializing = false;
      });
    }
  );
  server.on("connection", (socket) => {
    activeConnections.add(socket);
    socket.once("close", () => activeConnections.delete(socket));
  });
})();
