import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../../db";
import { motoClubs, motoClubMembers, motoClubInvites, users, conversationParticipants } from "@shared/db";
import { eq, and, sql } from "drizzle-orm";
import { systemAccountConditions } from "../../lib/system-account-filter";
import { createClubConversation, addMemberToConversation, removeMemberFromConversation, notifyTopMembersOfNewJoin } from "./utils";
import { storage } from "../../storage";

import { requireAuth } from "../../lib/auth-middleware";
import { sendSuccess, sendError } from "../../lib/api-response";

const router = Router();

router.get("/me/clubs", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const clubs = await withDbRetry(() => db.select({
      club: motoClubs,
      member: motoClubMembers,
    })
      .from(motoClubMembers)
      .innerJoin(motoClubs, eq(motoClubs.id, motoClubMembers.clubId))
      .where(and(eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active"))));

    return res.json(clubs.map(r => ({ ...r.club, joinedAt: r.member.joinedAt, role: r.member.role })));
  } catch (_e) {
    return sendError(res, 500, "Errore interno");
  }
});

router.post("/:id/join", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const clubId = req.params.id;

    const [club] = await db.select().from(motoClubs).where(and(eq(motoClubs.id, clubId as string), eq(motoClubs.isApproved, true))).limit(1);
    if (!club) return sendError(res, 404, "Club non trovato");

    const requestingUser = await storage.getUser(userId);
    if (requestingUser?.userType === "zavorrina" && !club.allowZavorrine) {
      return sendError(res, 403, "Questo club non accetta zavorrine");
    }

    const existing = await db.select().from(motoClubMembers)
      .where(and(eq(motoClubMembers.clubId, clubId as string), eq(motoClubMembers.userId, userId)))
      .limit(1);

    if (existing.length > 0 && existing[0].status === "active") {
      return sendError(res, 409, "Sei già membro di questo club");
    }

    if (existing.length > 0) {
      await db.update(motoClubMembers)
        .set({ status: "active", joinedAt: new Date() })
        .where(and(eq(motoClubMembers.clubId, clubId as string), eq(motoClubMembers.userId, userId)));
    } else {
      await db.insert(motoClubMembers).values({ clubId: clubId as string, userId, status: "active" });
    }

    await db.update(motoClubInvites)
      .set({ status: "accepted" })
      .where(and(eq(motoClubInvites.clubId, clubId as string), eq(motoClubInvites.userId, userId)));

    let convId = club.conversationId;
    const conversationWasNew = !convId;
    if (!convId) {
      convId = await createClubConversation(clubId as string, club.name);
    }
    if (convId) {
      await addMemberToConversation(convId, userId);
      if (conversationWasNew) {
        const existingMembers = await db
          .select({ userId: motoClubMembers.userId })
          .from(motoClubMembers)
          .where(and(eq(motoClubMembers.clubId, clubId as string), eq(motoClubMembers.status, "active")));
        const participantRows = existingMembers
          .filter((m) => m.userId !== userId)
          .map((m) => ({ conversationId: convId as string, userId: m.userId }));
        if (participantRows.length > 0) {
          await db.insert(conversationParticipants).values(participantRows).onConflictDoNothing();
        }
      }
    }

    await db.update(motoClubs)
      .set({ activityScore: sql`activity_score + 2`, updatedAt: new Date() })
      .where(eq(motoClubs.id, clubId as string));

    await notifyTopMembersOfNewJoin(clubId as string, userId, club.name);

    return sendSuccess(res, undefined, "Sei entrato nel club");
  } catch (_e) {
    console.error("[POST /motoclubs/:id/join]", _e);
    return sendError(res, 500, "Errore interno");
  }
});

