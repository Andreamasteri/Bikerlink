import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  workshops, workshopContacts, easterEggs, collectedEasterEggs, reports, moderatorLogs,
  type Workshop, type InsertWorkshop,
  type WorkshopContact, type InsertWorkshopContact,
  type EasterEgg, type InsertEasterEgg,
  type CollectedEasterEgg, type InsertCollectedEasterEgg,
  type Report, type InsertReport,
  type ModeratorLog, type InsertModeratorLog,
} from "@shared/db";
import { TrackingStorage } from "./tracking";

export class SocialStorage extends TrackingStorage {
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

  async deleteWorkshop(id: string): Promise<void> {
    await db.delete(workshops).where(eq(workshops.id, id));
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

  async deleteEasterEgg(id: string): Promise<void> {
    await db.delete(easterEggs).where(eq(easterEggs.id, id));
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

  async getModeratorLogs(): Promise<ModeratorLog[]> {
    return db.select().from(moderatorLogs).orderBy(desc(moderatorLogs.createdAt));
  }

  async clearModeratorLogs(): Promise<number> {
    const result = await db.delete(moderatorLogs).returning({ id: moderatorLogs.id });
    return result.length;
  }

  async getPendingReportsCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(reports).where(eq(reports.status, "pending"));
    return result[0]?.count ?? 0;
  }
}
