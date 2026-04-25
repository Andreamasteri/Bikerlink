import { Router } from "express";
import { storage } from "../storage";
import { allLimited } from "../lib/concurrency";

const router = Router();

const VALID_VISIBILITY = ["public", "friends", "private"] as const;
type Visibility = typeof VALID_VISIBILITY[number];

function isValidVisibility(v: unknown): v is Visibility {
  return typeof v === "string" && (VALID_VISIBILITY as readonly string[]).includes(v);
}

function resolveVisibility(visibility: unknown, isPublic: unknown): Visibility {
  if (isValidVisibility(visibility)) return visibility;
  if (isPublic === true) return "public";
  if (isPublic === false) return "private";
  return "public";
}

router.get("/api/custom-routes", async (req, res) => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });

    const featureSetting = await storage.getAppSetting("custom_routes_enabled");
    if (featureSetting?.value === "false") {
      return res.json({ disabled: true, myRoutes: [], publicRoutes: [] });
    }

    const myRoutesRaw = await storage.getCustomRoutes(userId);
    const publicRoutesRaw = await storage.getPublicCustomRoutes();
    const friendsRoutesRaw = await storage.getFriendsCustomRoutes(userId);

    const enrichRoute = async (route: (typeof myRoutesRaw)[number]) => {
      const waypoints = await storage.getCustomRouteWaypoints(route.id);
      const creator = await storage.getUser(route.userId);
      return {
        ...route,
        waypointCount: waypoints.length,
        creatorNickname: creator?.nickname || "Sconosciuto",
        ownerNickname: creator?.nickname || "Sconosciuto",
      };
    };

    const myRoutes = await allLimited(myRoutesRaw.map((r) => () => enrichRoute(r)));

    const friendsVisible: typeof publicRoutesRaw = [];
    for (const route of friendsRoutesRaw) {
      if (route.userId === userId) continue;
      const isFriend = await storage.isUserFriendOf(userId, route.userId);
      if (isFriend) friendsVisible.push(route);
    }

    const publicAndFriends = [...publicRoutesRaw, ...friendsVisible].filter(
      (r) => r.userId !== userId
    );

    const publicRoutes = await allLimited(publicAndFriends.map((r) => () => enrichRoute(r)));

    res.json({ disabled: false, myRoutes, publicRoutes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/custom-routes", async (req, res) => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });

    const featureSetting = await storage.getAppSetting("custom_routes_enabled");
    if (featureSetting?.value === "false") {
      return res.status(403).json({ error: "Funzione disattivata" });
    }

    const { title, description, isPublic, visibility } = req.body;
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: "Il titolo è obbligatorio" });
    }

    if (visibility !== undefined && !isValidVisibility(visibility)) {
      return res.status(400).json({ error: "Valore visibility non valido. Usa: public, friends, private" });
    }

    const resolvedVis = resolveVisibility(visibility, isPublic);

    const route = await storage.createCustomRoute({
      userId,
      title: title.trim(),
      description: description?.trim() || null,
      isPublic: resolvedVis === "public",
      visibility: resolvedVis,
    });

    res.json(route);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/api/custom-routes/:id", async (req, res) => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return res.status(404).json({ error: "Percorso non trovato" });

    const rawVis: unknown = (route as Record<string, unknown>).visibility;
    const routeVisibility: Visibility = isValidVisibility(rawVis)
      ? rawVis
      : route.isPublic
      ? "public"
      : "private";

    if (route.userId !== userId) {
      if (routeVisibility === "private") {
        return res.status(403).json({ error: "Accesso negato" });
      }
      if (routeVisibility === "friends") {
        const isFriend = await storage.isUserFriendOf(userId, route.userId);
        if (!isFriend) return res.status(403).json({ error: "Accesso negato" });
      }
    }

    const waypoints = await storage.getCustomRouteWaypoints(route.id);
    const creator = await storage.getUser(route.userId);

    res.json({
      ...route,
      visibility: routeVisibility,
      waypoints,
      isMine: route.userId === userId,
      creatorNickname: creator?.nickname || "Sconosciuto",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/api/custom-routes/:id", async (req, res) => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return res.status(404).json({ error: "Percorso non trovato" });
    if (route.userId !== userId) return res.status(403).json({ error: "Non autorizzato" });

    const { title, description, isPublic, visibility, totalDistanceKm } = req.body;

    if (visibility !== undefined && !isValidVisibility(visibility)) {
      return res.status(400).json({ error: "Valore visibility non valido. Usa: public, friends, private" });
    }

    type UpdateFields = {
      title?: string;
      description?: string | null;
      totalDistanceKm?: number | null;
      visibility?: string;
      isPublic?: boolean;
    };
    const updateFields: UpdateFields = {};
    if (title !== undefined) updateFields.title = title.trim();
    if (description !== undefined) updateFields.description = description?.trim() || null;
    if (totalDistanceKm !== undefined) updateFields.totalDistanceKm = totalDistanceKm;

    if (visibility !== undefined || isPublic !== undefined) {
      const resolvedVis = resolveVisibility(visibility, isPublic);
      updateFields.visibility = resolvedVis;
      updateFields.isPublic = resolvedVis === "public";
    }

    const updated = await storage.updateCustomRoute(req.params.id, updateFields);

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/custom-routes/:id", async (req, res) => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return res.status(404).json({ error: "Percorso non trovato" });
    if (route.userId !== userId) return res.status(403).json({ error: "Non autorizzato" });

    await storage.deleteCustomRoute(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/custom-routes/:id/waypoints", async (req, res) => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return res.status(404).json({ error: "Percorso non trovato" });
    if (route.userId !== userId) return res.status(403).json({ error: "Non autorizzato" });

    const { name, description, latitude, longitude, waypointType, orderIndex } = req.body;
    if (!name || latitude == null || longitude == null) {
      return res.status(400).json({ error: "Nome e coordinate obbligatori" });
    }

    const waypoint = await storage.createCustomRouteWaypoint({
      routeId: route.id,
      name: name.trim(),
      description: description?.trim() || null,
      latitude,
      longitude,
      waypointType: waypointType || "stop",
      orderIndex: orderIndex ?? 0,
    });

    res.json(waypoint);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/api/custom-routes/:id/waypoints/:waypointId", async (req, res) => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return res.status(404).json({ error: "Percorso non trovato" });
    if (route.userId !== userId) return res.status(403).json({ error: "Non autorizzato" });

    const { name, description, latitude, longitude, waypointType, orderIndex } = req.body;
    const updated = await storage.updateCustomRouteWaypoint(req.params.waypointId, {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(waypointType !== undefined && { waypointType }),
      ...(orderIndex !== undefined && { orderIndex }),
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/custom-routes/:id/waypoints/:waypointId", async (req, res) => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return res.status(404).json({ error: "Percorso non trovato" });
    if (route.userId !== userId) return res.status(403).json({ error: "Non autorizzato" });

    await storage.deleteCustomRouteWaypoint(req.params.waypointId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/api/users/:userId/custom-routes", async (req, res) => {
  try {
    const sessionUserId = (req.session as any)?.userId;
    if (!sessionUserId) return res.status(401).json({ error: "Non autenticato" });

    const { userId } = req.params;
    const routesRaw = await storage.getCustomRoutes(userId);

    const isFriend = sessionUserId !== userId
      ? await storage.isUserFriendOf(sessionUserId, userId)
      : false;

    const visibleRoutes = routesRaw.filter((r) => {
      const rawVis: unknown = (r as Record<string, unknown>).visibility;
      const vis: Visibility = isValidVisibility(rawVis)
        ? rawVis
        : r.isPublic
        ? "public"
        : "private";
      if (vis === "public") return true;
      if (vis === "friends" && isFriend) return true;
      return false;
    });

    const enriched = await allLimited(
      visibleRoutes.map((route) => async () => {
        const waypoints = await storage.getCustomRouteWaypoints(route.id);
        return { ...route, waypointCount: waypoints.length };
      })
    );

    res.json({ routes: enriched });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
