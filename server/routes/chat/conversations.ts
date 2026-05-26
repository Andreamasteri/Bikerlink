import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { users, conversationParticipants, messages } from "@shared/db";
import { createConversationSchema } from "@shared/validators";
import { inArray, desc } from "drizzle-orm";
import { convCacheKey, convCache, CONV_CACHE_TTL_MS, pruneConvCache, invalidateConvCache } from "./utils";
import { requireAuth } from "./auth";

const router = Router();

router.get("/unread-total", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const blockedIds = new Set(await storage.getBlockedUserIds(userId));
    const convs = await storage.getConversations(userId);
    let total = 0;

    const convIds = convs.map(c => c.id);
    if (convIds.length === 0) return res.json({ count: 0 });

    const [allParticipants, lastMsgs] = await Promise.all([
      db.select().from(conversationParticipants).where(inArray(conversationParticipants.conversationId, convIds)),
      db.selectDistinctOn([messages.conversationId], {
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        createdAt: messages.createdAt,
      }).from(messages)
        .where(inArray(messages.conversationId, convIds))
        .orderBy(messages.conversationId, desc(messages.createdAt)),
    ]);

    const participantsByConv = new Map<string, typeof allParticipants>();
    for (const p of allParticipants) {
      if (!participantsByConv.has(p.conversationId)) participantsByConv.set(p.conversationId, []);
      participantsByConv.get(p.conversationId)!.push(p);
    }
    const lastMsgMap = new Map(lastMsgs.map(m => [m.conversationId, m]));

    const allOtherParticipantIds = [...new Set(
      allParticipants.filter(p => p.userId !== userId).map(p => p.userId)
    )];
    const existingUsersResult = allOtherParticipantIds.length > 0
      ? await db.select({ id: users.id }).from(users).where(inArray(users.id, allOtherParticipantIds))
      : [];
    const existingUserSet = new Set(existingUsersResult.map(r => r.id));

    const orphanResets: Promise<void>[] = [];

    for (const conv of convs) {
      const participants = participantsByConv.get(conv.id) ?? [];

      const isDirectConv = conv.conversationType === "direct" || conv.conversationType === "private" || conv.conversationType === "contact";
      if (isDirectConv) {
        const otherParticipantIds = participants.filter(p => p.userId !== userId).map(p => p.userId);
        if (otherParticipantIds.some(id => blockedIds.has(id))) continue;
        if (otherParticipantIds.length > 0 && otherParticipantIds.every(id => !existingUserSet.has(id))) {
          orphanResets.push(storage.updateConversationLastRead(conv.id, userId));
          continue;
        }
      }

      const myParticipant = participants.find((p) => p.userId === userId);
      const lastMessage = lastMsgMap.get(conv.id) ?? null;

      if (!lastMessage) continue;
      if (lastMessage.senderId === userId) continue;
      if (lastMessage.senderId && !existingUserSet.has(lastMessage.senderId)) continue;

      if (myParticipant?.lastReadAt) {
        if (new Date(lastMessage.createdAt) > new Date(myParticipant.lastReadAt)) {
          total++;
        }
      } else {
        total++;
      }
    }

    if (orphanResets.length > 0) {
      await Promise.allSettled(orphanResets);
    }

    return res.json({ count: total });
  } catch (error) {
    console.error("Get unread total error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const rawLimit = parseInt(String(req.query.limit ?? "200"), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 200;
    const rawOffset = parseInt(String(req.query.offset ?? "0"), 10);
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
    const cacheKey = convCacheKey(userId, limit, offset);
    const cached = convCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    const [blockedIds, convs] = await Promise.all([
      storage.getBlockedUserIds(userId),
      storage.getConversations(userId, limit, offset),
    ]);
    const blockedSet = new Set(blockedIds);

    if (convs.length === 0) {
      const empty: unknown[] = [];
      pruneConvCache();
      convCache.set(cacheKey, { data: empty, expiresAt: Date.now() + CONV_CACHE_TTL_MS });
      return res.json(empty);
    }

    const convIds = convs.map(c => c.id);

    const [allParticipants, lastMsgs] = await Promise.all([
      db.select().from(conversationParticipants).where(inArray(conversationParticipants.conversationId, convIds)),
      db.selectDistinctOn([messages.conversationId], {
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        messageType: messages.messageType,
        content: messages.content,
        imageUrl: messages.imageUrl,
        latitude: messages.latitude,
        longitude: messages.longitude,
        isFiltered: messages.isFiltered,
        createdAt: messages.createdAt,
        playlistId: messages.playlistId,
      })
        .from(messages)
        .where(inArray(messages.conversationId, convIds))
        .orderBy(messages.conversationId, desc(messages.createdAt)),
    ]);

    const allUserIds = [...new Set(allParticipants.map(p => p.userId))];
    const allUsers = allUserIds.length > 0
      ? await db.select({ id: users.id, nickname: users.nickname, avatarUrl: users.avatarUrl, userType: users.userType, sex: users.sex })
          .from(users).where(inArray(users.id, allUserIds))
      : [];
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    const lastMsgMap = new Map(lastMsgs.map(m => [m.conversationId, m]));

    const participantsByConv = new Map<string, typeof allParticipants>();
    for (const p of allParticipants) {
      if (!participantsByConv.has(p.conversationId)) participantsByConv.set(p.conversationId, []);
      participantsByConv.get(p.conversationId)!.push(p);
    }

    const result = convs.map(conv => {
      const participants = participantsByConv.get(conv.id) ?? [];
      const lastMessage = lastMsgMap.get(conv.id) ?? null;

      const isDirectConv = conv.conversationType === "direct" || conv.conversationType === "private" || conv.conversationType === "contact";
      if (isDirectConv) {
        const otherIds = participants.filter(p => p.userId !== userId).map(p => p.userId);
        if (otherIds.some(id => blockedSet.has(id))) return null;
      }

      const participantUsers = participants.map(p => userMap.get(p.userId) ?? null).filter(Boolean);

      const myParticipant = participants.find(p => p.userId === userId);
      const unreadCount = lastMessage && lastMessage.senderId !== userId
        ? myParticipant?.lastReadAt
          ? new Date(lastMessage.createdAt) > new Date(myParticipant.lastReadAt) ? 1 : 0
          : 1
        : 0;

      return {
        ...conv,
        participants: participantUsers,
        lastMessage,
        unreadCount,
      };
    }).filter(Boolean);

    pruneConvCache();
    convCache.set(cacheKey, { data: result, expiresAt: Date.now() + CONV_CACHE_TTL_MS });
    return res.json(result);
  } catch (error) {
    console.error("Get conversations error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const parsedConv = createConversationSchema.safeParse(req.body);
    if (!parsedConv.success) {
      return sendError(res, 400, parsedConv.error.issues[0].message);
    }
    const { conversationType, title, proposalId, participantIds } = parsedConv.data;

    if (participantIds?.length === 1) {
      const targetUserId = participantIds[0];
      const blocked = await storage.isBlocked(userId, targetUserId);
      if (blocked) {
        return sendError(res, 403, "Non puoi aprire una conversazione con questo utente");
      }
    }

    if (conversationType === "contact" && participantIds?.length === 1) {
      const targetUserId = participantIds[0];
      const existing = await storage.getConversations(userId);
      const contactThread = existing.find(c =>
        c.conversationType === "contact" &&
        (c as { participantCount?: number }).participantCount === 2
      );
      if (contactThread) {
        const parts = await storage.getConversationParticipants(contactThread.id);
        const hasBoth = parts.some(p => p.userId === userId) && parts.some(p => p.userId === targetUserId);
        if (hasBoth) {
          return res.json(contactThread);
        }
      }
    }

    const conversation = await storage.createConversation({
      conversationType,
      title,
      proposalId,
    });

    const allParticipantIds = [...new Set([userId, ...(participantIds || [])])];
    await Promise.all(allParticipantIds.map(uid => storage.addConversationParticipant({ conversationId: conversation.id, userId: uid })));

    allParticipantIds.forEach(id => invalidateConvCache(id));
    return res.status(201).json(conversation);
  } catch (error) {
    console.error("Create conversation error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/:id/read", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const conversationId = req.params.id as string;
    await storage.updateConversationLastRead(conversationId, userId);
    invalidateConvCache(userId);
    return res.sendStatus(200);
  } catch (error) {
    console.error("Mark as read error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
