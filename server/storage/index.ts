import { eq, sql, desc } from "drizzle-orm";
import { db } from "../db";
import {
  coordinateHistory, plannedRoutes, routeWeatherCache, users,
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
  type ZavarrinaWishlist,
  type ZavarrinaWishlistPhoto, type InsertZavarrinaWishlistPhoto,
  type ZavarrinaWishlistMoto, type InsertZavarrinaWishlistMoto,
  type BikerZavarrinaMatch, type InsertBikerZavarrinaMatch,
  type BikerBikerMatch, type InsertBikerBikerMatch,
  type EmailVerificationToken,
  type CustomRoute, type InsertCustomRoute,
  type CustomRouteWaypoint, type InsertCustomRouteWaypoint,
  type SosRequest, type InsertSosRequest,
  type UserBlock,
  type WorkshopContact as WorkshopContactType,
  type ProposalProfileMatch, type InsertProposalProfileMatch,
} from "@shared/schema";
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
  getProposal(id: string): Promise<Proposal | undefined>;
  createProposal(proposal: InsertProposal): Promise<Proposal>;
  updateProposal(id: string, data: Partial<InsertProposal>): Promise<Proposal | undefined>;
  deleteProposal(id: string): Promise<void>;
  getProposalParticipants(proposalId: string): Promise<ProposalParticipant[]>;
  addProposalParticipant(participant: InsertProposalParticipant): Promise<ProposalParticipant>;
  removeProposalParticipant(id: string): Promise<void>;
  getProposalMatches(userId: string): Promise<ProposalMatch[]>;
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
  createMessage(message: InsertMessage): Promise<Message>;
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
  getEasterEggs(active?: boolean): Promise<EasterEgg[]>;
  getEasterEgg(id: string): Promise<EasterEgg | undefined>;
  createEasterEgg(egg: InsertEasterEgg): Promise<EasterEgg>;
  updateEasterEgg(id: string, data: Partial<InsertEasterEgg>): Promise<EasterEgg | undefined>;
  collectEasterEgg(data: InsertCollectedEasterEgg): Promise<CollectedEasterEgg>;
  getCollectedEasterEggs(userId: string): Promise<CollectedEasterEgg[]>;
  hasCollectedEasterEgg(easterEggId: string, userId: string): Promise<boolean>;
  getReports(status?: string): Promise<Report[]>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(id: string, data: Partial<InsertReport>): Promise<Report | undefined>;
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
  createVerificationCode(code: InsertVerificationCode): Promise<VerificationCode>;
  createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  getNearbyUsers(lat: number, lng: number, radiusKm: number, countries?: string[]): Promise<Array<{ user: User; profile: UserProfile; distance: number }>>;
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
  getAvailableBikersList(lat?: number, lng?: number, countries?: string[], onlineIds?: string[]): Promise<any[]>;
  getAvailableZavorrinaList(lat?: number, lng?: number, countries?: string[], onlineIds?: string[]): Promise<any[]>;
  getMotorcyclePhotos(motorcycleId: string): Promise<MotorcyclePhoto[]>;
  getMotorcyclePhoto(id: string): Promise<MotorcyclePhoto | undefined>;
  addMotorcyclePhoto(data: InsertMotorcyclePhoto): Promise<MotorcyclePhoto>;
  deleteMotorcyclePhoto(id: string): Promise<void>;
  getMotorcyclePhotoCount(motorcycleId: string): Promise<number>;
  getWishlist(userId: string): Promise<ZavarrinaWishlist | undefined>;
  createOrUpdateWishlist(userId: string, description: string): Promise<ZavarrinaWishlist>;
  getWishlistPhotos(wishlistId: string): Promise<ZavarrinaWishlistPhoto[]>;
  addWishlistPhoto(data: InsertZavarrinaWishlistPhoto): Promise<ZavarrinaWishlistPhoto>;
  deleteWishlistPhoto(id: string): Promise<void>;
  getWishlistPhotoCount(wishlistId: string): Promise<number>;
  getWishlistMoto(id: string): Promise<ZavarrinaWishlistMoto | undefined>;
  getWishlistMotos(wishlistId: string): Promise<ZavarrinaWishlistMoto[]>;
  addWishlistMoto(data: InsertZavarrinaWishlistMoto): Promise<ZavarrinaWishlistMoto>;
  updateWishlistMoto(id: string, data: Partial<InsertZavarrinaWishlistMoto>): Promise<ZavarrinaWishlistMoto | undefined>;
  deleteWishlistMoto(id: string): Promise<void>;
  getWishlistMotoCount(wishlistId: string): Promise<number>;
  findMatchingWishlistMotos(brand: string, model: string, ridingStyle: string, motorcycleType: string): Promise<Array<ZavarrinaWishlistMoto & { userId: string }>>;
  findMatchingBikerMotos(brand: string, model: string, ridingStyle: string, motorcycleType: string): Promise<UserMotorcycle[]>;
  createMatch(data: InsertBikerZavarrinaMatch): Promise<BikerZavarrinaMatch | null>;
  getMatchesForUser(userId: string): Promise<BikerZavarrinaMatch[]>;
  getGarageMatch(id: string): Promise<BikerZavarrinaMatch | undefined>;
  updateGarageMatch(id: string, data: Partial<InsertBikerZavarrinaMatch>): Promise<BikerZavarrinaMatch | undefined>;
  deleteGarageMatch(id: string, userId: string): Promise<boolean>;
  resetGarageMatchToNew(id: string, userId: string): Promise<boolean>;
  deleteRejectedGarageMatches(userId: string): Promise<number>;
  deleteNewGarageMatches(userId: string): Promise<number>;
  getAllWishlistMotosWithUsers(countries?: string[]): Promise<{ wishlistMoto: any; userId: string }[]>;
  getAllBikerMotorcyclesWithUsers(countries?: string[]): Promise<{ motorcycle: any; userId: string }[]>;
  findExistingBikerZavarrinaMatch(bikerId: string, zavarrinaId: string, bikerMotorcycleId: string, wishlistMotoId: string): Promise<BikerZavarrinaMatch | undefined>;
  getAllExistingBikerZavarrinaMatchKeys(): Promise<Set<string>>;
  getAllExistingProposalMatchKeys(): Promise<Set<string>>;
  getBikerBikerMatchesForUser(userId: string): Promise<BikerBikerMatch[]>;
  createBikerBikerMatch(data: InsertBikerBikerMatch): Promise<BikerBikerMatch | undefined>;
  getBikerBikerMatch(id: string): Promise<BikerBikerMatch | undefined>;
  updateBikerBikerMatch(id: string, data: Partial<InsertBikerBikerMatch>): Promise<BikerBikerMatch | undefined>;
  resetBikerBikerMatchToNew(id: string, userId: string): Promise<boolean>;
  deleteRejectedBikerBikerMatches(userId: string): Promise<number>;
  deleteNewBikerBikerMatches(userId: string): Promise<number>;
  getAcceptedBikerBikerPairKeys(userId: string): Promise<Set<string>>;
  createEmailVerificationToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined>;
  deleteEmailVerificationTokens(userId: string): Promise<void>;
  markUserEmailVerified(userId: string): Promise<void>;
  getPasswordResetTokenByCode(userId: string, code: string): Promise<{ id: string; userId: string; expiresAt: Date; token: string } | undefined>;
  markPasswordResetTokenUsedById(id: string): Promise<void>;
  deletePasswordResetTokens(userId: string): Promise<void>;
  requestUserDeletion(userId: string): Promise<void>;
  cancelUserDeletion(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  recordFakeUserInteraction(fakeUserId: string, realUserId: string, interactionType: string): Promise<void>;
  getFakeUserStats(limit?: number, offset?: number, type?: string): Promise<{ users: any[]; total: number; hasMore: boolean; stats: { total: number; biker: number; zavorrina: number; coppia: number } }>;
  getFakeUsers(): Promise<User[]>;
  deleteFakeUser(id: string): Promise<void>;
  deleteAllFakeUsers(): Promise<number>;
  toggleFakeZavorrineAvailability(): Promise<void>;
  getFakeUserConversations(fakeUserId: string): Promise<any[]>;
  getCustomRoutes(userId: string): Promise<CustomRoute[]>;
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
  cleanupAdminMatches(): Promise<{ bikerZavarrina: number; bikerBiker: number }>;
  createPlannedRoute(data: InsertPlannedRoute): Promise<PlannedRoute>;
  getPlannedRoute(id: string): Promise<PlannedRoute | undefined>;
  getPlannedRoutes(userId: string): Promise<PlannedRoute[]>;
  getPublicPlannedRoutes(limit?: number): Promise<PlannedRoute[]>;
  updatePlannedRoute(id: string, data: Partial<InsertPlannedRoute>): Promise<PlannedRoute | undefined>;
  deletePlannedRoute(id: string): Promise<void>;
  upsertRouteWeatherCache(data: InsertRouteWeatherCache): Promise<RouteWeatherCache>;
  getRouteWeatherCache(routeId: string): Promise<RouteWeatherCache | undefined>;
  getOnlineUsersList(since: Date, lat?: number, lng?: number, countries?: string[], onlineIds?: string[]): Promise<any[]>;
  getAvailableUsersList(lat?: number, lng?: number): Promise<any[]>;
  getAllExistingProposalProfileMatchKeys(): Promise<Set<string>>;
  getActedUponBikerZavarrinaPairs(): Promise<Set<string>>;
  createProposalProfileMatch(data: InsertProposalProfileMatch): Promise<ProposalProfileMatch | null>;
  getPendingReportsCount(): Promise<number>;
}

