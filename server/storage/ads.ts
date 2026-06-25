import { eq, and, or, sql, desc, asc, isNull, isNotNull } from "drizzle-orm";
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
        isNull(adCampaigns.ghostedAt),
        sql`${adCampaigns.name} NOT LIKE '\\_\\_selfcheck\\_\\_%' ESCAPE '\\'`
      )
    );
  }

  async getActiveAdsByUserType(userType: string): Promise<AdCampaign[]> {
    return db.select().from(adCampaigns).where(
      and(
        eq(adCampaigns.isActive, true),
        isNull(adCampaigns.ghostedAt),
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
    // Le campagne nel cestino (ghosted_at IS NOT NULL) non esistono per il
    // sistema: niente warmup, serving, conteggi né cleanup-reference.
    return db.select().from(adCampaigns)
      .where(isNull(adCampaigns.ghostedAt))
      .orderBy(desc(adCampaigns.createdAt));
  }

  /**
   * Marca una campagna come ghost (cestino) — usato dal warmup quando l'immagine
   * è irrecuperabile da Object Storage. Non elimina la riga: l'admin può
   * ripristinarla dal pannello "Segnalate dal sistema".
   */
  async ghostCampaign(id: string): Promise<void> {
    await db.update(adCampaigns)
      .set({ ghostedAt: sql`NOW()` })
      .where(eq(adCampaigns.id, id));
  }

  /** Campagne nel cestino (solo pannello admin "Segnalate dal sistema"). */
  async getGhostedCampaigns(): Promise<AdCampaign[]> {
    return db.select().from(adCampaigns)
      .where(isNotNull(adCampaigns.ghostedAt))
      .orderBy(desc(adCampaigns.ghostedAt));
  }

  /** Ripristina una campagna ghostata (ghosted_at = NULL). */
  async restoreCampaign(id: string): Promise<AdCampaign | undefined> {
    const [campaign] = await db.update(adCampaigns)
      .set({ ghostedAt: null })
      .where(eq(adCampaigns.id, id))
      .returning();
    return campaign;
  }

  async deleteCampaign(id: string): Promise<void> {
    await db.delete(adCampaigns).where(eq(adCampaigns.id, id));
  }

  /**
   * Hard-delete di TUTTE le campagne artefatto del prober (__selfcheck__*).
   * Sono campagne di test, non campagne reali: vanno eliminate dal DB, mai
   * ghostate. Idempotente — chiamabile nel finally del self-check per garantire
   * che non restino mai artefatti anche se le DELETE HTTP per-id falliscono.
   * Ritorna il numero di righe rimosse.
   */
  async deleteSelfcheckCampaigns(): Promise<number> {
    const rows = await db.delete(adCampaigns)
      .where(sql`${adCampaigns.name} LIKE '\\_\\_selfcheck\\_\\_%' ESCAPE '\\'`)
      .returning({ id: adCampaigns.id });
    return rows.length;
  }
}
