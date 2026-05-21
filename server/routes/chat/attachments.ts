import { Router, type Request, type Response } from "express";
import multer from "multer";
import { storage } from "../../storage";
import { db } from "../../db";
import { motoClubs, motoClubMembers } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { uploadBuffer, downloadBuffer } from "../../objectStorage";
import { notifyChatEvent } from "../../chat-sse";
import { invalidateConvCache } from "./utils";
import { requireAuth } from "./auth";

const router = Router();

const chatImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Formato non supportato. Usa JPEG, PNG, WebP o GIF."));
  },
});

router.post("/conversations/:id/images", chatImageUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    if (!req.file) return res.status(400).json({ message: "Nessun file ricevuto" });

    const conversationId = req.params.id as string;

    const [conversation, participants] = await Promise.all([
      storage.getConversation(conversationId),
      storage.getConversationParticipants(conversationId),
    ]);
    if (!participants.find((p) => p.userId === userId)) {
      return res.status(403).json({ message: "Non fai parte di questa conversazione" });
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
          return res.status(403).json({ message: "Utente bloccato" });
        }
      }
    }

    const ext = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/gif" ? "gif" : "jpg";
    const filename = `chat-${conversationId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const objectPath = `public/chat-images/${filename}`;

    await uploadBuffer(objectPath, req.file.buffer, req.file.mimetype);

    const imageUrl = `/api/chat/images/${filename}`;

    const message = await storage.createMessage({
      conversationId,
      senderId: userId,
      messageType: "image",
      content: null,
      imageUrl,
      latitude: null,
      longitude: null,
      isFiltered: false,
    });

    await storage.updateConversationTimestamp(conversationId);
    participants.forEach(p => invalidateConvCache(p.userId));

    const sender = await storage.getUser(userId);
    const imagePayload = {
      ...message,
      sender: sender
        ? { id: sender.id, nickname: sender.nickname, avatarUrl: sender.avatarUrl, userType: sender.userType }
        : null,
    };

    notifyChatEvent(
      participants.map(p => p.userId),
      { type: "new_message", conversationId, message: imagePayload }
    );

    return res.status(201).json(imagePayload);
  } catch (error) {
    console.error("Chat image upload error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/images/:filename", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const filename = req.params.filename as string;
    if (!filename || !/^chat-[0-9a-f-]{36}-[0-9]+-[a-z0-9]+\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
      return res.status(400).end();
    }

    const convMatch = filename.match(
      /^chat-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i
    );
    if (!convMatch) return res.status(403).end();
    const conversationId = convMatch[1];

    const [conversation, participants] = await Promise.all([
      storage.getConversation(conversationId),
      storage.getConversationParticipants(conversationId),
    ]);

    const isInParticipants = !!participants.find((p) => p.userId === userId);
    let authorized = isInParticipants;

    const isDirectConv = conversation?.conversationType === "direct"
      || conversation?.conversationType === "private"
      || conversation?.conversationType === "contact";
    if (authorized && isDirectConv) {
      const otherParticipants = participants.filter((p) => p.userId !== userId);
      for (const other of otherParticipants) {
        const blocked = await storage.isBlocked(userId, other.userId);
        if (blocked) {
          authorized = false;
          break;
        }
      }
    }

    if (conversation?.conversationType === "motoclub") {
      const clubRow = await db
        .select({ id: motoClubs.id })
        .from(motoClubs)
        .where(eq(motoClubs.conversationId, conversationId))
        .limit(1);
      if (clubRow[0]) {
        const membership = await db
          .select({ userId: motoClubMembers.userId })
          .from(motoClubMembers)
          .where(and(
            eq(motoClubMembers.clubId, clubRow[0].id),
            eq(motoClubMembers.userId, userId),
            eq(motoClubMembers.status, "active"),
          ))
          .limit(1);
        authorized = !!membership[0];
      } else {
        authorized = false;
      }
    }

    if (!authorized) return res.status(403).end();

    const objectPath = `public/chat-images/${filename}`;
    const buffer = await downloadBuffer(objectPath);
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
    const mime = mimeMap[ext ?? "jpg"] ?? "image/jpeg";
    res.set("Content-Type", mime);
    res.set("Cache-Control", "private, no-store");
    res.send(buffer);
  } catch {
    res.status(404).end();
  }
});

export default router;
