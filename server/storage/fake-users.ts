import { eq, and, or, sql, desc, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  users, userProfiles, userMotorcycles, conversations, conversationParticipants, messages, fakeUserInteractions,
  type User,
} from "@shared/db";
import { SosStorage } from "./sos";
import { systemAccountConditions } from "../lib/system-account-filter";
import { PROTECTED_NICKNAMES } from "../constants";

export class FakeUsersStorage extends SosStorage {
  async getFakeUserStats(limit = 50, offset = 0, type = "tutti"): Promise<{ users: unknown[]; total: number; hasMore: boolean; stats: { total: number; biker: number; zavorrina: number; coppia: number } }> {
    const baseCondition = and(eq(users.isFake, true), ...systemAccountConditions(users));
    const typeCondition = type !== "tutti"
      ? and(eq(users.isFake, true), ...systemAccountConditions(users), eq(users.userType, type))
      : baseCondition;

    const [[{ total }], [statsRow], fakeUsers] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` }).from(users).where(typeCondition),
      db.select({
        total: sql<number>`count(*)::int`,
        biker: sql<number>`count(*) filter (where ${users.userType} = 'biker')::int`,
        zavorrina: sql<number>`count(*) filter (where ${users.userType} = 'zavorrina')::int`,
        coppia: sql<number>`count(*) filter (where ${users.userType} = 'coppia')::int`,
      }).from(users).where(baseCondition),
      db.select().from(users).where(typeCondition).orderBy(desc(users.createdAt)).limit(limit).offset(offset),
    ]);

    const userIds = fakeUsers.map(u => u.id);
    const [profiles, interactionCounts] = await Promise.all([
      userIds.length > 0 ? db.select().from(userProfiles).where(inArray(userProfiles.userId, userIds)) : Promise.resolve([]),
      userIds.length > 0
        ? db.select({
            fakeUserId: fakeUserInteractions.fakeUserId,
            profileViews: sql<number>`count(*) filter (where ${fakeUserInteractions.interactionType} = 'profile_view')::int`,
            chatRequests: sql<number>`count(*) filter (where ${fakeUserInteractions.interactionType} = 'chat_request')::int`,
            chatMessages: sql<number>`count(*) filter (where ${fakeUserInteractions.interactionType} = 'chat_message')::int`,
          }).from(fakeUserInteractions).where(inArray(fakeUserInteractions.fakeUserId, userIds)).groupBy(fakeUserInteractions.fakeUserId)
        : Promise.resolve([]),
    ]);

    const profileMap = new Map(profiles.map(p => [p.userId, p]));
    const countsMap = new Map(interactionCounts.map(r => [r.fakeUserId, r]));
    const result = fakeUsers.map(u => {
      const { password: _, ...safeUser } = u;
      const counts = countsMap.get(u.id);
      return { ...safeUser, profile: profileMap.get(u.id) ?? null, profileViews: counts?.profileViews ?? 0, chatRequests: counts?.chatRequests ?? 0, chatMessages: counts?.chatMessages ?? 0 };
    });

    return { users: result, total, hasMore: offset + fakeUsers.length < total, stats: { total: statsRow?.total ?? 0, biker: statsRow?.biker ?? 0, zavorrina: statsRow?.zavorrina ?? 0, coppia: statsRow?.coppia ?? 0 } };
  }

  async getFakeUsers(): Promise<User[]> {
    return db.select().from(users).where(and(eq(users.isFake, true), ...systemAccountConditions(users))).orderBy(desc(users.createdAt));
  }

  async deleteFakeUser(id: string): Promise<void> {
    const fakeCondition = and(eq(users.id, id), eq(users.isFake, true), ...systemAccountConditions(users));
    const [fakeUser] = await db.select({ id: users.id }).from(users).where(fakeCondition).limit(1);
    if (!fakeUser) return;
    await db.transaction(async (tx) => {
      await tx.delete(userMotorcycles).where(eq(userMotorcycles.userId, id));
      await tx.delete(users).where(fakeCondition);
    });
  }

  async deleteAllFakeUsers(): Promise<number> {
    const condition = and(eq(users.isFake, true), ...systemAccountConditions(users));
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(condition);
    console.log(`[Admin] deleteAllFakeUsers: trovati ${count} utenti fake da eliminare`);
    if (count === 0) return 0;
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM user_motorcycles WHERE user_id IN (SELECT id FROM users WHERE is_fake = true)`);
      console.log(`[Admin] deleteAllFakeUsers: eliminate moto associate agli utenti fake`);
      await tx.delete(users).where(condition);
      console.log(`[Admin] deleteAllFakeUsers: eliminati ${count} utenti fake`);
      await tx.execute(sql`DELETE FROM conversations WHERE id IN (SELECT c.id FROM conversations c LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id WHERE c.conversation_type != 'motoclub' GROUP BY c.id HAVING count(cp.id) = 0)`);
      const officialUser = await tx.select({ id: users.id }).from(users).where(inArray(users.nickname, PROTECTED_NICKNAMES)).limit(1);
      if (officialUser.length > 0) {
        await tx.execute(sql`DELETE FROM conversations WHERE id IN (SELECT c.id FROM conversations c INNER JOIN conversation_participants cp ON cp.conversation_id = c.id WHERE c.conversation_type != 'motoclub' GROUP BY c.id HAVING count(cp.id) = 1 AND max(cp.user_id) = ${officialUser[0].id})`);
      }
    });
    console.log(`[Admin] deleteAllFakeUsers: pulizia conversation orfane completata`);
    return count;
  }

  async toggleFakeZavorrineAvailability(): Promise<void> {
    const globalToggle = await this.getAppSetting("fake_users_enabled");
    if (globalToggle && globalToggle.value === "false") return;
    const fakeZavorrine = await db.select({ id: users.id, profileUserId: userProfiles.userId, adminOverrideUntil: userProfiles.adminOverrideUntil })
      .from(users).innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(users.isFake, true), eq(users.userType, "zavorrina")));
    const now = new Date();
    for (const z of fakeZavorrine) {
      if (z.adminOverrideUntil && new Date(z.adminOverrideUntil) > now) continue;
      const available = Math.random() < 0.55;
      await db.update(userProfiles).set({ isAvailable: available }).where(eq(userProfiles.userId, z.id));
      if (available) await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, z.id));
    }
    const fakeBikers = await db.select({ id: users.id, profileUserId: userProfiles.userId, adminOverrideUntil: userProfiles.adminOverrideUntil })
      .from(users).innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(users.isFake, true), or(eq(users.userType, "biker"), eq(users.userType, "coppia"))));
    for (const b of fakeBikers) {
      if (b.adminOverrideUntil && new Date(b.adminOverrideUntil) > now) continue;
      const available = Math.random() < 0.55;
      await db.update(userProfiles).set({ isAvailable: available }).where(eq(userProfiles.userId, b.id));
      if (available) await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, b.id));
    }
  }

  async getFakeUserConversations(fakeUserId: string): Promise<import("@shared/db").Conversation[]> {
    const participantRows = await db.select().from(conversationParticipants).where(eq(conversationParticipants.userId, fakeUserId));
    if (participantRows.length === 0) return [];
    const convIds = participantRows.map(p => p.conversationId);
    const convs = await db.select().from(conversations).where(sql`${conversations.id} = ANY(${convIds})`).orderBy(desc(conversations.updatedAt));
    const result = [];
    for (const conv of convs) {
      const parts = await this.getConversationParticipants(conv.id);
      const partUsers = [];
      for (const p of parts) {
        const u = await this.getUser(p.userId);
        if (u) partUsers.push({ id: u.id, nickname: u.nickname, userType: u.userType, isFake: u.isFake });
      }
      const msgs = await this.getMessages(conv.id, 1, 0);
      const totalMsgs = await db.select({ count: sql<number>`count(*)::int` }).from(messages).where(eq(messages.conversationId, conv.id));
      result.push({ ...conv, participants: partUsers, lastMessage: msgs[0] || null, messageCount: totalMsgs[0]?.count ?? 0 });
    }
    return result;
  }
}
