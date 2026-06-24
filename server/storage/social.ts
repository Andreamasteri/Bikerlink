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
import { BusinessStorage } from "./business";

export class SocialStorage extends BusinessStorage {
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
}