router.post("/:id/leave", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const clubId = req.params.id;

    await db.update(motoClubMembers)
      .set({ status: "left" })
      .where(and(eq(motoClubMembers.clubId, clubId as string), eq(motoClubMembers.userId, userId)));

    const [club] = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId as string)).limit(1);
    if (club?.conversationId) {
      await removeMemberFromConversation(club.conversationId, userId);
    }

    return sendSuccess(res, undefined, "Hai lasciato il club");
  } catch (_e) {
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const clubId = req.params.id;
    const userId = req.session.userId!;

    const [clubRow] = await withDbRetry(() => db.select({
      id: motoClubs.id,
      name: motoClubs.name,
      clubType: motoClubs.clubType,
      brandName: motoClubs.brandName,
      modelName: motoClubs.modelName,
      region: motoClubs.region,
      country: motoClubs.country,
      description: motoClubs.description,
      logoUrl: motoClubs.logoUrl,
      coverUrl: motoClubs.coverUrl,
      isApproved: motoClubs.isApproved,
      isFeatured: motoClubs.isFeatured,
      memberCount: motoClubs.memberCount,
      activityScore: motoClubs.activityScore,
      conversationId: motoClubs.conversationId,
      parentClubId: motoClubs.parentClubId,
      latitude: motoClubs.latitude,
      longitude: motoClubs.longitude,
      allowZavorrine: motoClubs.allowZavorrine,
      createdAt: motoClubs.createdAt,
      updatedAt: motoClubs.updatedAt,
      _proposedLatitude: motoClubs.proposedLatitude,
    }).from(motoClubs).where(eq(motoClubs.id, clubId as string)).limit(1));
    if (!clubRow) return sendError(res, 404, "Club non trovato");
    const { _proposedLatitude, ...club } = clubRow;
    const hasPendingLocationProposal = _proposedLatitude != null;

    const [membership] = await withDbRetry(() => db.select({ id: motoClubMembers.id })
      .from(motoClubMembers)
      .where(and(
        eq(motoClubMembers.clubId, clubId as string),
        eq(motoClubMembers.userId, userId),
        eq(motoClubMembers.status, "active"),
      ))
      .limit(1));
    if (!membership) return sendError(res, 403, "Non sei membro di questo club");

    const membersRaw = await withDbRetry(() => db.select({
      member: motoClubMembers,
      user: users,
    })
      .from(motoClubMembers)
      .innerJoin(users, eq(users.id, motoClubMembers.userId))
      .where(and(eq(motoClubMembers.clubId, clubId as string), eq(motoClubMembers.status, "active"), ...systemAccountConditions(users))));

    const members = membersRaw.map(r => ({
      userId: r.user.id,
      nickname: r.user.nickname,
      userType: r.user.userType,
      avatarUrl: r.user.avatarUrl,
      country: r.user.country,
      joinedAt: r.member.joinedAt,
    }));

    return res.json({ ...club, hasPendingLocationProposal, members, memberCount: members.length });
  } catch (_e) {
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/:id/detail", requireAuth, async (req: Request, res: Response) => {
  try {
    const clubId = req.params.id;
    const userId = req.session.userId!;
    const limit = Math.min(parseInt(String(req.query.limit ?? "30"), 10) || 30, 50);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

    const [clubRow] = await withDbRetry(() => db.select({
      id: motoClubs.id,
      name: motoClubs.name,
      clubType: motoClubs.clubType,
      brandName: motoClubs.brandName,
      modelName: motoClubs.modelName,
      region: motoClubs.region,
      country: motoClubs.country,
      description: motoClubs.description,
      logoUrl: motoClubs.logoUrl,
      coverUrl: motoClubs.coverUrl,
      isApproved: motoClubs.isApproved,
      isFeatured: motoClubs.isFeatured,
      memberCount: motoClubs.memberCount,
      activityScore: motoClubs.activityScore,
      conversationId: motoClubs.conversationId,
      parentClubId: motoClubs.parentClubId,
      latitude: motoClubs.latitude,
      longitude: motoClubs.longitude,
      allowZavorrine: motoClubs.allowZavorrine,
      createdAt: motoClubs.createdAt,
      updatedAt: motoClubs.updatedAt,
      _proposedLatitude: motoClubs.proposedLatitude,
    }).from(motoClubs).where(eq(motoClubs.id, clubId as string)).limit(1));
    if (!clubRow) return sendError(res, 404, "Club non trovato");
    const { _proposedLatitude, ...club } = clubRow;
    const hasPendingLocationProposal = _proposedLatitude != null;

    const [membership] = await withDbRetry(() => db.select({ id: motoClubMembers.id })
      .from(motoClubMembers)
      .where(and(
        eq(motoClubMembers.clubId, clubId as string),
        eq(motoClubMembers.userId, userId),
        eq(motoClubMembers.status, "active"),
      ))
      .limit(1));
    if (!membership) return sendError(res, 403, "Non sei membro di questo club");

    const memberships = await withDbRetry(() => db
      .select({
        profileId: motoClubMembers.userId,
        role: motoClubMembers.role,
        joinedAt: motoClubMembers.joinedAt,
        nickname: users.nickname,
        userType: users.userType,
        avatarUrl: users.avatarUrl,
        country: users.country,
      })
      .from(motoClubMembers)
      .innerJoin(users, eq(motoClubMembers.userId, users.id))
      .where(and(eq(motoClubMembers.clubId, clubId as string), eq(motoClubMembers.status, "active"), ...systemAccountConditions(users)))
      .orderBy(motoClubMembers.joinedAt)
      .limit(limit)
      .offset(offset));

    const [{ totalCount }] = await withDbRetry(() => db
      .select({ totalCount: sql<number>`count(${motoClubMembers.id})::int` })
      .from(motoClubMembers)
      .innerJoin(users, eq(motoClubMembers.userId, users.id))
      .where(and(eq(motoClubMembers.clubId, clubId as string), eq(motoClubMembers.status, "active"), ...systemAccountConditions(users))));

    const total = Number(totalCount);
    return res.json({ ...club, hasPendingLocationProposal, members: memberships, totalCount: total, hasMore: offset + limit < total });
  } catch (_e) {
    console.error("[GET /:id/detail]", _e);
    return sendError(res, 500, "Errore interno");
  }
});

export default router;
