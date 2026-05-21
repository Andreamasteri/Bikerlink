import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  notifications, invitationCodes, feedbackTickets, appSettings, phoneSharingTracker, workshopContacts,
  users,
  type Notification, type InsertNotification,
  type InvitationCode, type InsertInvitationCode,
  type FeedbackTicket, type InsertFeedbackTicket,
  type AppSetting,
  type WorkshopContact,
} from "@shared/schema";
import { AdsStorage } from "./ads";

export class SystemStorage extends AdsStorage {
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

  async updateFeedbackTicket(id: string, updates: { status?: string; internalNote?: string }): Promise<FeedbackTicket | undefined> {
    const [ticket] = await db.update(feedbackTickets).set({ ...updates, updatedAt: new Date() }).where(eq(feedbackTickets.id, id)).returning();
    return ticket;
  }

  async getAppSetting(key: string): Promise<AppSetting | undefined> {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    return setting;
  }

  async upsertAppSetting(key: string, value?: string, valueJson?: unknown): Promise<AppSetting> {
    const [setting] = await db.insert(appSettings)
      .values({ key, value, valueJson, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [appSettings.key], set: { value, valueJson, updatedAt: new Date() } })
      .returning();
    return setting;
  }

  async getAllAppSettings(): Promise<AppSetting[]> {
    return db.select().from(appSettings);
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

  async getWorkshopContactsByPeriod(startDate: Date, endDate: Date): Promise<WorkshopContact[]> {
    return db.select().from(workshopContacts).where(and(gte(workshopContacts.createdAt, startDate), lte(workshopContacts.createdAt, endDate)));
  }
}
