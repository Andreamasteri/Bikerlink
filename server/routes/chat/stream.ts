import { Router, type Request, type Response } from "express";
import { addSseClient, removeSseClient, filterConnectedUserIds, notifyPresenceEvent } from "../../chat-sse";
import { requireAuth } from "./auth";
import { getUserIdFromCookieHeader } from "../../session-utils";
import { db } from "../../db";
import { conversationParticipants, conversations } from "@shared/db";
import { eq, inArray } from "drizzle-orm";

const router = Router();

async function pushPresenceForUser(userId: string): Promise<void> {
  try {
    const myParticipations = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
      .where(eq(conversationParticipants.userId, userId));

    if (myParticipations.length === 0) return;

    const convIds = myParticipations.map((p) => p.conversationId);
    const allParticipants = await db
      .select({ conversationId: conversationParticipants.conversationId, userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(inArray(conversationParticipants.conversationId, convIds));

    const byConv = new Map<string, string[]>();
    for (const row of allParticipants) {
      const arr = byConv.get(row.conversationId) ?? [];
      arr.push(row.userId);
      byConv.set(row.conversationId, arr);
    }

    for (const [convId, participantIds] of byConv) {
      const onlineIds = filterConnectedUserIds(participantIds);
      notifyPresenceEvent(participantIds, convId, onlineIds);
    }
  } catch {
    // no-op: presence push is best-effort, never block the stream lifecycle
  }
}

router.get("/", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write("event: connected\ndata: {}\n\n");

  const connId = addSseClient(userId, res);

  setImmediate(() => { pushPresenceForUser(userId); });

  const heartbeat = setInterval(() => {
    try { res.write(":heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 4000);

  const cookieHeader = req.headers.cookie ?? "";
  let sessionCheck: ReturnType<typeof setInterval> | undefined;
  if (cookieHeader) {
    sessionCheck = setInterval(async () => {
      try {
        const stillUserId = await getUserIdFromCookieHeader(cookieHeader);
        if (!stillUserId || stillUserId !== userId) {
          clearInterval(heartbeat);
          if (sessionCheck !== undefined) clearInterval(sessionCheck);
          try { res.write("event: session-revoked\ndata: {}\n\n"); } catch { /* noop */ }
          try { res.end(); } catch { /* noop */ }
          removeSseClient(userId, connId);
          setImmediate(() => { pushPresenceForUser(userId); });
        }
      } catch { /* leave stream open on transient DB errors */ }
    }, 60_000);
  }

  req.on("close", () => {
    clearInterval(heartbeat);
    if (sessionCheck !== undefined) clearInterval(sessionCheck);
    removeSseClient(userId, connId);
    setImmediate(() => { pushPresenceForUser(userId); });
  });
});

export default router;
