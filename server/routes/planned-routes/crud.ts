import { sendError } from "../../lib/api-response";
import { Router, Request, Response } from "express";
import { storage } from "../../storage";
import { savePlannedRouteSchema, updatePlannedRouteBodySchema } from "@shared/validators";
import { requireAuth } from "./utils";
import { triggerAnalyzePlannedRoute } from "../../matching/jobs/analyze-planned-route";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsedRoute = savePlannedRouteSchema.safeParse(req.body);
  if (!parsedRoute.success) {
    return sendError(res, 400, parsedRoute.error.issues[0].message);
  }
  const body = parsedRoute.data;

  try {
    const route = await storage.createPlannedRoute({
      userId,
      title: body.title,
      description: body.description ?? null,
      waypoints: (body.waypoints ?? []) as Array<{ lat: number; lng: number; name?: string }>,
      polyline: body.polyline ?? null,
      distanceKm: body.distanceKm ?? 0,
      durationMinutes: body.durationMinutes ?? 0,
      bikerScore: body.bikerScore ?? 0,
      style: body.style ?? "curvy",
      visibility: body.visibility ?? "public",
      isMultiDay: body.isMultiDay ?? false,
      metadata: body.metadata ?? {},
      navigationSteps: body.navigationSteps ?? null,
      elevationProfile: body.elevationProfile ?? null,
      elevationGainM: body.elevationGainM ?? null,
      altitudeMinM: body.altitudeMinM ?? null,
      altitudeMaxM: body.altitudeMaxM ?? null,
    });
    // Task #2528 — analizza in background (geohash cells, curvy avg, tags).
    triggerAnalyzePlannedRoute(route.id);
    return res.status(201).json(route);
  } catch (err) {
    console.error("[planned-routes] create error:", err);
    return sendError(res, 500, "Errore salvataggio");
  }
});

router.get("/", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { filter } = req.query as { filter?: string };

  try {
    if (filter === "public") {
      const routes = await storage.getPublicPlannedRoutes(50);
      return res.json(routes);
    }
    const routes = await storage.getPlannedRoutes(userId);
    return res.json(routes);
  } catch (err) {
    console.error("[planned-routes] list error:", err);
    return sendError(res, 500, "Errore caricamento");
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const route = await storage.getPlannedRoute(id);
    if (!route) return sendError(res, 404, "Percorso non trovato");
    if (route.userId !== userId && route.visibility !== "public") {
      return sendError(res, 403, "Accesso non consentito");
    }
    return res.json(route);
  } catch (err) {
    console.error("[planned-routes] get error:", err);
    return sendError(res, 500, "Errore");
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const existing = await storage.getPlannedRoute(id);
    if (!existing) return sendError(res, 404, "Non trovato");
    if (existing.userId !== userId) return sendError(res, 403, "Non autorizzato");

    const parsedUpd = updatePlannedRouteBodySchema.safeParse(req.body);
    if (!parsedUpd.success) return sendError(res, 400, parsedUpd.error.issues[0].message);
    const updated = await storage.updatePlannedRoute(id, parsedUpd.data);
    // Task #2528 — riprocessa se sono cambiate geometria o metadata
    triggerAnalyzePlannedRoute(id);
    return res.json(updated);
  } catch (err) {
    console.error("[planned-routes] update error:", err);
    return sendError(res, 500, "Errore aggiornamento");
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const existing = await storage.getPlannedRoute(id);
    if (!existing) return sendError(res, 404, "Non trovato");
    if (existing.userId !== userId) return sendError(res, 403, "Non autorizzato");

    await storage.deletePlannedRoute(id);
    return res.status(204).send();
  } catch (err) {
    console.error("[planned-routes] delete error:", err);
    return sendError(res, 500, "Errore eliminazione");
  }
});

export default router;
