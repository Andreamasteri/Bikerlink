import { Router } from "express";
import { storage } from "../storage";
import { allLimited } from "../lib/concurrency";
import { haversineKm } from "../geo";
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


router.get("/api/custom-routes/:id/elevation", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return sendError(res, 404, "Percorso non trovato");

    const rawVis: unknown = (route as Record<string, unknown>).visibility;
    const routeVisibility = isValidVisibility(rawVis)
      ? rawVis
      : route.isPublic
      ? "public"
      : "private";

    if (route.userId !== userId) {
      if (routeVisibility === "private") {
        return sendError(res, 403, "Non autorizzato");
      }
      if (routeVisibility === "friends") {
        const isFriend = await storage.isUserFriendOf(userId, route.userId);
        if (!isFriend) return sendError(res, 403, "Non autorizzato");
      }
    }

    const waypoints = await storage.getCustomRouteWaypoints(route.id);
    const validWps = waypoints
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .filter((wp) => wp.latitude !== 0 || wp.longitude !== 0);

    if (validWps.length < 2) {
      return sendError(res, 422, "Nessun punto disponibile per il profilo altimetrico");
    }

    const rawPoints: [number, number][] = validWps.map((wp) => [wp.latitude, wp.longitude]);

    const MAX_SAMPLES = 100;
    const step = Math.max(1, Math.ceil(rawPoints.length / MAX_SAMPLES));
    const sampled: [number, number][] = [];
    for (let i = 0; i < rawPoints.length; i += step) {
      sampled.push(rawPoints[i]);
    }
    const last = rawPoints[rawPoints.length - 1];
    if (sampled[sampled.length - 1] !== last && sampled.length < MAX_SAMPLES) {
      sampled.push(last);
    }
    if (sampled.length > MAX_SAMPLES) sampled.length = MAX_SAMPLES;

    const distKm: number[] = [0];
    for (let i = 1; i < sampled.length; i++) {
      distKm.push(
        distKm[i - 1] +
          haversineKm(sampled[i - 1][0], sampled[i - 1][1], sampled[i][0], sampled[i][1])
      );
    }

    const locationsStr = sampled
      .map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
      .join("|");
    const topoUrl = `https://api.opentopodata.org/v1/srtm90m?locations=${locationsStr}`;

    let elevations: number[];
    try {
      const topoResp = await fetch(topoUrl, {
        headers: { "User-Agent": "BikerLink/4.0 (info@bikerlink.it)" },
      });
      if (!topoResp.ok) throw new Error(`OpenTopoData ${topoResp.status}`);
      type TopoData = { status: string; results?: Array<{ elevation?: number }> };
      const topoData = await topoResp.json() as TopoData;
      if (topoData.status !== "OK") throw new Error("OpenTopoData status: " + topoData.status);
      elevations = (topoData.results ?? []).map((r) => Math.round(r.elevation ?? 0));
    } catch (err) {
      console.error("[custom-routes elevation] OpenTopoData error:", err);
      return sendError(res, 502, "Dati altimetrici non disponibili al momento");
    }

    const validEle = elevations.filter((e) => e != null && !isNaN(e));
    if (validEle.length === 0) {
      return sendError(res, 502, "Dati altimetrici non disponibili al momento");
    }

    const minEle = Math.min(...validEle);
    const maxEle = Math.max(...validEle);
    let totalGain = 0;
    let totalLoss = 0;
    for (let i = 1; i < elevations.length; i++) {
      const diff = elevations[i] - elevations[i - 1];
      if (diff > 0) totalGain += diff;
      else totalLoss += Math.abs(diff);
    }

    return res.json({
      elevations,
      distanceKm: distKm.map((d) => Math.round(d * 10) / 10),
      minEle: Math.round(minEle),
      maxEle: Math.round(maxEle),
      totalGain: Math.round(totalGain),
      totalLoss: Math.round(totalLoss),
      points: sampled.length,
    });
  } catch (err: unknown) {
    console.error("[custom-routes elevation] error:", err);
    return sendError(res, 500, "Errore profilo altimetrico");
  }
});

// ─── GET /api/users/:userId/custom-routes ─────────────────────────────────────
router.get("/api/users/:userId/custom-routes", async (req, res) => {
  try {
    const sessionUserId = req.session.userId;
    if (!sessionUserId) return sendError(res, 401, "Non autenticato");

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
  } catch (error: unknown) {
    sendError(res, 500, error instanceof Error ? error.message : "Errore interno");
  }
});

export default router;
