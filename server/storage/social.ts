import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  workshops, workshopContacts, easterEggs, collectedEasterEggs, reports, moderatorLogs,
  businesses, businessClicks, businessPassageStats,
  type Workshop, type InsertWorkshop,
  type WorkshopContact, type InsertWorkshopContact,
  type EasterEgg, type InsertEasterEgg,
  type CollectedEasterEgg, type InsertCollectedEasterEgg,
  type Report, type InsertReport,
  type ModeratorLog, type InsertModeratorLog,
  type Business, type InsertBusiness, type InsertBusinessClick,
} from "@shared/db";
import { TextAliasesStorage } from "./text-aliases";

export class SocialStorage extends TextAliasesStorage {
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

  async getWorkshopContactsByPeriod(startDate: Date, endDate: Date): Promise<WorkshopContact[]> {
    return db.select().from(workshopContacts).where(and(sql`${workshopContacts.createdAt} >= ${startDate}`, sql`${workshopContacts.createdAt} <= ${endDate}`));
  }

  async getPendingReportsCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(reports).where(eq(reports.status, "pending"));
    return result[0]?.count ?? 0;
  }

  // Task #2530 — filtri estesi per admin/moderator
  async getReportsFiltered(opts: {
    status?: string;
    category?: string;
    severity?: string;
    context?: string;
    reportedUserId?: string;
    limit?: number;
  } = {}): Promise<Report[]> {
    const conds = [] as ReturnType<typeof eq>[];
    if (opts.status) conds.push(eq(reports.status, opts.status));
    if (opts.category) conds.push(eq(reports.category, opts.category));
    if (opts.severity) conds.push(eq(reports.severity, opts.severity));
    if (opts.context) conds.push(eq(reports.context, opts.context));
    if (opts.reportedUserId) conds.push(eq(reports.reportedUserId, opts.reportedUserId));
    const q = db.select().from(reports);
    const qWithWhere = conds.length ? q.where(and(...conds)) : q;
    return qWithWhere.orderBy(desc(reports.createdAt)).limit(opts.limit ?? 200);
  }

  async resolveReport(id: string, opts: { status: "resolved" | "dismissed"; resolvedBy: string }): Promise<Report | undefined> {
    const [report] = await db.update(reports)
      .set({ status: opts.status, resolvedBy: opts.resolvedBy, resolvedAt: new Date() })
      .where(eq(reports.id, id))
      .returning();
    return report;
  }

  // ─── Task #2531 — Hub Moderazione ────────────────────────────────────────

  /**
   * Dashboard hub summary: contatori per status, categoria, ruolo, top pattern,
   * critical aperti > 1h, ban attivi 24h. Una sola roundtrip.
   */
  async getReportsHubSummary(): Promise<{
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
  }> {
    const [byStatusRows, byCatRows, byRoleRows, bySevRows, topPatternsRows, criticalRows, bansRows, unclaimedRows] = await Promise.all([
      db.execute(sql<{ status: string; n: number }>`SELECT status, count(*)::int AS n FROM reports GROUP BY status`),
      db.execute(sql<{ category: string; n: number }>`SELECT COALESCE(category,'other') AS category, count(*)::int AS n FROM reports WHERE status='pending' GROUP BY category`),
      db.execute(sql<{ role: string; n: number }>`SELECT COALESCE(reported_user_role,'unknown') AS role, count(*)::int AS n FROM reports WHERE status='pending' GROUP BY reported_user_role`),
      db.execute(sql<{ severity: string; n: number }>`SELECT severity, count(*)::int AS n FROM reports WHERE status='pending' GROUP BY severity`),
      db.execute(sql<{ reported_user_id: string; count: number; weight: number }>`
        SELECT reported_user_id, count(*)::int AS count,
               COALESCE(SUM(reporter_trust_score),0)::float AS weight
        FROM reports
        WHERE created_at > now() - interval '30 days'
        GROUP BY reported_user_id
        ORDER BY weight DESC, count DESC
        LIMIT 5
      `),
      db.execute(sql<{ n: number }>`
        SELECT count(*)::int AS n FROM reports
        WHERE status='pending' AND severity='critical' AND created_at < now() - interval '1 hour'
      `),
      db.execute(sql<{ n: number }>`
        SELECT count(*)::int AS n FROM users
        WHERE (status IN ('blocked','suspended') OR shadow_banned_at IS NOT NULL)
          AND updated_at > now() - interval '24 hours'
      `),
      db.execute(sql<{ n: number }>`SELECT count(*)::int AS n FROM reports WHERE status='pending' AND assigned_moderator_id IS NULL`),
    ]);

    const toMap = (rows: { rows: Array<Record<string, unknown>> }, key: string): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const r of rows.rows) out[String(r[key])] = Number(r.n);
      return out;
    };
    const byStatus = toMap(byStatusRows as unknown as { rows: Array<Record<string, unknown>> }, "status");
    return {
      byStatus,
      byCategory: toMap(byCatRows as unknown as { rows: Array<Record<string, unknown>> }, "category"),
      byRole: toMap(byRoleRows as unknown as { rows: Array<Record<string, unknown>> }, "role"),
      bySeverity: toMap(bySevRows as unknown as { rows: Array<Record<string, unknown>> }, "severity"),
      topPatterns: ((topPatternsRows as unknown as { rows: Array<{ reported_user_id: string; count: number; weight: number }> }).rows ?? []).map((r) => ({
        reportedUserId: String(r.reported_user_id),
        count: Number(r.count),
        weight: Number(r.weight),
      })),
      criticalOpenOver1h: Number(((criticalRows as unknown as { rows: Array<{ n: number }> }).rows[0]?.n) ?? 0),
      activeBansLast24h: Number(((bansRows as unknown as { rows: Array<{ n: number }> }).rows[0]?.n) ?? 0),
      unclaimedPending: Number(((unclaimedRows as unknown as { rows: Array<{ n: number }> }).rows[0]?.n) ?? 0),
      totalPending: byStatus.pending ?? 0,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Pattern: utenti con N+ segnalazioni in 30 giorni, ordinati per peso (count × trust). */
  async getReportsPatterns(opts: { minCount?: number; days?: number; limit?: number } = {}): Promise<Array<{
    reportedUserId: string;
    nickname: string | null;
    userType: string | null;
    count: number;
    weight: number;
    lastReportAt: string | null;
    statusBreakdown: Record<string, number>;
  }>> {
    const minCount = opts.minCount ?? 2;
    const days = opts.days ?? 30;
    const limit = opts.limit ?? 100;
    const result = await db.execute(sql<Record<string, unknown>>`
      SELECT r.reported_user_id,
             u.nickname,
             u.user_type,
             count(*)::int AS count,
             COALESCE(SUM(r.reporter_trust_score),0)::float AS weight,
             MAX(r.created_at) AS last_report_at,
             jsonb_object_agg(r.status, cnt) AS status_breakdown
      FROM (
        SELECT reported_user_id, reporter_trust_score, status, created_at
        FROM reports
        WHERE created_at > now() - (${days}::text || ' days')::interval
      ) r
      LEFT JOIN users u ON u.id = r.reported_user_id
      LEFT JOIN LATERAL (
        SELECT status, count(*)::int AS cnt
        FROM reports r2
        WHERE r2.reported_user_id = r.reported_user_id
          AND r2.created_at > now() - (${days}::text || ' days')::interval
        GROUP BY status
      ) sb ON sb.status = r.status
      GROUP BY r.reported_user_id, u.nickname, u.user_type
      HAVING count(*) >= ${minCount}
      ORDER BY weight DESC, count DESC
      LIMIT ${limit}
    `);
    const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
    return rows.map((r) => ({
      reportedUserId: String(r.reported_user_id),
      nickname: r.nickname ? String(r.nickname) : null,
      userType: r.user_type ? String(r.user_type) : null,
      count: Number(r.count),
      weight: Number(r.weight),
      lastReportAt: r.last_report_at ? new Date(r.last_report_at as string).toISOString() : null,
      statusBreakdown: (r.status_breakdown as Record<string, number>) ?? {},
    }));
  }

  /** Ban attivi: shadow-ban temporaneo, suspended, blocked. */
  async getActiveBans(): Promise<Array<{
    userId: string;
    nickname: string;
    userType: string | null;
    type: "shadow" | "suspended" | "blocked";
    reason: string | null;
    shadowBannedAt: string | null;
    shadowBannedUntil: string | null;
    updatedAt: string | null;
  }>> {
    const result = await db.execute(sql<Record<string, unknown>>`
      SELECT id, nickname, user_type, status, shadow_banned_at, shadow_banned_until, shadow_ban_reason, updated_at
      FROM users
      WHERE status IN ('blocked','suspended')
         OR shadow_banned_at IS NOT NULL
      ORDER BY COALESCE(shadow_banned_at, updated_at) DESC
      LIMIT 500
    `);
    const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
    return rows.map((r) => {
      let type: "shadow" | "suspended" | "blocked" = "shadow";
      if (r.status === "blocked") type = "blocked";
      else if (r.status === "suspended") type = "suspended";
      return {
        userId: String(r.id),
        nickname: String(r.nickname),
        userType: r.user_type ? String(r.user_type) : null,
        type,
        reason: r.shadow_ban_reason ? String(r.shadow_ban_reason) : null,
        shadowBannedAt: r.shadow_banned_at ? new Date(r.shadow_banned_at as string).toISOString() : null,
        shadowBannedUntil: r.shadow_banned_until ? new Date(r.shadow_banned_until as string).toISOString() : null,
        updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
      };
    });
  }

  /**
   * Claim atomico: il primo moderatore che lo prende vince.
   * Ritorna null se già preso da qualcun altro.
   */
  async claimReport(id: string, moderatorId: string): Promise<Report | null> {
    const result = await db.execute(sql<Record<string, unknown>>`
      UPDATE reports
      SET assigned_moderator_id = ${moderatorId}, assigned_at = now()
      WHERE id = ${id}
        AND (assigned_moderator_id IS NULL OR assigned_moderator_id = ${moderatorId})
      RETURNING *
    `);
    const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
    if (rows.length === 0) return null;
    const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    return report ?? null;
  }

  async unclaimReport(id: string, moderatorId: string): Promise<Report | null> {
    const result = await db.execute(sql<Record<string, unknown>>`
      UPDATE reports
      SET assigned_moderator_id = NULL, assigned_at = NULL
      WHERE id = ${id} AND assigned_moderator_id = ${moderatorId}
      RETURNING id
    `);
    const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
    if (rows.length === 0) return null;
    const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    return report ?? null;
  }

  async unbanUser(userId: string): Promise<boolean> {
    const { users } = await import("@shared/db");
    const result = await db.execute(sql<Record<string, unknown>>`
      UPDATE users
      SET status = 'active',
          shadow_banned_at = NULL,
          shadow_ban_reason = NULL,
          shadow_banned_until = NULL,
          updated_at = now()
      WHERE id = ${userId}
      RETURNING id
    `);
    void users;
    const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
    return rows.length > 0;
  }

  // ── Business Reach (Task #4818) ────────────────────────────────────────────

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
