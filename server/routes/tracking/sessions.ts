import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { createRouteSchema } from "@shared/validators";
import { requireUserId } from "../../lib/auth-middleware";

const router = Router();

// Create new session
router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const existingRoutes = await storage.getRoutes(userId);
    for (const r of existingRoutes) {
      if (!["active", "armed"].includes(r.status)) continue;
      // Armed sessions have no measurement start timestamp. They are cleaned
      // by creation time so an abandoned setup cannot leave pending rows.
      const lifecycleAt = r.startedAt ? new Date(r.startedAt) : new Date(r.createdAt);
      const hasDistance = r.totalDistanceKm !== null && r.totalDistanceKm !== undefined && r.totalDistanceKm > 0;
      try {
        if (!hasDistance && lifecycleAt < tenMinutesAgo) {
          await storage.deleteRoute(r.id);
        } else if (hasDistance && lifecycleAt < twoHoursAgo) {
          const stoppedAt = new Date();
          const durationSeconds = r.startedAt
            ? Math.floor((stoppedAt.getTime() - lifecycleAt.getTime()) / 1000)
            : 0;
          await storage.updateRoute(r.id, {
            status: "completed",
            stoppedAt,
            durationSeconds,
          });
        }
      } catch (err) {
        console.warn(`[tracking] Failed to cleanup/auto-stop route ${r.id}:`, err);
      }
    }

    const parsed = createRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error("[POST /api/routes] validation failed:", parsed.error.issues);
      return sendError(res, 400, parsed.error.issues[0].message);
    }
    const { title, trackingFrequency, isSprint, status } = parsed.data;

    const route = await storage.createRoute({
      userId,
      title: title ?? null,
      trackingFrequency: trackingFrequency ?? 5,
      status: status ?? "active",
      isSprint: isSprint === true,
      startedAt: status === "armed" ? null : new Date(),
    });

    return res.status(201).json(route);
  } catch (error) {
    console.error("Create route error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

// Activate an armed automatic-start session exactly when the client has
// confirmed the movement gate. This keeps server duration aligned with the
// actual measurement start instead of the user's tap on the setup screen.
router.post("/:id/start", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const route = await storage.getRoute(req.params.id as string);
    if (!route) return sendError(res, 404, "Route non trovata");
    if (route.userId !== userId) return sendError(res, 403, "Non autorizzato");
    if (route.status === "completed") return sendError(res, 409, "Route già completata");
    // Idempotency: a retry after activation must not reset the measurement
    // clock. Heal a legacy active row that predates nullable startedAt, since
    // otherwise its stop endpoint would remain permanently blocked.
    if (route.status === "active") {
      if (route.startedAt) return res.json(route);
      const healed = await storage.updateRoute(route.id, { startedAt: new Date() });
      return res.json(healed ?? route);
    }
    if (route.status !== "armed") return sendError(res, 409, "Route non attivabile");
    const updated = await storage.updateRoute(route.id, { status: "active", startedAt: new Date() });
    return res.json(updated);
  } catch (error) {
    console.error("Start route error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

// List user sessions
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const userRoutes = await storage.getRoutes(userId);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const filtered = userRoutes.filter((r) => {
      const isOrphan =
        ["active", "armed"].includes(r.status) &&
        (r.totalDistanceKm === null || r.totalDistanceKm === undefined || r.totalDistanceKm === 0) &&
        new Date(r.startedAt ?? r.createdAt) < tenMinutesAgo;
      return !isOrphan;
    });
    return res.json(filtered);
  } catch (error) {
    console.error("Get routes error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
