import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { sendMessageSchema } from "@shared/validators";
import { invalidateConvCache } from "./utils";
import { notifyChatEvent } from "../../chat-sse";
import { handleNotifications, handleFakeReplies } from "./logic";
import { requireAuth } from "./auth";

const router = Router();

const PHONE_REGEX = /(?<![/\w])(\+?(?:\d[\s\-.]?){8,}\d)(?![/\d])/g;

console.assert(!PHONE_REGEX.test("12/03/2024"), "PHONE_REGEX: date DD/MM/YYYY non deve fare match");
PHONE_REGEX.lastIndex = 0;
console.assert(!PHONE_REGEX.test("SKU-1234567"), "PHONE_REGEX: codice prodotto 7 cifre non deve fare match");
PHONE_REGEX.lastIndex = 0;
console.assert(PHONE_REGEX.test("+39 02 1234567"), "PHONE_REGEX: numero internazionale deve fare match");
PHONE_REGEX.lastIndex = 0;

async function filterPhoneNumbers(content: string, conversationId: string, senderId: string): Promise<{ filtered: string; wasFiltered: boolean }> {
  PHONE_REGEX.lastIndex = 0;
  const matches = content.match(PHONE_REGEX);
  if (!matches || matches.length === 0) {
    return { filtered: content, wasFiltered: false };
  }

  const currentCount = await storage.getPhoneSharedCount(conversationId, senderId);

  if (currentCount === 0) {
    await storage.incrementPhoneSharedCount(conversationId, senderId);
    return { filtered: content, wasFiltered: false };
  }

  PHONE_REGEX.lastIndex = 0;
  const filtered = content.replace(PHONE_REGEX, "[numero bloccato]");
  return {
    filtered: filtered + "\n\n⚠ Per la tua sicurezza, puoi condividere il tuo numero di telefono solo una volta per conversazione.",
    wasFiltered: true,
  };
}

router.get("/conversations/:id/messages", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const conversationId = req.params.id as string;
    const rawLimit = parseInt(String(req.query.limit ?? "50"), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
    const rawOffset = parseInt(String(req.query.offset ?? "0"), 10);
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

    const participants = await storage.getConversationParticipants(conversationId);
    if (!participants.find((p) => p.userId === userId)) {
      return sendError(res, 403, "Non fai parte di questa conversazione");
    }

    const messages = await storage.getMessages(conversationId, limit, offset);
    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const senders = await storage.getUsersByIds(senderIds);
    const senderMap = new Map(senders.filter(Boolean).map((s) => [s!.id, { id: s!.id, nickname: s!.nickname, avatarUrl: s!.avatarUrl, userType: s!.userType }]));

    const messagesWithSender = messages.map((m) => ({
      ...m,
      sender: senderMap.get(m.senderId) || null,
    }));

    return res.json(messagesWithSender);
  } catch (error) {
    console.error("Get messages error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/conversations/:id/messages", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }

    const { content, messageType, imageUrl, latitude, longitude, playlistId } = parsed.data;

    const [conversation, participants] = await Promise.all([
      storage.getConversation(id),
      storage.getConversationParticipants(id),
    ]);

    if (!participants.find((p) => p.userId === userId)) {
      return sendError(res, 403, "Non fai parte di questa conversazione");
    }

    const isDirectConv = conversation && (
      conversation.conversationType === "direct" ||
      conversation.conversationType === "private" ||
      conversation.conversationType === "contact"
    );

    if (isDirectConv) {
      const otherParticipants = participants.filter((p) => p.userId !== userId);
      for (const other of otherParticipants) {
        const blocked = await storage.isBlocked(userId, other.userId);
        if (blocked) {
          return sendError(res, 403, "Utente bloccato");
        }
      }
    }

    let finalContent = content;
    let isFiltered = false;
    if (messageType === "text" && content) {
      const filterResult = await filterPhoneNumbers(content, id, userId);
      finalContent = filterResult.filtered;
      isFiltered = filterResult.wasFiltered;
    }

    const message = await storage.createMessage({
      conversationId: id,
      senderId: userId,
      messageType,
      content: finalContent || null,
      imageUrl: imageUrl || null,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      isFiltered,
      playlistId: playlistId != null ? Number(playlistId) : null,
    });

    await storage.updateConversationTimestamp(id);
    participants.forEach(p => invalidateConvCache(p.userId));

    await handleNotifications(id, userId, { messageType: message.messageType, content: message.content ?? undefined }, participants);
    await handleFakeReplies(id, userId, finalContent || "", participants);

    const sender = await storage.getUser(userId);
    const messagePayload = {
      ...message,
      sender: sender
        ? { id: sender.id, nickname: sender.nickname, avatarUrl: sender.avatarUrl, userType: sender.userType }
        : null,
    };

    notifyChatEvent(
      participants.map(p => p.userId),
      { type: "new_message", conversationId: id, message: messagePayload }
    );

    return res.status(201).json(messagePayload);
  } catch (error) {
    console.error("Send message error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/messages/:messageId", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const messageId = String(req.params.messageId);

    const msg = await storage.getMessageById(messageId);
    if (!msg) {
      return sendError(res, 404, "Messaggio non trovato");
    }
    if (msg.senderId !== userId) {
      return sendError(res, 403, "Non puoi eliminare messaggi di altri utenti");
    }

    const conversationId = msg.conversationId;
    const deleted = await storage.deleteMessage(messageId, userId);
    if (!deleted) {
      return sendError(res, 404, "Messaggio non trovato o non autorizzato");
    }

    const participants = await storage.getConversationParticipants(conversationId);
    notifyChatEvent(
      participants.map((p) => p.userId),
      { type: "message_deleted", conversationId, messageId }
    );

    return res.status(204).send();
  } catch (error) {
    console.error("Delete message error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
