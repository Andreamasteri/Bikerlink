import { Router, type Request, type Response } from "express";
import { addSseClient, removeSseClient } from "../../chat-sse";
import { requireAuth } from "./auth";

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

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSseClient(userId, connId);
  });
});

export default router;
