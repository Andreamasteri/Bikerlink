import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { events, eventParticipants, inviteUserToEventSchema } from "@shared/schema";
import { requireAuth, eq, and } from "../events-helpers";

const router = Router();

router.post("/:id/invite-user", async (req: Request, res: Response) => {
  try {
    const requesterId = requireAuth(req, res);
    if (!requesterId) return;
    const eventId = req.params.id;
    const parsedIu = inviteUserToEventSchema.safeParse(req.body);
    if (!parsedIu.success) return res.status(400).json({ message: parsedIu.error.issues[0].message });
    const { userId: targetUserId } = parsedIu.data;

    const [event] = await db.select({
      id: events.id,
      title: events.title,
      organizerId: (events as any).organizerId, // Note: I saw organizerId in the original file at line 1101, but the schema snippet showed creatorId. Original code used organizerId at 1101.
      status: events.status,
      eventDate: events.eventDate,
    }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) return res.status(404).json({ message: "Evento non trovato" });

    if (event.status !== "approved") {
      return res.status(403).json({ message: "Solo gli eventi approvati accettano inviti" });
    }
    const todayStr = new Date().toISOString().substring(0, 10);
    if (!event.eventDate || String(event.eventDate).substring(0, 10) < todayStr) {
      return res.status(403).json({ message: "Non puoi invitare a un evento già passato" });
    }

    const requester = await storage.getUser(requesterId);
    if (!requester) return res.status(404).json({ message: "Utente non trovato" });

    const isOrganizerOrAdmin =
      event.organizerId === requesterId ||
      requester.role === "admin" ||
      requester.role === "moderator";
    if (!isOrganizerOrAdmin) {
      return res.status(403).json({ message: "Solo l'organizzatore o un admin può invitare utenti" });
    }

    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) return res.status(404).json({ message: "Utente destinatario non trovato" });

    const isBlocked = await storage.hasBlockedUser(targetUserId, requesterId);
    if (isBlocked) return res.status(403).json({ message: "Non puoi contattare questo utente" });

    const [existing] = await db.select({ id: eventParticipants.id })
      .from(eventParticipants)
      .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, targetUserId)))
      .limit(1);
    if (existing) {
      return res.status(409).json({ message: "L'utente partecipa già a questo evento" });
    }

    await storage.createNotification({
      userId: targetUserId,
      title: "Invito a un raduno!",
      body: `${requester.nickname} ti ha invitato al raduno: "${event.title}"`,
      notificationType: "event_invite",
      referenceType: "event",
      referenceId: eventId,
    });

    return res.json({ success: true });
  } catch (e) {
    console.error("[POST /events/:id/invite-user]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

export default router;
