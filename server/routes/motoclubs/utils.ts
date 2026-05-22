import { db } from "../../db";
import { storage } from "../../storage";
import {
  motoClubs,
  motoClubMembers,
  motoClubInvites,
  conversations,
  conversationParticipants,
  messages,
  users,
} from "@shared/db";
import { eq, and, ne, sql, desc, or, ilike } from "drizzle-orm";
import { sendMotoclubPushNotifications } from "../../push-notifications";

export async function createClubConversation(clubId: string, clubName: string) {
  const existing = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId)).limit(1);
  if (!existing[0] || existing[0].conversationId) return existing[0]?.conversationId ?? null;

  const [conv] = await db.insert(conversations).values({
    conversationType: "motoclub",
    title: `Club ${clubName}`,
  }).returning();

  await db.update(motoClubs)
    .set({ conversationId: conv.id, updatedAt: new Date() })
    .where(eq(motoClubs.id, clubId));

  return conv.id;
}

export async function addMemberToConversation(conversationId: string, userId: string) {
  await db.insert(conversationParticipants).values({
    conversationId,
    userId,
  }).onConflictDoNothing();
}

export async function removeMemberFromConversation(conversationId: string, userId: string) {
  await db.delete(conversationParticipants)
    .where(and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, userId)
    ));
}

export async function notifyTopMembersOfNewJoin(clubId: string, newUserId: string, clubName: string) {
  try {
    const club = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId)).limit(1);
    if (!club[0]?.conversationId) return;

    const convId = club[0].conversationId;
    const topSenders = await db.select({
      senderId: messages.senderId,
      count: sql<number>`count(*)::int`,
    })
      .from(messages)
      .where(and(eq(messages.conversationId, convId), ne(messages.senderId, newUserId)))
      .groupBy(messages.senderId)
      .orderBy(desc(sql`count(*)`))
      .limit(3);

    const newUser = await storage.getUser(newUserId);
    const nickname = newUser?.nickname ?? "Un nuovo utente";
    for (const row of topSenders) {
      await storage.createNotification({
        userId: row.senderId,
        title: `Nuovo membro in ${clubName}!`,
        body: `${nickname} è entrato nel tuo club`,
        notificationType: "motoclub_join",
        referenceType: "motoclub",
        referenceId: clubId,
      });
    }

    const topSenderIds = topSenders.map(r => r.senderId);
    sendMotoclubPushNotifications(topSenderIds, {
      title: `Nuovo membro in ${clubName}!`,
      body: `${nickname} è entrato nel tuo club`,
      clubId,
    }).catch(() => {});
  } catch (e) {
    console.error("[notifyTopMembers error]", e);
  }
}

export async function createRegionalClubInvite(userId: string, region: string): Promise<void> {
  try {
    const user = await storage.getUser(userId);
    if (!user) return;

    const [regionalClub] = await db.select()
      .from(motoClubs)
      .where(
        and(
          eq(motoClubs.isApproved, true),
          eq(motoClubs.clubType, "region"),
          eq(motoClubs.region!, region)
        )
      )
      .limit(1);

    if (!regionalClub) return;

    const isMember = await db.select()
      .from(motoClubMembers)
      .where(and(
        eq(motoClubMembers.clubId, regionalClub.id),
        eq(motoClubMembers.userId, userId),
        eq(motoClubMembers.status, "active")
      ))
      .limit(1);
    if (isMember.length > 0) return;

    const existingInvite = await db.select()
      .from(motoClubInvites)
      .where(and(
        eq(motoClubInvites.clubId, regionalClub.id),
        eq(motoClubInvites.userId, userId),
        eq(motoClubInvites.status, "pending")
      ))
      .limit(1);
    if (existingInvite.length > 0) return;

    if (user.autoJoinClubs === false) {
      const declinedRegional = await db.select({ id: motoClubInvites.id })
        .from(motoClubInvites)
        .where(and(
          eq(motoClubInvites.clubId, regionalClub.id),
          eq(motoClubInvites.userId, userId),
          eq(motoClubInvites.status, "declined")
        ))
        .limit(1);
      if (declinedRegional.length > 0) {
        await db.update(motoClubInvites)
          .set({ status: "pending" })
          .where(eq(motoClubInvites.id, declinedRegional[0].id));
      } else {
        await db.insert(motoClubInvites)
          .values({ clubId: regionalClub.id, userId, status: "pending" });
      }
      await storage.createNotification({
        userId,
        title: "Invito al club regionale",
        body: `Sei stato invitato nel club "${regionalClub.name}"`,
        notificationType: "motoclub_invite",
        referenceType: "motoclub",
        referenceId: regionalClub.id,
      });
      sendMotoclubPushNotifications([userId], {
        title: "Invito al club regionale",
        body: `Sei stato invitato nel club "${regionalClub.name}"`,
        clubId: regionalClub.id,
      }).catch(() => {});
      return;
    }

    await db.insert(motoClubMembers)
      .values({ clubId: regionalClub.id, userId, status: "active" })
      .onConflictDoUpdate({
        target: [motoClubMembers.clubId, motoClubMembers.userId],
        set: { status: "active", joinedAt: new Date(), updatedAt: new Date() },
      });

    let convId = regionalClub.conversationId;
    if (!convId) convId = await createClubConversation(regionalClub.id, regionalClub.name);
    if (convId) await addMemberToConversation(convId, userId);

    await db.update(motoClubs)
      .set({ activityScore: sql`activity_score + 2`, updatedAt: new Date() })
      .where(eq(motoClubs.id, regionalClub.id));

    await storage.createNotification({
      userId,
      title: "Sei entrato nel club!",
      body: `Benvenuto nel club regionale "${regionalClub.name}" 🏍️`,
      notificationType: "motoclub_invite",
      referenceType: "motoclub",
      referenceId: regionalClub.id,
    });
  } catch (e) {
    console.error("[createRegionalClubInvite error]", e);
  }
}

