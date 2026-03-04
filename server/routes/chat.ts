import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { storage } from "../storage";
import { shouldWarnPhoneNumber, PHONE_WARNING_MESSAGE } from "../utils/phone-filter";

export const chatRouter = Router();

chatRouter.post("/private/:userId", requireAuth, async (req, res) => {
  try {
    const currentUser = (req as any).user;
    const targetUserId = req.params.userId;

    if (currentUser.id === targetUserId) {
      return res.status(400).json({ message: "Non puoi avviare una chat con te stesso" });
    }

    const target = await storage.getUser(targetUserId);
    if (!target) return res.status(404).json({ message: "Utente non trovato" });

    let conv = await storage.getPrivateConversation(currentUser.id, targetUserId);
    if (!conv) {
      conv = await storage.createConversation("private");
      await storage.addParticipant(conv.id, currentUser.id);
      await storage.addParticipant(conv.id, targetUserId);
    }

    res.json({ conversation: conv });
  } catch (err) {
    res.status(500).json({ message: "Errore nella creazione conversazione" });
  }
});

chatRouter.get("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const conversations = await storage.getUserConversations(user.id);

    const enriched = await Promise.all(
      conversations.map(async (conv: any) => {
        const participants = await storage.getConversationParticipants(conv.id);
        return {
          ...conv,
          participants: participants.map(p => {
            const { passwordHash: _, ...safe } = p.user;
            return safe;
          }),
        };
      })
    );

    res.json({ conversations: enriched });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento conversazioni" });
  }
});

chatRouter.get("/:id/messages", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const messages = await storage.getMessages(req.params.id, limit, offset);
    res.json({
      messages: messages.map(m => {
        const { passwordHash: _, ...safeSender } = m.sender;
        return { ...m.message, sender: safeSender };
      }),
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento messaggi" });
  }
});

chatRouter.post("/:id/messages", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const conversationId = req.params.id;
    const { content, messageType, imageUrl, latitude, longitude } = req.body;

    if (!content && !imageUrl && !latitude) {
      return res.status(400).json({ message: "Contenuto messaggio obbligatorio" });
    }

    const msg = await storage.createMessage({
      senderId: user.id,
      conversationId,
      content,
      messageType: messageType || "text",
      imageUrl,
      latitude,
      longitude,
    });

    if (content && messageType !== "image") {
      const recentMessages = await storage.getRecentMessagesFromUser(conversationId, user.id, 3);
      const previous = recentMessages.filter(m => m.id !== msg.id);

      if (shouldWarnPhoneNumber(content, previous)) {
        await storage.createMessage({
          senderId: user.id,
          conversationId,
          content: PHONE_WARNING_MESSAGE,
          messageType: "text",
          isSystem: true,
        });
      }
    }

    res.status(201).json({ message: msg });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'invio messaggio" });
  }
});

chatRouter.put("/:id/read", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    await storage.markMessagesAsRead(req.params.id, user.id);
    res.json({ message: "Messaggi segnati come letti" });
  } catch (err) {
    res.status(500).json({ message: "Errore nella lettura messaggi" });
  }
});

chatRouter.get("/:id/participants", requireAuth, async (req, res) => {
  try {
    const participants = await storage.getConversationParticipants(req.params.id);
    res.json({
      participants: participants.map(p => {
        const { passwordHash: _, ...safe } = p.user;
        return safe;
      }),
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento partecipanti" });
  }
});
