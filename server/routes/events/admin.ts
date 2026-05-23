import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { users, events } from "@shared/db";
import { eq, asc, desc, requireAdminOrMod, allLimited, enrichEvent, count } from "../events-helpers";

const router = Router();

// GET /api/events/admin/pending — admin/mod: lista pending
router.get("/pending", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdminOrMod(req, res);
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
      .where(eq(events.status, "pending"))
      .orderBy(asc(events.createdAt));

    const enriched = await allLimited(rows.map((r) => () => enrichEvent(r as any, userId)));
    return res.json(enriched);
  } catch (err) {
    console.error("[events] GET /admin/pending error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

// GET /api/events/admin/all — admin/mod: tutti gli eventi
router.get("/all", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdminOrMod(req, res);
    if (!userId) return;

    const { status: filterStatus, page = "1", limit = "30" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 30));
    const offset = (pageNum - 1) * limitNum;

    const whereClause = filterStatus ? eq(events.status, filterStatus) : undefined;

    const [rows, totalRows] = await Promise.all([
      db.select({
        id: events.id,
        title: events.title,
        eventType: events.eventType,
        creatorId: events.creatorId,
        creatorNickname: users.nickname,
        locationName: (events as any).locationName,
        eventDate: (events as any).eventDate,
        status: events.status,
        rejectionReason: (events as any).rejectionReason,
        approvedAt: (events as any).approvedAt,
        createdAt: events.createdAt,
      })
        .from(events)
        .leftJoin(users, eq(users.id, events.creatorId))
        .where(whereClause)
        .orderBy(desc(events.createdAt))
        .limit(limitNum)
        .offset(offset),

      db.select({ count: count() }).from(events).where(whereClause),
    ]);

    return res.json({ events: rows, total: Number(totalRows[0]?.count ?? 0), page: pageNum, limit: limitNum });
  } catch (err) {
    console.error("[events] GET /admin/all error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