export async function createClubInvitesForMoto(userId: string, brand: string, model: string) {
  try {
    const user = await storage.getUser(userId);
    if (!user) return;

    const matchingClubs = await db.select()
      .from(motoClubs)
      .where(
        and(
          eq(motoClubs.isApproved, true),
          eq(motoClubs.clubType, "brand"),
          or(
            ilike(motoClubs.brandName!, brand),
            sql`${motoClubs.brandName} ilike ${'%' + brand + '%'}`,
            sql`${brand} ilike '%' || ${motoClubs.brandName} || '%'`
          )
        )
      );

    for (const club of matchingClubs) {
      const isMember = await db.select()
        .from(motoClubMembers)
        .where(and(
          eq(motoClubMembers.clubId, club.id),
          eq(motoClubMembers.userId, userId),
          eq(motoClubMembers.status, "active")
        ))
        .limit(1);
      if (isMember.length > 0) continue;

      const existingInvite = await db.select()
        .from(motoClubInvites)
        .where(and(
          eq(motoClubInvites.clubId, club.id),
          eq(motoClubInvites.userId, userId),
          eq(motoClubInvites.status, "pending")
        ))
        .limit(1);
      if (existingInvite.length > 0) continue;

      if (user.autoJoinClubs === false) {
        const declinedBrand = await db.select({ id: motoClubInvites.id })
          .from(motoClubInvites)
          .where(and(
            eq(motoClubInvites.clubId, club.id),
            eq(motoClubInvites.userId, userId),
            eq(motoClubInvites.status, "declined")
          ))
          .limit(1);
        if (declinedBrand.length > 0) {
          await db.update(motoClubInvites)
            .set({ status: "pending" })
            .where(eq(motoClubInvites.id, declinedBrand[0].id));
        } else {
          await db.insert(motoClubInvites)
            .values({ clubId: club.id, userId, status: "pending" });
        }
        await storage.createNotification({
          userId,
          title: "Invito al club",
          body: `Sei stato invitato nel club "${club.name}"`,
          notificationType: "motoclub_invite",
          referenceType: "motoclub",
          referenceId: club.id,
        });
        sendMotoclubPushNotifications([userId], {
          title: "Invito al club",
          body: `Sei stato invitato nel club "${club.name}"`,
          clubId: club.id,
        }).catch(() => {});
        continue;
      }

      await db.insert(motoClubMembers)
        .values({ clubId: club.id, userId, status: "active" })
        .onConflictDoUpdate({
          target: [motoClubMembers.clubId, motoClubMembers.userId],
          set: { status: "active", joinedAt: new Date(), updatedAt: new Date() },
        });

      let convId = club.conversationId;
      if (!convId) convId = await createClubConversation(club.id, club.name);
      if (convId) await addMemberToConversation(convId, userId);

      await db.update(motoClubs)
        .set({ activityScore: sql`activity_score + 2`, updatedAt: new Date() })
        .where(eq(motoClubs.id, club.id));

      await storage.createNotification({
        userId,
        title: "Sei entrato nel club!",
        body: `Benvenuto nel club "${club.name}" — hai una ${brand} 🏍️`,
        notificationType: "motoclub_invite",
        referenceType: "motoclub",
        referenceId: club.id,
      });
    }
  } catch (e) {
    console.error("[createClubInvites error]", e);
  }
}
