import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../../db";
import { storage } from "../../storage";
import { motoClubs, motoClubMembers, motoClubInvites, motoClubRequests, feedbackTickets } from "@shared/db";
import { respondToInviteSchema, createMotoClubSchema } from "@shared/validators";
import { eq, and, desc, sql } from "drizzle-orm";
import { sendEmail } from "../../email";
import { createClubConversation, addMemberToConversation, notifyTopMembersOfNewJoin } from "./utils";

import { requireAuth } from "../../lib/auth-middleware";
import { sendSuccess, sendError } from "../../lib/api-response";

const router = Router();

router.get("/invites", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const invites = await withDbRetry(() => db.select({
      invite: motoClubInvites,
      club: motoClubs,
    })
      .from(motoClubInvites)
      .innerJoin(motoClubs, eq(motoClubs.id, motoClubInvites.clubId))
      .where(and(eq(motoClubInvites.userId, userId), eq(motoClubInvites.status, "pending"))));

    return res.json(invites.map(r => ({ ...r.invite, club: r.club })));
  } catch (_e) {
    return sendError(res, 500, "Errore interno");
  }
});

router.put("/invites/:id/respond", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const inviteId = req.params.id;
    const parsedInvite = respondToInviteSchema.safeParse(req.body);
    if (!parsedInvite.success) {
      return sendError(res, 400, parsedInvite.error.issues[0].message);
    }
    const { response } = parsedInvite.data;

    const [invite] = await db.select().from(motoClubInvites)
      .where(and(eq(motoClubInvites.id, inviteId as string), eq(motoClubInvites.userId, userId)))
      .limit(1);

    if (!invite) return sendError(res, 404, "Invito non trovato");

    await db.update(motoClubInvites)
      .set({ status: response })
      .where(eq(motoClubInvites.id, inviteId as string));

    if (response === "accepted") {
      const [club] = await db.select().from(motoClubs).where(eq(motoClubs.id, invite.clubId)).limit(1);
      if (club) {
        const existing = await db.select().from(motoClubMembers)
          .where(and(eq(motoClubMembers.clubId, invite.clubId), eq(motoClubMembers.userId, userId)))
          .limit(1);

        if (existing.length > 0) {
          await db.update(motoClubMembers)
            .set({ status: "active", joinedAt: new Date() })
            .where(and(eq(motoClubMembers.clubId, invite.clubId), eq(motoClubMembers.userId, userId)));
        } else {
          await db.insert(motoClubMembers).values({ clubId: invite.clubId, userId, status: "active" });
        }

        let convId = club.conversationId;
        if (!convId) convId = await createClubConversation(invite.clubId, club.name);
        if (convId) await addMemberToConversation(convId, userId);

        await db.update(motoClubs)
          .set({ activityScore: sql`activity_score + 2`, updatedAt: new Date() })
          .where(eq(motoClubs.id, invite.clubId));

        await notifyTopMembersOfNewJoin(invite.clubId, userId, club.name);
      }
    }

    return sendSuccess(res, undefined, response === "accepted" ? "Sei entrato nel club!" : "Invito rifiutato");
  } catch (_e) {
    console.error("[PUT /invites/:id/respond]", _e);
    return sendError(res, 500, "Errore interno");
  }
});

router.post("/request", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsedReq = createMotoClubSchema.safeParse(req.body);
    if (!parsedReq.success) {
      return sendError(res, 400, parsedReq.error.issues[0].message);
    }
    const { name, clubType, brandName, modelName } = parsedReq.data;

    if (!name) return sendError(res, 400, "Nome obbligatorio");
    const [request] = await db.insert(motoClubRequests).values({
      name: name as string,
      clubType: clubType ?? "generic",
      brandName: brandName ?? null,
      modelName: modelName ?? null,
      requestedBy: userId,
      status: "pending",
    }).returning();

    return res.status(201).json(request);
  } catch (_e) {
    return sendError(res, 500, "Errore interno");
  }
});

