import type { Router } from "express";
import { getAllQueues } from "./queues";
import { isRedisAvailable } from "./redis";

/**
 * Bull Board admin dashboard (Task #2517).
 *
 * Mounted at /api/admin/queues by routes.ts behind the admin middleware.
 * If Redis/DragonflyDB (Task #5244) is unavailable, returns a stub router that
 * responds with 503 so the route stays reachable for diagnostics.
 */

export async function buildBullBoardRouter(): Promise<Router> {
  const express = await import("express");
  const router = express.Router();

  if (!isRedisAvailable()) {
    router.use((_req, res) => {
      res
        .status(503)
        .json({ error: "queues_unavailable", message: "Redis non disponibile — code BullMQ disattivate." });
    });
    return router;
  }

  try {
    const { createBullBoard } = await import("@bull-board/api");
    const { BullMQAdapter } = await import("@bull-board/api/bullMQAdapter");
    const { ExpressAdapter } = await import("@bull-board/express");

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath("/api/admin/queues");

    const queues = getAllQueues();
    createBullBoard({
      queues: queues.map((q) => new BullMQAdapter(q)),
      serverAdapter,
    });

    router.use(serverAdapter.getRouter());
    return router;
  } catch (err) {
    console.warn("[bull-board] init failed:", err instanceof Error ? err.message : err);
    router.use((_req, res) => {
      res.status(500).json({ error: "bullboard_init_failed", message: String(err) });
    });
    return router;
  }
}
