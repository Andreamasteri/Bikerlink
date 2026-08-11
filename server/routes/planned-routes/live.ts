import { Router, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { requireAuth } from "./utils";
import { sendError } from "../../lib/api-response";

const router = Router();
const MAX_LIVE_AGE_MS = 5 * 60_000;
const MAX_LIVE_ACCURACY_M = 250;

const liveEventSchema = z.object({
  event: z.enum(["start", "position", "waypoint", "arrived", "off_route", "stopped"]),
  latitude: z.number().finite().gte(-90).lte(90).nullable().optional(),
  longitude: z.number().finite().gte(-180).lte(180).nullable().optional(),
  accuracyM: z.number().finite().nonnegative().max(10000).nullable().optional(),
  positionSource: z.enum(["gps", "waypoint", "destination", "dead_reckoning", "unknown"]).default("unknown"),
  locationAgeMs: z.number().int().nonnegative().max(86_400_000).nullable().optional(),
  waypointIndex: z.number().int().nonnegative().nullable().optional(),
  progressPct: z.number().finite().min(0).max(100).nullable().optional(),
  eventAt: z.string().datetime({ offset: true }).optional(),
});

router.post("/:id/live", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = liveEventSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);

  try {
    const route = await storage.getPlannedRoute(req.params.id as string);
    if (!route) return sendError(res, 404, "Percorso non trovato");
    if (route.userId !== userId) return sendError(res, 403, "Solo il proprietario può aggiornare lo stato live");

    const body = parsed.data;
    const hasPosition = body.latitude != null && body.longitude != null;
    const previous = ((route.metadata ?? {}) as Record<string, unknown>).live;
    const eventAt = body.eventAt ?? new Date().toISOString();
    const previousEventAt = typeof previous === "object" && previous !== null && "eventAt" in previous
      ? Date.parse(String((previous as { eventAt?: unknown }).eventAt ?? ""))
      : NaN;
    const incomingEventAt = Date.parse(eventAt);
    if (Number.isFinite(previousEventAt) && Number.isFinite(incomingEventAt) && incomingEventAt < previousEventAt) {
      return res.json({ ok: true, ignored: true, live: previous });
    }
    const live = {
      event: body.event,
      latitude: hasPosition ? body.latitude : null,
      longitude: hasPosition ? body.longitude : null,
      positionKnown: hasPosition && body.positionSource !== "unknown",
      positionReliable: hasPosition
        && body.positionSource !== "unknown"
        && (body.accuracyM == null || body.accuracyM <= MAX_LIVE_ACCURACY_M)
        && (body.locationAgeMs == null || body.locationAgeMs <= MAX_LIVE_AGE_MS),
      accuracyM: body.accuracyM ?? null,
      positionSource: body.positionSource,
      locationAgeMs: body.locationAgeMs ?? null,
      waypointIndex: body.waypointIndex ?? null,
      progressPct: body.progressPct ?? null,
      eventAt,
      previousEventAt: typeof previous === "object" && previous !== null && "eventAt" in previous
        ? (previous as { eventAt?: unknown }).eventAt ?? null
        : null,
    };
    const metadata = { ...((route.metadata ?? {}) as Record<string, unknown>), live };
    const updated = await storage.updatePlannedRoute(route.id, { metadata });
    return res.json({ ok: true, live: updated?.metadata ? (updated.metadata as Record<string, unknown>).live : live });
  } catch (err) {
    console.error("[planned-routes/live] update error:", err instanceof Error ? err.message : err);
    return sendError(res, 500, "Impossibile aggiornare lo stato live");
  }
});

export default router;
