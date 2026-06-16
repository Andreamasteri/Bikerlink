import { Router, type Request, type Response } from "express";
import { db } from "../db";
import {
  bikerZavorrinaMatches,
  bikerBikerMatches,
  proposalMatches,
  directMatchRequests,
  users,
  notifications,
  matchPreferences,
} from "@shared/db";
import { and, eq, or } from "drizzle-orm";

import { requireAuth } from "../lib/auth-middleware";
import { sendSuccess, sendError } from "../lib/api-response";

const router = Router();

async function isFriendsWith(userId: string, otherId: string): Promise<boolean> {
  const bzMatch = await db
    .select({ id: bikerZavorrinaMatches.id })
    .from(bikerZavorrinaMatches)
    .where(
      and(
        eq(bikerZavorrinaMatches.status, "accepted"),
        or(
          and(eq(bikerZavorrinaMatches.bikerId, userId), eq(bikerZavorrinaMatches.zavorrinaId, otherId)),
          and(eq(bikerZavorrinaMatches.bikerId, otherId), eq(bikerZavorrinaMatches.zavorrinaId, userId))
        )
      )
    )
    .limit(1);
  if (bzMatch.length > 0) return true;

  const bbMatch = await db
    .select({ id: bikerBikerMatches.id })
    .from(bikerBikerMatches)
    .where(
      and(
        eq(bikerBikerMatches.status, "accepted"),
        or(
          and(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, otherId)),
          and(eq(bikerBikerMatches.biker1Id, otherId), eq(bikerBikerMatches.biker2Id, userId))
        )
      )
    )
    .limit(1);
  if (bbMatch.length > 0) return true;

  const pMatch = await db
    .select({ id: proposalMatches.id })
    .from(proposalMatches)
    .where(
      and(
        eq(proposalMatches.status, "accepted"),
        or(
          and(eq(proposalMatches.userId1, userId), eq(proposalMatches.userId2, otherId)),
          and(eq(proposalMatches.userId1, otherId), eq(proposalMatches.userId2, userId))
        )
      )
    )
    .limit(1);
  return pMatch.length > 0;
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const friendMap = new Map<string, { id: string; nickname: string; userType: string; gender: string | null }>();

    const bzMatches = await db
      .select()
      .from(bikerZavorrinaMatches)
      .where(
        and(
          eq(bikerZavorrinaMatches.status, "accepted"),
          or(
            eq(bikerZavorrinaMatches.bikerId, userId),
            eq(bikerZavorrinaMatches.zavorrinaId, userId)
          )
        )
      );

    for (const m of bzMatches) {
      const otherId = m.bikerId === userId ? m.zavorrinaId : m.bikerId;
      if (!friendMap.has(otherId)) {
        const other = await db
          .select({ id: users.id, nickname: users.nickname, userType: users.userType, sex: users.sex })
          .from(users)
          .where(eq(users.id, otherId))
          .limit(1);
        if (other[0]) {
          friendMap.set(otherId, {
            id: other[0].id,
            nickname: other[0].nickname,
            userType: other[0].userType,
            gender: other[0].sex ?? null,
          });
        }
      }
    }

    const bbMatches = await db
      .select()
      .from(bikerBikerMatches)
      .where(
        and(
          eq(bikerBikerMatches.status, "accepted"),
          or(
            eq(bikerBikerMatches.biker1Id, userId),
            eq(bikerBikerMatches.biker2Id, userId)
          )
        )
      );

    for (const m of bbMatches) {
      const otherId = m.biker1Id === userId ? m.biker2Id : m.biker1Id;
      if (!friendMap.has(otherId)) {
        const other = await db
          .select({ id: users.id, nickname: users.nickname, userType: users.userType, sex: users.sex })
          .from(users)
          .where(eq(users.id, otherId))
          .limit(1);
        if (other[0]) {
          friendMap.set(otherId, {
            id: other[0].id,
            nickname: other[0].nickname,
            userType: other[0].userType,
            gender: other[0].sex ?? null,
          });
        }
      }
    }

    const pMatches = await db
      .select()
      .from(proposalMatches)
      .where(
        and(
          eq(proposalMatches.status, "accepted"),
          or(
            eq(proposalMatches.userId1, userId),
            eq(proposalMatches.userId2, userId)
          )
        )
      );

    for (const m of pMatches) {
      const otherId = m.userId1 === userId ? m.userId2 : m.userId1;
      if (!friendMap.has(otherId)) {
        const other = await db
          .select({ id: users.id, nickname: users.nickname, userType: users.userType, sex: users.sex })
          .from(users)
          .where(eq(users.id, otherId))
          .limit(1);
        if (other[0]) {
          friendMap.set(otherId, {
            id: other[0].id,
            nickname: other[0].nickname,
            userType: other[0].userType,
            gender: other[0].sex ?? null,
          });
        }
      }
    }

    return res.json([...friendMap.values()]);
  } catch (error) {
    console.error("Get friends error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/status/:userId", requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.session.userId!;
    const targetUserId = req.params.userId as string;

    if (currentUserId === targetUserId) {
      return res.json({ status: "self" });
    }

    const alreadyFriends = await isFriendsWith(currentUserId, targetUserId);
    if (alreadyFriends) {
      return res.json({ status: "friends" });
    }

    const sentRequest = await db
      .select()
      .from(directMatchRequests)
      .where(
        and(
          eq(directMatchRequests.senderId, currentUserId),
          eq(directMatchRequests.receiverId, targetUserId),
          eq(directMatchRequests.status, "pending")
        )
      )
      .limit(1);

    if (sentRequest.length > 0) {
      return res.json({ status: "pending_sent", requestId: sentRequest[0].id });
    }

    const receivedRequest = await db
      .select()
      .from(directMatchRequests)
      .where(
        and(
          eq(directMatchRequests.senderId, targetUserId),
          eq(directMatchRequests.receiverId, currentUserId),
          eq(directMatchRequests.status, "pending")
        )
      )
      .limit(1);

    if (receivedRequest.length > 0) {
      return res.json({ status: "pending_received", requestId: receivedRequest[0].id });
    }

    return res.json({ status: "none" });
  } catch (error) {
    console.error("Friends status error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/request/:userId", requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.session.userId!;
    const targetUserId = req.params.userId as string;

    if (currentUserId === targetUserId) {
      return sendError(res, 400, "Non puoi inviare una richiesta a te stesso");
    }

    const targetUser = await db
      .select({ id: users.id, nickname: users.nickname })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser[0]) {
      return sendError(res, 404, "Utente non trovato");
    }

    const alreadyFriends = await isFriendsWith(currentUserId, targetUserId);
    if (alreadyFriends) {
      return sendError(res, 409, "Siete già amici");
    }

    const existing = await db
      .select()
      .from(directMatchRequests)
      .where(
        or(
          and(
            eq(directMatchRequests.senderId, currentUserId),
            eq(directMatchRequests.receiverId, targetUserId),
            eq(directMatchRequests.status, "pending")
          ),
          and(
            eq(directMatchRequests.senderId, targetUserId),
            eq(directMatchRequests.receiverId, currentUserId),
            eq(directMatchRequests.status, "pending")
          )
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return sendError(res, 409, "Richiesta già in attesa");
    }

    const sender = await db
      .select({ id: users.id, nickname: users.nickname })
      .from(users)
      .where(eq(users.id, currentUserId))
      .limit(1);

    const receiverPrefs = await db
      .select({ directMatch: matchPreferences.directMatch })
      .from(matchPreferences)
      .where(eq(matchPreferences.userId, targetUserId))
      .limit(1);
    if (receiverPrefs.length > 0 && receiverPrefs[0].directMatch === false) {
      return sendError(res, 403, "Questo utente non accetta richieste di direct match");
    }

    const rejectedOutgoing = await db
      .select({ id: directMatchRequests.id })
      .from(directMatchRequests)
      .where(
        and(
          eq(directMatchRequests.senderId, currentUserId),
          eq(directMatchRequests.receiverId, targetUserId),
          eq(directMatchRequests.status, "rejected")
        )
      )
      .limit(1);

    let newRequest: typeof directMatchRequests.$inferSelect;

    if (rejectedOutgoing.length > 0) {
      const [updated] = await db
        .update(directMatchRequests)
        .set({ status: "pending", createdAt: new Date() })
        .where(eq(directMatchRequests.id, rejectedOutgoing[0].id))
        .returning();
      newRequest = updated;
    } else {
      const [inserted] = await db.insert(directMatchRequests).values({
        senderId: currentUserId,
        receiverId: targetUserId,
        status: "pending",
      }).returning();
      newRequest = inserted;
    }

    await db.insert(notifications).values({
      userId: targetUserId,
      title: `${sender[0]?.nickname ?? "Un biker"} ti ha mandato una richiesta di match`,
      body: "Vai nelle notifiche per accettare o rifiutare",
      notificationType: "direct_match_request",
      referenceType: "direct_match_request",
      referenceId: newRequest.id,
    });

    return sendSuccess(res, { requestId: newRequest.id });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "23505") {
      return sendError(res, 409, "Richiesta già in attesa");
    }
    console.error("Send match request error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/request/:userId", requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.session.userId!;
    const targetUserId = req.params.userId as string;

    const existing = await db
      .select()
      .from(directMatchRequests)
      .where(
        and(
          eq(directMatchRequests.senderId, currentUserId),
          eq(directMatchRequests.receiverId, targetUserId),
          eq(directMatchRequests.status, "pending")
        )
      )
      .limit(1);

    if (existing.length === 0) {
      return sendError(res, 404, "Nessuna richiesta pendente trovata");
    }

    const requestId = existing[0].id;

    await db.transaction(async (tx) => {
      await tx
        .delete(notifications)
        .where(
          and(
            eq(notifications.referenceType, "direct_match_request"),
            eq(notifications.referenceId, requestId)
          )
        );

      await tx
        .delete(directMatchRequests)
        .where(eq(directMatchRequests.id, requestId));
    });

    return sendSuccess(res);
  } catch (error) {
    console.error("Cancel match request error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

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
