import { eq, and, or, sql, desc, asc } from "drizzle-orm";
import { db } from "../db";
import {
  adCampaigns, adClicks,
  type AdCampaign, type InsertAdCampaign,
  type AdClick, type InsertAdClick,
} from "@shared/db";
import { SocialStorage } from "./social";

export class AdsStorage extends SocialStorage {
  async getActiveCampaigns(): Promise<AdCampaign[]> {
    return db.select().from(adCampaigns).where(
      and(
        eq(adCampaigns.isActive, true),
        sql`${adCampaigns.name} NOT LIKE '\\_\\_selfcheck\\_\\_%' ESCAPE '\\'`
      )
    );
  }

  async getActiveAdsByUserType(userType: string): Promise<AdCampaign[]> {
    return db.select().from(adCampaigns).where(
      and(
        eq(adCampaigns.isActive, true),
        or(eq(adCampaigns.targetUserType, userType), eq(adCampaigns.targetUserType, "tutti")),
        sql`${adCampaigns.name} NOT LIKE '\\_\\_selfcheck\\_\\_%' ESCAPE '\\'`
      )
    ).orderBy(asc(adCampaigns.sortOrder));
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

  async getAllCampaigns(): Promise<AdCampaign[]> {
    return db.select().from(adCampaigns).orderBy(desc(adCampaigns.createdAt));
  }

  async deleteCampaign(id: string): Promise<void> {
    await db.delete(adCampaigns).where(eq(adCampaigns.id, id));
  }
}
