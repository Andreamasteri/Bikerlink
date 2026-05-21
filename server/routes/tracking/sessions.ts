import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { createRouteSchema } from "@shared/schema";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}

// Create new session
router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const existingRoutes = await storage.getRoutes(userId);
    for (const r of existingRoutes) {
      if (r.status !== "active" || !r.startedAt) continue;
      const startedAt = new Date(r.startedAt);
      const hasDistance = r.totalDistanceKm !== null && r.totalDistanceKm !== undefined && r.totalDistanceKm > 0;
      try {
        if (!hasDistance && startedAt < tenMinutesAgo) {
          await storage.deleteRoute(r.id);
        } else if (hasDistance && startedAt < twoHoursAgo) {
          const stoppedAt = new Date();
          const durationSeconds = Math.floor((stoppedAt.getTime() - startedAt.getTime()) / 1000);
          await storage.updateRoute(r.id, {
            status: "completed",
            stoppedAt,
            durationSeconds,
          } as any);
        }
      } catch {
      }
    }

    const parsed = createRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    const { title, trackingFrequency, isSprint } = parsed.data;

    const route = await storage.createRoute({
      userId,
      title: title ?? null,
      trackingFrequency: trackingFrequency ?? 5,
      status: "active",
      isSprint: isSprint === true,
      startedAt: new Date(),
    });

    return res.status(201).json(route);
  } catch (error) {
    console.error("Create route error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// List user sessions
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const userRoutes = await storage.getRoutes(userId);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const filtered = userRoutes.filter((r: any) => {
      const isOrphan =
        r.status === "active" &&
        (r.totalDistanceKm === null || r.totalDistanceKm === undefined || r.totalDistanceKm === 0) &&
        r.startedAt &&
        new Date(r.startedAt) < tenMinutesAgo;
      return !isOrphan;
    });
    return res.json(filtered);
  } catch (error) {
    console.error("Get routes error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
