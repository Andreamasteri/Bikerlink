import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

const fakeBotMessageCounts = new Map<string, number>();

const GREETING_KEYWORDS = ["ciao", "hey", "salve", "buongiorno", "buonasera", "ehi", "bella", "yo", "hola"];
const PUSH_KEYWORDS = ["usciamo", "vediamo", "giro", "andiamo", "quando", "domani", "weekend", "sabato", "domenica", "stasera", "oggi", "uscire", "incontriamo", "vieni", "raggiungi", "dove ci", "ci troviamo", "partiamo", "pronti", "sei libero", "sei libera"];

const GREETING_REPLIES = [
  "Ciao! Tutto bene? 😊",
  "Ehi! Come va?",
  "Bella! Di dove sei?",
  "Ciao ciao! Come stai?",
  "Hey! Piacere! 🏍️",
  "Buongiorno! Che moto hai?",
];

const VAGUE_REPLIES = [
  "Ahah bella! 😄",
  "Si si, vediamo dai!",
  "Magari più avanti!",
  "Bello! Ne parliamo!",
  "Eh sì, sarebbe figo!",
  "Ci sta! 👍",
  "Ahahah esatto!",
  "Vero vero!",
  "Ma sì dai!",
  "Beh dai non male!",
  "Top! 🔥",
  "Sì sì, assolutamente!",
  "Haha bella questa!",
  "Eh già! 😁",
  "Forte!",
];

const EVASIVE_REPLIES = [
  "Eh fa ancora troppo freddo per uscire... 🥶",
  "Guarda io sono qua per testare l'app per ora 😅",
  "Ho la moto dal meccanico in questo periodo...",
  "Magari quando fa più caldo!",
  "Questo weekend non posso, vediamo più avanti!",
  "Eh guarda, ho un sacco di impegni ultimamente...",
  "Sì sì, appena si sistema il tempo! ☀️",
  "Bella idea ma sto periodo sono incasinato/a...",
  "Dai più avanti sicuro! Ora è un periodaccio 😬",
  "Ahah magari! Ma devo prima far revisionare la moto...",
  "Mi piacerebbe ma sto testando l'app al momento 😅",
  "Eh con questo tempo... meglio aspettare!",
  "Sicuro! Ma non questa settimana purtroppo...",
  "Appena finisco di sistemare la moto ne parliamo!",
  "Ci sto! Ma non ora, ho il lavoro che mi ammazza... 😩",
];

const VERY_EVASIVE_REPLIES = [
  "Guarda, io veramente sono qui solo per testare l'app 😂",
  "Eh lo so che insisti ma davvero non posso ora!",
  "Ahahah sei insistente! Ma veramente non è periodo...",
  "Ma sì dai, prima o poi! Non ti preoccupare 😅",
  "Tranquillo/a, appena posso ti scrivo io!",
  "Eh magari... ma non prometto nulla! 🤷",
  "Senti, ti faccio sapere io ok? 😊",
  "Haha dai non insistere! Quando sarà sarà! 🏍️",
];

function getFakeBotReply(content: string, conversationId: string): string {
  const count = fakeBotMessageCounts.get(conversationId) || 0;
  fakeBotMessageCounts.set(conversationId, count + 1);

  const lower = content.toLowerCase();

  if (count === 0 && GREETING_KEYWORDS.some(k => lower.includes(k))) {
    return GREETING_REPLIES[Math.floor(Math.random() * GREETING_REPLIES.length)];
  }

  const isPushing = PUSH_KEYWORDS.some(k => lower.includes(k));

  if (isPushing && count >= 5) {
    return VERY_EVASIVE_REPLIES[Math.floor(Math.random() * VERY_EVASIVE_REPLIES.length)];
  }

  if (isPushing) {
    return EVASIVE_REPLIES[Math.floor(Math.random() * EVASIVE_REPLIES.length)];
  }

  return VAGUE_REPLIES[Math.floor(Math.random() * VAGUE_REPLIES.length)];
}

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

    if (conversationType === "contact" && participantIds?.length === 1) {
      const targetUserId = participantIds[0];
      const targetConvs = await storage.getConversations(targetUserId);
      const existingContactConv = targetConvs.find((c) => c.conversationType === "contact");

      if (existingContactConv) {
        const parts = await storage.getConversationParticipants(existingContactConv.id);
        const alreadyParticipant = parts.some((p) => p.userId === userId);
        if (!alreadyParticipant) {
          await storage.addConversationParticipant({
            conversationId: existingContactConv.id,
            userId,
          });
        }
        return res.json(existingContactConv);
      }

      const conv = await storage.createConversation({
        conversationType: "contact",
        title: title || null,
        proposalId: proposalId || null,
      });

      await storage.addConversationParticipant({
        conversationId: conv.id,
        userId: targetUserId,
      });
      await storage.addConversationParticipant({
        conversationId: conv.id,
        userId,
      });

      return res.status(201).json(conv);
    }

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

    if (conversationType === "group" && proposalId) {
      const existingConvs = await storage.getConversations(userId);
      const existingGroupConv = existingConvs.find(
        (c) => c.conversationType === "group" && c.proposalId === proposalId
      );
      if (existingGroupConv) {
        return res.json(existingGroupConv);
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
          const targetUser = await storage.getUser(pid);
          if (targetUser?.isFake) {
            storage.recordFakeUserInteraction(pid, userId, "chat_request").catch(() => {});
          }
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

    for (const p of participants) {
      if (p.userId !== userId) {
        const targetUser = await storage.getUser(p.userId);
        if (targetUser?.isFake) {
          storage.recordFakeUserInteraction(p.userId, userId, "chat_message").catch(() => {});

          const fakeUserId = p.userId;
          const convId = id;
          const userContent = finalContent || "";
          const delay = 1000 + Math.random() * 2000;
          setTimeout(async () => {
            try {
              const replyText = getFakeBotReply(userContent, convId);
              await storage.createMessage({
                conversationId: convId,
                senderId: fakeUserId,
                messageType: "text",
                content: replyText,
                imageUrl: null,
                latitude: null,
                longitude: null,
                isFiltered: false,
              });
              await storage.updateConversationTimestamp(convId);
            } catch (err) {
              console.error("Fake bot reply error:", err);
            }
          }, delay);
        }
      }
    }

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