export class DatabaseStorage extends FakeUsersStorage implements IStorage {
  async saveCoordinateHistory(userId: string, latitude: number, longitude: number): Promise<CoordinateHistory | null> {
    try {
      const enabledSetting = await this.getAppSetting("coordinate_history_enabled");
      if (enabledSetting?.value !== "true") return null;
      const modeSetting = await this.getAppSetting("coordinate_history_mode");
      const mode = modeSetting?.value || "all";
      if (mode === "selected") {
        const usersSetting = await this.getAppSetting("coordinate_history_users");
        const selectedUsers: string[] = usersSetting?.value ? JSON.parse(usersSetting.value) : [];
        if (!selectedUsers.includes(userId)) return null;
      }
      const intervalSetting = await this.getAppSetting("coordinate_history_interval");
      const intervalSec = intervalSetting?.value ? parseInt(intervalSetting.value, 10) : 30;
      const minInterval = isNaN(intervalSec) || intervalSec < 5 ? 30 : intervalSec;
      const lastRecord = await db.select().from(coordinateHistory).where(eq(coordinateHistory.userId, userId)).orderBy(desc(coordinateHistory.recordedAt)).limit(1);
      if (lastRecord.length > 0) {
        const elapsed = (Date.now() - new Date(lastRecord[0].recordedAt).getTime()) / 1000;
        if (elapsed < minInterval) return null;
      }
      const [record] = await db.insert(coordinateHistory).values({ userId, latitude, longitude }).returning();
      return record;
    } catch (err) {
      console.error("[CoordinateHistory] save error:", err);
      return null;
    }
  }

