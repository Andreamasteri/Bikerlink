import { Router } from "express";
import { storage } from "../storage";
import { allLimited } from "../lib/concurrency";
import { createCustomRouteSchema, updateCustomRouteSchema, createWaypointSchema, updateWaypointSchema, gpxImportSchema } from "@shared/validators";
import { sendError } from "../lib/api-response";

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
    const userId = req.session.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");

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
  } catch (error: unknown) {
    sendError(res, 500, error instanceof Error ? error.message : "Errore interno");
  }
});

router.post("/api/custom-routes", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");

    const featureSetting = await storage.getAppSetting("custom_routes_enabled");
    if (featureSetting?.value === "false") {
      return sendError(res, 403, "Funzione disattivata");
    }

    const parsedCr = createCustomRouteSchema.safeParse(req.body);
    if (!parsedCr.success) {
      return sendError(res, 400, parsedCr.error.issues[0].message);
    }
    const { title, description, isPublic, visibility } = parsedCr.data;
    const resolvedVis = resolveVisibility(visibility, isPublic);

    const route = await storage.createCustomRoute({
      userId,
      title: title.trim(),
      description: description?.trim() || null,
      isPublic: resolvedVis === "public",
      visibility: resolvedVis,
    });

    res.json(route);
  } catch (error: unknown) {
    sendError(res, 500, error instanceof Error ? error.message : "Errore interno");
  }
});

router.get("/api/custom-routes/:id", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return sendError(res, 404, "Percorso non trovato");

    const rawVis: unknown = (route as Record<string, unknown>).visibility;
    const routeVisibility: Visibility = isValidVisibility(rawVis)
      ? rawVis
      : route.isPublic
      ? "public"
      : "private";

    if (route.userId !== userId) {
      if (routeVisibility === "private") {
        return sendError(res, 403, "Accesso negato");
      }
      if (routeVisibility === "friends") {
        const isFriend = await storage.isUserFriendOf(userId, route.userId);
        if (!isFriend) return sendError(res, 403, "Accesso negato");
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
  } catch (error: unknown) {
    sendError(res, 500, error instanceof Error ? error.message : "Errore interno");
  }
});

router.put("/api/custom-routes/:id", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return sendError(res, 404, "Percorso non trovato");
    if (route.userId !== userId) return sendError(res, 403, "Non autorizzato");

    const parsedUpd = updateCustomRouteSchema.safeParse(req.body);
    if (!parsedUpd.success) {
      return sendError(res, 400, parsedUpd.error.issues[0].message);
    }
    const { title, description, isPublic, visibility, totalDistanceKm } = parsedUpd.data;

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
  } catch (error: unknown) {
    sendError(res, 500, error instanceof Error ? error.message : "Errore interno");
  }
});

router.delete("/api/custom-routes/:id", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return sendError(res, 404, "Percorso non trovato");
    if (route.userId !== userId) return sendError(res, 403, "Non autorizzato");

    await storage.deleteCustomRoute(req.params.id);
    res.json({ success: true });
  } catch (error: unknown) {
    sendError(res, 500, error instanceof Error ? error.message : "Errore interno");
  }
});

router.delete("/api/custom-routes/:id/waypoints", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return sendError(res, 404, "Percorso non trovato");
    if (route.userId !== userId) return sendError(res, 403, "Non autorizzato");

    await storage.deleteAllCustomRouteWaypoints(route.id);
    res.json({ success: true });
  } catch (error: unknown) {
    sendError(res, 500, error instanceof Error ? error.message : "Errore interno");
  }
});

router.post("/api/custom-routes/:id/waypoints", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return sendError(res, 404, "Percorso non trovato");
    if (route.userId !== userId) return sendError(res, 403, "Non autorizzato");

    const parsedWp = createWaypointSchema.safeParse(req.body);
    if (!parsedWp.success) {
      return sendError(res, 400, parsedWp.error.issues[0].message);
    }
    const { name, description, latitude, longitude, waypointType, orderIndex } = parsedWp.data;

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
  } catch (error: unknown) {
    sendError(res, 500, error instanceof Error ? error.message : "Errore interno");
  }
});

router.put("/api/custom-routes/:id/waypoints/:waypointId", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return sendError(res, 404, "Percorso non trovato");
    if (route.userId !== userId) return sendError(res, 403, "Non autorizzato");

    const parsedWpUpd = updateWaypointSchema.safeParse(req.body);
    if (!parsedWpUpd.success) {
      return sendError(res, 400, parsedWpUpd.error.issues[0].message);
    }
    const { name, description, latitude, longitude, waypointType, orderIndex } = parsedWpUpd.data;
    const updated = await storage.updateCustomRouteWaypoint(req.params.waypointId, {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(waypointType !== undefined && { waypointType }),
      ...(orderIndex !== undefined && { orderIndex }),
    });

    res.json(updated);
  } catch (error: unknown) {
    sendError(res, 500, error instanceof Error ? error.message : "Errore interno");
  }
});

