import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { events, users } from "@shared/schema";
import { requireAuth, eq, desc, allLimited, enrichEvent } from "../events-helpers";

const router = Router();

// GET /api/events/my — eventi dell'utente (inclusi pending/rejected)
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const rows = await db.select({
      id: events.id,
      title: events.title,
      description: events.description,
      eventType: events.eventType,
      creatorId: events.creatorId,
      creatorNickname: users.nickname,
      locationName: (events as any).locationName,
      latitude: events.latitude,
      longitude: events.longitude,
      eventDate: (events as any).eventDate,
      eventTime: (events as any).eventTime,
      isRecurring: (events as any).isRecurring,
      recurrenceInfo: (events as any).recurrenceInfo,
      maxParticipants: events.maxParticipants,
      websiteUrl: (events as any).websiteUrl,
      autoInviteReason: (events as any).autoInviteReason,
      autoInviteRegion: (events as any).autoInviteRegion,
      autoInviteBrand: (events as any).autoInviteBrand,
      status: events.status,
      rejectionReason: (events as any).rejectionReason,
      approvedBy: (events as any).approvedBy,
      approvedAt: (events as any).approvedAt,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
    })
      .from(events)
      .leftJoin(users, eq(users.id, events.creatorId))
      .where(eq(events.creatorId, userId))
      .orderBy(desc(events.createdAt));

    const enriched = await allLimited(rows.map((r) => () => enrichEvent(r as any, userId)));
    return res.json(enriched);
  } catch (err) {
    console.error("[events] GET /my error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
