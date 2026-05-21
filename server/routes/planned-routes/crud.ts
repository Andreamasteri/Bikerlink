import { Router, Request, Response } from "express";
import { storage } from "../../storage";
import { savePlannedRouteSchema, updatePlannedRouteBodySchema } from "@shared/schema";
import { requireAuth } from "./utils";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsedRoute = savePlannedRouteSchema.safeParse(req.body);
  if (!parsedRoute.success) {
    return res.status(400).json({ message: parsedRoute.error.issues[0].message });
  }
  const body = parsedRoute.data;

  try {
    const route = await storage.createPlannedRoute({
      userId,
      title: body.title,
      description: body.description ?? null,
      fromAddress: body.fromAddress ?? null,
      toAddress: body.toAddress ?? null,
      distanceKm: body.distanceKm ?? 0,
      durationMinutes: body.durationMinutes ?? 0,
      waypointsJson: body.waypointsJson ?? [],
      routePolyline: body.routePolyline ?? null,
      gpxData: body.gpxData ?? null,
      isPublic: body.isPublic ?? true,
      isCurvy: body.isCurvy ?? false,
      curvyScore: body.curvyScore ?? 0,
      elevationGain: body.elevationGain ?? 0,
      elevationLoss: body.elevationLoss ?? 0,
      tags: body.tags ?? [],
      extraJson: body.extraJson ?? {},
      sourceType: body.sourceType ?? "manual",
    });
    return res.status(201).json(route);
  } catch (err) {
    console.error("[planned-routes] create error:", err);
    return res.status(500).json({ message: "Errore salvataggio" });
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
    return res.status(500).json({ message: "Errore caricamento" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const route = await storage.getPlannedRoute(id);
    if (!route) return res.status(404).json({ message: "Percorso non trovato" });
    if (route.userId !== userId && !route.isPublic) {
      return res.status(403).json({ message: "Accesso non consentito" });
    }
    return res.json(route);
  } catch (err) {
    console.error("[planned-routes] get error:", err);
    return res.status(500).json({ message: "Errore" });
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const existing = await storage.getPlannedRoute(id);
    if (!existing) return res.status(404).json({ message: "Non trovato" });
    if (existing.userId !== userId) return res.status(403).json({ message: "Non autorizzato" });

    const parsedUpd = updatePlannedRouteBodySchema.safeParse(req.body);
    if (!parsedUpd.success) return res.status(400).json({ message: parsedUpd.error.issues[0].message });
    const updated = await storage.updatePlannedRoute(id, parsedUpd.data);
    return res.json(updated);
  } catch (err) {
    console.error("[planned-routes] update error:", err);
    return res.status(500).json({ message: "Errore aggiornamento" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const existing = await storage.getPlannedRoute(id);
    if (!existing) return res.status(404).json({ message: "Non trovato" });
    if (existing.userId !== userId) return res.status(403).json({ message: "Non autorizzato" });

    await storage.deletePlannedRoute(id);
    return res.status(204).send();
  } catch (err) {
    console.error("[planned-routes] delete error:", err);
    return res.status(500).json({ message: "Errore eliminazione" });
  }
});

export default router;
