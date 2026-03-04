import { db } from "./db";
import { eq, and, desc, sql, gte, lte, ne, asc, count, isNull } from "drizzle-orm";
import * as schema from "@shared/schema";
import { randomUUID } from "crypto";

export const storage = {
  async getUser(id: string) {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user;
  },

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return user;
  },

  async getUserByNickname(nickname: string) {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.nickname, nickname));
    return user;
  },

  async createUser(data: {
    email: string;
    phone?: string;
    passwordHash: string;
    nickname: string;
    sex: (typeof schema.sexEnum)[number];
    birthYear: number;
    region: string;
    userType: (typeof schema.userTypeEnum)[number];
    coupleSexConfig?: (typeof schema.coupleSexConfigEnum)[number];
    eulaAccepted: boolean;
    invitationCode?: string;
  }) {
    const [user] = await db.insert(schema.users).values(data).returning();
    await db.insert(schema.userProfiles).values({ userId: user.id });
    return user;
  },

  async updateUser(id: string, data: Partial<schema.User>) {
    const [user] = await db.update(schema.users).set({ ...data, updatedAt: new Date() }).where(eq(schema.users.id, id)).returning();
    return user;
  },

  async getAllUsers() {
    return db.select().from(schema.users).orderBy(desc(schema.users.createdAt));
  },

  async getUserProfile(userId: string) {
    const [profile] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, userId));
    return profile;
  },

  async updateUserProfile(userId: string, data: Partial<schema.UserProfile>) {
    const existing = await this.getUserProfile(userId);
    if (!existing) {
      const [profile] = await db.insert(schema.userProfiles).values({ userId, ...data }).returning();
      return profile;
    }
    const [profile] = await db.update(schema.userProfiles).set(data).where(eq(schema.userProfiles.userId, userId)).returning();
    return profile;
  },

  async getUserPhotos(userId: string) {
    return db.select().from(schema.userPhotos).where(eq(schema.userPhotos.userId, userId)).orderBy(asc(schema.userPhotos.sortOrder));
  },

  async addUserPhoto(userId: string, photoUrl: string, sortOrder: number) {
    const photos = await this.getUserPhotos(userId);
    if (photos.length >= 3) throw new Error("Massimo 3 foto consentite");
    const [photo] = await db.insert(schema.userPhotos).values({ userId, photoUrl, sortOrder }).returning();
    return photo;
  },

  async deleteUserPhoto(id: string) {
    await db.delete(schema.userPhotos).where(eq(schema.userPhotos.id, id));
  },

  async getNearbyUsers(lat: number, lng: number, radiusKm: number) {
    const profiles = await db
      .select({
        user: schema.users,
        profile: schema.userProfiles,
      })
      .from(schema.userProfiles)
      .innerJoin(schema.users, eq(schema.userProfiles.userId, schema.users.id))
      .where(
        and(
          eq(schema.userProfiles.isAvailable, true),
          eq(schema.users.status, "active"),
          sql`(
            6371 * acos(
              cos(radians(${lat})) * cos(radians(${schema.userProfiles.lastLatitude})) *
              cos(radians(${schema.userProfiles.lastLongitude}) - radians(${lng})) +
              sin(radians(${lat})) * sin(radians(${schema.userProfiles.lastLatitude}))
            )
          ) <= ${radiusKm}`
        )
      );
    return profiles;
  },

  async createProposal(data: Omit<schema.Proposal, "id" | "createdAt" | "isActive">) {
    const [proposal] = await db.insert(schema.proposals).values(data).returning();
    return proposal;
  },

  async getProposals(filters?: { type?: string; lat?: number; lng?: number; radiusKm?: number }) {
    let query = db.select({ proposal: schema.proposals, user: schema.users })
      .from(schema.proposals)
      .innerJoin(schema.users, eq(schema.proposals.userId, schema.users.id))
      .where(eq(schema.proposals.isActive, true))
      .orderBy(desc(schema.proposals.createdAt));
    return query;
  },

  async getProposal(id: string) {
    const [result] = await db.select({ proposal: schema.proposals, user: schema.users })
      .from(schema.proposals)
      .innerJoin(schema.users, eq(schema.proposals.userId, schema.users.id))
      .where(eq(schema.proposals.id, id));
    return result;
  },

  async updateProposal(id: string, data: Partial<schema.Proposal>) {
    const [proposal] = await db.update(schema.proposals).set(data).where(eq(schema.proposals.id, id)).returning();
    return proposal;
  },

  async deleteProposal(id: string) {
    await db.update(schema.proposals).set({ isActive: false }).where(eq(schema.proposals.id, id));
  },

  async createConversation(type: (typeof schema.conversationTypeEnum)[number], proposalId?: string) {
    const [conv] = await db.insert(schema.conversations).values({ type, proposalId }).returning();
    return conv;
  },

  async getConversation(id: string) {
    const [conv] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, id));
    return conv;
  },

  async getPrivateConversation(userId1: string, userId2: string) {
    const result = await db.execute(sql`
      SELECT c.* FROM conversations c
      JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.user_id = ${userId1}
      JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id = ${userId2}
      WHERE c.type = 'private'
      LIMIT 1
    `);
    return result.rows[0] as schema.Conversation | undefined;
  },

  async getGroupConversationForProposal(proposalId: string) {
    const [conv] = await db.select().from(schema.conversations)
      .where(and(eq(schema.conversations.proposalId, proposalId), eq(schema.conversations.type, "group")));
    return conv;
  },

  async addParticipant(conversationId: string, userId: string) {
    try {
      await db.insert(schema.conversationParticipants).values({ conversationId, userId });
    } catch (e: any) {
      if (e.code !== "23505") throw e;
    }
  },

  async getUserConversations(userId: string) {
    const result = await db.execute(sql`
      SELECT c.*, 
        (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.is_read = false AND m.sender_id != ${userId})::int as unread_count
      FROM conversations c
      JOIN conversation_participants cp ON c.id = cp.conversation_id
      WHERE cp.user_id = ${userId}
      ORDER BY last_message_at DESC NULLS LAST
    `);
    return result.rows;
  },

  async getConversationParticipants(conversationId: string) {
    return db.select({ user: schema.users })
      .from(schema.conversationParticipants)
      .innerJoin(schema.users, eq(schema.conversationParticipants.userId, schema.users.id))
      .where(eq(schema.conversationParticipants.conversationId, conversationId));
  },

  async createMessage(data: { senderId: string; conversationId: string; content?: string; messageType?: (typeof schema.messageTypeEnum)[number]; imageUrl?: string; latitude?: number; longitude?: number; isSystem?: boolean }) {
    const [msg] = await db.insert(schema.messages).values({
      ...data,
      messageType: data.messageType || "text",
    }).returning();
    return msg;
  },

  async getMessages(conversationId: string, limit = 50, offset = 0) {
    return db.select({ message: schema.messages, sender: schema.users })
      .from(schema.messages)
      .innerJoin(schema.users, eq(schema.messages.senderId, schema.users.id))
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(desc(schema.messages.createdAt))
      .limit(limit)
      .offset(offset);
  },

  async markMessagesAsRead(conversationId: string, userId: string) {
    await db.update(schema.messages)
      .set({ isRead: true })
      .where(and(
        eq(schema.messages.conversationId, conversationId),
        ne(schema.messages.senderId, userId),
        eq(schema.messages.isRead, false)
      ));
  },

  async getRecentMessagesFromUser(conversationId: string, senderId: string, limit = 3) {
    return db.select().from(schema.messages)
      .where(and(
        eq(schema.messages.conversationId, conversationId),
        eq(schema.messages.senderId, senderId),
        eq(schema.messages.isSystem, false)
      ))
      .orderBy(desc(schema.messages.createdAt))
      .limit(limit);
  },

  async createRoute(userId: string, trackingFrequency: (typeof schema.trackingFrequencyEnum)[number]) {
    const [route] = await db.insert(schema.routes).values({ userId, trackingFrequency }).returning();
    return route;
  },

  async getRoute(id: string) {
    const [route] = await db.select().from(schema.routes).where(eq(schema.routes.id, id));
    return route;
  },

  async updateRoute(id: string, data: Partial<schema.Route>) {
    const [route] = await db.update(schema.routes).set(data).where(eq(schema.routes.id, id)).returning();
    return route;
  },

  async addRoutePoint(data: { routeId: string; latitude: number; longitude: number; altitude?: number; speed?: number; isStop?: boolean }) {
    const [point] = await db.insert(schema.routePoints).values(data).returning();
    return point;
  },

  async getRoutePoints(routeId: string) {
    return db.select().from(schema.routePoints).where(eq(schema.routePoints.routeId, routeId)).orderBy(asc(schema.routePoints.timestamp));
  },

  async addRoutePhoto(routeId: string, photoUrl: string, caption?: string) {
    const [photo] = await db.insert(schema.routePhotos).values({ routeId, photoUrl, caption }).returning();
    return photo;
  },

  async getRoutePhotos(routeId: string) {
    return db.select().from(schema.routePhotos).where(eq(schema.routePhotos.routeId, routeId));
  },

  async getPublishedRoutes(limit = 20, offset = 0) {
    return db.select({ route: schema.routes, user: schema.users })
      .from(schema.routes)
      .innerJoin(schema.users, eq(schema.routes.userId, schema.users.id))
      .where(eq(schema.routes.isPublished, true))
      .orderBy(desc(schema.routes.createdAt))
      .limit(limit)
      .offset(offset);
  },

  async likeRoute(routeId: string, userId: string) {
    try {
      await db.insert(schema.routeLikes).values({ routeId, userId });
      return true;
    } catch (e: any) {
      if (e.code === "23505") return false;
      throw e;
    }
  },

  async unlikeRoute(routeId: string, userId: string) {
    await db.delete(schema.routeLikes).where(and(eq(schema.routeLikes.routeId, routeId), eq(schema.routeLikes.userId, userId)));
  },

  async getRouteLikeCount(routeId: string) {
    const [result] = await db.select({ count: count() }).from(schema.routeLikes).where(eq(schema.routeLikes.routeId, routeId));
    return result?.count || 0;
  },

  async hasUserLikedRoute(routeId: string, userId: string) {
    const [result] = await db.select().from(schema.routeLikes).where(and(eq(schema.routeLikes.routeId, routeId), eq(schema.routeLikes.userId, userId)));
    return !!result;
  },

  async submitContestPhoto(data: { userId: string; photoUrl: string; caption?: string; routeId?: string }) {
    const now = new Date();
    const weekNumber = getWeekNumber(now);
    const yearNumber = now.getFullYear();
    const [entry] = await db.insert(schema.photoContestEntries).values({
      ...data,
      weekNumber,
      yearNumber,
    }).returning();
    return entry;
  },

  async getCurrentContestEntries() {
    const now = new Date();
    const weekNumber = getWeekNumber(now);
    const yearNumber = now.getFullYear();
    return db.select({
      entry: schema.photoContestEntries,
      user: schema.users,
      voteCount: sql<number>`(SELECT COUNT(*) FROM photo_votes WHERE photo_id = ${schema.photoContestEntries.id})::int`,
    })
      .from(schema.photoContestEntries)
      .innerJoin(schema.users, eq(schema.photoContestEntries.userId, schema.users.id))
      .where(and(
        eq(schema.photoContestEntries.weekNumber, weekNumber),
        eq(schema.photoContestEntries.yearNumber, yearNumber),
        eq(schema.photoContestEntries.isRemoved, false),
      ))
      .orderBy(desc(sql`(SELECT COUNT(*) FROM photo_votes WHERE photo_id = ${schema.photoContestEntries.id})`));
  },

  async voteForPhoto(photoId: string, userId: string) {
    const today = new Date().toISOString().split("T")[0];

    const [dailyCount] = await db.select().from(schema.dailyVoteCounts)
      .where(and(eq(schema.dailyVoteCounts.userId, userId), eq(schema.dailyVoteCounts.date, today)));

    if (dailyCount && dailyCount.voteCount >= 10) {
      throw new Error("Hai raggiunto il limite di 10 voti al giorno");
    }

    const [photo] = await db.select().from(schema.photoContestEntries).where(eq(schema.photoContestEntries.id, photoId));
    if (!photo) throw new Error("Foto non trovata");
    if (photo.userId === userId) throw new Error("Non puoi votare le tue foto");

    try {
      await db.insert(schema.photoVotes).values({ photoId, userId });
    } catch (e: any) {
      if (e.code === "23505") throw new Error("Hai già votato questa foto");
      throw e;
    }

    if (dailyCount) {
      await db.update(schema.dailyVoteCounts)
        .set({ voteCount: dailyCount.voteCount + 1 })
        .where(eq(schema.dailyVoteCounts.id, dailyCount.id));
    } else {
      await db.insert(schema.dailyVoteCounts).values({ userId, date: today, voteCount: 1 });
    }

    return true;
  },

  async getDailyVoteCount(userId: string) {
    const today = new Date().toISOString().split("T")[0];
    const [result] = await db.select().from(schema.dailyVoteCounts)
      .where(and(eq(schema.dailyVoteCounts.userId, userId), eq(schema.dailyVoteCounts.date, today)));
    return result?.voteCount || 0;
  },

  async getContestWinners() {
    return db.select({ winner: schema.photoWinners, photo: schema.photoContestEntries, user: schema.users })
      .from(schema.photoWinners)
      .innerJoin(schema.photoContestEntries, eq(schema.photoWinners.photoId, schema.photoContestEntries.id))
      .innerJoin(schema.users, eq(schema.photoWinners.userId, schema.users.id))
      .orderBy(desc(schema.photoWinners.yearNumber), desc(schema.photoWinners.weekNumber));
  },

  async finalizeWeekWinner(weekNumber: number, yearNumber: number) {
    const existing = await db.select().from(schema.photoWinners)
      .where(and(eq(schema.photoWinners.weekNumber, weekNumber), eq(schema.photoWinners.yearNumber, yearNumber)));
    if (existing.length > 0) return existing[0];

    const entries = await db.select({
      entry: schema.photoContestEntries,
      voteCount: sql<number>`(SELECT COUNT(*) FROM photo_votes WHERE photo_id = ${schema.photoContestEntries.id})::int`,
    })
      .from(schema.photoContestEntries)
      .where(and(
        eq(schema.photoContestEntries.weekNumber, weekNumber),
        eq(schema.photoContestEntries.yearNumber, yearNumber),
        eq(schema.photoContestEntries.isRemoved, false),
      ))
      .orderBy(desc(sql`(SELECT COUNT(*) FROM photo_votes WHERE photo_id = ${schema.photoContestEntries.id})`))
      .limit(1);

    if (entries.length === 0) return null;

    const winner = entries[0];
    const [record] = await db.insert(schema.photoWinners).values({
      photoId: winner.entry.id,
      userId: winner.entry.userId,
      weekNumber,
      yearNumber,
      voteCount: winner.voteCount,
    }).returning();
    return record;
  },

  async getApprovedWorkshops() {
    return db.select().from(schema.workshops).where(eq(schema.workshops.isApproved, true));
  },

  async getWorkshop(id: string) {
    const [ws] = await db.select().from(schema.workshops).where(eq(schema.workshops.id, id));
    return ws;
  },

  async getAllWorkshops() {
    return db.select().from(schema.workshops).orderBy(desc(schema.workshops.createdAt));
  },

  async createWorkshop(data: Omit<schema.Workshop, "id" | "createdAt" | "isApproved">) {
    const [ws] = await db.insert(schema.workshops).values(data).returning();
    return ws;
  },

  async updateWorkshop(id: string, data: Partial<schema.Workshop>) {
    const [ws] = await db.update(schema.workshops).set(data).where(eq(schema.workshops.id, id)).returning();
    return ws;
  },

  async deleteWorkshop(id: string) {
    await db.delete(schema.workshops).where(eq(schema.workshops.id, id));
  },

  async logWorkshopContact(workshopId: string, userId: string, contactType: string) {
    await db.insert(schema.workshopContacts).values({ workshopId, userId, contactType });
  },

  async getWorkshopContacts() {
    return db.select({ contact: schema.workshopContacts, workshop: schema.workshops, user: schema.users })
      .from(schema.workshopContacts)
      .innerJoin(schema.workshops, eq(schema.workshopContacts.workshopId, schema.workshops.id))
      .innerJoin(schema.users, eq(schema.workshopContacts.userId, schema.users.id))
      .orderBy(desc(schema.workshopContacts.createdAt));
  },

  async getActiveEasterEggs() {
    return db.select().from(schema.easterEggs).where(eq(schema.easterEggs.isActive, true));
  },

  async getEasterEgg(id: string) {
    const [egg] = await db.select().from(schema.easterEggs).where(eq(schema.easterEggs.id, id));
    return egg;
  },

  async getAllEasterEggs() {
    return db.select().from(schema.easterEggs).orderBy(desc(schema.easterEggs.createdAt));
  },

  async createEasterEgg(data: Omit<schema.EasterEgg, "id" | "createdAt">) {
    const [egg] = await db.insert(schema.easterEggs).values(data).returning();
    return egg;
  },

  async updateEasterEgg(id: string, data: Partial<schema.EasterEgg>) {
    const [egg] = await db.update(schema.easterEggs).set(data).where(eq(schema.easterEggs.id, id)).returning();
    return egg;
  },

  async deleteEasterEgg(id: string) {
    await db.delete(schema.easterEggs).where(eq(schema.easterEggs.id, id));
  },

  async collectEasterEgg(easterEggId: string, userId: string) {
    try {
      const [collected] = await db.insert(schema.collectedEasterEggs).values({ easterEggId, userId }).returning();
      return collected;
    } catch (e: any) {
      if (e.code === "23505") return null;
      throw e;
    }
  },

  async getUserCollectedEasterEggs(userId: string) {
    return db.select({ collected: schema.collectedEasterEggs, easterEgg: schema.easterEggs })
      .from(schema.collectedEasterEggs)
      .innerJoin(schema.easterEggs, eq(schema.collectedEasterEggs.easterEggId, schema.easterEggs.id))
      .where(eq(schema.collectedEasterEggs.userId, userId))
      .orderBy(desc(schema.collectedEasterEggs.collectedAt));
  },

  async createReport(data: { reporterId: string; reportedUserId: string; category: (typeof schema.reportCategoryEnum)[number]; description: string }) {
    const [report] = await db.insert(schema.reports).values(data).returning();
    return report;
  },

  async getReports() {
    return db.select({ report: schema.reports, reporter: schema.users })
      .from(schema.reports)
      .innerJoin(schema.users, eq(schema.reports.reporterId, schema.users.id))
      .orderBy(desc(schema.reports.createdAt));
  },

  async updateReport(id: string, data: Partial<schema.Report>) {
    const [report] = await db.update(schema.reports).set(data).where(eq(schema.reports.id, id)).returning();
    return report;
  },

  async getActiveAds(displayMode?: string) {
    let conditions = [eq(schema.adCampaigns.isActive, true)];
    if (displayMode) {
      conditions.push(eq(schema.adCampaigns.displayMode, displayMode as any));
    }
    return db.select().from(schema.adCampaigns)
      .where(and(...conditions))
      .orderBy(desc(schema.adCampaigns.priority));
  },

  async getAllAds() {
    return db.select().from(schema.adCampaigns).orderBy(desc(schema.adCampaigns.createdAt));
  },

  async createAd(data: Omit<schema.AdCampaign, "id" | "createdAt" | "clickCount" | "impressionCount">) {
    const [ad] = await db.insert(schema.adCampaigns).values(data).returning();
    return ad;
  },

  async updateAd(id: string, data: Partial<schema.AdCampaign>) {
    const [ad] = await db.update(schema.adCampaigns).set(data).where(eq(schema.adCampaigns.id, id)).returning();
    return ad;
  },

  async deleteAd(id: string) {
    await db.delete(schema.adCampaigns).where(eq(schema.adCampaigns.id, id));
  },

  async incrementAdClick(id: string) {
    await db.update(schema.adCampaigns).set({ clickCount: sql`${schema.adCampaigns.clickCount} + 1` }).where(eq(schema.adCampaigns.id, id));
  },

  async incrementAdImpression(id: string) {
    await db.update(schema.adCampaigns).set({ impressionCount: sql`${schema.adCampaigns.impressionCount} + 1` }).where(eq(schema.adCampaigns.id, id));
  },

  async createModeratorLog(data: { moderatorId: string; action: string; targetType: (typeof schema.moderatorTargetTypeEnum)[number]; targetId: string; details?: string }) {
    const [log] = await db.insert(schema.moderatorLogs).values(data).returning();
    return log;
  },

  async getModeratorLogs() {
    return db.select({ log: schema.moderatorLogs, moderator: schema.users })
      .from(schema.moderatorLogs)
      .innerJoin(schema.users, eq(schema.moderatorLogs.moderatorId, schema.users.id))
      .orderBy(desc(schema.moderatorLogs.createdAt));
  },

  async getSetting(key: string) {
    const [setting] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key));
    return setting?.value;
  },

  async setSetting(key: string, value: string) {
    await db.insert(schema.appSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
  },

  async getAllSettings() {
    const settings = await db.select().from(schema.appSettings);
    const result: Record<string, string | null> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    return result;
  },

  async createVerificationCode(identifier: string, type: (typeof schema.verificationTypeEnum)[number]) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const [record] = await db.insert(schema.verificationCodes).values({ identifier, code, type, expiresAt }).returning();
    console.log(`[VERIFICA] Codice ${type} per ${identifier}: ${code}`);
    return record;
  },

  async verifyCode(identifier: string, code: string, type: (typeof schema.verificationTypeEnum)[number]) {
    const [record] = await db.select().from(schema.verificationCodes)
      .where(and(
        eq(schema.verificationCodes.identifier, identifier),
        eq(schema.verificationCodes.code, code),
        eq(schema.verificationCodes.type, type),
        isNull(schema.verificationCodes.usedAt),
        gte(schema.verificationCodes.expiresAt, new Date()),
      ))
      .orderBy(desc(schema.verificationCodes.createdAt))
      .limit(1);

    if (!record) return false;
    await db.update(schema.verificationCodes).set({ usedAt: new Date() }).where(eq(schema.verificationCodes.id, record.id));
    return true;
  },

  async createNotification(data: { userId: string; title: string; body: string; type: string; relatedId?: string }) {
    const [notif] = await db.insert(schema.notifications).values(data).returning();
    return notif;
  },

  async getUserNotifications(userId: string, limit = 50) {
    return db.select().from(schema.notifications)
      .where(eq(schema.notifications.userId, userId))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit);
  },

  async markNotificationRead(id: string) {
    await db.update(schema.notifications).set({ isRead: true }).where(eq(schema.notifications.id, id));
  },

  async getAnalytics() {
    const [totalUsers] = await db.select({ count: count() }).from(schema.users);
    const [totalRoutes] = await db.select({ count: count() }).from(schema.routes).where(eq(schema.routes.isPublished, true));
    const [totalWorkshopClicks] = await db.select({ count: sql<number>`SUM(${schema.adCampaigns.clickCount})::int` }).from(schema.adCampaigns);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [activeToday] = await db.select({ count: count() }).from(schema.users).where(gte(schema.users.updatedAt, today));
    return {
      totalUsers: totalUsers?.count || 0,
      activeToday: activeToday?.count || 0,
      totalRoutes: totalRoutes?.count || 0,
      totalAdClicks: totalWorkshopClicks?.count || 0,
    };
  },

  async removeContestPhoto(id: string) {
    await db.update(schema.photoContestEntries).set({ isRemoved: true }).where(eq(schema.photoContestEntries.id, id));
  },

  async getContestPhotosForModeration() {
    return db.select({
      entry: schema.photoContestEntries,
      user: schema.users,
      reportCount: sql<number>`(SELECT COUNT(*) FROM reports WHERE reported_user_id = ${schema.photoContestEntries.userId} AND category = 'foto_inappropriata')::int`,
    })
      .from(schema.photoContestEntries)
      .innerJoin(schema.users, eq(schema.photoContestEntries.userId, schema.users.id))
      .where(eq(schema.photoContestEntries.isRemoved, false))
      .orderBy(desc(schema.photoContestEntries.createdAt));
  },

  async getAllInvitationCodes() {
    return db.select().from(schema.invitationCodes).orderBy(desc(schema.invitationCodes.createdAt));
  },

  async getInvitationCode(id: string) {
    const [code] = await db.select().from(schema.invitationCodes).where(eq(schema.invitationCodes.id, id));
    return code;
  },

  async getInvitationCodeByCode(code: string) {
    const [result] = await db.select().from(schema.invitationCodes).where(eq(schema.invitationCodes.code, code));
    return result;
  },

  async createInvitationCode(data: { code: string; description?: string; maxUses?: number; isActive?: boolean; expiresAt?: Date | null }) {
    const [code] = await db.insert(schema.invitationCodes).values({
      code: data.code,
      description: data.description,
      maxUses: data.maxUses ?? 1,
      isActive: data.isActive !== false,
      expiresAt: data.expiresAt,
    }).returning();
    return code;
  },

  async updateInvitationCode(id: string, data: Partial<schema.InvitationCode>) {
    const [code] = await db.update(schema.invitationCodes).set(data).where(eq(schema.invitationCodes.id, id)).returning();
    return code;
  },

  async deleteInvitationCode(id: string) {
    await db.delete(schema.invitationCodes).where(eq(schema.invitationCodes.id, id));
  },

  async useInvitationCode(code: string) {
    const invitation = await this.getInvitationCodeByCode(code);
    if (!invitation) return { valid: false, error: "Codice invito non trovato" };
    if (!invitation.isActive) return { valid: false, error: "Codice invito non attivo" };
    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) return { valid: false, error: "Codice invito scaduto" };
    if (invitation.currentUses >= invitation.maxUses) return { valid: false, error: "Codice invito esaurito" };

    await db.update(schema.invitationCodes)
      .set({ currentUses: invitation.currentUses + 1 })
      .where(eq(schema.invitationCodes.id, invitation.id));
    return { valid: true };
  },

  async validateInvitationCode(code: string) {
    const invitation = await this.getInvitationCodeByCode(code);
    if (!invitation) return { valid: false, error: "Codice invito non trovato" };
    if (!invitation.isActive) return { valid: false, error: "Codice invito non attivo" };
    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) return { valid: false, error: "Codice invito scaduto" };
    if (invitation.currentUses >= invitation.maxUses) return { valid: false, error: "Codice invito esaurito" };
    return { valid: true };
  },

  async seedDefaultSettings() {
    const defaults: Record<string, string> = {
      splash_image_url: "",
      eula_text: "Termini e Condizioni d'Uso di BikerLink\n\n1. L'utilizzo dell'app implica l'accettazione dei presenti termini.\n2. Non è incoraggiato in nessun modo l'utilizzo dell'app come un'app d'incontri tipo Tinder e affini.\n3. L'uso di immagini generate con intelligenza artificiale è sconsigliato. Sono ammessi avatar in stile anime e fumetto.\n4. Rispetta gli altri utenti e le regole della strada.\n5. BikerLink non è responsabile per eventuali incidenti durante i giri organizzati tramite l'app.\n6. La privacy degli utenti è la nostra priorità.",
      foodtracker_enabled: "false",
      paypal_enabled: "false",
      syneco_default_products: "olio_motore,lubrificante_catena",
      gdrive_backup_enabled: "false",
    };

    for (const [key, value] of Object.entries(defaults)) {
      const existing = await this.getSetting(key);
      if (existing === undefined || existing === null) {
        await this.setSetting(key, value);
      }
    }
  },
};

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
