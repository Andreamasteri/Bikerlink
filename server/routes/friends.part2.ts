import { Router, type Request, type Response } from "express";
import { db } from "../db";
import {
  directMatchRequests,
  users,
  notifications,
} from "@shared/db";
import { and, eq, or } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { sendSuccess, sendError } from "../lib/api-response";

const router = Router();

router.post("/request/:requestId/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.session.userId!;
    const requestId = req.params.requestId as string;

    const request = await db
      .select()
      .from(directMatchRequests)
      .where(eq(directMatchRequests.id, requestId))
      .limit(1);

    if (!request[0]) {
      return sendError(res, 404, "Richiesta non trovata");
    }

    if (request[0].receiverId !== currentUserId) {
      return sendError(res, 403, "Non autorizzato");
    }

    if (request[0].status !== "pending") {
      return sendError(res, 409, "Richiesta già gestita");
    }

    const receiver = await db
      .select({ id: users.id, nickname: users.nickname })
      .from(users)
      .where(eq(users.id, currentUserId))
      .limit(1);

    const { bikerBikerMatches } = await import("@shared/db");

    await db.transaction(async (tx) => {
      await tx
        .update(directMatchRequests)
        .set({ status: "accepted" })
        .where(eq(directMatchRequests.id, requestId));

      try {
        await tx.insert(bikerBikerMatches).values({
          biker1Id: request[0].senderId,
          biker2Id: currentUserId,
          motorcycleBrand: "direct",
          status: "accepted",
        });
      } catch (insertErr: unknown) {
        if ((insertErr as { code?: string })?.code !== "23505") {
          throw insertErr;
        }
        await tx
          .update(bikerBikerMatches)
          .set({ status: "accepted" })
          .where(
            or(
              and(
                eq(bikerBikerMatches.biker1Id, request[0].senderId),
                eq(bikerBikerMatches.biker2Id, currentUserId)
              ),
              and(
                eq(bikerBikerMatches.biker1Id, currentUserId),
                eq(bikerBikerMatches.biker2Id, request[0].senderId)
              )
            )
          );
      }

      await tx
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.userId, currentUserId),
            eq(notifications.notificationType, "direct_match_request"),
            eq(notifications.referenceId, requestId)
          )
        );
    });

    await db.insert(notifications).values({
      userId: request[0].senderId,
      title: `${receiver[0]?.nickname ?? "Un biker"} ha accettato la tua richiesta di match!`,
      body: "Siete ora amici. Puoi scrivergli un messaggio.",
      notificationType: "direct_match_accepted",
      referenceType: "user",
      referenceId: currentUserId,
    });

    return sendSuccess(res);
  } catch (error) {
    console.error("Accept match request error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/request/:requestId/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.session.userId!;
    const requestId = req.params.requestId as string;

    const request = await db
      .select()
      .from(directMatchRequests)
      .where(eq(directMatchRequests.id, requestId))
      .limit(1);

    if (!request[0]) {
      return sendError(res, 404, "Richiesta non trovata");
    }

    if (request[0].receiverId !== currentUserId) {
      return sendError(res, 403, "Non autorizzato");
    }

    if (request[0].status !== "pending") {
      return sendError(res, 409, "Richiesta già gestita");
    }

    await db
      .update(directMatchRequests)
      .set({ status: "rejected" })
      .where(eq(directMatchRequests.id, requestId));

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.userId, currentUserId),
          eq(notifications.notificationType, "direct_match_request"),
          eq(notifications.referenceId, requestId)
        )
      );

    return sendSuccess(res);
  } catch (error) {
    console.error("Reject match request error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/requests/incoming", requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.session.userId!;

    const incoming = await db
      .select()
      .from(directMatchRequests)
      .where(
        and(
          eq(directMatchRequests.receiverId, currentUserId),
          eq(directMatchRequests.status, "pending")
        )
      );

    const result = await Promise.all(
      incoming.map(async (r) => {
        const sender = await db
          .select({ id: users.id, nickname: users.nickname, avatarUrl: users.avatarUrl, userType: users.userType })
          .from(users)
          .where(eq(users.id, r.senderId))
          .limit(1);
        return {
          ...r,
          sender: sender[0] ?? null,
        };
      })
    );

    return res.json(result);
  } catch (error) {
    console.error("Get incoming requests error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
