import { sendError } from "../lib/api-response";
import { type Request, type Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import {
  eventImages,
  eventParticipants,
  users,
} from "@shared/db";
import {
  eq,
  and,
  asc,
} from "drizzle-orm";
import { systemAccountConditions } from "../lib/system-account-filter";

import { requireUserId } from "../lib/auth-middleware";
export { requireUserId as requireAuth } from "../lib/auth-middleware";

export async function requireAdminOrMod(req: Request, res: Response): Promise<string | null> {
  const userId = requireUserId(req, res);
  if (!userId) return null;
  const user = await storage.getUser(userId);
  if (!user || (user.role !== "admin" && user.role !== "moderator")) {
    sendError(res, 403, "Accesso non autorizzato");
    return null;
  }
  return userId;
}

export async function isAdminOrModUser(userId: string): Promise<boolean> {
  const user = await storage.getUser(userId);
  return !!(user && (user.role === "admin" || user.role === "moderator"));
}

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  eventType: string;
  creatorId: string;
  creatorNickname: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  eventDate: Date;
  eventTime: string | null;
  isRecurring: boolean;
  recurrenceInfo: string | null;
  maxParticipants: number | null;
  websiteUrl: string | null;
  autoInviteReason: string | null;
  autoInviteRegion: string | null;
  autoInviteBrand: string | null;
  status: string;
  rejectionReason: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function enrichEvent(evt: EventRow, requestingUserId: string | null) {
  const [imgs, participants] = await Promise.all([
    db.select().from(eventImages).where(eq(eventImages.eventId, evt.id)).orderBy(asc(eventImages.sortOrder)),
    db.select({
      id: eventParticipants.id,
      userId: eventParticipants.userId,
      participationStatus: eventParticipants.participationStatus,
      joinedAt: eventParticipants.joinedAt,
      nickname: users.nickname,
      photoUrl: users.avatarUrl,
    })
      .from(eventParticipants)
      .leftJoin(users, eq(users.id, eventParticipants.userId))
      .where(and(
        eq(eventParticipants.eventId, evt.id),
        ...systemAccountConditions(users),
      ))
      .orderBy(asc(eventParticipants.joinedAt)),
  ]);

  const goingCount = participants.filter(p => p.participationStatus === "going").length;
  const interestedCount = participants.filter(p => p.participationStatus === "interested").length;
  const userParticipation = requestingUserId
    ? (participants.find(p => p.userId === requestingUserId)?.participationStatus ?? null)
    : null;

  return {
    ...evt,
    images: imgs.map(img => ({ id: img.id, imageUrl: img.imageUrl, sortOrder: img.sortOrder })),
    participantCount: goingCount,
    interestedCount,
    userParticipation,
    participants: participants.map(p => ({
      userId: p.userId,
      nickname: p.nickname,
      photoUrl: p.photoUrl,
      participationStatus: p.participationStatus,
    })),
  };
}

export { eq, and, asc, desc, sql, count, ilike, gte, lte, inArray, ne, notInArray } from "drizzle-orm";
export { systemAccountConditions } from "../lib/system-account-filter";
export { allLimited } from "../lib/concurrency";
