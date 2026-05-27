import { eq, and, or, sql, desc, lte, lt, inArray, isNull, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { systemAccountConditions } from "../lib/system-account-filter";
import {
  proposals, proposalParticipants, proposalMatches, users,
  type Proposal, type InsertProposal,
  type ProposalParticipant, type InsertProposalParticipant,
  type ProposalMatch, type InsertProposalMatch,
} from "@shared/db";
import { ConversationsStorage } from "./conversations";
import { dynamicScoreSql, FRESHNESS_DEFAULTS } from "../matching/scoring";

export class ProposalsStorage extends ConversationsStorage {
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

  async removeProposalParticipant(id: string): Promise<void> {
    await db.delete(proposalParticipants).where(eq(proposalParticipants.id, id));
  }

  async getActiveProposalsWithLocation(): Promise<Proposal[]> {
    const results = await db.select({ proposal: proposals, role: users.role })
      .from(proposals)
      .innerJoin(users, eq(users.id, proposals.userId))
      .where(and(
        eq(proposals.status, "active"),
        sql`${proposals.departureLatitude} IS NOT NULL`,
        sql`${proposals.departureLongitude} IS NOT NULL`,
        sql`${proposals.searchType} IS NOT NULL`,
        ...systemAccountConditions(users),
      ));
    return results.map(r => r.proposal);
  }

  async getProposalMatches(userId: string, options?: { includeArchived?: boolean; halfLifeDays?: number }): Promise<ProposalMatch[]> {
    const halfLife = options?.halfLifeDays ?? FRESHNESS_DEFAULTS.halfLifeProposalDays;
    const archivedCond = options?.includeArchived
      ? isNotNull(proposalMatches.archivedAt)
      : isNull(proposalMatches.archivedAt);
    return db.select().from(proposalMatches).where(and(
      or(eq(proposalMatches.userId1, userId), eq(proposalMatches.userId2, userId)),
      archivedCond,
    )).orderBy(desc(dynamicScoreSql(sql`${proposalMatches.createdAt}`, halfLife)));
  }

  async archiveStaleProposalMatches(afterDays: number = FRESHNESS_DEFAULTS.archiveAfterDays): Promise<number> {
    const cutoff = new Date(Date.now() - afterDays * 24 * 60 * 60 * 1000);
    const result = await db.update(proposalMatches)
      .set({ archivedAt: new Date() })
      .where(and(
        eq(proposalMatches.status, "pending"),
        eq(proposalMatches.acceptedByUser1, false),
        eq(proposalMatches.acceptedByUser2, false),
        isNull(proposalMatches.archivedAt),
        lt(proposalMatches.createdAt, cutoff),
      ))
      .returning({ id: proposalMatches.id });
    return result.length;
  }

  async reactivateProposalMatch(id: string, userId: string): Promise<boolean> {
    const [match] = await db.select().from(proposalMatches).where(eq(proposalMatches.id, id));
    if (!match) return false;
    if (match.userId1 !== userId && match.userId2 !== userId) return false;
    if (!match.archivedAt) return false;
    await db.update(proposalMatches)
      .set({ status: "pending", archivedAt: null, createdAt: new Date() })
      .where(and(eq(proposalMatches.id, id), isNotNull(proposalMatches.archivedAt)));
    return true;
  }

  async getFreshProposalMatchesForUser(userId: string, options?: { threshold?: number; halfLifeDays?: number; limit?: number }): Promise<Array<ProposalMatch & { freshness: number }>> {
    const threshold = options?.threshold ?? FRESHNESS_DEFAULTS.freshThreshold;
    const halfLife = options?.halfLifeDays ?? FRESHNESS_DEFAULTS.halfLifeProposalDays;
    const limit = options?.limit ?? 50;
    const freshExpr = dynamicScoreSql(sql`${proposalMatches.createdAt}`, halfLife);
    const rows = await db.select({
      match: proposalMatches,
      freshness: sql<number>`${freshExpr}`.as("freshness"),
    }).from(proposalMatches).where(and(
      or(eq(proposalMatches.userId1, userId), eq(proposalMatches.userId2, userId)),
      isNull(proposalMatches.archivedAt),
      eq(proposalMatches.status, "pending"),
      sql`${freshExpr} > ${threshold}`,
    )).orderBy(desc(sql`${freshExpr}`)).limit(limit);
    return rows.map((r) => ({ ...r.match, freshness: Number(r.freshness) }));
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
      and(or(eq(proposalMatches.userId1, userId), eq(proposalMatches.userId2, userId)), eq(proposalMatches.status, "rejected"))
    );
    if (rejected.length === 0) return 0;
    await db.delete(proposalMatches).where(
      and(or(eq(proposalMatches.userId1, userId), eq(proposalMatches.userId2, userId)), eq(proposalMatches.status, "rejected"))
    );
    return rejected.length;
  }

  async deletePendingProposalMatches(userId: string): Promise<number> {
    const pending = await db.select().from(proposalMatches).where(
      and(or(eq(proposalMatches.userId1, userId), eq(proposalMatches.userId2, userId)), eq(proposalMatches.status, "pending"))
    );
    if (pending.length === 0) return 0;
    await db.delete(proposalMatches).where(
      and(or(eq(proposalMatches.userId1, userId), eq(proposalMatches.userId2, userId)), eq(proposalMatches.status, "pending"))
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
      .where(and(eq(proposals.status, "active"), sql`${proposals.expiresAt} IS NOT NULL`, lte(proposals.expiresAt, now)))
      .returning();
    if (result.length > 0) {
      const expiredIds = result.map(p => p.id);
      await db.update(proposalMatches)
        .set({ status: "expired" })
        .where(and(
          eq(proposalMatches.status, "pending"),
          sql`${proposalMatches.proposalId1} = ANY(${expiredIds})`,
          sql`${proposalMatches.proposalId2} = ANY(${expiredIds})`
        ));
    }
    return result.length;
  }

  async deleteExpiredProposals(): Promise<number> {
    const expiredProposalsList = await db.select({ id: proposals.id }).from(proposals).where(eq(proposals.status, "expired"));
    if (expiredProposalsList.length === 0) return 0;
    const expiredIds = expiredProposalsList.map(p => p.id);
    await db.delete(proposalMatches).where(
      or(inArray(proposalMatches.proposalId1, expiredIds), inArray(proposalMatches.proposalId2, expiredIds))
    );
    await db.delete(proposalParticipants).where(inArray(proposalParticipants.proposalId, expiredIds));
    const deleted = await db.delete(proposals).where(eq(proposals.status, "expired")).returning();
    return deleted.length;
  }

  async getAllExistingProposalMatchKeys(): Promise<Set<string>> {
    const rows = await db.select({ proposalId1: proposalMatches.proposalId1, proposalId2: proposalMatches.proposalId2 }).from(proposalMatches);
    const keys = new Set<string>();
    for (const r of rows) {
      keys.add(`${r.proposalId1}:${r.proposalId2}`);
      keys.add(`${r.proposalId2}:${r.proposalId1}`);
    }
    return keys;
  }
}
