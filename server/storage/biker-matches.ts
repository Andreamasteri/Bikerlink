import { eq, and, or, sql, asc, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  bikerBikerMatches, userBlocks, users,
  type BikerBikerMatch, type InsertBikerBikerMatch,
  type UserBlock,
} from "@shared/db";
import { MatchingStorage } from "./matching";

export class BikerMatchesStorage extends MatchingStorage {
  async getBikerBikerMatchesForUser(userId: string): Promise<BikerBikerMatch[]> {
    return db.select().from(bikerBikerMatches).where(
      or(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, userId))
    ).orderBy(
      sql`CASE WHEN ${bikerBikerMatches.status} = 'accepted' THEN 0 WHEN ${bikerBikerMatches.status} = 'new' THEN 1 ELSE 2 END`,
      asc(bikerBikerMatches.id)
    ).limit(2000);
  }

  async createBikerBikerMatch(data: InsertBikerBikerMatch): Promise<BikerBikerMatch | undefined> {
    const idA = data.biker1Id < data.biker2Id ? data.biker1Id : data.biker2Id;
    const idB = data.biker1Id < data.biker2Id ? data.biker2Id : data.biker1Id;
    const isSupermatch = data.isSupermatch ?? false;
    const status = data.status || "new";
    const pairType = data.pairType ?? "bb";
    const result = await db.execute(sql`
      INSERT INTO biker_biker_matches (id, biker1_id, biker2_id, motorcycle_brand, status, is_supermatch, pair_type)
      VALUES (gen_random_uuid(), ${idA}, ${idB}, ${data.motorcycleBrand}, ${status}, ${isSupermatch}, ${pairType})
      ON CONFLICT (LEAST(biker1_id, biker2_id), GREATEST(biker1_id, biker2_id), motorcycle_brand)
      DO UPDATE SET
        status = 'new',
        is_supermatch = EXCLUDED.is_supermatch,
        pair_type = EXCLUDED.pair_type
      WHERE biker_biker_matches.status = 'rejected'
      RETURNING *`);
    if (!result.rows || result.rows.length === 0) return undefined;
    const row = result.rows[0];
    return {
      id: row.id, biker1Id: row.biker1_id, biker2Id: row.biker2_id,
      motorcycleBrand: row.motorcycle_brand, status: row.status,
      isSupermatch: row.is_supermatch, pairType: row.pair_type ?? "bb", createdAt: row.created_at,
    } as BikerBikerMatch;
  }

  async getBikerBikerMatch(id: string): Promise<BikerBikerMatch | undefined> {
    const [match] = await db.select().from(bikerBikerMatches).where(eq(bikerBikerMatches.id, id));
    return match;
  }

  async updateBikerBikerMatch(id: string, data: Partial<InsertBikerBikerMatch>): Promise<BikerBikerMatch | undefined> {
    const [updated] = await db.update(bikerBikerMatches).set(data).where(eq(bikerBikerMatches.id, id)).returning();
    return updated;
  }

  async resetBikerBikerMatchToNew(id: string, userId: string): Promise<boolean> {
    const [match] = await db.select().from(bikerBikerMatches).where(eq(bikerBikerMatches.id, id));
    if (!match) return false;
    if (match.biker1Id !== userId && match.biker2Id !== userId) return false;
    const newStatus = match.status === "accepted" ? "rejected" : "new";
    await db.update(bikerBikerMatches).set({ status: newStatus }).where(eq(bikerBikerMatches.id, id));
    return true;
  }

  async deleteRejectedBikerBikerMatches(userId: string): Promise<number> {
    const rejected = await db.select().from(bikerBikerMatches).where(
      and(or(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, userId)), eq(bikerBikerMatches.status, "rejected"))
    );
    if (rejected.length === 0) return 0;
    await db.delete(bikerBikerMatches).where(
      and(or(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, userId)), eq(bikerBikerMatches.status, "rejected"))
    );
    return rejected.length;
  }

  async deleteNewBikerBikerMatches(userId: string): Promise<number> {
    const newMatches = await db.select().from(bikerBikerMatches).where(
      and(or(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, userId)), eq(bikerBikerMatches.status, "new"))
    );
    if (newMatches.length === 0) return 0;
    await db.delete(bikerBikerMatches).where(
      and(or(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, userId)), eq(bikerBikerMatches.status, "new"))
    );
    return newMatches.length;
  }

  async getAcceptedBikerBikerPairKeys(userId: string): Promise<Set<string>> {
    const rows = await db.select({ biker1Id: bikerBikerMatches.biker1Id, biker2Id: bikerBikerMatches.biker2Id })
      .from(bikerBikerMatches)
      .where(and(or(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, userId)), eq(bikerBikerMatches.status, "accepted")));
    const keys = new Set<string>();
    for (const r of rows) {
      const idA = r.biker1Id < r.biker2Id ? r.biker1Id : r.biker2Id;
      const idB = r.biker1Id < r.biker2Id ? r.biker2Id : r.biker1Id;
      keys.add(`${idA}:${idB}`);
    }
    return keys;
  }

  async blockUser(blockerId: string, blockedId: string): Promise<UserBlock> {
    const [block] = await db.insert(userBlocks).values({ blockerId, blockedId }).returning();
    return block;
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<boolean> {
    const result = await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId))).returning();
    return result.length > 0;
  }

  async isBlocked(userId1: string, userId2: string): Promise<boolean> {
    const [row] = await db.select().from(userBlocks).where(
      or(and(eq(userBlocks.blockerId, userId1), eq(userBlocks.blockedId, userId2)), and(eq(userBlocks.blockerId, userId2), eq(userBlocks.blockedId, userId1)))
    ).limit(1);
    return !!row;
  }

  async hasBlockedUser(blockerId: string, blockedId: string): Promise<boolean> {
    const [row] = await db.select().from(userBlocks).where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId))).limit(1);
    return !!row;
  }

  async getBlockedUserIds(userId: string): Promise<string[]> {
    const rows = await db.select().from(userBlocks).where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)));
    return rows.map(r => r.blockerId === userId ? r.blockedId : r.blockerId);
  }

  async getBlockedUsersByBlocker(blockerId: string): Promise<Array<{ id: string; nickname: string; userType: string | null; avatarUrl: string | null }>> {
    const rows = await db.select({ id: users.id, nickname: users.nickname, userType: users.userType, avatarUrl: users.avatarUrl })
      .from(userBlocks).innerJoin(users, eq(users.id, userBlocks.blockedId)).where(eq(userBlocks.blockerId, blockerId));
    return rows;
  }

  async getAllBlockedPairs(): Promise<Array<{ blockerId: string; blockedId: string }>> {
    const rows = await db.select({ blockerId: userBlocks.blockerId, blockedId: userBlocks.blockedId }).from(userBlocks);
    return rows;
  }

  async getAdminBlocks(options: { search?: string; page?: number; limit?: number }): Promise<{
    blocks: Array<{ id: string; blockerId: string; blockerNickname: string; blockerAvatarUrl: string | null; blockedId: string; blockedNickname: string; blockedAvatarUrl: string | null; createdAt: string }>;
    total: number; hasMore: boolean;
  }> {
    const pageSize = Math.min(options.limit ?? 20, 100);
    const pageNum = Math.max(options.page ?? 1, 1);
    const offset = (pageNum - 1) * pageSize;
    const searchFilter = options.search?.trim().toLowerCase() ?? "";
    type BlockRow = Record<string, unknown> & { id: string; blockerId: string; blockerNickname: string; blockerAvatarUrl: string | null; blockedId: string; blockedNickname: string; blockedAvatarUrl: string | null; createdAt: Date };
    type CountRow = Record<string, unknown> & { cnt: number };
    const rowsResult = searchFilter
      ? await db.execute<BlockRow>(sql`SELECT ub.id, ub.blocker_id AS "blockerId", u1.nickname AS "blockerNickname", u1.avatar_url AS "blockerAvatarUrl", ub.blocked_id AS "blockedId", u2.nickname AS "blockedNickname", u2.avatar_url AS "blockedAvatarUrl", ub.created_at AS "createdAt" FROM user_blocks ub JOIN users u1 ON u1.id = ub.blocker_id JOIN users u2 ON u2.id = ub.blocked_id WHERE LOWER(u1.nickname) LIKE ${'%' + searchFilter + '%'} OR LOWER(u2.nickname) LIKE ${'%' + searchFilter + '%'} ORDER BY ub.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`)
      : await db.execute<BlockRow>(sql`SELECT ub.id, ub.blocker_id AS "blockerId", u1.nickname AS "blockerNickname", u1.avatar_url AS "blockerAvatarUrl", ub.blocked_id AS "blockedId", u2.nickname AS "blockedNickname", u2.avatar_url AS "blockedAvatarUrl", ub.created_at AS "createdAt" FROM user_blocks ub JOIN users u1 ON u1.id = ub.blocker_id JOIN users u2 ON u2.id = ub.blocked_id ORDER BY ub.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`);
    const countResult = searchFilter
      ? await db.execute<CountRow>(sql`SELECT COUNT(*)::int AS cnt FROM user_blocks ub JOIN users u1 ON u1.id = ub.blocker_id JOIN users u2 ON u2.id = ub.blocked_id WHERE LOWER(u1.nickname) LIKE ${'%' + searchFilter + '%'} OR LOWER(u2.nickname) LIKE ${'%' + searchFilter + '%'}`)
      : await db.execute<CountRow>(sql`SELECT COUNT(*)::int AS cnt FROM user_blocks`);
    const total = Number(countResult.rows[0]?.cnt ?? 0);
    const blocks = rowsResult.rows.map((r) => ({
      id: String(r.id), blockerId: String(r.blockerId), blockerNickname: String(r.blockerNickname),
      blockerAvatarUrl: r.blockerAvatarUrl ? String(r.blockerAvatarUrl) : null,
      blockedId: String(r.blockedId), blockedNickname: String(r.blockedNickname),
      blockedAvatarUrl: r.blockedAvatarUrl ? String(r.blockedAvatarUrl) : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
    return { blocks, total, hasMore: offset + blocks.length < total };
  }

  async deleteBlockById(id: string): Promise<boolean> {
    const result = await db.delete(userBlocks).where(eq(userBlocks.id, id)).returning();
    return result.length > 0;
  }

  async deleteBikerBikerMatchesBetween(userId1: string, userId2: string): Promise<number> {
    const result = await db.delete(bikerBikerMatches).where(
      or(and(eq(bikerBikerMatches.biker1Id, userId1), eq(bikerBikerMatches.biker2Id, userId2)), and(eq(bikerBikerMatches.biker1Id, userId2), eq(bikerBikerMatches.biker2Id, userId1)))
    ).returning();
    return result.length;
  }

  async cleanupAdminMatches(): Promise<{ bikerZavarrina: number; bikerBiker: number }> {
    const adminUsers = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["admin"]));
    if (adminUsers.length === 0) return { bikerZavarrina: 0, bikerBiker: 0 };
    const adminIds = adminUsers.map(u => u.id);
    console.log(`[AdminCleanup] Trovati ${adminIds.length} utenti admin da escludere dai match`);
    let bzDeleted = 0;
    let bbDeleted = 0;
    const { bikerZavarrinaMatches: bzTable } = await import("@shared/db");
    for (const adminId of adminIds) {
      const bzResult = await db.delete(bzTable).where(or(eq(bzTable.bikerId, adminId), eq(bzTable.zavarrinaId, adminId))).returning();
      bzDeleted += bzResult.length;
      const bbResult = await db.delete(bikerBikerMatches).where(or(eq(bikerBikerMatches.biker1Id, adminId), eq(bikerBikerMatches.biker2Id, adminId))).returning();
      bbDeleted += bbResult.length;
    }
    console.log(`[AdminCleanup] Rimossi ${bzDeleted} match biker-zavorrina e ${bbDeleted} match biker-biker con admin`);
    return { bikerZavarrina: bzDeleted, bikerBiker: bbDeleted };
  }
}
