import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}

const PHONE_REGEX = /(?:\+?\d[\d\s\-().]{6,}\d|\b\d{3}[\s\-.]?\d{3}[\s\-.]?\d{4}\b)/g;

async function filterPhoneNumbers(content: string, conversationId: string, senderId: string): Promise<{ filtered: string; wasFiltered: boolean }> {
  const matches = content.match(PHONE_REGEX);
  if (!matches || matches.length === 0) {
    return { filtered: content, wasFiltered: false };
  }

  const currentCount = await storage.getPhoneSharedCount(conversationId, senderId);

  if (currentCount === 0) {
    await storage.incrementPhoneSharedCount(conversationId, senderId);
    return { filtered: content, wasFiltered: false };
  }

  const filtered = content.replace(PHONE_REGEX, "[numero bloccato]");
  return {
    filtered: filtered + "\n\n⚠ Per la tua sicurezza, puoi condividere il tuo numero di telefono solo una volta per conversazione.",
    wasFiltered: true,
  };
}

router.get("/conversations", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const convs = await storage.getConversations(userId);

    const result = await Promise.all(
      convs.map(async (conv) => {
        const participants = await storage.getConversationParticipants(conv.id);
        const msgs = await storage.getMessages(conv.id, 1, 0);
        const lastMessage = msgs[0] || null;

        const participantUsers = await Promise.all(
          participants.map(async (p) => {
            const user = await storage.getUser(p.userId);
            return user
              ? { id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl, userType: user.userType }
              : null;
          })
        );

        const myParticipant = participants.find((p) => p.userId === userId);
        const unreadCount = lastMessage && myParticipant?.lastReadAt
          ? new Date(lastMessage.createdAt) > new Date(myParticipant.lastReadAt) ? 1 : 0
          : lastMessage ? 1 : 0;

        return {
          ...conv,
          participants: participantUsers.filter(Boolean),
          lastMessage,
          unreadCount,
        };
      })
    );

    return res.json(result);
  } catch (error) {
    console.error("Get conversations error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/conversations", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { conversationType, title, proposalId, participantIds } = req.body;

    if (conversationType === "private" && participantIds?.length === 1) {
      const otherUserId = participantIds[0];
      const existingConvs = await storage.getConversations(userId);
      for (const conv of existingConvs) {
        if (conv.conversationType !== "private") continue;
        const parts = await storage.getConversationParticipants(conv.id);
        if (parts.length === 2) {
          const ids = parts.map((p) => p.userId);
          if (ids.includes(userId) && ids.includes(otherUserId)) {
            return res.json(conv);
          }
        }
      }
    }

    const conv = await storage.createConversation({
      conversationType: conversationType || "private",
      title: title || null,
      proposalId: proposalId || null,
    });

    await storage.addConversationParticipant({
      conversationId: conv.id,
      userId,
    });

    if (participantIds && Array.isArray(participantIds)) {
      for (const pid of participantIds) {
        if (pid !== userId) {
          await storage.addConversationParticipant({
            conversationId: conv.id,
            userId: pid,
          });
        }
      }
    }

    return res.status(201).json(conv);
  } catch (error) {
    console.error("Create conversation error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/conversations/:id/messages", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const participants = await storage.getConversationParticipants(id);
    if (!participants.find((p) => p.userId === userId)) {
      return res.status(403).json({ message: "Non fai parte di questa conversazione" });
    }

    const msgs = await storage.getMessages(id, limit, offset);

    const result = await Promise.all(
      msgs.map(async (msg) => {
        const sender = await storage.getUser(msg.senderId);
        return {
          ...msg,
          sender: sender
            ? { id: sender.id, nickname: sender.nickname, avatarUrl: sender.avatarUrl, userType: sender.userType }
            : null,
        };
      })
    );

    await storage.updateConversationLastRead(id, userId);

    return res.json(result);
  } catch (error) {
    console.error("Get messages error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/conversations/:id/messages", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const { messageType, content, imageUrl, latitude, longitude } = req.body;

    const participants = await storage.getConversationParticipants(id);
    if (!participants.find((p) => p.userId === userId)) {
      return res.status(403).json({ message: "Non fai parte di questa conversazione" });
    }

    let finalContent = content;
    let isFiltered = false;

    if (messageType === "text" && content) {
      const result = await filterPhoneNumbers(content, id, userId);
      finalContent = result.filtered;
      isFiltered = result.wasFiltered;
    }

    const message = await storage.createMessage({
      conversationId: id,
      senderId: userId,
      messageType: messageType || "text",
      content: finalContent,
      imageUrl: imageUrl || null,
      latitude: latitude || null,
      longitude: longitude || null,
      isFiltered,
    });

    await storage.updateConversationTimestamp(id);

    const sender = await storage.getUser(userId);

    return res.status(201).json({
      ...message,
      sender: sender
        ? { id: sender.id, nickname: sender.nickname, avatarUrl: sender.avatarUrl, userType: sender.userType }
        : null,
    });
  } catch (error) {
    console.error("Send message error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
