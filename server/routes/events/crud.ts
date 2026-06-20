import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../../db";
import { users, events, type InsertEvent } from "@shared/db";
import { updateEventSchema } from "@shared/validators";
import { eq, and, requireAuth, isAdminOrModUser, enrichEvent, type EventRow, systemAccountConditions } from "../events-helpers";

const router = Router();

// GET /api/events/:id — dettaglio evento
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;

    const [row] = await withDbRetry(() => db.select({
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
      .where(and(eq(events.id, id), ...systemAccountConditions(users))));

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

    const body = req.body as Record<string, unknown>;

    const updates: Partial<InsertEvent> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description ? description.trim() : null;
    if (eventType !== undefined) updates.eventType = eventType ?? undefined;
    if (body.locationName !== undefined) updates.locationName = body.locationName ? String(body.locationName).trim() : null;
    if (latitude !== undefined) updates.latitude = latitude ?? null;
    if (longitude !== undefined) updates.longitude = longitude ?? null;
    if (body.eventDate !== undefined) updates.eventDate = body.eventDate ? new Date(body.eventDate as string) : undefined;
    if (body.eventTime !== undefined) updates.eventTime = body.eventTime ? String(body.eventTime).trim() : null;
    if (body.isRecurring !== undefined) updates.isRecurring = Boolean(body.isRecurring);
    if (body.recurrenceInfo !== undefined) updates.recurrenceInfo = body.recurrenceInfo ? String(body.recurrenceInfo).trim() : null;
    if (maxParticipants !== undefined) updates.maxParticipants = maxParticipants ?? null;
    if (body.websiteUrl !== undefined) updates.websiteUrl = body.websiteUrl ? String(body.websiteUrl).trim() : null;
    if (body.autoInviteReason !== undefined) updates.autoInviteReason = body.autoInviteReason ? String(body.autoInviteReason).trim() : null;
    if (body.autoInviteRegion !== undefined) updates.autoInviteRegion = body.autoInviteRegion ? String(body.autoInviteRegion).trim() : null;
    if (body.autoInviteBrand !== undefined) updates.autoInviteBrand = body.autoInviteBrand ? String(body.autoInviteBrand).trim() : null;

    const [updated] = await db.update(events).set(updates).where(eq(events.id, id)).returning();

    return res.json({ event: updated, message: "Evento aggiornato con successo" });
  } catch (err) {
    console.error("[events] PUT /:id error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