  async getCoordinateHistoryStats(): Promise<{ totalRecords: number; trackedUsers: number; oldestRecord: string | null; newestRecord: string | null }> {
    const result = await db.execute(sql`SELECT COUNT(*)::int as total_records, COUNT(DISTINCT user_id)::int as tracked_users, MIN(created_at)::text as oldest_record, MAX(created_at)::text as newest_record FROM coordinate_history`);
    const row = result.rows[0] as { total_records: number; tracked_users: number; oldest_record: string | null; newest_record: string | null };
    return { totalRecords: row.total_records || 0, trackedUsers: row.tracked_users || 0, oldestRecord: row.oldest_record || null, newestRecord: row.newest_record || null };
  }

  async getCoordinateHistoryUsers(): Promise<Array<{ userId: string; nickname: string; recordCount: number; lastRecord: string }>> {
    const result = await db.execute(sql`SELECT ch.user_id, u.nickname, COUNT(*)::int as record_count, MAX(ch.created_at)::text as last_record FROM coordinate_history ch JOIN users u ON u.id = ch.user_id GROUP BY ch.user_id, u.nickname ORDER BY last_record DESC`);
    return result.rows.map((r) => {
      const row = r as { user_id: string; nickname: string; record_count: number; last_record: string };
      return { userId: row.user_id, nickname: row.nickname, recordCount: row.record_count, lastRecord: row.last_record };
    });
  }

