import {
  type CoordinateHistory,
  type PlannedRoute, type InsertPlannedRoute,
  type RouteWeatherCache, type InsertRouteWeatherCache,
  type User, type InsertUser,
  type UserPhoto, type InsertUserPhoto,
  type UserMotorcycle, type InsertUserMotorcycle,
  type UserProfile, type InsertUserProfile,
  type Proposal, type InsertProposal,
  type ProposalParticipant, type InsertProposalParticipant,
  type ProposalMatch, type InsertProposalMatch,
  type Conversation, type InsertConversation,
  type ConversationParticipant, type InsertConversationParticipant,
  type Message, type InsertMessage,
  type Route, type InsertRoute,
  type RoutePoint, type InsertRoutePoint,
  type GpsError, type InsertGpsError,
  type PhotoContestEntry, type InsertPhotoContestEntry,
  type PhotoVote, type InsertPhotoVote,
  type DailyVoteCount,
  type PhotoWinner, type InsertPhotoWinner,
  type Workshop, type InsertWorkshop,
  type WorkshopContact, type InsertWorkshopContact,
  type Business, type InsertBusiness, type InsertBusinessClick,
  type EasterEgg, type InsertEasterEgg,
  type CollectedEasterEgg, type InsertCollectedEasterEgg,
  type Report, type InsertReport,
  type ModeratorLog, type InsertModeratorLog,
  type AdCampaign, type InsertAdCampaign,
  type AdClick, type InsertAdClick,
  type Notification, type InsertNotification,
  type InvitationCode, type InsertInvitationCode,
  type FeedbackTicket, type InsertFeedbackTicket,
  type AppSetting,
  type VerificationCode, type InsertVerificationCode,
  type MotorcyclePhoto, type InsertMotorcyclePhoto,
  type ZavorrinaWishlist,
  type ZavorrinaWishlistPhoto, type InsertZavorrinaWishlistPhoto,
  type ZavorrinaWishlistMoto, type InsertZavorrinaWishlistMoto,
  type BikerZavorrinaMatch, type InsertBikerZavorrinaMatch,
  type BikerBikerMatch, type InsertBikerBikerMatch,
  type EmailVerificationToken,
  type CustomRoute, type InsertCustomRoute,
  type CustomRouteWaypoint, type InsertCustomRouteWaypoint,
  type SosRequest, type InsertSosRequest,
  type UserBlock,
  type WorkshopContact as WorkshopContactType,
  type ProposalProfileMatch, type InsertProposalProfileMatch,
} from "@shared/db";
import { FakeUsersStorage } from "./fake-users";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUsersByIds(ids: string[]): Promise<User[]>;
  getUserByNickname(nickname: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  getUserPhotos(userId: string): Promise<UserPhoto[]>;
  createUserPhoto(photo: InsertUserPhoto): Promise<UserPhoto>;
  deleteUserPhoto(id: string): Promise<void>;
  getUserPhotoCount(userId: string): Promise<number>;
  getUserMotorcycles(userId: string): Promise<UserMotorcycle[]>;
  getUserMotorcyclesBatch(userIds: string[]): Promise<UserMotorcycle[]>;
  createUserMotorcycle(moto: InsertUserMotorcycle): Promise<UserMotorcycle>;
  updateUserMotorcycle(id: string, data: Partial<InsertUserMotorcycle>): Promise<UserMotorcycle | undefined>;
  deleteUserMotorcycle(id: string): Promise<void>;
  searchUsers(query: string): Promise<{ user: User; profile: UserProfile | null }[]>;
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  getUserProfilesByIds(ids: string[]): Promise<UserProfile[]>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: string, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined>;
  upsertUserProfile(userId: string, data: Partial<InsertUserProfile>): Promise<UserProfile>;
  getProposals(filters?: { status?: string }): Promise<Proposal[]>;
  getActiveProposalsWithLocation(): Promise<Proposal[]>;
  getActiveProposalsWithLocationStats(): Promise<{ proposals: Proposal[]; candidatesPre: number }>;
  getActiveProposalCandidatePairs(maxRadiusKm: number): Promise<Array<{ id1: string; id2: string }>>;
  getCompatibleWishlistGaragePairs(countries?: string[]): Promise<Array<{
    wishlistMoto: import("@shared/db").ZavorrinaWishlistMoto;
    motorcycle: import("@shared/db").UserMotorcycle;
    zavorrinaId: string;
    bikerId: string;
  }>>;
  getProposal(id: string): Promise<Proposal | undefined>;
  createProposal(proposal: InsertProposal): Promise<Proposal>;
  updateProposal(id: string, data: Partial<InsertProposal>): Promise<Proposal | undefined>;
  deleteProposal(id: string): Promise<void>;
  getProposalParticipants(proposalId: string): Promise<ProposalParticipant[]>;
  addProposalParticipant(participant: InsertProposalParticipant): Promise<ProposalParticipant>;
  removeProposalParticipant(id: string): Promise<void>;
  getProposalMatches(userId: string, options?: { includeArchived?: boolean; halfLifeDays?: number }): Promise<ProposalMatch[]>;
  archiveStaleProposalMatches(afterDays?: number): Promise<number>;
  reactivateProposalMatch(id: string, userId: string): Promise<boolean>;
  getFreshProposalMatchesForUser(userId: string, options?: { threshold?: number; halfLifeDays?: number; limit?: number }): Promise<Array<ProposalMatch & { freshness: number }>>;
  getProposalMatch(id: string): Promise<ProposalMatch | undefined>;
  createProposalMatch(match: InsertProposalMatch): Promise<ProposalMatch>;
  updateProposalMatch(id: string, data: Partial<InsertProposalMatch>): Promise<ProposalMatch | undefined>;
  findExistingMatch(proposalId1: string, proposalId2: string): Promise<ProposalMatch | undefined>;
  deleteProposalMatch(id: string, userId: string): Promise<boolean>;
  deleteRejectedProposalMatches(userId: string): Promise<number>;
  deletePendingProposalMatches(userId: string): Promise<number>;
  expireOldProposals(): Promise<number>;
  deleteExpiredProposals(): Promise<number>;
  getConversations(userId: string, limit?: number, offset?: number): Promise<Conversation[]>;
  getAllConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conv: InsertConversation): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  getConversationParticipants(conversationId: string): Promise<ConversationParticipant[]>;
  addConversationParticipant(participant: InsertConversationParticipant): Promise<ConversationParticipant>;
  getMessages(conversationId: string, limit?: number, offset?: number): Promise<Message[]>;
  getMessageById(messageId: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  deleteMessage(messageId: string, senderId: string): Promise<boolean>;
  updateConversationLastRead(conversationId: string, userId: string): Promise<void>;
  updateConversationTimestamp(conversationId: string): Promise<void>;
  getRoutes(userId: string): Promise<Route[]>;
  getAllRoutes(): Promise<Route[]>;
  getRoute(id: string): Promise<Route | undefined>;
  createRoute(route: InsertRoute): Promise<Route>;
  updateRoute(id: string, data: Partial<InsertRoute>): Promise<Route | undefined>;
  getRoutePoints(routeId: string): Promise<RoutePoint[]>;
  createRoutePoints(points: InsertRoutePoint[]): Promise<RoutePoint[]>;
  deleteRoute(id: string): Promise<void>;
  createGpsError(data: InsertGpsError): Promise<GpsError>;
  getGpsErrors(limit: number, offset: number): Promise<GpsError[]>;
  countGpsErrors(): Promise<number>;
  getPhotoContestEntries(weekNumber: number, year: number): Promise<PhotoContestEntry[]>;
  createPhotoContestEntry(entry: InsertPhotoContestEntry): Promise<PhotoContestEntry>;
  deletePhotoContestEntry(id: string): Promise<void>;
  createPhotoVote(vote: InsertPhotoVote): Promise<PhotoVote>;
  getPhotoVote(entryId: string, userId: string): Promise<PhotoVote | undefined>;
  getDailyVoteCount(userId: string, voteDate: string): Promise<DailyVoteCount | undefined>;
  upsertDailyVoteCount(userId: string, voteDate: string): Promise<void>;
  incrementEntryVotes(entryId: string): Promise<void>;
  getPhotoWinners(): Promise<PhotoWinner[]>;
  createPhotoWinner(winner: InsertPhotoWinner): Promise<PhotoWinner>;
  getWorkshops(approved?: boolean): Promise<Workshop[]>;
  getWorkshop(id: string): Promise<Workshop | undefined>;
  createWorkshop(workshop: InsertWorkshop): Promise<Workshop>;
  updateWorkshop(id: string, data: Partial<InsertWorkshop>): Promise<Workshop | undefined>;
  createWorkshopContact(contact: InsertWorkshopContact): Promise<WorkshopContact>;
  getBusinesses(): Promise<Business[]>;
  getBusiness(id: string): Promise<Business | undefined>;
  getVisibleBusinesses(): Promise<Business[]>;
  getBusinessByAccessToken(token: string): Promise<Business | undefined>;
  setBusinessAccessToken(id: string, token: string | null): Promise<Business | undefined>;
  createBusiness(data: InsertBusiness): Promise<Business>;
  updateBusiness(id: string, data: Partial<InsertBusiness>): Promise<Business | undefined>;
  deleteBusiness(id: string): Promise<void>;
  setAllBusinessesActive(isActive: boolean): Promise<number>;
  createBusinessClick(data: InsertBusinessClick): Promise<void>;
  computeQualifiedPassages(businessId: string, periodMonth: string, radiusM: number, maxSpeedKmh: number): Promise<{ qualifiedPassages: number; uniqueRiders: number }>;
  getBusinessReport(periodMonth: string): Promise<Array<{ businessId: string; name: string; type: string; qualifiedPassages: number; uniqueRiders: number; radiusM: number; computedAt: Date | null; clicks: number; clicksByAction: Record<string, number> }>>;
  getBusinessSelfReport(businessId: string, periodMonth: string): Promise<{ businessId: string; name: string; type: string; periodMonth: string; qualifiedPassages: number; uniqueRiders: number; radiusM: number; computedAt: Date | null; clicks: number; clicksByAction: Record<string, number>; availableMonths: string[] } | null>;
  getEasterEggs(active?: boolean): Promise<EasterEgg[]>;
  getEasterEgg(id: string): Promise<EasterEgg | undefined>;
  createEasterEgg(egg: InsertEasterEgg): Promise<EasterEgg>;
  updateEasterEgg(id: string, data: Partial<InsertEasterEgg>): Promise<EasterEgg | undefined>;
  collectEasterEgg(data: InsertCollectedEasterEgg): Promise<CollectedEasterEgg>;
  getCollectedEasterEggs(userId: string): Promise<CollectedEasterEgg[]>;
  hasCollectedEasterEgg(easterEggId: string, userId: string): Promise<boolean>;
  getReports(status?: string): Promise<Report[]>;
  getReportsFiltered(opts?: { status?: string; category?: string; severity?: string; context?: string; reportedUserId?: string; limit?: number }): Promise<Report[]>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(id: string, data: Partial<InsertReport>): Promise<Report | undefined>;
  resolveReport(id: string, opts: { status: "resolved" | "dismissed"; resolvedBy: string }): Promise<Report | undefined>;
  // Task #2531 — Hub Moderazione (Pannello Admin Report)
  getReportsHubSummary(): Promise<{
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
    byRole: Record<string, number>;
    bySeverity: Record<string, number>;
    topPatterns: Array<{ reportedUserId: string; count: number; weight: number }>;
    criticalOpenOver1h: number;
    activeBansLast24h: number;
    unclaimedPending: number;
    totalPending: number;
    generatedAt: string;
  }>;
  getReportsPatterns(opts?: { minCount?: number; days?: number; limit?: number }): Promise<Array<{
    reportedUserId: string;
    nickname: string | null;
    userType: string | null;
    count: number;
    weight: number;
    lastReportAt: string | null;
    statusBreakdown: Record<string, number>;
  }>>;
  getActiveBans(): Promise<Array<{
    userId: string;
    nickname: string;
    userType: string | null;
    type: "shadow" | "suspended" | "blocked";
    reason: string | null;
    shadowBannedAt: string | null;
    shadowBannedUntil: string | null;
    updatedAt: string | null;
  }>>;
  claimReport(id: string, moderatorId: string): Promise<Report | null>;
  unclaimReport(id: string, moderatorId: string): Promise<Report | null>;
  unbanUser(userId: string): Promise<boolean>;
  createModeratorLog(log: InsertModeratorLog): Promise<ModeratorLog>;
  getActiveCampaigns(): Promise<AdCampaign[]>;
  getActiveAdsByUserType(userType: string): Promise<AdCampaign[]>;
  getAdCampaign(id: string): Promise<AdCampaign | undefined>;
  createAdCampaign(campaign: InsertAdCampaign): Promise<AdCampaign>;
  updateAdCampaign(id: string, data: Partial<InsertAdCampaign>): Promise<AdCampaign | undefined>;
  createAdClick(click: InsertAdClick): Promise<AdClick>;
  incrementCampaignImpressions(id: string): Promise<void>;
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<void>;
  getInvitationCodes(): Promise<InvitationCode[]>;
  getInvitationCode(code: string): Promise<InvitationCode | undefined>;
  getInvitationCodeById(id: string): Promise<InvitationCode | undefined>;
  createInvitationCode(code: InsertInvitationCode): Promise<InvitationCode>;
  updateInvitationCode(id: string, data: Partial<InsertInvitationCode>): Promise<InvitationCode>;
  deleteInvitationCode(id: string): Promise<void>;
  incrementInvitationCodeUses(id: string): Promise<void>;
  countUsersWithInvitationCode(): Promise<number>;
  countUsersByInvitationCode(code: string): Promise<number>;
  getFeedbackTickets(): Promise<FeedbackTicket[]>;
  createFeedbackTicket(ticket: InsertFeedbackTicket): Promise<FeedbackTicket>;
  updateFeedbackTicket(id: string, updates: { status?: string; internalNote?: string }): Promise<FeedbackTicket | undefined>;
  getAppSetting(key: string): Promise<AppSetting | undefined>;
  upsertAppSetting(key: string, value?: string, valueJson?: unknown): Promise<AppSetting>;
  upsertAppSettingsAtomic(entries: { key: string; value?: string; valueJson?: unknown }[]): Promise<void>;
  createVerificationCode(code: InsertVerificationCode): Promise<VerificationCode>;
  createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  getNearbyUsers(lat: number, lng: number, radiusKm: number, countries?: string[], motoTagIds?: string[]): Promise<Array<{ user: User; profile: UserProfile; distance: number }>>;
  getUserMotorcycle(id: string): Promise<UserMotorcycle | undefined>;
  getUserPhoto(id: string): Promise<UserPhoto | undefined>;
  getAllUsers(): Promise<User[]>;
  getModeratorLogs(): Promise<ModeratorLog[]>;
  clearModeratorLogs(): Promise<number>;
  getAllCampaigns(): Promise<AdCampaign[]>;
  deleteEasterEgg(id: string): Promise<void>;
  deleteWorkshop(id: string): Promise<void>;
  deleteCampaign(id: string): Promise<void>;
  getAllAppSettings(): Promise<AppSetting[]>;
  getWorkshopContactsByPeriod(startDate: Date, endDate: Date): Promise<WorkshopContactType[]>;
  countUsers(): Promise<number>;
  countActiveUsers(since: Date): Promise<number>;
  countOnlineUsers(since: Date, countries?: string[]): Promise<number>;
  countAvailableUsers(): Promise<number>;
  getUnapprovedUserPhotos(): Promise<UserPhoto[]>;
  updateUserPhotoApproval(id: string, approved: boolean): Promise<UserPhoto | undefined>;
  getUnapprovedContestEntries(): Promise<PhotoContestEntry[]>;
  updateContestEntryApproval(id: string, approved: boolean): Promise<PhotoContestEntry | undefined>;
  getPhotoContestEntry(id: string): Promise<PhotoContestEntry | undefined>;
  getPhoneSharedCount(conversationId: string, userId: string): Promise<number>;
  incrementPhoneSharedCount(conversationId: string, userId: string): Promise<void>;
  countAvailableBikers(countries?: string[]): Promise<number>;
  countAvailableZavorrine(countries?: string[]): Promise<number>;
  getAvailableBikersList(lat?: number, lng?: number, countries?: string[], onlineIds?: string[]): Promise<Array<{ user: import("@shared/db").User; profile: import("@shared/db").UserProfile; distance: number }>>;
  getAvailableZavorrinaList(lat?: number, lng?: number, countries?: string[], onlineIds?: string[]): Promise<Array<{ user: import("@shared/db").User; profile: import("@shared/db").UserProfile; distance: number }>>;
  getMotorcyclePhotos(motorcycleId: string): Promise<MotorcyclePhoto[]>;
  getMotorcyclePhoto(id: string): Promise<MotorcyclePhoto | undefined>;
  addMotorcyclePhoto(data: InsertMotorcyclePhoto): Promise<MotorcyclePhoto>;
  deleteMotorcyclePhoto(id: string): Promise<void>;
  getMotorcyclePhotoCount(motorcycleId: string): Promise<number>;
  getWishlist(userId: string): Promise<ZavorrinaWishlist | undefined>;
  createOrUpdateWishlist(userId: string, description: string): Promise<ZavorrinaWishlist>;
  getWishlistPhotos(wishlistId: string): Promise<ZavorrinaWishlistPhoto[]>;
  getWishlistPhoto(id: string): Promise<ZavorrinaWishlistPhoto | undefined>;
  addWishlistPhoto(data: InsertZavorrinaWishlistPhoto): Promise<ZavorrinaWishlistPhoto>;
  deleteWishlistPhoto(id: string): Promise<void>;
  getWishlistPhotoCount(wishlistId: string): Promise<number>;
  getWishlistMoto(id: string): Promise<ZavorrinaWishlistMoto | undefined>;
  getWishlistMotos(wishlistId: string): Promise<ZavorrinaWishlistMoto[]>;
  addWishlistMoto(data: InsertZavorrinaWishlistMoto): Promise<ZavorrinaWishlistMoto>;
  updateWishlistMoto(id: string, data: Partial<InsertZavorrinaWishlistMoto>): Promise<ZavorrinaWishlistMoto | undefined>;
  deleteWishlistMoto(id: string): Promise<void>;
  getWishlistMotoCount(wishlistId: string): Promise<number>;
  findMatchingWishlistMotos(brand: string, model: string, ridingStyle: string, motorcycleType: string): Promise<Array<import("@shared/db").ZavorrinaWishlistMoto & { userId: string }>>;
  findMatchingBikerMotos(brand: string, model: string, ridingStyle: string, motorcycleType: string): Promise<import("@shared/db").UserMotorcycle[]>;
  createMatch(data: import("@shared/db").InsertBikerZavorrinaMatch): Promise<import("@shared/db").BikerZavorrinaMatch | null>;
  getMatchesForUser(userId: string, options?: { includeArchived?: boolean; halfLifeDays?: number }): Promise<import("@shared/db").BikerZavorrinaMatch[]>;
  archiveStaleBikerZavorrinaMatches(afterDays?: number): Promise<number>;
  reactivateGarageMatch(id: string, userId: string): Promise<boolean>;
  getFreshMatchesForUser(userId: string, options?: { threshold?: number; halfLifeDays?: number; limit?: number }): Promise<Array<import("@shared/db").BikerZavorrinaMatch & { freshness: number }>>;
  getFreshBikerBikerMatchesForUser(userId: string, options?: { threshold?: number; halfLifeDays?: number; limit?: number }): Promise<Array<import("@shared/db").BikerBikerMatch & { freshness: number }>>;
  getFreshProposalProfileMatchesForUser(userId: string, options?: { threshold?: number; halfLifeDays?: number; limit?: number }): Promise<Array<import("@shared/db").ProposalProfileMatch & { freshness: number }>>;
  getGarageMatch(id: string): Promise<import("@shared/db").BikerZavorrinaMatch | undefined>;
  updateGarageMatch(id: string, data: Partial<import("@shared/db").InsertBikerZavorrinaMatch>): Promise<import("@shared/db").BikerZavorrinaMatch | undefined>;
  deleteGarageMatch(id: string, userId: string): Promise<boolean>;
  resetGarageMatchToNew(id: string, userId: string): Promise<boolean>;
  deleteRejectedGarageMatches(userId: string): Promise<number>;
  deleteNewGarageMatches(userId: string): Promise<number>;
  getAllWishlistMotosWithUsers(countries?: string[]): Promise<{ wishlistMoto: import("@shared/db").ZavorrinaWishlistMoto; userId: string }[]>;
  getAllBikerMotorcyclesWithUsers(countries?: string[]): Promise<{ motorcycle: import("@shared/db").UserMotorcycle; userId: string }[]>;
  findExistingBikerZavorrinaMatch(bikerId: string, zavorrinaId: string, bikerMotorcycleId: string, wishlistMotoId: string): Promise<import("@shared/db").BikerZavorrinaMatch | undefined>;
  getActedUponBikerZavorrinaPairs(): Promise<Set<string>>;
  getAllExistingBikerZavorrinaMatchKeys(): Promise<Set<string>>;
  getAllExistingProposalMatchKeys(): Promise<Set<string>>;
  getAllExistingProposalProfileMatchKeys(): Promise<Set<string>>;
  getBikerBikerMatchesForUser(userId: string, options?: { includeArchived?: boolean; halfLifeDays?: number }): Promise<import("@shared/db").BikerBikerMatch[]>;
  archiveStaleBikerBikerMatches(afterDays?: number): Promise<number>;
  reactivateBikerBikerMatch(id: string, userId: string): Promise<boolean>;
  createBikerBikerMatch(data: import("@shared/db").InsertBikerBikerMatch): Promise<import("@shared/db").BikerBikerMatch | undefined>;
  getBikerBikerMatch(id: string): Promise<import("@shared/db").BikerBikerMatch | undefined>;
  updateBikerBikerMatch(id: string, data: Partial<import("@shared/db").InsertBikerBikerMatch>): Promise<import("@shared/db").BikerBikerMatch | undefined>;
  resetBikerBikerMatchToNew(id: string, userId: string): Promise<boolean>;
  deleteRejectedBikerBikerMatches(userId: string): Promise<number>;
  deleteNewBikerBikerMatches(userId: string): Promise<number>;
  getAcceptedBikerBikerPairKeys(userId: string): Promise<Set<string>>;
  createEmailVerificationToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  getEmailVerificationToken(token: string): Promise<import("@shared/db").EmailVerificationToken | undefined>;
  deleteEmailVerificationTokens(userId: string): Promise<void>;
  markUserEmailVerified(userId: string): Promise<void>;
  getPasswordResetTokenByCode(userId: string, code: string): Promise<{ id: string; userId: string; expiresAt: Date; token: string } | undefined>;
  markPasswordResetTokenUsedById(id: string): Promise<void>;
  deletePasswordResetTokens(userId: string): Promise<void>;
  requestUserDeletion(userId: string): Promise<void>;
  cancelUserDeletion(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  recordFakeUserInteraction(fakeUserId: string, realUserId: string, interactionType: string): Promise<void>;
  getFakeUserStats(limit?: number, offset?: number, type?: string): Promise<{ users: unknown[]; total: number; hasMore: boolean; stats: { total: number; biker: number; zavorrina: number; coppia: number } }>;
  getFakeUsers(): Promise<import("@shared/db").User[]>;
  deleteFakeUser(id: string): Promise<void>;
  deleteAllFakeUsers(): Promise<number>;
  toggleFakeZavorrineAvailability(): Promise<void>;
  getFakeUserConversations(fakeUserId: string): Promise<import("@shared/db").Conversation[]>;
  getWorkshopContactsByPeriod(startDate: Date, endDate: Date): Promise<import("@shared/db").WorkshopContact[]>;
  getCustomRoutes(userId: string): Promise<import("@shared/db").CustomRoute[]>;
  getPublicCustomRoutes(): Promise<CustomRoute[]>;
  getFriendsCustomRoutes(userId: string): Promise<CustomRoute[]>;
  isUserFriendOf(userId: string, ownerId: string): Promise<boolean>;
  getCustomRoute(id: string): Promise<CustomRoute | undefined>;
  createCustomRoute(data: InsertCustomRoute): Promise<CustomRoute>;
  updateCustomRoute(id: string, data: Partial<InsertCustomRoute>): Promise<CustomRoute | undefined>;
  deleteCustomRoute(id: string): Promise<void>;
  getCustomRouteWaypoints(routeId: string): Promise<CustomRouteWaypoint[]>;
  createCustomRouteWaypoint(data: InsertCustomRouteWaypoint): Promise<CustomRouteWaypoint>;
  updateCustomRouteWaypoint(id: string, data: Partial<InsertCustomRouteWaypoint>): Promise<CustomRouteWaypoint | undefined>;
  deleteCustomRouteWaypoint(id: string): Promise<void>;
  deleteAllCustomRouteWaypoints(routeId: string): Promise<void>;
  createSosRequest(data: InsertSosRequest): Promise<SosRequest>;
  getSosRequest(id: string): Promise<SosRequest | undefined>;
  getActiveSosRequestByUser(userId: string): Promise<SosRequest | undefined>;
  getActiveSosRequests(): Promise<SosRequest[]>;
  updateSosRequest(id: string, data: Partial<InsertSosRequest>): Promise<SosRequest | undefined>;
  saveCoordinateHistory(userId: string, latitude: number, longitude: number): Promise<CoordinateHistory | null>;
  getLatestCoordinateHistory(userId: string): Promise<{ latitude: number; longitude: number } | null>;
  getCoordinateHistoryStats(): Promise<{ totalRecords: number; trackedUsers: number; oldestRecord: string | null; newestRecord: string | null }>;
  getCoordinateHistoryUsers(): Promise<Array<{ userId: string; nickname: string; recordCount: number; lastRecord: string }>>;
  cleanupOldCoordinateHistory(): Promise<number>;
  blockUser(blockerId: string, blockedId: string): Promise<UserBlock>;
  unblockUser(blockerId: string, blockedId: string): Promise<boolean>;
  isBlocked(userId1: string, userId2: string): Promise<boolean>;
  hasBlockedUser(blockerId: string, blockedId: string): Promise<boolean>;
  getBlockedUserIds(userId: string): Promise<string[]>;
  getBlockedUsersByBlocker(blockerId: string): Promise<Array<{ id: string; nickname: string; userType: string | null; avatarUrl: string | null }>>;
  getAllBlockedPairs(): Promise<Array<{ blockerId: string; blockedId: string }>>;
  getAdminBlocks(options: { search?: string; page?: number; limit?: number }): Promise<{ blocks: Array<{ id: string; blockerId: string; blockerNickname: string; blockerAvatarUrl: string | null; blockedId: string; blockedNickname: string; blockedAvatarUrl: string | null; createdAt: string }>; total: number; hasMore: boolean }>;
  deleteBlockById(id: string): Promise<boolean>;
  deleteBikerBikerMatchesBetween(userId1: string, userId2: string): Promise<number>;
  cleanupAdminMatches(): Promise<{ bikerZavorrina: number; bikerBiker: number }>;
  getRouteAffinityMatchesForUser(userId: string): Promise<import("@shared/db").RouteAffinityMatch[]>;
  getRouteAffinityMatch(id: string): Promise<import("@shared/db").RouteAffinityMatch | undefined>;
  updateRouteAffinityMatch(id: string, data: Partial<import("@shared/db").InsertRouteAffinityMatch>): Promise<import("@shared/db").RouteAffinityMatch | undefined>;
  deleteRouteAffinityMatch(id: string): Promise<boolean>;
  deleteRouteAffinityMatchByUser(id: string, userId: string): Promise<boolean>;
  deleteRouteAffinityMatchesBetween(userId1: string, userId2: string): Promise<number>;
  getUserTelemetryProfile(userId: string): Promise<import("@shared/db").UserTelemetryProfile | undefined>;
  getTelemetryAffinityMatchesForUser(userId: string): Promise<import("@shared/db").TelemetryAffinityMatch[]>;
  getTelemetryAffinityMatch(id: string): Promise<import("@shared/db").TelemetryAffinityMatch | undefined>;
  updateTelemetryAffinityMatch(id: string, data: Partial<import("@shared/db").InsertTelemetryAffinityMatch>): Promise<import("@shared/db").TelemetryAffinityMatch | undefined>;
  deleteTelemetryAffinityMatch(id: string): Promise<boolean>;
  deleteTelemetryAffinityMatchByUser(id: string, userId: string): Promise<boolean>;
  deleteTelemetryAffinityMatchesBetween(userId1: string, userId2: string): Promise<number>;
  createPlannedRoute(data: InsertPlannedRoute): Promise<PlannedRoute>;
  getPlannedRoute(id: string): Promise<PlannedRoute | undefined>;
  getPlannedRoutes(userId: string): Promise<PlannedRoute[]>;
  getPublicPlannedRoutes(limit?: number): Promise<PlannedRoute[]>;
  updatePlannedRoute(id: string, data: Partial<InsertPlannedRoute>): Promise<PlannedRoute | undefined>;
  deletePlannedRoute(id: string): Promise<void>;
  upsertRouteWeatherCache(data: InsertRouteWeatherCache): Promise<RouteWeatherCache>;
  getRouteWeatherCache(routeId: string): Promise<RouteWeatherCache | undefined>;
  getOnlineUsersList(since?: Date, lat?: number, lng?: number, countries?: string[], onlineIds?: string[]): Promise<Array<{ user: import("@shared/db").User; profile: import("@shared/db").UserProfile | null; distance: number }>>;
  getAvailableUsersList(lat?: number, lng?: number): Promise<Array<{ user: import("@shared/db").User; profile: import("@shared/db").UserProfile; distance: number }>>;
  getAllExistingProposalProfileMatchKeys(): Promise<Set<string>>;
  getActedUponBikerZavorrinaPairs(): Promise<Set<string>>;
  createProposalProfileMatch(data: InsertProposalProfileMatch): Promise<ProposalProfileMatch | null>;
  getProposalProfileMatchesForUser(userId: string, options?: { includeArchived?: boolean; halfLifeDays?: number }): Promise<ProposalProfileMatch[]>;
  archiveStaleProposalProfileMatches(afterDays?: number): Promise<number>;
  reactivateProposalProfileMatch(id: string, userId: string): Promise<boolean>;
  getProposalProfileMatch(id: string): Promise<ProposalProfileMatch | undefined>;
  updateProposalProfileMatch(id: string, data: Partial<InsertProposalProfileMatch>): Promise<ProposalProfileMatch | undefined>;
  getPendingReportsCount(): Promise<number>;
  // Tag system (Task #2512)
  listTagCategories(): Promise<import("@shared/db").TagCategory[]>;
  getTagCategoryBySlug(slug: string): Promise<import("@shared/db").TagCategory | undefined>;
  listTagsByCategorySlug(slug: string): Promise<import("@shared/db").Tag[]>;
  listAllTagsWithCategory(): Promise<Array<{ tag: import("@shared/db").Tag; category: import("@shared/db").TagCategory }>>;
  getTagById(id: string): Promise<import("@shared/db").Tag | undefined>;
  createTag(data: import("@shared/db").InsertTag): Promise<import("@shared/db").Tag>;
  deleteTag(id: string): Promise<boolean>;
  getTagsForEntity(entityType: string, entityId: string): Promise<Array<import("@shared/db").Tag & { categorySlug: string; categoryLabel: string }>>;
  setTagsForEntity(entityType: string, entityId: string, tagIds: string[], options?: { categorySlug?: string }): Promise<import("@shared/db").EntityTag[]>;
  // Text aliases (Task #2518)
  listTextAliases(category?: string): Promise<Array<import("@shared/db").TextAlias & { tagLabel: string | null }>>;
  createTextAlias(input: { category: string; input: string; targetId?: string | null; targetValue?: string | null; confidence?: number; source?: string }): Promise<import("@shared/db").TextAlias>;
  deleteTextAlias(id: string): Promise<boolean>;
}

export class DatabaseStorage extends FakeUsersStorage implements IStorage {
  async archiveStaleProposalProfileMatches(afterDays?: number): Promise<number> {
    const { archiveStaleProposalProfileMatches } = await import("./matching.part2");
    return archiveStaleProposalProfileMatches(afterDays);
  }
  async reactivateProposalProfileMatch(id: string, userId: string): Promise<boolean> {
    const { reactivateProposalProfileMatch } = await import("./matching.part2");
    return reactivateProposalProfileMatch(id, userId);
  }
}

export const storage: IStorage = new DatabaseStorage();
