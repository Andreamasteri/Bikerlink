/**
 * Endpoint lato suggerito: percorsi pianificati in cui l'utente
 * compare come candidato compagno di viaggio.
 *
 *  GET  /api/planned-route-invites/mine          → lista inviti pending
 *  PATCH /api/planned-route-invites/:id/respond  → accetta (avvia chat) o rifiuta
 */

import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { sendError } from "../lib/api-response";
import { plannedRouteInvites, users, plannedRoutes } from "@shared/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { storage } from "../storage";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  const userId = (req.session as { userId?: string })?.userId;
  if (!userId) { sendError(res, 401, "Non autenticato"); return null; }
  return userId;
}

router.get("/mine", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const rows = await db
      .select({
        id: plannedRouteInvites.id,
        routeId: plannedRouteInvites.routeId,
        ownerId: plannedRouteInvites.ownerId,
        score: plannedRouteInvites.score,
        reasons: plannedRouteInvites.reasons,
        priority: plannedRouteInvites.priority,
        status: plannedRouteInvites.status,
        createdAt: plannedRouteInvites.createdAt,
        ownerNickname: users.nickname,
        ownerAvatarUrl: users.avatarUrl,
        routeTitle: plannedRoutes.title,
        routeDistanceKm: plannedRoutes.distanceKm,
        routeDurationMinutes: plannedRoutes.durationMinutes,
        routeStyle: plannedRoutes.style,
        routeVisibility: plannedRoutes.visibility,
      })
      .from(plannedRouteInvites)
      .innerJoin(users, eq(users.id, plannedRouteInvites.ownerId))
      .innerJoin(plannedRoutes, eq(plannedRoutes.id, plannedRouteInvites.routeId))
      .where(
        and(
          eq(plannedRouteInvites.suggestedUserId, userId),
          inArray(plannedRouteInvites.status, ["suggested", "invited"]),
        ),
      )
      .orderBy(desc(plannedRouteInvites.score))
      .limit(30);

    return res.json({
      count: rows.length,
      invites: rows.map((r) => ({
        id: r.id,
        routeId: r.routeId,
        ownerId: r.ownerId,
        ownerNickname: r.ownerNickname,
        ownerAvatarUrl: r.ownerAvatarUrl,
        routeTitle: r.routeTitle,
        routeDistanceKm: r.routeDistanceKm,
        routeDurationMinutes: r.routeDurationMinutes,
        routeStyle: r.routeStyle,
        routeVisibility: r.routeVisibility,
        score: r.score,
        reasons: r.reasons,
        priority: r.priority,
        status: r.status,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error("[planned-route-invites/mine] error:", err);
    return sendError(res, 500, "Errore caricamento inviti percorso");
  }
});

const respondSchema = z.object({
  action: z.enum(["accept", "reject"]),
});

router.patch("/:id/respond", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "action deve essere 'accept' o 'reject'");
  const { action } = parsed.data;

  try {
    const [invite] = await db
      .select()
      .from(plannedRouteInvites)
      .where(
        and(
          eq(plannedRouteInvites.id, id),
          eq(plannedRouteInvites.suggestedUserId, userId),
        ),
      )
      .limit(1);

    if (!invite) return sendError(res, 404, "Invito non trovato");
    if (!["suggested", "invited"].includes(invite.status)) {
      return sendError(res, 409, "Invito già gestito");
    }

    if (action === "reject") {
      await db
        .update(plannedRouteInvites)
        .set({ status: "rejected" })
        .where(eq(plannedRouteInvites.id, id));
      return res.json({ ok: true, action: "rejected" });
    }

    // accept → cerca o crea conversazione privata con l'owner del percorso
    const ownerId = invite.ownerId;

    const existingResult = await db.execute(sql`
      SELECT c.id
      FROM conversations c
      WHERE c.conversation_type IN ('private', 'contact', 'direct')
        AND (SELECT COUNT(*) FROM conversation_participants cp0 WHERE cp0.conversation_id = c.id) = 2
        AND EXISTS (SELECT 1 FROM conversation_participants cp1 WHERE cp1.conversation_id = c.id AND cp1.user_id = ${userId})
        AND EXISTS (SELECT 1 FROM conversation_participants cp2 WHERE cp2.conversation_id = c.id AND cp2.user_id = ${ownerId})
      ORDER BY c.created_at ASC
      LIMIT 1
    `);

    let conversationId: string;
    if (existingResult.rows[0]) {
      conversationId = (existingResult.rows[0] as { id: string }).id;
    } else {
      const conversation = await storage.createConversation({ conversationType: "private" });
      await storage.addConversationParticipant({ conversationId: conversation.id, userId });
      await storage.addConversationParticipant({ conversationId: conversation.id, userId: ownerId });
      conversationId = conversation.id;
    }

    await db
      .update(plannedRouteInvites)
      .set({ status: "accepted" })
      .where(eq(plannedRouteInvites.id, id));

    return res.json({ ok: true, action: "accepted", conversationId });
  } catch (err) {
    console.error("[planned-route-invites/respond] error:", err);
    return sendError(res, 500, "Errore risposta invito");
  }
});

export default router;
