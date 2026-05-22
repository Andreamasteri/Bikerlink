import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { users, events, eventParticipants, updateEventSchema, type InsertEvent } from "@shared/schema";
import { eq, and, requireAuth, isAdminOrModUser, enrichEvent, type EventRow, systemAccountConditions } from "../events-helpers";

const router = Router();

// GET /api/events/:id — dettaglio evento
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;

    const [row] = await db.select({
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
      .where(and(eq(events.id, id), ...systemAccountConditions(users)));

    if (!row) return sendError(res, 404, "Evento non trovato");

    // Visibility: approved events are public; non-approved only for creator/admin/mod
    if (row.status !== "approved") {
      const isOwner = userId === row.creatorId;
      const isPrivileged = await isAdminOrModUser(userId);
      if (!isOwner && !isPrivileged) {
        return sendError(res, 404, "Evento non trovato");
      }
    }

    const enriched = await enrichEvent(row as EventRow, userId);
    return res.json(enriched);
  } catch (err) {
    console.error("[events] GET /:id error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

// PUT /api/events/:id — modifica evento
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const [existing] = await db.select().from(events).where(eq(events.id, id));
    if (!existing) return sendError(res, 404, "Evento non trovato");

    const isPrivileged = await isAdminOrModUser(userId);
    const isOwner = existing.creatorId === userId;

    if (!isOwner && !isPrivileged) {
      return sendError(res, 403, "Non autorizzato");
    }

    // Creator can only edit events in pending or approved status
    if (isOwner && !isPrivileged && existing.status !== "pending" && existing.status !== "approved") {
      return sendError(res, 403, "Non puoi modificare un evento rifiutato o cancellato");
    }

    const parsedUpdate = updateEventSchema.safeParse(req.body);
    if (!parsedUpdate.success) {
      return sendError(res, 400, parsedUpdate.error.issues[0].message);
    }
    const {
      title, description, eventType, latitude, longitude,
      maxParticipants,
    } = parsedUpdate.data;

    // Use any for fields that might be missing in some schema versions but were in original code
    const body = req.body;

    const updates: Partial<InsertEvent> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description ? description.trim() : null;
    if (eventType !== undefined) updates.eventType = eventType ?? undefined;
    if (body.locationName !== undefined) (updates as any).locationName = body.locationName ? body.locationName.trim() : null;
    if (latitude !== undefined) updates.latitude = latitude ?? null;
    if (longitude !== undefined) updates.longitude = longitude ?? null;
    if (body.eventDate !== undefined) (updates as any).eventDate = body.eventDate;
    if (body.eventTime !== undefined) (updates as any).eventTime = body.eventTime ? body.eventTime.trim() : null;
    if (body.isRecurring !== undefined) (updates as any).isRecurring = Boolean(body.isRecurring);
    if (body.recurrenceInfo !== undefined) (updates as any).recurrenceInfo = body.recurrenceInfo ? body.recurrenceInfo.trim() : null;
    if (maxParticipants !== undefined) updates.maxParticipants = maxParticipants ?? null;
    if (body.websiteUrl !== undefined) (updates as any).websiteUrl = body.websiteUrl ? body.websiteUrl.trim() : null;
    if (body.autoInviteReason !== undefined) (updates as any).autoInviteReason = body.autoInviteReason ? body.autoInviteReason.trim() : null;
    if (body.autoInviteRegion !== undefined) (updates as any).autoInviteRegion = body.autoInviteRegion ? body.autoInviteRegion.trim() : null;
    if (body.autoInviteBrand !== undefined) (updates as any).autoInviteBrand = body.autoInviteBrand ? body.autoInviteBrand.trim() : null;

    const [updated] = await db.update(events).set(updates).where(eq(events.id, id)).returning();

    return res.json({ event: updated, message: "Evento aggiornato con successo" });
  } catch (err) {
    console.error("[events] PUT /:id error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
