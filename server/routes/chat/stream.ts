import { Router, type Request, type Response } from "express";
import { addSseClient, removeSseClient } from "../../chat-sse";
import { requireAuth } from "./auth";
import { getUserIdFromCookieHeader } from "../../session-utils";

const router = Router();

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

  const heartbeat = setInterval(() => {
    try { res.write(":heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 4000);

  // Periodic session revalidation: if the session has been destroyed (logout or
  // displacement), the row will be gone from the store. Re-check via the cookie
  // header every 60 s and terminate the stream on revocation.
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
        }
      } catch { /* leave stream open on transient DB errors */ }
    }, 60_000);
  }

  req.on("close", () => {
    clearInterval(heartbeat);
    if (sessionCheck !== undefined) clearInterval(sessionCheck);
    removeSseClient(userId, connId);
  });
});

export default router;