router.delete("/api/custom-routes/:id/waypoints/:waypointId", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return sendError(res, 404, "Percorso non trovato");
    if (route.userId !== userId) return sendError(res, 403, "Non autorizzato");

    await storage.deleteCustomRouteWaypoint(req.params.waypointId);
    res.json({ success: true });
  } catch (error: unknown) {
    sendError(res, 500, error instanceof Error ? error.message : "Errore interno");
  }
});

// ─── GPX helpers ─────────────────────────────────────────────────────────────

function gpxExtractAttr(attrs: string, name: string): number | null {
  const m = new RegExp(`${name}="([^"]+)"`).exec(attrs);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return isNaN(v) ? null : v;
}

function gpxExtractTagText(inner: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(inner);
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

interface GpxPoint { lat: number; lon: number; name: string }

function parseGpxServer(text: string): GpxPoint[] {
  const points: GpxPoint[] = [];

  const tryTag = (tagName: string, fallbackLabel: string) => {
    const re = new RegExp(`<${tagName}\\s([^>]+)>([\\s\\S]*?)<\\/${tagName}>`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const lat = gpxExtractAttr(m[1], "lat");
      const lon = gpxExtractAttr(m[1], "lon");
      if (lat === null || lon === null) continue;
      const name = gpxExtractTagText(m[2], "name") || fallbackLabel;
      points.push({ lat, lon, name });
    }
  };

  tryTag("wpt", "Waypoint");
  if (points.length === 0) tryTag("rtept", "Punto");

  if (points.length === 0) {
    const trkptRe = /<trkpt\s([^>]+)>/gi;
    const all: GpxPoint[] = [];
    let m: RegExpExecArray | null;
    while ((m = trkptRe.exec(text)) !== null) {
      const lat = gpxExtractAttr(m[1], "lat");
      const lon = gpxExtractAttr(m[1], "lon");
      if (lat !== null && lon !== null) all.push({ lat, lon, name: "" });
    }
    if (all.length > 0) {
      const MAX = 50;
      const step = Math.max(1, Math.floor(all.length / MAX));
      const sampled = all.filter((_, i) => i % step === 0);
      if (sampled[sampled.length - 1] !== all[all.length - 1]) {
        sampled.push(all[all.length - 1]);
      }
      sampled.forEach((p, i) => points.push({ ...p, name: `Punto ${i + 1}` }));
    }
  }

  return points;
}

function gpxWaypointType(index: number, total: number): string {
  if (index === 0) return "start";
  if (index === total - 1 && total > 1) return "end";
  return "stop";
}

// ─── POST /api/custom-routes/import-gpx ──────────────────────────────────────
// Accepts { gpxContent: string, title?: string }, parses GPX server-side,
// creates the route with all waypoints, and returns the full route object.

router.post("/api/custom-routes/import-gpx", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");

    const featureSetting = await storage.getAppSetting("custom_routes_enabled");
    if (featureSetting?.value === "false") {
      return sendError(res, 403, "Funzione disattivata");
    }

    const parsedGpx = gpxImportSchema.safeParse(req.body);
    if (!parsedGpx.success) {
      return sendError(res, 400, parsedGpx.error.issues[0].message);
    }
    const { gpxData: gpxContent, title } = parsedGpx.data;

    const points = parseGpxServer(gpxContent);
    if (points.length === 0) {
      return sendError(res, 422, "Nessuna tappa trovata nel file GPX");
    }
    if (points.length < 2) {
      return sendError(res, 422, "Il file GPX deve contenere almeno 2 tappe");
    }

    const routeTitle =
      (typeof title === "string" && title.trim().length > 0)
        ? title.trim()
        : "Percorso importato";

    const route = await storage.createCustomRoute({
      userId,
      title: routeTitle,
      description: null,
      isPublic: false,
      visibility: "private",
    });

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      await storage.createCustomRouteWaypoint({
        routeId: route.id,
        name: p.name,
        description: null,
        latitude: p.lat,
        longitude: p.lon,
        waypointType: gpxWaypointType(i, points.length),
        orderIndex: i,
      });
    }

    const waypoints = await storage.getCustomRouteWaypoints(route.id);
    res.json({ ...route, waypoints });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Errore interno";
    sendError(res, 500, msg);
  }
});

// ─── GET /api/custom-routes/:id/elevation ────────────────────────────────────


import customRoutesPart2 from "./custom-routes.part2";

router.use(customRoutesPart2);

export default router;