router.post("/creation-request", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const creationEnabled = await storage.getAppSetting("motoclub_user_creation_enabled");
    if (creationEnabled?.value !== "true") {
      return sendError(res, 403, "Creazione motoclub non abilitata");
    }

    const parsedCreation = createMotoClubSchema.safeParse(req.body);
    if (!parsedCreation.success) {
      return sendError(res, 400, parsedCreation.error.issues[0].message);
    }
    const { name, parentClubId, latitude, longitude, inviteRadiusKm, inviteUserIds } = parsedCreation.data as {
      name: string;
      parentClubId?: string;
      latitude?: number;
      longitude?: number;
      inviteRadiusKm?: number;
      inviteUserIds?: string[];
    };

    const user = await storage.getUser(userId);

    const [request] = await db.insert(motoClubRequests).values({
      name: name.trim(),
      clubType: "custom",
      requestedBy: userId,
      status: "pending",
      parentClubId: parentClubId ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      inviteRadiusKm: inviteRadiusKm ?? null,
      inviteUserIds: inviteUserIds && inviteUserIds.length > 0 ? JSON.stringify(inviteUserIds) : null,
    }).returning();

    await db.insert(feedbackTickets).values({
      userId,
      ticketType: "suggestion",
      subject: `Richiesta creazione Motoclub: ${name}`,
      message: [
        `Utente: ${user?.nickname ?? userId}`,
        `Nome club: ${name}`,
        parentClubId ? `Sub-club di: ${parentClubId}` : "Elenco principale",
        latitude && longitude ? `Posizione: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}` : "Nessuna posizione",
        inviteRadiusKm ? `Raggio inviti: ${inviteRadiusKm} km` : "",
        inviteUserIds && inviteUserIds.length > 0 ? `Utenti invitati: ${inviteUserIds.length}` : "",
        `Request ID: ${request.id}`,
      ].filter(Boolean).join("\n"),
      status: "open",
    });

    const adminEmail = process.env.ADMIN_EMAIL || "bikerlinkapp@gmail.com";
    await sendEmail(
      adminEmail,
      `[BikerLink] Nuova richiesta Motoclub: ${name}`,
      `<p>Un utente ha richiesto la creazione di un nuovo motoclub:</p>
      <ul>
        <li><strong>Utente:</strong> ${user?.nickname ?? userId}</li>
        <li><strong>Nome:</strong> ${name}</li>
        <li><strong>Tipo:</strong> ${parentClubId ? "Sub-club" : "Elenco principale"}</li>
        ${latitude && longitude ? `<li><strong>Posizione:</strong> ${latitude.toFixed(4)}, ${longitude.toFixed(4)}</li>` : ""}
        ${inviteRadiusKm ? `<li><strong>Raggio inviti:</strong> ${inviteRadiusKm} km</li>` : ""}
        ${inviteUserIds && inviteUserIds.length > 0 ? `<li><strong>Inviti manuali:</strong> ${inviteUserIds.length} utenti</li>` : ""}
        <li><strong>Request ID:</strong> ${request.id}</li>
      </ul>
      <p>Vai al pannello admin per approvare o rifiutare.</p>`
    ).catch(_e => console.error("[creation-request] email error:", _e));

    return res.status(201).json({ success: true, requestId: request.id });
  } catch (_e) {
    console.error("[POST /creation-request]", _e);
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/creation-request/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const [request] = await withDbRetry(() => db
      .select()
      .from(motoClubRequests)
      .where(and(eq(motoClubRequests.requestedBy, userId), eq(motoClubRequests.clubType, "custom")))
      .orderBy(desc(motoClubRequests.createdAt))
      .limit(1));

    if (!request) return res.json(null);
    return res.json({
      status: request.status,
      name: request.name,
      createdAt: request.createdAt,
      reviewNote: request.reviewNote,
    });
  } catch (_e) {
    return sendError(res, 500, "Errore interno");
  }
});

export default router;
