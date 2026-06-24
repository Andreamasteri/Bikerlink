import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  businesses, businessClicks, businessPassageStats,
  type Business, type InsertBusiness, type InsertBusinessClick,
} from "@shared/db";
import { TextAliasesStorage } from "./text-aliases";

/**
 * Business Reach storage (Task #4818, #4917).
 * CRUD business + click tracking + calcolo passaggi qualificati e report reach
 * aggregati (admin e vista self-service del titolare). Estratto da social.ts per
 * rispettare il ratchet 600 righe.
 */
export class BusinessStorage extends TextAliasesStorage {
  async getBusinesses(): Promise<Business[]> {
    return db.select().from(businesses).orderBy(desc(businesses.createdAt));
  }

  async getBusiness(id: string): Promise<Business | undefined> {
    const [row] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
    return row;
  }

  /** Solo i business approvati E attivi: questi sono i marker visibili al rider. */
  async getVisibleBusinesses(): Promise<Business[]> {
    return db.select().from(businesses)
      .where(and(eq(businesses.isApproved, true), eq(businesses.isActive, true)));
  }

  /** Lookup per token di accesso self-service (vista business reach del titolare). */
  async getBusinessByAccessToken(token: string): Promise<Business | undefined> {
    if (!token) return undefined;
    const [row] = await db.select().from(businesses)
      .where(eq(businesses.accessToken, token)).limit(1);
    return row;
  }

  /** Imposta (o revoca con null) il token di accesso self-service del business. */
  async setBusinessAccessToken(id: string, token: string | null): Promise<Business | undefined> {
    const [row] = await db.update(businesses)
      .set({ accessToken: token, updatedAt: new Date() })
      .where(eq(businesses.id, id)).returning();
    return row;
  }

  async createBusiness(data: InsertBusiness): Promise<Business> {
    const [row] = await db.insert(businesses).values(data).returning();
    return row;
  }

  async updateBusiness(id: string, data: Partial<InsertBusiness>): Promise<Business | undefined> {
    const [row] = await db.update(businesses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(businesses.id, id)).returning();
    return row;
  }

  async deleteBusiness(id: string): Promise<void> {
    await db.delete(businesses).where(eq(businesses.id, id));
  }

  /** Bulk toggle visibilità di TUTTI i business (azione "attiva/disattiva tutto"). */
  async setAllBusinessesActive(isActive: boolean): Promise<number> {
    const rows = await db.update(businesses)
      .set({ isActive, updatedAt: new Date() })
      .returning({ id: businesses.id });
    return rows.length;
  }

  async createBusinessClick(data: InsertBusinessClick): Promise<void> {
    await db.insert(businessClicks).values(data);
  }

