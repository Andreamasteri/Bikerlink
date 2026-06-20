import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../../db";
import { events, users } from "@shared/db";
import { requireAuth, eq, desc, allLimited, enrichEvent } from "../events-helpers";

const router = Router();

// GET /api/events/my — eventi dell'utente (inclusi pending/rejected)
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const rows = await withDbRetry(() => db.select({
      id: events.id,
      title: events.title,
      description: events.description,
      eventType: events.eventType,
      creatorId: events.creatorId,
      creatorNickname: users.nickname,
      locationName: events.locationName,
      latitude: events.latitude,
      longitude: events.longitude,
      eventDate: events.eventDate,
      eventTime: events.eventTime,
      isRecurring: events.isRecurring,
      recurrenceInfo: events.recurrenceInfo,
      maxParticipants: events.maxParticipants,
      websiteUrl: events.websiteUrl,
      autoInviteReason: events.autoInviteReason,
      autoInviteRegion: events.autoInviteRegion,
      autoInviteBrand: events.autoInviteBrand,
      status: events.status,
      rejectionReason: events.rejectionReason,
      approvedBy: events.approvedBy,
      approvedAt: events.approvedAt,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
    })
      .from(events)
      .leftJoin(users, eq(users.id, events.creatorId))
      .where(eq(events.creatorId, userId))
      .orderBy(desc(events.createdAt)));

    const enriched = await allLimited(rows.map((r) => () => enrichEvent(r, userId)));
    return res.json(enriched);
  } catch (err) {
    console.error("[events] GET /my error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
