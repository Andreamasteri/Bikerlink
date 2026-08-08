import { sendError } from "../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { allLimited } from "../lib/concurrency";
import { createSosSchema } from "@shared/validators";
import { requireAuth } from "../lib/auth-middleware";
import { db } from "../db";
import { users, userProfiles } from "@shared/db";
import { and, eq, isNotNull, gt, notInArray, ne, sql } from "drizzle-orm";
import { sendSosPushNotifications } from "../push-notifications";
import { PROTECTED_NICKNAMES } from "../constants";

const router = Router();

router.use(requireAuth);

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsed = createSosSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }
    const { reason, latitude, longitude, radiusKm } = parsed.data;
    const radius = radiusKm ?? 10;

    const sosEnabled = await storage.getAppSetting("sos_enabled");
    if (sosEnabled?.value === "false") {
      return sendError(res, 403, "Funzione SOS disabilitata");
    }

    const existing = await storage.getActiveSosRequestByUser(userId);
    if (existing) {
      return sendError(res, 409, "Hai già una richiesta SOS attiva");
    }

    const sosRequest = await storage.createSosRequest({
      requesterId: userId,
      reason: reason.trim(),
      latitude,
      longitude,
      radiusKm: radius,
      status: "active",
    });

    try {
      const currentUser = await storage.getUser(userId);
      await Promise.all([
        storage.updateUserProfile(userId, { isAvailable: true }),
        ...(currentUser?.ghostMode ? [storage.updateUser(userId, { ghostMode: false })] : []),
      ]);

      // Notify nearby bikers via push
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const radiusMeters = radius * 1000;
      const nearbyRows = await db
        .select({ userId: userProfiles.userId })
        .from(userProfiles)
        .innerJoin(users, eq(userProfiles.userId, users.id))
        .where(
          and(
            isNotNull(userProfiles.latitude),
            isNotNull(userProfiles.longitude),
            gt(userProfiles.coordinatesUpdatedAt, sevenDaysAgo),
            eq(users.status, "active"),
            eq(users.isFake, false),
            eq(users.isSystem, false),
            ne(users.role, "admin"),
            notInArray(users.nickname, PROTECTED_NICKNAMES),
            sql`${userProfiles.geom} IS NOT NULL`,
            sql`ST_DWithin(${userProfiles.geom}, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography, ${radiusMeters})`,
          )
        );

      const nearbyUserIds = nearbyRows
        .map((r) => r.userId)
        .filter((id) => id !== userId);

      if (nearbyUserIds.length > 0) {
        const requesterNickname = currentUser?.nickname ?? "Un biker";
        sendSosPushNotifications(nearbyUserIds, { reason: reason.trim(), requesterNickname });
      }
    } catch (updateErr) {
      console.error("SOS post-create operations failed (non-fatal):", updateErr);
    }

    return res.status(201).json(sosRequest);
  } catch (error) {
    console.error("SOS create error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/active", async (req: Request, res: Response) => {
  try {
    const sosEnabled = await storage.getAppSetting("sos_enabled");
    if (sosEnabled?.value === "false") {
      return res.json([]);
    }

    const requests = await storage.getActiveSosRequests();
    const enriched = await allLimited(
      requests.map((r) => async () => {
        const requester = await storage.getUser(r.requesterId);
        return {
          ...r,
          requesterNickname: requester?.nickname || "Sconosciuto",
          requesterType: requester?.userType || "biker",
        };
      })
    );
    return res.json(enriched);
  } catch (error) {
    console.error("SOS get active error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/my", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const active = await storage.getActiveSosRequestByUser(userId);
    return res.json(active || null);
  } catch (error) {
    console.error("SOS get my error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/:id/cancel", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const sosRequest = await storage.getSosRequest(req.params.id as string);

    if (!sosRequest) {
      return sendError(res, 404, "Richiesta SOS non trovata");
    }
    if (sosRequest.requesterId !== userId) {
      return sendError(res, 403, "Non autorizzato");
    }
    if (sosRequest.status !== "active") {
      return sendError(res, 400, "Richiesta già chiusa");
    }

    const updated = await storage.updateSosRequest(sosRequest.id, { status: "cancelled" });
    return res.json(updated);
  } catch (error) {
    console.error("SOS cancel error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/:id/accept", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const sosRequest = await storage.getSosRequest(req.params.id as string);

    if (!sosRequest) {
      return sendError(res, 404, "Richiesta SOS non trovata");
    }
    if (sosRequest.status !== "active") {
      return sendError(res, 400, "Richiesta non più attiva");
    }
    if (sosRequest.requesterId === userId) {
      return sendError(res, 400, "Non puoi accettare la tua stessa richiesta");
    }

    const conv = await storage.createConversation({
      conversationType: "private",
      title: `SOS: ${sosRequest.reason}`,
      proposalId: null,
    });

    await storage.addConversationParticipant({
      conversationId: conv.id,
      userId: sosRequest.requesterId,
    });
    await storage.addConversationParticipant({
      conversationId: conv.id,
      userId,
    });

    const helper = await storage.getUser(userId);
    await storage.createMessage({
      conversationId: conv.id,
      senderId: userId,
      content: `${helper?.nickname || "Un utente"} ha accettato la tua richiesta SOS: "${sosRequest.reason}". Posizione condivisa.`,
      messageType: "text",
    });

    await storage.createMessage({
      conversationId: conv.id,
      senderId: sosRequest.requesterId,
      content: "📍 La mia posizione SOS",
      messageType: "location",
      latitude: sosRequest.latitude,
      longitude: sosRequest.longitude,
    });

    const updated = await storage.updateSosRequest(sosRequest.id, {
      status: "accepted",
      helperId: userId,
      conversationId: conv.id,
    });

    return res.json({ sosRequest: updated, conversationId: conv.id });
  } catch (error) {
    console.error("SOS accept error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