  async cleanupOldCoordinateHistory(): Promise<number> {
    try {
      const maxRecordsSetting = await this.getAppSetting("coordinate_history_max_records");
      const maxRecords = maxRecordsSetting?.value ? parseInt(maxRecordsSetting.value, 10) : 60;
      const limit = isNaN(maxRecords) || maxRecords < 1 ? 60 : maxRecords;
      const result = await db.execute(sql`DELETE FROM coordinate_history WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn FROM coordinate_history) ranked WHERE rn > ${limit}) RETURNING id`);
      return result.rows.length;
    } catch (err) {
      console.error("[CoordinateHistory] cleanup error:", err);
      return 0;
    }
  }

  async createPlannedRoute(data: InsertPlannedRoute): Promise<PlannedRoute> {
    const [route] = await db.insert(plannedRoutes).values(data).returning();
    return route;
  }

  async getPlannedRoute(id: string): Promise<PlannedRoute | undefined> {
    const [route] = await db.select().from(plannedRoutes).where(eq(plannedRoutes.id, id)).limit(1);
    return route;
  }

  async getPlannedRoutes(userId: string): Promise<PlannedRoute[]> {
    return db.select().from(plannedRoutes).where(eq(plannedRoutes.userId, userId)).orderBy(desc(plannedRoutes.createdAt));
  }

  async getPublicPlannedRoutes(limit = 50): Promise<PlannedRoute[]> {
    return db.select().from(plannedRoutes).where(eq(plannedRoutes.isPublic, true)).orderBy(desc(plannedRoutes.createdAt)).limit(limit);
  }

  async updatePlannedRoute(id: string, data: Partial<InsertPlannedRoute>): Promise<PlannedRoute | undefined> {
    const [route] = await db.update(plannedRoutes).set({ ...data, updatedAt: new Date() }).where(eq(plannedRoutes.id, id)).returning();
    return route;
  }

  async deletePlannedRoute(id: string): Promise<void> {
    await db.delete(plannedRoutes).where(eq(plannedRoutes.id, id));
  }

  async upsertRouteWeatherCache(data: InsertRouteWeatherCache): Promise<RouteWeatherCache> {
    const [existing] = await db.select().from(routeWeatherCache).where(eq(routeWeatherCache.routeId, data.routeId)).limit(1);
    if (existing) {
      const [updated] = await db.update(routeWeatherCache).set({ weatherData: data.weatherData, expiresAt: data.expiresAt }).where(eq(routeWeatherCache.routeId, data.routeId)).returning();
      return updated;
    }
    const [created] = await db.insert(routeWeatherCache).values(data).returning();
    return created;
  }

  async getRouteWeatherCache(routeId: string): Promise<RouteWeatherCache | undefined> {
    const [cache] = await db.select().from(routeWeatherCache).where(eq(routeWeatherCache.routeId, routeId)).limit(1);
    return cache;
  }
}

export const storage = new DatabaseStorage();
