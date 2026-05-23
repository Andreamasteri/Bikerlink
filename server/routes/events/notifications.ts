import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { events, motoClubs, eventClubInvites, motoClubMembers, type Event } from "@shared/db";
import { requireAuth, eq, ilike, and, allLimited } from "../events-helpers";
import { sendEventiPushNotifications } from "../../push-notifications";

const router = Router();

export async function sendClubInvitesByIds(evt: Event, eventId: string, clubIds: string[], creatorId: string): Promise<void> {
  try {
    for (const clubId of clubIds) {
      try {
        const [club] = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId)).limit(1);
        if (!club) continue;

        await db.insert(eventClubInvites).values({ eventId, clubId }).onConflictDoNothing();

        const members = await db.select({ userId: motoClubMembers.userId })
          .from(motoClubMembers)
          .where(eq(motoClubMembers.clubId, clubId));

        if (members.length === 0) continue;

        const notifiedMemberIds: string[] = [];
        await allLimited(members.map((member) => async () => {
          if (member.userId === creatorId) return;
          try {
            await storage.createNotification({
              userId: member.userId,
              title: "Evento per il tuo club!",
              body: `Il tuo club "${club.name}" è stato invitato all'evento "${evt.title}".`,
              notificationType: "event_invite",
              referenceType: "event",
              referenceId: eventId,
            });
            notifiedMemberIds.push(member.userId);
          } catch (err) {
            console.warn(`[events] Failed to create notification for user ${member.userId}:`, err);
          }
        }));

        if (notifiedMemberIds.length > 0) {
          sendEventiPushNotifications(notifiedMemberIds, {
            title: "Evento per il tuo club!",
            body: `Il tuo club "${club.name}" è stato invitato all'evento "${evt.title}".`,
            eventId,
          }).catch((err) => {
            console.warn("[events] Failed to send push notifications:", err);
          });
        }
      } catch (err) {
        console.warn(`[events] Failed to process invites for club ${clubId}:`, err);
      }
    }
  } catch (err) {
    console.error("[events] sendClubInvitesByIds error:", err);
  }
}

export async function sendClubInvites(evt: Event, approvedEventId: string): Promise<void> {
  try {
    const conditions: any[] = [];
    if ((evt as any).autoInviteRegion) {
      conditions.push(ilike(motoClubs.region, `%${(evt as any).autoInviteRegion}%`));
    }
    if ((evt as any).autoInviteBrand) {
      conditions.push(ilike(motoClubs.brandName, `%${(evt as any).autoInviteBrand}%`));
    }

    const clubs = conditions.length > 0
      ? await db.select({ id: motoClubs.id, name: motoClubs.name, conversationId: motoClubs.conversationId })
          .from(motoClubs)
          .where(and(...conditions))
      : await db.select({ id: motoClubs.id, name: motoClubs.name, conversationId: motoClubs.conversationId }).from(motoClubs);

    for (const club of clubs) {
      try {
        await db.insert(eventClubInvites).values({ eventId: approvedEventId, clubId: club.id })
          .onConflictDoNothing();

        const members = await db.select({ userId: motoClubMembers.userId })
          .from(motoClubMembers)
          .where(eq(motoClubMembers.clubId, club.id));

        const notifiedMemberIds: string[] = [];
        await allLimited(members.map((member) => async () => {
          if (member.userId === evt.creatorId) return;
          try {
            await storage.createNotification({
              userId: member.userId,
              title: "Evento per il tuo club!",
              body: `Il tuo club "${club.name}" è stato invitato all'evento "${evt.title}". ${(evt as any).autoInviteReason ?? ""}`.trim(),
              notificationType: "event_invite",
              referenceType: "event",
              referenceId: approvedEventId,
            });
            notifiedMemberIds.push(member.userId);
          } catch (err) {
            console.warn(`[events] Failed to create notification for user ${member.userId}:`, err);
          }
        }));

        if (notifiedMemberIds.length > 0) {
          sendEventiPushNotifications(notifiedMemberIds, {
            title: "Evento per il tuo club!",
            body: `Il tuo club "${club.name}" è stato invitato all'evento "${evt.title}".`,
            eventId: approvedEventId,
          }).catch((err) => {
            console.warn("[events] Failed to send push notifications (auto-invite):", err);
          });
        }
      } catch (err) {
        console.warn(`[events] Failed to process auto-invite for club ${club.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[events] sendClubInvites error:", err);
  }
}

export default router;