  /**
   * Calcola i "passaggi qualificati" per un business in un mese ('YYYY-MM').
   * Un passaggio qualificato = una sessione rider con almeno un punto telemetria
   * entro `radiusM` dal business E a velocità <= `maxSpeedKmh` (esclude i flyby
   * autostradali). Output SOLO aggregato: conteggio sessioni + rider distinti,
   * nessuna traccia individuale persistita.
   */
  async computeQualifiedPassages(
    businessId: string,
    periodMonth: string,
    radiusM: number,
    maxSpeedKmh: number,
  ): Promise<{ qualifiedPassages: number; uniqueRiders: number }> {
    const biz = await this.getBusiness(businessId);
    if (!biz || biz.latitude == null || biz.longitude == null) {
      return { qualifiedPassages: 0, uniqueRiders: 0 };
    }
    const lat0 = biz.latitude;
    const lon0 = biz.longitude;
    const [yStr, mStr] = periodMonth.split("-");
    const year = Number(yStr);
    const month = Number(mStr);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return { qualifiedPassages: 0, uniqueRiders: 0 };
    }
    const startMs = Date.UTC(year, month - 1, 1);
    const endMs = Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1);
    // Bounding box prefilter (degrees) per non scorrere tutta la tabella.
    const latDelta = radiusM / 111320;
    const lonDelta = radiusM / (111320 * Math.max(Math.cos((lat0 * Math.PI) / 180), 0.01));
    const result = await db.execute(sql`
      SELECT
        COUNT(DISTINCT user_id || ':' || session_id)::int AS passages,
        COUNT(DISTINCT user_id)::int AS riders
      FROM ride_telemetry
      WHERE lat IS NOT NULL AND lon IS NOT NULL
        AND ts >= ${startMs} AND ts < ${endMs}
        AND speed_kmh IS NOT NULL AND speed_kmh <= ${maxSpeedKmh}
        AND lat BETWEEN ${lat0 - latDelta} AND ${lat0 + latDelta}
        AND lon BETWEEN ${lon0 - lonDelta} AND ${lon0 + lonDelta}
        AND (
          6371000 * acos(
            LEAST(1, GREATEST(-1,
              cos(radians(${lat0})) * cos(radians(lat)) * cos(radians(lon) - radians(${lon0}))
              + sin(radians(${lat0})) * sin(radians(lat))
            ))
          )
        ) <= ${radiusM}
    `);
    const rows = (result as unknown as { rows: Array<{ passages: number; riders: number }> }).rows ?? [];
    const qualifiedPassages = Number(rows[0]?.passages ?? 0);
    const uniqueRiders = Number(rows[0]?.riders ?? 0);
    await db.insert(businessPassageStats)
      .values({ businessId, periodMonth, qualifiedPassages, uniqueRiders, radiusM, computedAt: new Date() })
      .onConflictDoUpdate({
        target: [businessPassageStats.businessId, businessPassageStats.periodMonth],
        set: { qualifiedPassages, uniqueRiders, radiusM, computedAt: new Date() },
      });
    return { qualifiedPassages, uniqueRiders };
  }

  /**
   * Report reach mensile: per ogni business, passaggi qualificati (da cache) +
   * click per azione, sul mese. SOLO conteggi aggregati.
   */
  async getBusinessReport(periodMonth: string): Promise<Array<{
    businessId: string;
    name: string;
    type: string;
    qualifiedPassages: number;
    uniqueRiders: number;
    radiusM: number;
    computedAt: Date | null;
    clicks: number;
    clicksByAction: Record<string, number>;
  }>> {
    const [yStr, mStr] = periodMonth.split("-");
    const year = Number(yStr);
    const month = Number(mStr);
    const startMs = Date.UTC(year, month - 1, 1);
    const endMs = Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1);
    const monthStart = new Date(startMs);
    const monthEnd = new Date(endMs);

    const biz = await db.select().from(businesses).orderBy(desc(businesses.createdAt));
    const stats = await db.select().from(businessPassageStats)
      .where(eq(businessPassageStats.periodMonth, periodMonth));
    const statsByBiz = new Map(stats.map((s) => [s.businessId, s]));

    const clickRows = await db.select({
      businessId: businessClicks.businessId,
      actionType: businessClicks.actionType,
      count: sql<number>`count(*)::int`,
    })
      .from(businessClicks)
      .where(and(
        sql`${businessClicks.createdAt} >= ${monthStart}`,
        sql`${businessClicks.createdAt} < ${monthEnd}`,
      ))
      .groupBy(businessClicks.businessId, businessClicks.actionType);

    const clicksByBiz = new Map<string, Record<string, number>>();
    for (const r of clickRows) {
      const map = clicksByBiz.get(r.businessId) ?? {};
      map[r.actionType] = Number(r.count);
      clicksByBiz.set(r.businessId, map);
    }

    return biz.map((b) => {
      const s = statsByBiz.get(b.id);
      const clicksByAction = clicksByBiz.get(b.id) ?? {};
      const clicks = Object.values(clicksByAction).reduce((a, c) => a + c, 0);
      return {
        businessId: b.id,
        name: b.name,
        type: b.type,
        qualifiedPassages: s?.qualifiedPassages ?? 0,
        uniqueRiders: s?.uniqueRiders ?? 0,
        radiusM: s?.radiusM ?? 0,
        computedAt: s?.computedAt ?? null,
        clicks,
        clicksByAction,
      };
    });
  }

  /**
   * Vista self-service del titolare (Task #4917): report reach aggregato di UN
   * solo business per un mese, più l'elenco dei mesi disponibili. SOLO conteggi
   * aggregati — nessuna traccia individuale di rider è mai esposta.
   */
  async getBusinessSelfReport(businessId: string, periodMonth: string): Promise<{
    businessId: string;
    name: string;
    type: string;
    periodMonth: string;
    qualifiedPassages: number;
    uniqueRiders: number;
    radiusM: number;
    computedAt: Date | null;
    clicks: number;
    clicksByAction: Record<string, number>;
    availableMonths: string[];
  } | null> {
    const biz = await this.getBusiness(businessId);
    if (!biz) return null;

    const [yStr, mStr] = periodMonth.split("-");
    const year = Number(yStr);
    const month = Number(mStr);
    const startMs = Date.UTC(year, month - 1, 1);
    const endMs = Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1);
    const monthStart = new Date(startMs);
    const monthEnd = new Date(endMs);

    const [stat] = await db.select().from(businessPassageStats)
      .where(and(
        eq(businessPassageStats.businessId, businessId),
        eq(businessPassageStats.periodMonth, periodMonth),
      )).limit(1);

    const clickRows = await db.select({
      actionType: businessClicks.actionType,
      count: sql<number>`count(*)::int`,
    })
      .from(businessClicks)
      .where(and(
        eq(businessClicks.businessId, businessId),
        sql`${businessClicks.createdAt} >= ${monthStart}`,
        sql`${businessClicks.createdAt} < ${monthEnd}`,
      ))
      .groupBy(businessClicks.actionType);

    const clicksByAction: Record<string, number> = {};
    for (const r of clickRows) clicksByAction[r.actionType] = Number(r.count);
    const clicks = Object.values(clicksByAction).reduce((a, c) => a + c, 0);

    // Mesi disponibili: unione dei period_month con stat passaggi e dei mesi con
    // almeno un click, per popolare il selettore mese della vista titolare.
    const months = new Set<string>();
    const statMonths = await db.select({ periodMonth: businessPassageStats.periodMonth })
      .from(businessPassageStats)
      .where(eq(businessPassageStats.businessId, businessId));
    for (const r of statMonths) months.add(r.periodMonth);
    const clickMonths = await db.execute(sql<{ m: string }>`
      SELECT DISTINCT to_char(created_at, 'YYYY-MM') AS m
      FROM business_clicks
      WHERE business_id = ${businessId}
    `);
    for (const r of (clickMonths as unknown as { rows: Array<{ m: string }> }).rows ?? []) {
      if (r.m) months.add(r.m);
    }
    months.add(periodMonth);
    const availableMonths = Array.from(months).sort((a, b) => b.localeCompare(a));

    return {
      businessId: biz.id,
      name: biz.name,
      type: biz.type,
      periodMonth,
      qualifiedPassages: stat?.qualifiedPassages ?? 0,
      uniqueRiders: stat?.uniqueRiders ?? 0,
      radiusM: stat?.radiusM ?? 0,
      computedAt: stat?.computedAt ?? null,
      clicks,
      clicksByAction,
      availableMonths,
    };
  }
}
