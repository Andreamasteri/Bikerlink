import { Router, type Request, type Response } from "express";
import { addSseClient, removeSseClient, filterConnectedUserIds, notifyPresenceEvent, schedulePushPresence } from "../../chat-sse";
import { requireAuth } from "./auth";
import { getUserIdFromCookieHeader } from "../../session-utils";
import { db } from "../../db";
import { conversationParticipants, conversations } from "@shared/db";
import { eq, inArray } from "drizzle-orm";

const router = Router();

interface MembershipCache {
  byConv: Map<string, string[]>;
  expiresAt: number;
}

const MEMBERSHIP_CACHE_TTL_MS = 30_000;
const membershipCache = new Map<string, MembershipCache>();

async function pushPresenceForUser(userId: string): Promise<void> {
  try {
    let cached = membershipCache.get(userId);

    if (!cached || Date.now() > cached.expiresAt) {
      const myParticipations = await db
        .select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants)
        .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
        .where(eq(conversationParticipants.userId, userId));

      if (myParticipations.length === 0) {
        membershipCache.delete(userId);
        return;
      }

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

      cached = { byConv, expiresAt: Date.now() + MEMBERSHIP_CACHE_TTL_MS };
      membershipCache.set(userId, cached);
    }

    for (const [convId, participantIds] of cached.byConv) {
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

  schedulePushPresence(userId, pushPresenceForUser);

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
          schedulePushPresence(userId, pushPresenceForUser);
        }
      } catch { /* leave stream open on transient DB errors */ }
    }, 60_000);
  }

  // Task #43 — l'aggancio DEVE essere su `res.on("close")`, mai su
  // `req.on("close")`: su Node 20 + express.json() la IncomingMessage emette
  // "close" non appena il body (qui assente, ma il middleware globale gira
  // comunque su ogni richiesta) viene consumato, PRIMA che questo handler
  // arrivi qui — "close" è one-shot, quindi un listener agganciato dopo
  // scatterebbe solo per un evento già perso in precedenza (mai per la vera
  // disconnessione del client). `res` emette "close" solo alla chiusura reale
  // della risposta. Vedi .agents/memory/sse-abort-res-not-req.md.
  res.on("close", () => {
    clearInterval(heartbeat);
    if (sessionCheck !== undefined) clearInterval(sessionCheck);
    removeSseClient(userId, connId);
    schedulePushPresence(userId, pushPresenceForUser);
  });
});

export default router;
