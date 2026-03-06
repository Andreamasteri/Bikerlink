import { eq, and, or, sql, desc, asc, gte, lte } from "drizzle-orm";
import { db } from "./db";
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
  emailVerificationTokens,
  proposalMatches,
  fakeUserInteractions,
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
  type EmailVerificationToken,
  type InsertEmailVerificationToken,
  type ProposalMatch,
  type InsertProposalMatch,
  type FakeUserInteraction,
  type InsertFakeUserInteraction,
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

  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: string, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined>;

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
  expireOldProposals(): Promise<number>;

  getConversations(userId: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conv: InsertConversation): Promise<Conversation>;
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
  createAdCampaign(campaign: InsertAdCampaign): Promise<AdCampaign>;
  updateAdCampaign(id: string, data: Partial<InsertAdCampaign>): Promise<AdCampaign | undefined>;
  createAdClick(click: InsertAdClick): Promise<AdClick>;
  incrementCampaignImpressions(id: string): Promise<void>;

  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<void>;

  getInvitationCodes(): Promise<InvitationCode[]>;
  getInvitationCode(code: string): Promise<InvitationCode | undefined>;
  createInvitationCode(code: InsertInvitationCode): Promise<InvitationCode>;
  incrementInvitationCodeUses(id: string): Promise<void>;

  getFeedbackTickets(): Promise<FeedbackTicket[]>;
  createFeedbackTicket(ticket: InsertFeedbackTicket): Promise<FeedbackTicket>;

  getAppSetting(key: string): Promise<AppSetting | undefined>;
  upsertAppSetting(key: string, value?: string, valueJson?: unknown): Promise<AppSetting>;

  createVerificationCode(code: InsertVerificationCode): Promise<VerificationCode>;
  getVerificationCode(target: string, codeType: string): Promise<VerificationCode | undefined>;
  markVerificationCodeUsed(id: string): Promise<void>;

  getNearbyUsers(lat: number, lng: number, radiusKm: number): Promise<Array<{
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
  getAdClicksByPeriod(campaignId: string, startDate: Date, endDate: Date): Promise<AdClick[]>;
  getWorkshopContactsByPeriod(startDate: Date, endDate: Date): Promise<WorkshopContact[]>;
  countUsers(): Promise<number>;
  countActiveUsers(since: Date): Promise<number>;
  countAvailableUsers(): Promise<number>;
  getUnapprovedUserPhotos(): Promise<UserPhoto[]>;
  updateUserPhotoApproval(id: string, approved: boolean): Promise<UserPhoto | undefined>;
  getUnapprovedContestEntries(): Promise<PhotoContestEntry[]>;
  updateContestEntryApproval(id: string, approved: boolean): Promise<PhotoContestEntry | undefined>;
  getPhotoContestEntry(id: string): Promise<PhotoContestEntry | undefined>;

  getPhoneSharedCount(conversationId: string, userId: string): Promise<number>;
  incrementPhoneSharedCount(conversationId: string, userId: string): Promise<void>;

  countAvailableBikers(since: Date): Promise<number>;
  countAvailableZavorrine(since: Date): Promise<number>;
  getAvailableBikersList(since: Date, lat?: number, lng?: number): Promise<any[]>;
  getAvailableZavorrinaList(since: Date, lat?: number, lng?: number): Promise<any[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByNickname(nickname: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.nickname, nickname)).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
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
    return db.select().from(proposals).where(
      and(
        eq(proposals.status, "active"),
        sql`${proposals.departureLatitude} IS NOT NULL`,
        sql`${proposals.departureLongitude} IS NOT NULL`,
        sql`${proposals.searchType} IS NOT NULL`
      )
    );
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
            or(
              sql`${proposalMatches.proposalId1} = ANY(${expiredIds})`,
              sql`${proposalMatches.proposalId2} = ANY(${expiredIds})`
            )
          )
        );
    }
    return result.length;
  }

  async getConversations(userId: string): Promise<Conversation[]> {
    const participantRows = await db.select().from(conversationParticipants).where(eq(conversationParticipants.userId, userId));
    if (participantRows.length === 0) return [];
    const convIds = participantRows.map((p) => p.conversationId);
    return db.select().from(conversations).where(sql`${conversations.id} = ANY(${convIds})`).orderBy(desc(conversations.updatedAt));
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return conv;
  }

  async createConversation(data: InsertConversation): Promise<Conversation> {
    const [conv] = await db.insert(conversations).values(data).returning();
    return conv;
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
    return db.select().from(adCampaigns).where(and(eq(adCampaigns.isActive, true), eq(adCampaigns.targetUserType, userType))).orderBy(asc(adCampaigns.sortOrder));
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

  async createInvitationCode(data: InsertInvitationCode): Promise<InvitationCode> {
    const [code] = await db.insert(invitationCodes).values(data).returning();
    return code;
  }

  async incrementInvitationCodeUses(id: string): Promise<void> {
    await db.update(invitationCodes).set({ currentUses: sql`${invitationCodes.currentUses} + 1` }).where(eq(invitationCodes.id, id));
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

  async getVerificationCode(target: string, codeType: string): Promise<VerificationCode | undefined> {
    const [code] = await db.select().from(verificationCodes).where(and(eq(verificationCodes.target, target), eq(verificationCodes.codeType, codeType), eq(verificationCodes.isUsed, false))).orderBy(desc(verificationCodes.createdAt)).limit(1);
    return code;
  }

  async markVerificationCodeUsed(id: string): Promise<void> {
    await db.update(verificationCodes).set({ isUsed: true }).where(eq(verificationCodes.id, id));
  }

  async getNearbyUsers(lat: number, lng: number, radiusKm: number): Promise<Array<{ user: User; profile: UserProfile; distance: number }>> {
    const results = await db
      .select({
        user: users,
        profile: userProfiles,
        distance: sql<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance"),
      })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(
        and(
          eq(userProfiles.isAvailable, true),
          eq(users.status, "active"),
          sql`${userProfiles.latitude} IS NOT NULL`,
          sql`${userProfiles.longitude} IS NOT NULL`
        )
      )
      .having(sql`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude})))) < ${radiusKm}`)
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

  async getAdClicksByPeriod(campaignId: string, startDate: Date, endDate: Date): Promise<AdClick[]> {
    return db.select().from(adClicks).where(and(eq(adClicks.campaignId, campaignId), gte(adClicks.createdAt, startDate), lte(adClicks.createdAt, endDate)));
  }

  async getWorkshopContactsByPeriod(startDate: Date, endDate: Date): Promise<WorkshopContact[]> {
    return db.select().from(workshopContacts).where(and(gte(workshopContacts.createdAt, startDate), lte(workshopContacts.createdAt, endDate)));
  }

  async countUsers(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    return result[0]?.count ?? 0;
  }

  async countActiveUsers(since: Date): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(and(eq(users.status, "active"), gte(users.lastLoginAt, since)));
    return result[0]?.count ?? 0;
  }

  async countAvailableUsers(since?: Date): Promise<number> {
    const conditions = [eq(users.status, "active"), eq(userProfiles.isAvailable, true)];
    if (since) conditions.push(gte(users.lastLoginAt, since));
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(userProfiles).innerJoin(users, eq(users.id, userProfiles.userId)).where(and(...conditions));
    return result[0]?.count ?? 0;
  }

  async getOnlineUsersList(since: Date, lat?: number, lng?: number): Promise<any[]> {
    const distanceExpr = lat != null && lng != null
      ? sql<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance")
      : sql<number>`0`.as("distance");
    const results = await db
      .select({ user: users, profile: userProfiles, distance: distanceExpr })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(users.status, "active"), gte(users.lastLoginAt, since)))
      .orderBy(sql`distance`);
    return results;
  }

  async getAvailableUsersList(since: Date, lat?: number, lng?: number): Promise<any[]> {
    const distanceExpr = lat != null && lng != null
      ? sql<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance")
      : sql<number>`0`.as("distance");
    const results = await db
      .select({ user: users, profile: userProfiles, distance: distanceExpr })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(and(eq(users.status, "active"), eq(userProfiles.isAvailable, true), gte(users.lastLoginAt, since)))
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

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.token, token));
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

  async createMatch(data: InsertBikerZavarrinaMatch): Promise<BikerZavarrinaMatch> {
    const [match] = await db.insert(bikerZavarrinaMatches).values(data).returning();
    return match;
  }

  async getMatchesForUser(userId: string): Promise<BikerZavarrinaMatch[]> {
    return db.select().from(bikerZavarrinaMatches).where(
      or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId))
    ).orderBy(desc(bikerZavarrinaMatches.createdAt));
  }

  async countAvailableBikers(since: Date): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(and(
        eq(users.status, "active"),
        eq(userProfiles.isAvailable, true),
        gte(users.lastLoginAt, since),
        or(eq(users.userType, "biker"), eq(users.userType, "coppia"))
      ));
    return result[0]?.count ?? 0;
  }

  async countAvailableZavorrine(since: Date): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(and(
        eq(users.status, "active"),
        eq(userProfiles.isAvailable, true),
        gte(users.lastLoginAt, since),
        eq(users.userType, "zavorrina")
      ));
    return result[0]?.count ?? 0;
  }

  async getAvailableBikersList(since: Date, lat?: number, lng?: number): Promise<any[]> {
    const distanceExpr = lat != null && lng != null
      ? sql<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance")
      : sql<number>`0`.as("distance");
    return db
      .select({ user: users, profile: userProfiles, distance: distanceExpr })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(and(
        eq(users.status, "active"),
        eq(userProfiles.isAvailable, true),
        gte(users.lastLoginAt, since),
        or(eq(users.userType, "biker"), eq(users.userType, "coppia"))
      ))
      .orderBy(sql`distance`);
  }

  async getAvailableZavorrinaList(since: Date, lat?: number, lng?: number): Promise<any[]> {
    const distanceExpr = lat != null && lng != null
      ? sql<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance")
      : sql<number>`0`.as("distance");
    return db
      .select({ user: users, profile: userProfiles, distance: distanceExpr })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(and(
        eq(users.status, "active"),
        eq(userProfiles.isAvailable, true),
        gte(users.lastLoginAt, since),
        eq(users.userType, "zavorrina")
      ))
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

  async getFakeUserStats(): Promise<any[]> {
    const fakeUsers = await db.select().from(users).where(eq(users.isFake, true)).orderBy(desc(users.createdAt));
    const stats = [];
    for (const u of fakeUsers) {
      const profile = await this.getUserProfile(u.id);
      const [views] = await db.select({ count: sql<number>`count(*)::int` }).from(fakeUserInteractions).where(and(eq(fakeUserInteractions.fakeUserId, u.id), eq(fakeUserInteractions.interactionType, "profile_view")));
      const [chats] = await db.select({ count: sql<number>`count(*)::int` }).from(fakeUserInteractions).where(and(eq(fakeUserInteractions.fakeUserId, u.id), eq(fakeUserInteractions.interactionType, "chat_request")));
      const [msgs] = await db.select({ count: sql<number>`count(*)::int` }).from(fakeUserInteractions).where(and(eq(fakeUserInteractions.fakeUserId, u.id), eq(fakeUserInteractions.interactionType, "chat_message")));
      const { password: _, ...safeUser } = u;
      stats.push({
        ...safeUser,
        profile,
        profileViews: views?.count ?? 0,
        chatRequests: chats?.count ?? 0,
        chatMessages: msgs?.count ?? 0,
      });
    }
    return stats;
  }

  async getFakeUsers(): Promise<User[]> {
    return db.select().from(users).where(eq(users.isFake, true)).orderBy(desc(users.createdAt));
  }

  async deleteFakeUser(id: string): Promise<void> {
    await db.delete(users).where(and(eq(users.id, id), eq(users.isFake, true)));
  }

  async toggleFakeZavorrineAvailability(): Promise<void> {
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
}

export const storage = new DatabaseStorage();
