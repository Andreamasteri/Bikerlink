import { Router } from "express";
import { storage } from "../storage";
import { haversineKm } from "../geo";
import { allLimited } from "../lib/concurrency";
import { sendError } from "../lib/api-response";

const router = Router();

function isValidVisibility(v: unknown): v is "public" | "friends" | "private" {
  return typeof v === "string" && ["public", "friends", "private"].includes(v);
}

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
      const vis = isValidVisibility(rawVis)
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
