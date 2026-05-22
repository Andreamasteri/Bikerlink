import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { events, eventParticipants, inviteUserToEventSchema } from "@shared/schema";
import { requireAuth, eq, and } from "../events-helpers";
import { sendSuccess, sendError } from "../../lib/api-response";

const router = Router();

router.post("/:id/invite-user", async (req: Request, res: Response) => {
  try {
    const requesterId = requireAuth(req, res);
    if (!requesterId) return;
    const eventId = req.params.id;
    const parsedIu = inviteUserToEventSchema.safeParse(req.body);
    if (!parsedIu.success) return sendError(res, 400, parsedIu.error.issues[0].message);
    const { userId: targetUserId } = parsedIu.data;

    const [event] = await db.select({
      id: events.id,
      title: events.title,
      organizerId: (events as any).organizerId, // Note: I saw organizerId in the original file at line 1101, but the schema snippet showed creatorId. Original code used organizerId at 1101.
      status: events.status,
      eventDate: events.eventDate,
    }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) return sendError(res, 404, "Evento non trovato");

    if (event.status !== "approved") {
      return sendError(res, 403, "Solo gli eventi approvati accettano inviti");
    }
    const todayStr = new Date().toISOString().substring(0, 10);
    if (!event.eventDate || String(event.eventDate).substring(0, 10) < todayStr) {
      return sendError(res, 403, "Non puoi invitare a un evento già passato");
    }

    const requester = await storage.getUser(requesterId);
    if (!requester) return sendError(res, 404, "Utente non trovato");

    const isOrganizerOrAdmin =
      event.organizerId === requesterId ||
      requester.role === "admin" ||
      requester.role === "moderator";
    if (!isOrganizerOrAdmin) {
      return sendError(res, 403, "Solo l'organizzatore o un admin può invitare utenti");
    }

    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) return sendError(res, 404, "Utente destinatario non trovato");

    const isBlocked = await storage.hasBlockedUser(targetUserId, requesterId);
    if (isBlocked) return sendError(res, 403, "Non puoi contattare questo utente");

    const [existing] = await db.select({ id: eventParticipants.id })
      .from(eventParticipants)
      .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, targetUserId)))
      .limit(1);
    if (existing) {
      return sendError(res, 409, "L'utente partecipa già a questo evento");
    }

    await storage.createNotification({
      userId: targetUserId,
      title: "Invito a un raduno!",
      body: `${requester.nickname} ti ha invitato al raduno: "${event.title}"`,
      notificationType: "event_invite",
      referenceType: "event",
      referenceId: eventId,
    });

    return sendSuccess(res);
  } catch (e) {
    console.error("[POST /events/:id/invite-user]", e);
    return sendError(res, 500, "Errore interno");
  }
});

export default router;
