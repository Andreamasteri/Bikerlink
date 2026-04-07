import { eq, and, or, sql, desc, asc, gte, lte, inArray, notInArray } from "drizzle-orm";
import { db, pool } from "./db";
import {
  users,
  userPhotos,
  userMotorcycles,
  userProfiles,
  proposals,
  proposalParticipants,
  conversations,
  conversationParticipants,
  messages,
  routes,
  routePoints,
  photoContestEntries,
  photoVotes,
  dailyVoteCounts,
  photoWinners,
  workshops,
  workshopContacts,
  easterEggs,
  collectedEasterEggs,
  reports,
  moderatorLogs,
  adCampaigns,
  adClicks,
  notifications,
  invitationCodes,
  feedbackTickets,
  appSettings,
  verificationCodes,
  passwordResetTokens,
  phoneSharingTracker,
  motorcyclePhotos,
  zavarrinaWishlists,
  zavarrinaWishlistPhotos,
  zavarrinaWishlistMotos,
  bikerZavarrinaMatches,
  bikerBikerMatches,
  emailVerificationTokens,
  proposalMatches,
  fakeUserInteractions,
  customRoutes,
  customRouteWaypoints,
  userBlocks,
  type User,
  type InsertUser,
  type UserPhoto,
  type InsertUserPhoto,
  type UserMotorcycle,
  type InsertUserMotorcycle,
  type UserProfile,
  type InsertUserProfile,
  type Proposal,
  type InsertProposal,
  type ProposalParticipant,
  type InsertProposalParticipant,
  type Conversation,
  type InsertConversation,
  type ConversationParticipant,
  type InsertConversationParticipant,
  type Message,
  type InsertMessage,
  type Route,
  type InsertRoute,
  type RoutePoint,
  type InsertRoutePoint,
  type PhotoContestEntry,
  type InsertPhotoContestEntry,
  type PhotoVote,
  type InsertPhotoVote,
  type DailyVoteCount,
  type InsertDailyVoteCount,
  type PhotoWinner,
  type InsertPhotoWinner,
  type Workshop,
  type InsertWorkshop,
  type WorkshopContact,
  type InsertWorkshopContact,
  type EasterEgg,
  type InsertEasterEgg,
  type CollectedEasterEgg,
  type InsertCollectedEasterEgg,
  type Report,
  type InsertReport,
  type ModeratorLog,
  type InsertModeratorLog,
  type AdCampaign,
  type InsertAdCampaign,
  type AdClick,
  type InsertAdClick,
  type Notification,
  type InsertNotification,
  type InvitationCode,
  type InsertInvitationCode,
  type FeedbackTicket,
  type InsertFeedbackTicket,
  type AppSetting,
  type InsertAppSetting,
  type VerificationCode,
  type InsertVerificationCode,
  type PhoneSharingTracker,
  type InsertPhoneSharingTracker,
  type MotorcyclePhoto,
  type InsertMotorcyclePhoto,
  type ZavarrinaWishlist,
  type InsertZavarrinaWishlist,
  type ZavarrinaWishlistPhoto,
  type InsertZavarrinaWishlistPhoto,
  type ZavarrinaWishlistMoto,
  type InsertZavarrinaWishlistMoto,
  type BikerZavarrinaMatch,
  type InsertBikerZavarrinaMatch,
  type BikerBikerMatch,
  type InsertBikerBikerMatch,
  type EmailVerificationToken,
  type InsertEmailVerificationToken,
  type ProposalMatch,
  type InsertProposalMatch,
  type FakeUserInteraction,
  type InsertFakeUserInteraction,
  type CustomRoute,
  type InsertCustomRoute,
  type CustomRouteWaypoint,
  type InsertCustomRouteWaypoint,
  sosRequests,
  type SosRequest,
  type InsertSosRequest,
  type UserBlock,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
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

  getConversations(userId: string): Promise<Conversation[]>;
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

  getAppSetting(key: string): Promise<AppSetting | undefined>;
  upsertAppSetting(key: string, value?: string, valueJson?: unknown): Promise<AppSetting>;

  createVerificationCode(code: InsertVerificationCode): Promise<VerificationCode>;
  getNearbyUsers(lat: number, lng: number, radiusKm: number, countries?: string[]): Promise<Array<{
    user: User;
    profile: UserProfile;
    distance: number;
  }>>;
  getUserMotorcycle(id: string): Promise<UserMotorcycle | undefined>;
  getUserPhoto(id: string): Promise<UserPhoto | undefined>;

  getAllUsers(): Promise<User[]>;
  getModeratorLogs(): Promise<ModeratorLog[]>;
  getAllCampaigns(): Promise<AdCampaign[]>;
  deleteEasterEgg(id: string): Promise<void>;
  deleteWorkshop(id: string): Promise<void>;
  deleteCampaign(id: string): Promise<void>;
  getAllAppSettings(): Promise<AppSetting[]>;
  getWorkshopContactsByPeriod(startDate: Date, endDate: Date): Promise<WorkshopContact[]>;
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
  getAvailableBikersList(lat?: number, lng?: number, countries?: string[]): Promise<any[]>;
  getAvailableZavorrinaList(lat?: number, lng?: number, countries?: string[]): Promise<any[]>;

  getMotorcyclePhotos(motorcycleId: string): Promise<MotorcyclePhoto[]>;
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
  getCustomRoute(id: string): Promise<CustomRoute | undefined>;
  createCustomRoute(data: InsertCustomRoute): Promise<CustomRoute>;
  updateCustomRoute(id: string, data: Partial<InsertCustomRoute>): Promise<CustomRoute | undefined>;
  deleteCustomRoute(id: string): Promise<void>;
  getCustomRouteWaypoints(routeId: string): Promise<CustomRouteWaypoint[]>;
  createCustomRouteWaypoint(data: InsertCustomRouteWaypoint): Promise<CustomRouteWaypoint>;
  updateCustomRouteWaypoint(id: string, data: Partial<InsertCustomRouteWaypoint>): Promise<CustomRouteWaypoint | undefined>;
  deleteCustomRouteWaypoint(id: string): Promise<void>;

  createSosRequest(data: InsertSosRequest): Promise<SosRequest>;
  getSosRequest(id: string): Promise<SosRequest | undefined>;
  getActiveSosRequestByUser(userId: string): Promise<SosRequest | undefined>;
  getActiveSosRequests(): Promise<SosRequest[]>;
  updateSosRequest(id: string, data: Partial<InsertSosRequest>): Promise<SosRequest | undefined>;

  blockUser(blockerId: string, blockedId: string): Promise<UserBlock>;
  unblockUser(blockerId: string, blockedId: string): Promise<boolean>;
  isBlocked(userId1: string, userId2: string): Promise<boolean>;
  hasBlockedUser(blockerId: string, blockedId: string): Promise<boolean>;
  getBlockedUserIds(userId: string): Promise<string[]>;
  getBlockedUsersByBlocker(blockerId: string): Promise<Array<{ id: string; nickname: string; userType: string | null; avatarUrl: string | null }>>;
  getAllBlockedPairs(): Promise<Array<{ blockerId: string; blockedId: string }>>;
  deleteBikerBikerMatchesBetween(userId1: string, userId2: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByNickname(nickname: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(sql`LOWER(${users.nickname}) = LOWER(${nickname})`).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(sql`LOWER(${users.email}) = LOWER(${email})`).limit(1);
    return user;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user;
  }

  async getUserPhotos(userId: string): Promise<UserPhoto[]> {
    return db.select().from(userPhotos).where(eq(userPhotos.userId, userId)).orderBy(asc(userPhotos.sortOrder));
  }

  async createUserPhoto(data: InsertUserPhoto): Promise<UserPhoto> {
    const [photo] = await db.insert(userPhotos).values(data).returning();
    return photo;
  }

  async deleteUserPhoto(id: string): Promise<void> {
    await db.delete(userPhotos).where(eq(userPhotos.id, id));
  }

  async getUserPhotoCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(userPhotos).where(eq(userPhotos.userId, userId));
    return result[0]?.count ?? 0;
  }

  async getUserMotorcycles(userId: string): Promise<UserMotorcycle[]> {
    return db.select().from(userMotorcycles).where(eq(userMotorcycles.userId, userId));
  }

  async createUserMotorcycle(data: InsertUserMotorcycle): Promise<UserMotorcycle> {
    const [moto] = await db.insert(userMotorcycles).values(data).returning();
    return moto;
  }

  async updateUserMotorcycle(id: string, data: Partial<InsertUserMotorcycle>): Promise<UserMotorcycle | undefined> {
    const [moto] = await db.update(userMotorcycles).set(data).where(eq(userMotorcycles.id, id)).returning();
    return moto;
  }

  async deleteUserMotorcycle(id: string): Promise<void> {
    await db.delete(userMotorcycles).where(eq(userMotorcycles.id, id));
  }

  async searchUsers(query: string): Promise<{ user: User; profile: UserProfile | null }[]> {
    const pattern = `${query}%`;
    const results = await db
      .select({ user: users, profile: userProfiles })
      .from(users)
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(
        and(
          eq(users.status, "active"),
          sql`${users.nickname} ILIKE ${pattern}`
        )
      )
      .limit(20);
    return results.map(r => ({ user: r.user, profile: r.profile }));
  }

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    return profile;
  }

  async createUserProfile(data: InsertUserProfile): Promise<UserProfile> {
    const [profile] = await db.insert(userProfiles).values(data).returning();
    return profile;
  }

  async updateUserProfile(userId: string, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const [profile] = await db.update(userProfiles).set({ ...data, updatedAt: new Date() }).where(eq(userProfiles.userId, userId)).returning();
    return profile;
  }

  async upsertUserProfile(userId: string, data: Partial<InsertUserProfile>): Promise<UserProfile> {
    const [profile] = await db
      .insert(userProfiles)
      .values({ userId, ...data })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return profile;
  }

  async getProposals(filters?: { status?: string }): Promise<Proposal[]> {
    if (filters?.status) {
      return db.select().from(proposals).where(eq(proposals.status, filters.status)).orderBy(desc(proposals.createdAt));
    }
    return db.select().from(proposals).orderBy(desc(proposals.createdAt));
  }

  async getProposal(id: string): Promise<Proposal | undefined> {
    const [proposal] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
    return proposal;
  }

  async deleteProposal(id: string): Promise<void> {
    await db.delete(proposals).where(eq(proposals.id, id));
  }

  async createProposal(data: InsertProposal): Promise<Proposal> {
    const [proposal] = await db.insert(proposals).values(data).returning();
    return proposal;
  }

  async updateProposal(id: string, data: Partial<InsertProposal>): Promise<Proposal | undefined> {
    const [proposal] = await db.update(proposals).set({ ...data, updatedAt: new Date() }).where(eq(proposals.id, id)).returning();
    return proposal;
  }

  async getProposalParticipants(proposalId: string): Promise<ProposalParticipant[]> {
    return db.select().from(proposalParticipants).where(eq(proposalParticipants.proposalId, proposalId));
  }

  async addProposalParticipant(data: InsertProposalParticipant): Promise<ProposalParticipant> {
    const [participant] = await db.insert(proposalParticipants).values(data).returning();
    return participant;
  }

  async getActiveProposalsWithLocation(): Promise<Proposal[]> {
    const results = await db.select({ proposal: proposals, role: users.role })
      .from(proposals)
      .innerJoin(users, eq(users.id, proposals.userId))
      .where(
        and(
          eq(proposals.status, "active"),
          sql`${proposals.departureLatitude} IS NOT NULL`,
          sql`${proposals.departureLongitude} IS NOT NULL`,
          sql`${proposals.searchType} IS NOT NULL`,
          notInArray(users.role, ["admin", "moderator", "moderatore"])
        )
      );
    return results.map(r => r.proposal);
  }

  async getProposalMatches(userId: string): Promise<ProposalMatch[]> {
    return db.select().from(proposalMatches).where(
      or(
        eq(proposalMatches.userId1, userId),
        eq(proposalMatches.userId2, userId)
      )
    ).orderBy(desc(proposalMatches.createdAt));
  }

  async getProposalMatch(id: string): Promise<ProposalMatch | undefined> {
    const [match] = await db.select().from(proposalMatches).where(eq(proposalMatches.id, id));
    return match;
  }

  async createProposalMatch(data: InsertProposalMatch): Promise<ProposalMatch> {
    const [match] = await db.insert(proposalMatches).values(data).returning();
    return match;
  }

  async updateProposalMatch(id: string, data: Partial<InsertProposalMatch>): Promise<ProposalMatch | undefined> {
    const [match] = await db.update(proposalMatches).set(data).where(eq(proposalMatches.id, id)).returning();
    return match;
  }

  async deleteProposalMatch(id: string, userId: string): Promise<boolean> {
    const [match] = await db.select().from(proposalMatches).where(eq(proposalMatches.id, id));
    if (!match) return false;
    if (match.userId1 !== userId && match.userId2 !== userId) return false;
    await db.delete(proposalMatches).where(eq(proposalMatches.id, id));
    return true;
  }

  async deleteRejectedProposalMatches(userId: string): Promise<number> {
    const rejected = await db.select().from(proposalMatches).where(
      and(
        or(eq(proposalMatches.userId1, userId), eq(proposalMatches.userId2, userId)),
        eq(proposalMatches.status, "rejected")
      )
    );
    if (rejected.length === 0) return 0;
    await db.delete(proposalMatches).where(
      and(
        or(eq(proposalMatches.userId1, userId), eq(proposalMatches.userId2, userId)),
        eq(proposalMatches.status, "rejected")
      )
    );
    return rejected.length;
  }

  async deletePendingProposalMatches(userId: string): Promise<number> {
    const pending = await db.select().from(proposalMatches).where(
      and(
        or(eq(proposalMatches.userId1, userId), eq(proposalMatches.userId2, userId)),
        eq(proposalMatches.status, "pending")
      )
    );
    if (pending.length === 0) return 0;
    await db.delete(proposalMatches).where(
      and(
        or(eq(proposalMatches.userId1, userId), eq(proposalMatches.userId2, userId)),
        eq(proposalMatches.status, "pending")
      )
    );
    return pending.length;
  }

  async findExistingMatch(proposalId1: string, proposalId2: string): Promise<ProposalMatch | undefined> {
    const [match] = await db.select().from(proposalMatches).where(
      or(
        and(eq(proposalMatches.proposalId1, proposalId1), eq(proposalMatches.proposalId2, proposalId2)),
        and(eq(proposalMatches.proposalId1, proposalId2), eq(proposalMatches.proposalId2, proposalId1))
      )
    );
    return match;
  }

  async expireOldProposals(): Promise<number> {
    const now = new Date();
    const result = await db.update(proposals)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          eq(proposals.status, "active"),
          sql`${proposals.expiresAt} IS NOT NULL`,
          lte(proposals.expiresAt, now)
        )
      )
      .returning();
    if (result.length > 0) {
      const expiredIds = result.map(p => p.id);
      await db.update(proposalMatches)
        .set({ status: "expired" })
        .where(
          and(
            eq(proposalMatches.status, "pending"),
            sql`${proposalMatches.proposalId1} = ANY(${expiredIds})`,
            sql`${proposalMatches.proposalId2} = ANY(${expiredIds})`
          )
        );
    }
    return result.length;
  }

  async deleteExpiredProposals(): Promise<number> {
    const expiredProposalsList = await db.select({ id: proposals.id })
      .from(proposals)
      .where(eq(proposals.status, "expired"));

    if (expiredProposalsList.length === 0) return 0;

    const expiredIds = expiredProposalsList.map(p => p.id);

    await db.delete(proposalMatches).where(
      or(
        inArray(proposalMatches.proposalId1, expiredIds),
        inArray(proposalMatches.proposalId2, expiredIds)
      )
    );

    await db.delete(proposalParticipants).where(
      inArray(proposalParticipants.proposalId, expiredIds)
    );

    const deleted = await db.delete(proposals)
      .where(eq(proposals.status, "expired"))
      .returning();

    return deleted.length;
  }

  async getConversations(userId: string): Promise<Conversation[]> {
    const participantRows = await db.select().from(conversationParticipants).where(eq(conversationParticipants.userId, userId));
    if (participantRows.length === 0) return [];
    const convIds = participantRows.map((p) => p.conversationId);
    return db.select().from(conversations).where(inArray(conversations.id, convIds)).orderBy(desc(conversations.updatedAt));
  }

  async getAllConversations(): Promise<Conversation[]> {
    return db.select().from(conversations).orderBy(desc(conversations.updatedAt));
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return conv;
  }

  async createConversation(data: InsertConversation): Promise<Conversation> {
    const [conv] = await db.insert(conversations).values(data).returning();
    return conv;
  }

  async deleteConversation(id: string): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversationParticipants).where(eq(conversationParticipants.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async getConversationParticipants(conversationId: string): Promise<ConversationParticipant[]> {
    return db.select().from(conversationParticipants).where(eq(conversationParticipants.conversationId, conversationId));
  }

  async addConversationParticipant(data: InsertConversationParticipant): Promise<ConversationParticipant> {
    const [participant] = await db.insert(conversationParticipants).values(data).returning();
    return participant;
  }

  async getMessages(conversationId: string, limit = 50, offset = 0): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.createdAt)).limit(limit).offset(offset);
  }

  async createMessage(data: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(data).returning();
    return message;
  }

  async updateConversationLastRead(conversationId: string, userId: string): Promise<void> {
    await db.update(conversationParticipants).set({ lastReadAt: new Date() }).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)));
  }

  async updateConversationTimestamp(conversationId: string): Promise<void> {
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
  }

  async getRoutes(userId: string): Promise<Route[]> {
    return db.select().from(routes).where(eq(routes.userId, userId)).orderBy(desc(routes.createdAt));
  }

  async getAllRoutes(): Promise<Route[]> {
    return db.select().from(routes).orderBy(desc(routes.createdAt));
  }

  async getRoute(id: string): Promise<Route | undefined> {
    const [route] = await db.select().from(routes).where(eq(routes.id, id)).limit(1);
    return route;
  }

  async createRoute(data: InsertRoute): Promise<Route> {
    const [route] = await db.insert(routes).values(data).returning();
    return route;
  }

  async updateRoute(id: string, data: Partial<InsertRoute>): Promise<Route | undefined> {
    const [route] = await db.update(routes).set(data).where(eq(routes.id, id)).returning();
    return route;
  }

  async getRoutePoints(routeId: string): Promise<RoutePoint[]> {
    return db.select().from(routePoints).where(eq(routePoints.routeId, routeId)).orderBy(asc(routePoints.timestamp));
  }

  async createRoutePoints(data: InsertRoutePoint[]): Promise<RoutePoint[]> {
    if (data.length === 0) return [];
    return db.insert(routePoints).values(data).returning();
  }

  async getPhotoContestEntries(weekNumber: number, year: number): Promise<PhotoContestEntry[]> {
    return db.select().from(photoContestEntries).where(and(eq(photoContestEntries.weekNumber, weekNumber), eq(photoContestEntries.year, year))).orderBy(desc(photoContestEntries.votesCount));
  }

  async createPhotoContestEntry(data: InsertPhotoContestEntry): Promise<PhotoContestEntry> {
    const [entry] = await db.insert(photoContestEntries).values(data).returning();
    return entry;
  }

  async deletePhotoContestEntry(id: string): Promise<void> {
    await db.delete(photoContestEntries).where(eq(photoContestEntries.id, id));
  }

  async createPhotoVote(data: InsertPhotoVote): Promise<PhotoVote> {
    const [vote] = await db.insert(photoVotes).values(data).returning();
    return vote;
  }

  async getPhotoVote(entryId: string, userId: string): Promise<PhotoVote | undefined> {
    const [vote] = await db.select().from(photoVotes).where(and(eq(photoVotes.entryId, entryId), eq(photoVotes.userId, userId))).limit(1);
    return vote;
  }

  async getDailyVoteCount(userId: string, voteDate: string): Promise<DailyVoteCount | undefined> {
    const [row] = await db.select().from(dailyVoteCounts).where(and(eq(dailyVoteCounts.userId, userId), eq(dailyVoteCounts.voteDate, voteDate))).limit(1);
    return row;
  }

  async upsertDailyVoteCount(userId: string, voteDate: string): Promise<void> {
    await db.insert(dailyVoteCounts).values({ userId, voteDate, count: 1 }).onConflictDoUpdate({
      target: [dailyVoteCounts.userId, dailyVoteCounts.voteDate],
      set: { count: sql`${dailyVoteCounts.count} + 1` },
    });
  }

  async incrementEntryVotes(entryId: string): Promise<void> {
    await db.update(photoContestEntries).set({ votesCount: sql`${photoContestEntries.votesCount} + 1` }).where(eq(photoContestEntries.id, entryId));
  }

  async getPhotoWinners(): Promise<PhotoWinner[]> {
    return db.select().from(photoWinners).orderBy(desc(photoWinners.year), desc(photoWinners.weekNumber));
  }

  async createPhotoWinner(data: InsertPhotoWinner): Promise<PhotoWinner> {
    const [winner] = await db.insert(photoWinners).values(data).returning();
    return winner;
  }

  async getWorkshops(approved?: boolean): Promise<Workshop[]> {
    if (approved !== undefined) {
      return db.select().from(workshops).where(eq(workshops.isApproved, approved));
    }
    return db.select().from(workshops);
  }

  async getWorkshop(id: string): Promise<Workshop | undefined> {
    const [workshop] = await db.select().from(workshops).where(eq(workshops.id, id)).limit(1);
    return workshop;
  }

  async createWorkshop(data: InsertWorkshop): Promise<Workshop> {
    const [workshop] = await db.insert(workshops).values(data).returning();
    return workshop;
  }

  async updateWorkshop(id: string, data: Partial<InsertWorkshop>): Promise<Workshop | undefined> {
    const [workshop] = await db.update(workshops).set({ ...data, updatedAt: new Date() }).where(eq(workshops.id, id)).returning();
    return workshop;
  }

  async createWorkshopContact(data: InsertWorkshopContact): Promise<WorkshopContact> {
    const [contact] = await db.insert(workshopContacts).values(data).returning();
    return contact;
  }

  async getEasterEggs(active?: boolean): Promise<EasterEgg[]> {
    if (active !== undefined) {
      return db.select().from(easterEggs).where(eq(easterEggs.isActive, active));
    }
    return db.select().from(easterEggs);
  }

  async getEasterEgg(id: string): Promise<EasterEgg | undefined> {
    const [egg] = await db.select().from(easterEggs).where(eq(easterEggs.id, id)).limit(1);
    return egg;
  }

  async createEasterEgg(data: InsertEasterEgg): Promise<EasterEgg> {
    const [egg] = await db.insert(easterEggs).values(data).returning();
    return egg;
  }

  async updateEasterEgg(id: string, data: Partial<InsertEasterEgg>): Promise<EasterEgg | undefined> {
    const [egg] = await db.update(easterEggs).set(data).where(eq(easterEggs.id, id)).returning();
    return egg;
  }

  async collectEasterEgg(data: InsertCollectedEasterEgg): Promise<CollectedEasterEgg> {
    const [collected] = await db.insert(collectedEasterEggs).values(data).returning();
    return collected;
  }

  async getCollectedEasterEggs(userId: string): Promise<CollectedEasterEgg[]> {
    return db.select().from(collectedEasterEggs).where(eq(collectedEasterEggs.userId, userId));
  }

  async hasCollectedEasterEgg(easterEggId: string, userId: string): Promise<boolean> {
    const [row] = await db.select().from(collectedEasterEggs).where(and(eq(collectedEasterEggs.easterEggId, easterEggId), eq(collectedEasterEggs.userId, userId))).limit(1);
    return !!row;
  }

  async getReports(status?: string): Promise<Report[]> {
    if (status) {
      return db.select().from(reports).where(eq(reports.status, status)).orderBy(desc(reports.createdAt));
    }
    return db.select().from(reports).orderBy(desc(reports.createdAt));
  }

  async createReport(data: InsertReport): Promise<Report> {
    const [report] = await db.insert(reports).values(data).returning();
    return report;
  }

  async updateReport(id: string, data: Partial<InsertReport>): Promise<Report | undefined> {
    const [report] = await db.update(reports).set(data).where(eq(reports.id, id)).returning();
    return report;
  }

  async createModeratorLog(data: InsertModeratorLog): Promise<ModeratorLog> {
    const [log] = await db.insert(moderatorLogs).values(data).returning();
    return log;
  }

  async getActiveCampaigns(): Promise<AdCampaign[]> {
    return db.select().from(adCampaigns).where(eq(adCampaigns.isActive, true));
  }

  async getActiveAdsByUserType(userType: string): Promise<AdCampaign[]> {
    return db.select().from(adCampaigns).where(and(eq(adCampaigns.isActive, true), or(eq(adCampaigns.targetUserType, userType), eq(adCampaigns.targetUserType, "tutti")))).orderBy(asc(adCampaigns.sortOrder));
  }

  async getAdCampaign(id: string): Promise<AdCampaign | undefined> {
    const [campaign] = await db.select().from(adCampaigns).where(eq(adCampaigns.id, id)).limit(1);
    return campaign;
  }

  async createAdCampaign(data: InsertAdCampaign): Promise<AdCampaign> {
    const [campaign] = await db.insert(adCampaigns).values(data).returning();
    return campaign;
  }

  async updateAdCampaign(id: string, data: Partial<InsertAdCampaign>): Promise<AdCampaign | undefined> {
    const [campaign] = await db.update(adCampaigns).set(data).where(eq(adCampaigns.id, id)).returning();
    return campaign;
  }

  async createAdClick(data: InsertAdClick): Promise<AdClick> {
    const [click] = await db.insert(adClicks).values(data).returning();
    return click;
  }

  async incrementCampaignImpressions(id: string): Promise<void> {
    await db.update(adCampaigns).set({ impressions: sql`${adCampaigns.impressions} + 1` }).where(eq(adCampaigns.id, id));
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(data).returning();
    return notification;
  }

  async markNotificationRead(id: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }

  async getInvitationCodes(): Promise<InvitationCode[]> {
    return db.select().from(invitationCodes).orderBy(desc(invitationCodes.createdAt));
  }

  async getInvitationCode(code: string): Promise<InvitationCode | undefined> {
    const [row] = await db.select().from(invitationCodes).where(eq(invitationCodes.code, code)).limit(1);
    return row;
  }

  async getInvitationCodeById(id: string): Promise<InvitationCode | undefined> {
    const [row] = await db.select().from(invitationCodes).where(eq(invitationCodes.id, id)).limit(1);
    return row;
  }

  async createInvitationCode(data: InsertInvitationCode): Promise<InvitationCode> {
    const [code] = await db.insert(invitationCodes).values(data).returning();
    return code;
  }

  async updateInvitationCode(id: string, data: Partial<InsertInvitationCode>): Promise<InvitationCode> {
    const [updated] = await db.update(invitationCodes).set(data).where(eq(invitationCodes.id, id)).returning();
    return updated;
  }

  async deleteInvitationCode(id: string): Promise<void> {
    await db.delete(invitationCodes).where(eq(invitationCodes.id, id));
  }

  async incrementInvitationCodeUses(id: string): Promise<void> {
    await db.update(invitationCodes).set({ currentUses: sql`${invitationCodes.currentUses} + 1` }).where(eq(invitationCodes.id, id));
  }

  async countUsersWithInvitationCode(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(users).where(sql`${users.invitationCode} IS NOT NULL AND ${users.invitationCode} != ''`);
    return Number(row?.count ?? 0);
  }

  async countUsersByInvitationCode(code: string): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.invitationCode, code));
    return Number(row?.count ?? 0);
  }

  async getFeedbackTickets(): Promise<FeedbackTicket[]> {
    return db.select().from(feedbackTickets).orderBy(desc(feedbackTickets.createdAt));
  }

  async createFeedbackTicket(data: InsertFeedbackTicket): Promise<FeedbackTicket> {
    const [ticket] = await db.insert(feedbackTickets).values(data).returning();
    return ticket;
  }

  async getAppSetting(key: string): Promise<AppSetting | undefined> {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    return setting;
  }

  async upsertAppSetting(key: string, value?: string, valueJson?: unknown): Promise<AppSetting> {
    const [setting] = await db.insert(appSettings).values({ key, value, valueJson, updatedAt: new Date() }).onConflictDoUpdate({
      target: [appSettings.key],
      set: { value, valueJson, updatedAt: new Date() },
    }).returning();
    return setting;
  }

  async createVerificationCode(data: InsertVerificationCode): Promise<VerificationCode> {
    const [code] = await db.insert(verificationCodes).values(data).returning();
    return code;
  }

  async getNearbyUsers(lat: number, lng: number, radiusKm: number, countries?: string[]): Promise<Array<{ user: User; profile: UserProfile; distance: number }>> {
    const conditions = [
      eq(users.status, "active"),
      eq(users.ghostMode, false),
      notInArray(users.role, ["admin", "moderator", "moderatore"]),
      sql`${userProfiles.latitude} IS NOT NULL`,
      sql`${userProfiles.longitude} IS NOT NULL`,
    ];
    if (countries && countries.length > 0) {
      conditions.push(or(inArray(users.country, countries), sql`${users.country} IS NULL`)!);
    }
    const results = await db
      .select({
        user: users,
        profile: userProfiles,
        distance: sql<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance"),
      })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(and(...conditions))
      .orderBy(sql`distance`);
    return results;
  }

  async getUserMotorcycle(id: string): Promise<UserMotorcycle | undefined> {
    const [moto] = await db.select().from(userMotorcycles).where(eq(userMotorcycles.id, id)).limit(1);
    return moto;
  }

  async getUserPhoto(id: string): Promise<UserPhoto | undefined> {
    const [photo] = await db.select().from(userPhotos).where(eq(userPhotos.id, id)).limit(1);
    return photo;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getModeratorLogs(): Promise<ModeratorLog[]> {
    return db.select().from(moderatorLogs).orderBy(desc(moderatorLogs.createdAt));
  }

  async getAllCampaigns(): Promise<AdCampaign[]> {
    return db.select().from(adCampaigns).orderBy(desc(adCampaigns.createdAt));
  }

  async deleteEasterEgg(id: string): Promise<void> {
    await db.delete(easterEggs).where(eq(easterEggs.id, id));
  }

  async deleteWorkshop(id: string): Promise<void> {
    await db.delete(workshops).where(eq(workshops.id, id));
  }

  async deleteCampaign(id: string): Promise<void> {
    await db.delete(adCampaigns).where(eq(adCampaigns.id, id));
  }

  async getAllAppSettings(): Promise<AppSetting[]> {
    return db.select().from(appSettings);
  }

  async getWorkshopContactsByPeriod(startDate: Date, endDate: Date): Promise<WorkshopContact[]> {
    return db.select().from(workshopContacts).where(and(gte(workshopContacts.createdAt, startDate), lte(workshopContacts.createdAt, endDate)));
  }

  async countUsers(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    return result[0]?.count ?? 0;
  }

  async countActiveUsers(since: Date): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(and(eq(users.status, "active"), eq(users.isFake, false), gte(users.lastLoginAt, since)));
    return result[0]?.count ?? 0;
  }

  async countOnlineUsers(since: Date, countries?: string[]): Promise<number> {
    const conditions: any[] = [eq(users.status, "active"), gte(users.lastLoginAt, since), eq(users.ghostMode, false)];
    if (countries && countries.length > 0) conditions.push(inArray(users.country, countries));
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(and(...conditions));
    return result[0]?.count ?? 0;
  }

  async countAvailableUsers(): Promise<number> {
    const conditions = [eq(users.status, "active"), eq(userProfiles.isAvailable, true), eq(users.ghostMode, false)];
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(userProfiles).innerJoin(users, eq(users.id, userProfiles.userId)).where(and(...conditions));
    return result[0]?.count ?? 0;
  }

  async getOnlineUsersList(since: Date, lat?: number, lng?: number, countries?: string[]): Promise<any[]> {
    const distanceExpr = lat != null && lng != null
      ? sql<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance")
      : sql<number>`0`.as("distance");
    const conditions: any[] = [eq(users.status, "active"), gte(users.lastLoginAt, since), eq(users.ghostMode, false), notInArray(users.role, ["admin", "moderator", "moderatore"])];
    if (countries && countries.length > 0) {
      conditions.push(inArray(users.country, countries));
    }
    const results = await db
      .select({ user: users, profile: userProfiles, distance: distanceExpr })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(...conditions))
      .orderBy(sql`distance`);
    return results;
  }

  async getAvailableUsersList(lat?: number, lng?: number): Promise<any[]> {
    const distanceExpr = lat != null && lng != null
      ? sql<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance")
      : sql<number>`0`.as("distance");
    const results = await db
      .select({ user: users, profile: userProfiles, distance: distanceExpr })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(and(eq(users.status, "active"), eq(userProfiles.isAvailable, true), eq(users.ghostMode, false), notInArray(users.role, ["admin", "moderator", "moderatore"])))
      .orderBy(sql`distance`);
    return results;
  }

  async getUnapprovedUserPhotos(): Promise<UserPhoto[]> {
    return db.select().from(userPhotos).where(eq(userPhotos.isApproved, false)).orderBy(asc(userPhotos.createdAt));
  }

  async updateUserPhotoApproval(id: string, approved: boolean): Promise<UserPhoto | undefined> {
    const [photo] = await db.update(userPhotos).set({ isApproved: approved }).where(eq(userPhotos.id, id)).returning();
    return photo;
  }

  async getUnapprovedContestEntries(): Promise<PhotoContestEntry[]> {
    return db.select().from(photoContestEntries).where(eq(photoContestEntries.isApproved, false)).orderBy(asc(photoContestEntries.createdAt));
  }

  async updateContestEntryApproval(id: string, approved: boolean): Promise<PhotoContestEntry | undefined> {
    const [entry] = await db.update(photoContestEntries).set({ isApproved: approved }).where(eq(photoContestEntries.id, id)).returning();
    return entry;
  }

  async getPhotoContestEntry(id: string): Promise<PhotoContestEntry | undefined> {
    const [entry] = await db.select().from(photoContestEntries).where(eq(photoContestEntries.id, id)).limit(1);
    return entry;
  }
  async getPhoneSharedCount(conversationId: string, userId: string): Promise<number> {
    const [row] = await db.select().from(phoneSharingTracker).where(and(eq(phoneSharingTracker.conversationId, conversationId), eq(phoneSharingTracker.userId, userId))).limit(1);
    return row?.sharedCount ?? 0;
  }

  async incrementPhoneSharedCount(conversationId: string, userId: string): Promise<void> {
    await db.insert(phoneSharingTracker).values({ conversationId, userId, sharedCount: 1 }).onConflictDoUpdate({
      target: [phoneSharingTracker.conversationId, phoneSharingTracker.userId],
      set: { sharedCount: sql`${phoneSharingTracker.sharedCount} + 1` },
    });
  }

  async createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
  }

  async getPasswordResetToken(token: string) {
    const [row] = await db.select().from(passwordResetTokens).where(and(eq(passwordResetTokens.token, token), eq(passwordResetTokens.used, false))).limit(1);
    return row;
  }

  async getPasswordResetTokenByCode(userId: string, code: string) {
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, userId), eq(passwordResetTokens.token, code), eq(passwordResetTokens.used, false)))
      .limit(1);
    return row;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.token, token));
  }

  async markPasswordResetTokenUsedById(id: string): Promise<void> {
    await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.id, id));
  }

  async deletePasswordResetTokens(userId: string): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  }

  async getMotorcyclePhotos(motorcycleId: string): Promise<MotorcyclePhoto[]> {
    return db.select().from(motorcyclePhotos).where(eq(motorcyclePhotos.motorcycleId, motorcycleId)).orderBy(asc(motorcyclePhotos.sortOrder));
  }

  async addMotorcyclePhoto(data: InsertMotorcyclePhoto): Promise<MotorcyclePhoto> {
    const [photo] = await db.insert(motorcyclePhotos).values(data).returning();
    return photo;
  }

  async deleteMotorcyclePhoto(id: string): Promise<void> {
    await db.delete(motorcyclePhotos).where(eq(motorcyclePhotos.id, id));
  }

  async getMotorcyclePhotoCount(motorcycleId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(motorcyclePhotos).where(eq(motorcyclePhotos.motorcycleId, motorcycleId));
    return Number(result[0]?.count ?? 0);
  }

  async getWishlist(userId: string): Promise<ZavarrinaWishlist | undefined> {
    const [wl] = await db.select().from(zavarrinaWishlists).where(eq(zavarrinaWishlists.userId, userId)).limit(1);
    return wl;
  }

  async createOrUpdateWishlist(userId: string, description: string): Promise<ZavarrinaWishlist> {
    const existing = await this.getWishlist(userId);
    if (existing) {
      const [wl] = await db.update(zavarrinaWishlists).set({ description, updatedAt: new Date() }).where(eq(zavarrinaWishlists.id, existing.id)).returning();
      return wl;
    }
    const [wl] = await db.insert(zavarrinaWishlists).values({ userId, description }).returning();
    return wl;
  }

  async getWishlistPhotos(wishlistId: string): Promise<ZavarrinaWishlistPhoto[]> {
    return db.select().from(zavarrinaWishlistPhotos).where(eq(zavarrinaWishlistPhotos.wishlistId, wishlistId)).orderBy(asc(zavarrinaWishlistPhotos.sortOrder));
  }

  async addWishlistPhoto(data: InsertZavarrinaWishlistPhoto): Promise<ZavarrinaWishlistPhoto> {
    const [photo] = await db.insert(zavarrinaWishlistPhotos).values(data).returning();
    return photo;
  }

  async deleteWishlistPhoto(id: string): Promise<void> {
    await db.delete(zavarrinaWishlistPhotos).where(eq(zavarrinaWishlistPhotos.id, id));
  }

  async getWishlistPhotoCount(wishlistId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(zavarrinaWishlistPhotos).where(eq(zavarrinaWishlistPhotos.wishlistId, wishlistId));
    return Number(result[0]?.count ?? 0);
  }

  async getWishlistMoto(id: string): Promise<ZavarrinaWishlistMoto | undefined> {
    const [moto] = await db.select().from(zavarrinaWishlistMotos).where(eq(zavarrinaWishlistMotos.id, id)).limit(1);
    return moto;
  }

  async getWishlistMotos(wishlistId: string): Promise<ZavarrinaWishlistMoto[]> {
    return db.select().from(zavarrinaWishlistMotos).where(eq(zavarrinaWishlistMotos.wishlistId, wishlistId));
  }

  async addWishlistMoto(data: InsertZavarrinaWishlistMoto): Promise<ZavarrinaWishlistMoto> {
    const [moto] = await db.insert(zavarrinaWishlistMotos).values(data).returning();
    return moto;
  }

  async updateWishlistMoto(id: string, data: Partial<InsertZavarrinaWishlistMoto>): Promise<ZavarrinaWishlistMoto | undefined> {
    const [moto] = await db.update(zavarrinaWishlistMotos).set(data).where(eq(zavarrinaWishlistMotos.id, id)).returning();
    return moto;
  }

  async deleteWishlistMoto(id: string): Promise<void> {
    await db.delete(zavarrinaWishlistMotos).where(eq(zavarrinaWishlistMotos.id, id));
  }

  async getWishlistMotoCount(wishlistId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(zavarrinaWishlistMotos).where(eq(zavarrinaWishlistMotos.wishlistId, wishlistId));
    return Number(result[0]?.count ?? 0);
  }

  async findMatchingWishlistMotos(brand: string, model: string, ridingStyle: string, motorcycleType: string): Promise<Array<ZavarrinaWishlistMoto & { userId: string }>> {
    const brandModelMatch = and(
      sql`${zavarrinaWishlistMotos.brand} IS NOT NULL AND ${zavarrinaWishlistMotos.brand} != ''`,
      sql`${zavarrinaWishlistMotos.model} IS NOT NULL AND ${zavarrinaWishlistMotos.model} != ''`,
      sql`LOWER(${zavarrinaWishlistMotos.brand}) = LOWER(${brand})`,
      sql`(LOWER(${zavarrinaWishlistMotos.model}) LIKE '%' || LOWER(${model}) || '%' OR LOWER(${model}) LIKE '%' || LOWER(${zavarrinaWishlistMotos.model}) || '%')`,
      sql`LOWER(${zavarrinaWishlistMotos.ridingStyle}) = LOWER(${ridingStyle})`,
    );
    const typeMatch = and(
      sql`(${zavarrinaWishlistMotos.brand} IS NULL OR ${zavarrinaWishlistMotos.brand} = '')`,
      sql`(${zavarrinaWishlistMotos.model} IS NULL OR ${zavarrinaWishlistMotos.model} = '')`,
      sql`${zavarrinaWishlistMotos.motorcycleType} IS NOT NULL AND ${zavarrinaWishlistMotos.motorcycleType} != ''`,
      sql`LOWER(${zavarrinaWishlistMotos.motorcycleType}) = LOWER(${motorcycleType})`,
      sql`LOWER(${zavarrinaWishlistMotos.ridingStyle}) = LOWER(${ridingStyle})`,
    );
    const results = await db.select({
      id: zavarrinaWishlistMotos.id,
      wishlistId: zavarrinaWishlistMotos.wishlistId,
      brand: zavarrinaWishlistMotos.brand,
      model: zavarrinaWishlistMotos.model,
      motorcycleType: zavarrinaWishlistMotos.motorcycleType,
      ridingStyle: zavarrinaWishlistMotos.ridingStyle,
      createdAt: zavarrinaWishlistMotos.createdAt,
      userId: zavarrinaWishlists.userId,
    }).from(zavarrinaWishlistMotos)
      .innerJoin(zavarrinaWishlists, eq(zavarrinaWishlistMotos.wishlistId, zavarrinaWishlists.id))
      .where(or(brandModelMatch, typeMatch));
    return results;
  }

  async findMatchingBikerMotos(brand: string, model: string, ridingStyle: string, motorcycleType: string): Promise<UserMotorcycle[]> {
    if (brand && model) {
      return db.select().from(userMotorcycles).where(and(
        sql`LOWER(${userMotorcycles.brand}) = LOWER(${brand})`,
        sql`(LOWER(${userMotorcycles.model}) LIKE '%' || LOWER(${model}) || '%' OR LOWER(${model}) LIKE '%' || LOWER(${userMotorcycles.model}) || '%')`,
        sql`LOWER(${userMotorcycles.ridingStyle}) = LOWER(${ridingStyle})`,
      ));
    }
    if (motorcycleType) {
      return db.select().from(userMotorcycles).where(and(
        sql`LOWER(${userMotorcycles.motorcycleType}) = LOWER(${motorcycleType})`,
        sql`LOWER(${userMotorcycles.ridingStyle}) = LOWER(${ridingStyle})`,
      ));
    }
    return [];
  }

  async createMatch(data: InsertBikerZavarrinaMatch): Promise<BikerZavarrinaMatch | null> {
    const [match] = await db.insert(bikerZavarrinaMatches).values(data).onConflictDoNothing().returning();
    return match ?? null;
  }

  async getMatchesForUser(userId: string): Promise<BikerZavarrinaMatch[]> {
    return db.select().from(bikerZavarrinaMatches).where(
      or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId))
    ).orderBy(
      sql`CASE WHEN ${bikerZavarrinaMatches.status} = 'accepted' THEN 0 WHEN ${bikerZavarrinaMatches.status} = 'new' THEN 1 ELSE 2 END`,
      desc(bikerZavarrinaMatches.createdAt)
    ).limit(200);
  }

  async getGarageMatch(id: string): Promise<BikerZavarrinaMatch | undefined> {
    const [match] = await db.select().from(bikerZavarrinaMatches).where(eq(bikerZavarrinaMatches.id, id));
    return match;
  }

  async updateGarageMatch(id: string, data: Partial<InsertBikerZavarrinaMatch>): Promise<BikerZavarrinaMatch | undefined> {
    const [updated] = await db.update(bikerZavarrinaMatches).set(data).where(eq(bikerZavarrinaMatches.id, id)).returning();
    return updated;
  }

  async deleteGarageMatch(id: string, userId: string): Promise<boolean> {
    const [match] = await db.select().from(bikerZavarrinaMatches).where(eq(bikerZavarrinaMatches.id, id));
    if (!match) return false;
    if (match.bikerId !== userId && match.zavarrinaId !== userId) return false;
    await db.delete(bikerZavarrinaMatches).where(eq(bikerZavarrinaMatches.id, id));
    return true;
  }

  async resetGarageMatchToNew(id: string, userId: string): Promise<boolean> {
    const [match] = await db.select().from(bikerZavarrinaMatches).where(eq(bikerZavarrinaMatches.id, id));
    if (!match) return false;
    if (match.bikerId !== userId && match.zavarrinaId !== userId) return false;
    await this.updateGarageMatch(id, { status: "new" });
    return true;
  }

  async deleteRejectedGarageMatches(userId: string): Promise<number> {
    const rejected = await db.select().from(bikerZavarrinaMatches).where(
      and(
        or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId)),
        eq(bikerZavarrinaMatches.status, "rejected")
      )
    );
    if (rejected.length === 0) return 0;
    await db.delete(bikerZavarrinaMatches).where(
      and(
        or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId)),
        eq(bikerZavarrinaMatches.status, "rejected")
      )
    );
    return rejected.length;
  }

  async deleteNewGarageMatches(userId: string): Promise<number> {
    const newMatches = await db.select().from(bikerZavarrinaMatches).where(
      and(
        or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId)),
        eq(bikerZavarrinaMatches.status, "new")
      )
    );
    if (newMatches.length === 0) return 0;
    await db.delete(bikerZavarrinaMatches).where(
      and(
        or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId)),
        eq(bikerZavarrinaMatches.status, "new")
      )
    );
    return newMatches.length;
  }

  async getAllWishlistMotosWithUsers(countries?: string[]): Promise<{ wishlistMoto: any; userId: string }[]> {
    const baseCondition = notInArray(users.role, ["admin", "moderator", "moderatore"]);
    const condition = countries && countries.length > 0
      ? and(baseCondition, inArray(users.country, countries))
      : baseCondition;
    return db.select({
      wishlistMoto: zavarrinaWishlistMotos,
      userId: zavarrinaWishlists.userId,
    }).from(zavarrinaWishlistMotos)
      .innerJoin(zavarrinaWishlists, eq(zavarrinaWishlists.id, zavarrinaWishlistMotos.wishlistId))
      .innerJoin(users, eq(users.id, zavarrinaWishlists.userId))
      .where(condition);
  }

  async getAllBikerMotorcyclesWithUsers(countries?: string[]): Promise<{ motorcycle: any; userId: string }[]> {
    const baseCondition = and(
      or(eq(users.userType, "biker"), eq(users.userType, "coppia"))!,
      notInArray(users.role, ["admin", "moderator", "moderatore"])
    )!;
    const condition = countries && countries.length > 0
      ? and(baseCondition, inArray(users.country, countries))
      : baseCondition;
    const results = await db.select({
      motorcycle: userMotorcycles,
      userId: userMotorcycles.userId,
    }).from(userMotorcycles)
      .innerJoin(users, eq(users.id, userMotorcycles.userId))
      .where(condition);
    return results;
  }

  async findExistingBikerZavarrinaMatch(bikerId: string, zavarrinaId: string, bikerMotorcycleId: string, wishlistMotoId: string): Promise<BikerZavarrinaMatch | undefined> {
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

  async getAllExistingBikerZavarrinaMatchKeys(): Promise<Set<string>> {
    const rows = await db.select({
      bikerId: bikerZavarrinaMatches.bikerId,
      zavarrinaId: bikerZavarrinaMatches.zavarrinaId,
      bikerMotorcycleId: bikerZavarrinaMatches.bikerMotorcycleId,
      wishlistMotoId: bikerZavarrinaMatches.wishlistMotoId,
    }).from(bikerZavarrinaMatches);
    const keys = new Set<string>();
    for (const r of rows) {
      keys.add(`${r.bikerId}:${r.zavarrinaId}:${r.bikerMotorcycleId}:${r.wishlistMotoId}`);
    }
    return keys;
  }

  async getAllExistingProposalMatchKeys(): Promise<Set<string>> {
    const rows = await db.select({
      proposalId1: proposalMatches.proposalId1,
      proposalId2: proposalMatches.proposalId2,
    }).from(proposalMatches);
    const keys = new Set<string>();
    for (const r of rows) {
      keys.add(`${r.proposalId1}:${r.proposalId2}`);
      keys.add(`${r.proposalId2}:${r.proposalId1}`);
    }
    return keys;
  }

  async countAvailableBikers(countries?: string[]): Promise<number> {
    const conditions: any[] = [
      eq(users.status, "active"),
      eq(userProfiles.isAvailable, true),
      or(eq(users.userType, "biker"), eq(users.userType, "coppia")),
      eq(users.ghostMode, false),
      notInArray(users.role, ["admin", "moderator", "moderatore"]),
    ];
    if (countries && countries.length > 0) conditions.push(inArray(users.country, countries));
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(and(...conditions));
    return result[0]?.count ?? 0;
  }

  async countAvailableZavorrine(countries?: string[]): Promise<number> {
    const conditions: any[] = [
      eq(users.status, "active"),
      eq(userProfiles.isAvailable, true),
      eq(users.userType, "zavorrina"),
      eq(users.ghostMode, false),
      notInArray(users.role, ["admin", "moderator", "moderatore"]),
    ];
    if (countries && countries.length > 0) conditions.push(inArray(users.country, countries));
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(and(...conditions));
    return result[0]?.count ?? 0;
  }

  async getAvailableBikersList(lat?: number, lng?: number, countries?: string[]): Promise<any[]> {
    const distanceExpr = lat != null && lng != null
      ? sql<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance")
      : sql<number>`0`.as("distance");
    const conditions: any[] = [
      eq(users.status, "active"),
      eq(userProfiles.isAvailable, true),
      or(eq(users.userType, "biker"), eq(users.userType, "coppia")),
      eq(users.ghostMode, false),
      notInArray(users.role, ["admin", "moderator", "moderatore"]),
    ];
    if (countries && countries.length > 0) {
      conditions.push(inArray(users.country, countries));
    }
    return db
      .select({ user: users, profile: userProfiles, distance: distanceExpr })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(and(...conditions))
      .orderBy(sql`distance`);
  }

  async getAvailableZavorrinaList(lat?: number, lng?: number, countries?: string[]): Promise<any[]> {
    const distanceExpr = lat != null && lng != null
      ? sql<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance")
      : sql<number>`0`.as("distance");
    const conditions: any[] = [
      eq(users.status, "active"),
      eq(userProfiles.isAvailable, true),
      eq(users.userType, "zavorrina"),
      eq(users.ghostMode, false),
      notInArray(users.role, ["admin", "moderator", "moderatore"]),
    ];
    if (countries && countries.length > 0) {
      conditions.push(inArray(users.country, countries));
    }
    return db
      .select({ user: users, profile: userProfiles, distance: distanceExpr })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(and(...conditions))
      .orderBy(sql`distance`);
  }

  async createEmailVerificationToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db.insert(emailVerificationTokens).values({ userId, token, expiresAt });
  }

  async getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined> {
    const [row] = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.token, token)).limit(1);
    return row;
  }

  async deleteEmailVerificationTokens(userId: string): Promise<void> {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
  }

  async markUserEmailVerified(userId: string): Promise<void> {
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
  }

  async requestUserDeletion(userId: string): Promise<void> {
    const now = new Date();
    const scheduledFor = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await db.update(users).set({
      deletionRequestedAt: now,
      deletionScheduledFor: scheduledFor,
    }).where(eq(users.id, userId));
  }

  async cancelUserDeletion(userId: string): Promise<void> {
    await db.update(users).set({
      deletionRequestedAt: null,
      deletionScheduledFor: null,
    }).where(eq(users.id, userId));
  }

  async deleteUser(userId: string): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }

  async recordFakeUserInteraction(fakeUserId: string, realUserId: string, interactionType: string): Promise<void> {
    await db.insert(fakeUserInteractions).values({ fakeUserId, realUserId, interactionType });
  }

  async getFakeUserStats(limit = 50, offset = 0, type = "tutti"): Promise<{ users: any[]; total: number; hasMore: boolean; stats: { total: number; biker: number; zavorrina: number; coppia: number } }> {
    const baseCondition = and(eq(users.isFake, true), sql`${users.nickname} != 'BikerLink_Official'`);
    const typeCondition = type !== "tutti"
      ? and(eq(users.isFake, true), sql`${users.nickname} != 'BikerLink_Official'`, eq(users.userType, type))
      : baseCondition;

    const [[{ total }], [statsRow], fakeUsers] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` }).from(users).where(typeCondition),
      db.select({
        total: sql<number>`count(*)::int`,
        biker: sql<number>`count(*) filter (where ${users.userType} = 'biker')::int`,
        zavorrina: sql<number>`count(*) filter (where ${users.userType} = 'zavorrina')::int`,
        coppia: sql<number>`count(*) filter (where ${users.userType} = 'coppia')::int`,
      }).from(users).where(baseCondition),
      db.select().from(users).where(typeCondition).orderBy(desc(users.createdAt)).limit(limit).offset(offset),
    ]);

    const userIds = fakeUsers.map(u => u.id);
    const [profiles, interactionCounts] = await Promise.all([
      userIds.length > 0
        ? db.select().from(userProfiles).where(inArray(userProfiles.userId, userIds))
        : Promise.resolve([]),
      userIds.length > 0
        ? db.select({
            fakeUserId: fakeUserInteractions.fakeUserId,
            profileViews: sql<number>`count(*) filter (where ${fakeUserInteractions.interactionType} = 'profile_view')::int`,
            chatRequests: sql<number>`count(*) filter (where ${fakeUserInteractions.interactionType} = 'chat_request')::int`,
            chatMessages: sql<number>`count(*) filter (where ${fakeUserInteractions.interactionType} = 'chat_message')::int`,
          }).from(fakeUserInteractions).where(inArray(fakeUserInteractions.fakeUserId, userIds)).groupBy(fakeUserInteractions.fakeUserId)
        : Promise.resolve([]),
    ]);

    const profileMap = new Map(profiles.map(p => [p.userId, p]));
    const countsMap = new Map(interactionCounts.map(r => [r.fakeUserId, r]));

    const result = fakeUsers.map(u => {
      const { password: _, ...safeUser } = u;
      const counts = countsMap.get(u.id);
      return {
        ...safeUser,
        profile: profileMap.get(u.id) ?? null,
        profileViews: counts?.profileViews ?? 0,
        chatRequests: counts?.chatRequests ?? 0,
        chatMessages: counts?.chatMessages ?? 0,
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
        coppia: statsRow?.coppia ?? 0,
      },
    };
  }

  async getFakeUsers(): Promise<User[]> {
    return db.select().from(users).where(
      and(eq(users.isFake, true), sql`${users.nickname} != 'BikerLink_Official'`)
    ).orderBy(desc(users.createdAt));
  }

  async deleteFakeUser(id: string): Promise<void> {
    const fakeCondition = and(eq(users.id, id), eq(users.isFake, true), sql`${users.nickname} != 'BikerLink_Official'`);
    const [fakeUser] = await db.select({ id: users.id }).from(users).where(fakeCondition).limit(1);
    if (!fakeUser) return;
    await db.transaction(async (tx) => {
      await tx.delete(userMotorcycles).where(eq(userMotorcycles.userId, id));
      await tx.delete(users).where(fakeCondition);
    });
  }

  async deleteAllFakeUsers(): Promise<number> {
    const condition = and(eq(users.isFake, true), sql`${users.nickname} != 'BikerLink_Official'`);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(condition);
    console.log(`[Admin] deleteAllFakeUsers: trovati ${count} utenti fake da eliminare`);
    if (count === 0) return 0;

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        DELETE FROM user_motorcycles
        WHERE user_id IN (
          SELECT id FROM users WHERE is_fake = true AND nickname != 'BikerLink_Official'
        )
      `);
      console.log(`[Admin] deleteAllFakeUsers: eliminate moto associate agli utenti fake`);

      await tx.delete(users).where(condition);
      console.log(`[Admin] deleteAllFakeUsers: eliminati ${count} utenti fake`);

      await tx.execute(sql`
        DELETE FROM conversations
        WHERE id IN (
          SELECT c.id FROM conversations c
          LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
          WHERE c.conversation_type != 'motoclub'
          GROUP BY c.id
          HAVING count(cp.id) = 0
        )
      `);
      const officialUser = await tx.select({ id: users.id }).from(users)
        .where(sql`${users.nickname} = 'BikerLink_Official'`).limit(1);
      if (officialUser.length > 0) {
        await tx.execute(sql`
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

    return count;
  }

  async toggleFakeZavorrineAvailability(): Promise<void> {
    const globalToggle = await this.getAppSetting("fake_users_enabled");
    if (globalToggle && globalToggle.value === "false") {
      return;
    }

    const fakeZavorrine = await db.select({ id: users.id, profileUserId: userProfiles.userId, adminOverrideUntil: userProfiles.adminOverrideUntil })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(users.isFake, true), eq(users.userType, "zavorrina")));
    
    const now = new Date();
    for (const z of fakeZavorrine) {
      if (z.adminOverrideUntil && new Date(z.adminOverrideUntil) > now) continue;
      const available = Math.random() < 0.55;
      await db.update(userProfiles).set({ isAvailable: available }).where(eq(userProfiles.userId, z.id));
      if (available) {
        await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, z.id));
      }
    }

    const fakeBikers = await db.select({ id: users.id, profileUserId: userProfiles.userId, adminOverrideUntil: userProfiles.adminOverrideUntil })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(users.isFake, true), or(eq(users.userType, "biker"), eq(users.userType, "coppia"))));

    for (const b of fakeBikers) {
      if (b.adminOverrideUntil && new Date(b.adminOverrideUntil) > now) continue;
      const available = Math.random() < 0.55;
      await db.update(userProfiles).set({ isAvailable: available }).where(eq(userProfiles.userId, b.id));
      if (available) {
        await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, b.id));
      }
    }
  }

  async getFakeUserConversations(fakeUserId: string): Promise<any[]> {
    const participantRows = await db.select().from(conversationParticipants).where(eq(conversationParticipants.userId, fakeUserId));
    if (participantRows.length === 0) return [];
    const convIds = participantRows.map(p => p.conversationId);
    const convs = await db.select().from(conversations).where(sql`${conversations.id} = ANY(${convIds})`).orderBy(desc(conversations.updatedAt));
    const result = [];
    for (const conv of convs) {
      const parts = await this.getConversationParticipants(conv.id);
      const partUsers = [];
      for (const p of parts) {
        const u = await this.getUser(p.userId);
        if (u) partUsers.push({ id: u.id, nickname: u.nickname, userType: u.userType, isFake: u.isFake });
      }
      const msgs = await this.getMessages(conv.id, 1, 0);
      const totalMsgs = await db.select({ count: sql<number>`count(*)::int` }).from(messages).where(eq(messages.conversationId, conv.id));
      result.push({
        ...conv,
        participants: partUsers,
        lastMessage: msgs[0] || null,
        messageCount: totalMsgs[0]?.count ?? 0,
      });
    }
    return result;
  }

  async getCustomRoutes(userId: string): Promise<CustomRoute[]> {
    return db.select().from(customRoutes).where(eq(customRoutes.userId, userId)).orderBy(desc(customRoutes.createdAt));
  }

  async getPublicCustomRoutes(): Promise<CustomRoute[]> {
    return db.select().from(customRoutes).where(eq(customRoutes.isPublic, true)).orderBy(desc(customRoutes.createdAt));
  }

  async getCustomRoute(id: string): Promise<CustomRoute | undefined> {
    const [route] = await db.select().from(customRoutes).where(eq(customRoutes.id, id)).limit(1);
    return route;
  }

  async createCustomRoute(data: InsertCustomRoute): Promise<CustomRoute> {
    const [route] = await db.insert(customRoutes).values(data).returning();
    return route;
  }

  async updateCustomRoute(id: string, data: Partial<InsertCustomRoute>): Promise<CustomRoute | undefined> {
    const [route] = await db.update(customRoutes).set({ ...data, updatedAt: new Date() }).where(eq(customRoutes.id, id)).returning();
    return route;
  }

  async deleteCustomRoute(id: string): Promise<void> {
    await db.delete(customRoutes).where(eq(customRoutes.id, id));
  }

  async getCustomRouteWaypoints(routeId: string): Promise<CustomRouteWaypoint[]> {
    return db.select().from(customRouteWaypoints).where(eq(customRouteWaypoints.routeId, routeId)).orderBy(asc(customRouteWaypoints.orderIndex));
  }

  async createCustomRouteWaypoint(data: InsertCustomRouteWaypoint): Promise<CustomRouteWaypoint> {
    const [wp] = await db.insert(customRouteWaypoints).values(data).returning();
    return wp;
  }

  async updateCustomRouteWaypoint(id: string, data: Partial<InsertCustomRouteWaypoint>): Promise<CustomRouteWaypoint | undefined> {
    const [wp] = await db.update(customRouteWaypoints).set(data).where(eq(customRouteWaypoints.id, id)).returning();
    return wp;
  }

  async deleteCustomRouteWaypoint(id: string): Promise<void> {
    await db.delete(customRouteWaypoints).where(eq(customRouteWaypoints.id, id));
  }

  async createSosRequest(data: InsertSosRequest): Promise<SosRequest> {
    const [req] = await db.insert(sosRequests).values(data).returning();
    return req;
  }

  async getSosRequest(id: string): Promise<SosRequest | undefined> {
    const [req] = await db.select().from(sosRequests).where(eq(sosRequests.id, id)).limit(1);
    return req;
  }

  async getActiveSosRequestByUser(userId: string): Promise<SosRequest | undefined> {
    const [req] = await db.select().from(sosRequests)
      .where(and(eq(sosRequests.requesterId, userId), eq(sosRequests.status, "active")))
      .limit(1);
    return req;
  }

  async getActiveSosRequests(): Promise<SosRequest[]> {
    return db.select().from(sosRequests)
      .where(eq(sosRequests.status, "active"))
      .orderBy(desc(sosRequests.createdAt));
  }

  async updateSosRequest(id: string, data: Partial<InsertSosRequest>): Promise<SosRequest | undefined> {
    const [req] = await db.update(sosRequests).set({ ...data, updatedAt: new Date() }).where(eq(sosRequests.id, id)).returning();
    return req;
  }

  async getBikerBikerMatchesForUser(userId: string): Promise<BikerBikerMatch[]> {
    return db.select().from(bikerBikerMatches).where(
      or(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, userId))
    ).orderBy(
      sql`CASE WHEN ${bikerBikerMatches.status} = 'accepted' THEN 0 WHEN ${bikerBikerMatches.status} = 'new' THEN 1 ELSE 2 END`,
      asc(bikerBikerMatches.id)
    ).limit(2000);
  }

  async createBikerBikerMatch(data: InsertBikerBikerMatch): Promise<BikerBikerMatch | undefined> {
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

    if (!result.rows || result.rows.length === 0) return undefined;
    const row = result.rows[0];
    return {
      id: row.id,
      biker1Id: row.biker1_id,
      biker2Id: row.biker2_id,
      motorcycleBrand: row.motorcycle_brand,
      motorcycleModel: row.motorcycle_model,
      status: row.status,
      isSupermatch: row.is_supermatch,
      createdAt: row.created_at,
    } as BikerBikerMatch;
  }

  async getBikerBikerMatch(id: string): Promise<BikerBikerMatch | undefined> {
    const [match] = await db.select().from(bikerBikerMatches).where(eq(bikerBikerMatches.id, id));
    return match;
  }

  async updateBikerBikerMatch(id: string, data: Partial<InsertBikerBikerMatch>): Promise<BikerBikerMatch | undefined> {
    const [updated] = await db.update(bikerBikerMatches).set(data).where(eq(bikerBikerMatches.id, id)).returning();
    return updated;
  }

  async resetBikerBikerMatchToNew(id: string, userId: string): Promise<boolean> {
    const [match] = await db.select().from(bikerBikerMatches).where(eq(bikerBikerMatches.id, id));
    if (!match) return false;
    if (match.biker1Id !== userId && match.biker2Id !== userId) return false;
    const newStatus = match.status === "accepted" ? "rejected" : "new";
    await db.update(bikerBikerMatches).set({ status: newStatus }).where(eq(bikerBikerMatches.id, id));
    return true;
  }

  async deleteRejectedBikerBikerMatches(userId: string): Promise<number> {
    const rejected = await db.select().from(bikerBikerMatches).where(
      and(
        or(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, userId)),
        eq(bikerBikerMatches.status, "rejected")
      )
    );
    if (rejected.length === 0) return 0;
    await db.delete(bikerBikerMatches).where(
      and(
        or(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, userId)),
        eq(bikerBikerMatches.status, "rejected")
      )
    );
    return rejected.length;
  }

  async deleteNewBikerBikerMatches(userId: string): Promise<number> {
    const newMatches = await db.select().from(bikerBikerMatches).where(
      and(
        or(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, userId)),
        eq(bikerBikerMatches.status, "new")
      )
    );
    if (newMatches.length === 0) return 0;
    await db.delete(bikerBikerMatches).where(
      and(
        or(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, userId)),
        eq(bikerBikerMatches.status, "new")
      )
    );
    return newMatches.length;
  }

  async getAcceptedBikerBikerPairKeys(userId: string): Promise<Set<string>> {
    const rows = await db.select({
      biker1Id: bikerBikerMatches.biker1Id,
      biker2Id: bikerBikerMatches.biker2Id,
    }).from(bikerBikerMatches).where(
      and(
        or(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, userId)),
        eq(bikerBikerMatches.status, "accepted")
      )
    );
    const keys = new Set<string>();
    for (const r of rows) {
      const idA = r.biker1Id < r.biker2Id ? r.biker1Id : r.biker2Id;
      const idB = r.biker1Id < r.biker2Id ? r.biker2Id : r.biker1Id;
      keys.add(`${idA}:${idB}`);
    }
    return keys;
  }

  async blockUser(blockerId: string, blockedId: string): Promise<UserBlock> {
    const [block] = await db.insert(userBlocks).values({ blockerId, blockedId }).returning();
    return block;
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<boolean> {
    const result = await db.delete(userBlocks).where(
      and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId))
    ).returning();
    return result.length > 0;
  }

  async isBlocked(userId1: string, userId2: string): Promise<boolean> {
    const [row] = await db.select().from(userBlocks).where(
      or(
        and(eq(userBlocks.blockerId, userId1), eq(userBlocks.blockedId, userId2)),
        and(eq(userBlocks.blockerId, userId2), eq(userBlocks.blockedId, userId1))
      )
    ).limit(1);
    return !!row;
  }

  async hasBlockedUser(blockerId: string, blockedId: string): Promise<boolean> {
    const [row] = await db.select().from(userBlocks).where(
      and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId))
    ).limit(1);
    return !!row;
  }

  async getBlockedUserIds(userId: string): Promise<string[]> {
    const rows = await db.select().from(userBlocks).where(
      or(
        eq(userBlocks.blockerId, userId),
        eq(userBlocks.blockedId, userId)
      )
    );
    return rows.map(r => r.blockerId === userId ? r.blockedId : r.blockerId);
  }

  async getBlockedUsersByBlocker(blockerId: string): Promise<Array<{ id: string; nickname: string; userType: string | null; avatarUrl: string | null }>> {
    const rows = await db
      .select({
        id: users.id,
        nickname: users.nickname,
        userType: users.userType,
        avatarUrl: users.avatarUrl,
      })
      .from(userBlocks)
      .innerJoin(users, eq(users.id, userBlocks.blockedId))
      .where(eq(userBlocks.blockerId, blockerId));
    return rows;
  }

  async getAllBlockedPairs(): Promise<Array<{ blockerId: string; blockedId: string }>> {
    const rows = await db.select({ blockerId: userBlocks.blockerId, blockedId: userBlocks.blockedId }).from(userBlocks);
    return rows;
  }

  async deleteBikerBikerMatchesBetween(userId1: string, userId2: string): Promise<number> {
    const result = await db.delete(bikerBikerMatches).where(
      or(
        and(eq(bikerBikerMatches.biker1Id, userId1), eq(bikerBikerMatches.biker2Id, userId2)),
        and(eq(bikerBikerMatches.biker1Id, userId2), eq(bikerBikerMatches.biker2Id, userId1)),
      )
    ).returning();
    return result.length;
  }

  async cleanupAdminMatches(): Promise<{ bikerZavarrina: number; bikerBiker: number }> {
    const adminUsers = await db.select({ id: users.id })
      .from(users)
      .where(inArray(users.role, ["admin", "moderator", "moderatore"]));

    if (adminUsers.length === 0) {
      return { bikerZavarrina: 0, bikerBiker: 0 };
    }

    const adminIds = adminUsers.map(u => u.id);
    console.log(`[AdminCleanup] Trovati ${adminIds.length} utenti admin/moderator da escludere dai match`);

    let bzDeleted = 0;
    let bbDeleted = 0;

    for (const adminId of adminIds) {
      const bzResult = await db.delete(bikerZavarrinaMatches).where(
        or(
          eq(bikerZavarrinaMatches.bikerId, adminId),
          eq(bikerZavarrinaMatches.zavarrinaId, adminId)
        )
      ).returning();
      bzDeleted += bzResult.length;

      const bbResult = await db.delete(bikerBikerMatches).where(
        or(
          eq(bikerBikerMatches.biker1Id, adminId),
          eq(bikerBikerMatches.biker2Id, adminId)
        )
      ).returning();
      bbDeleted += bbResult.length;
    }

    console.log(`[AdminCleanup] Rimossi ${bzDeleted} match biker-zavorrina e ${bbDeleted} match biker-biker con admin/moderator`);
    return { bikerZavarrina: bzDeleted, bikerBiker: bbDeleted };
  }
}

export const storage = new DatabaseStorage();
