import { Router } from "express";
import { storage } from "../storage";
import https from "https";
import http from "http";

const router = Router();

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

    const enrichRoute = async (route: any) => {
      const waypoints = await storage.getCustomRouteWaypoints(route.id);
      const creator = await storage.getUser(route.userId);
      return {
        ...route,
        waypointCount: waypoints.length,
        creatorNickname: creator?.nickname || "Sconosciuto",
      };
    };

    const myRoutes = await Promise.all(myRoutesRaw.map(enrichRoute));
    const publicRoutes = await Promise.all(
      publicRoutesRaw
        .filter((r) => r.userId !== userId)
        .map(enrichRoute)
    );

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

    const { title, description, isPublic } = req.body;
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: "Il titolo è obbligatorio" });
    }

    const route = await storage.createCustomRoute({
      userId,
      title: title.trim(),
      description: description?.trim() || null,
      isPublic: isPublic || false,
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

    if (!route.isPublic && route.userId !== userId) {
      return res.status(403).json({ error: "Accesso negato" });
    }

    const waypoints = await storage.getCustomRouteWaypoints(route.id);
    const creator = await storage.getUser(route.userId);

    res.json({
      ...route,
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

    const { title, description, isPublic, totalDistanceKm } = req.body;
    const updated = await storage.updateCustomRoute(req.params.id, {
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(isPublic !== undefined && { isPublic }),
      ...(totalDistanceKm !== undefined && { totalDistanceKm }),
    });

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

function followRedirects(url: string, maxRedirects = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error("Troppi redirect"));
    const client = url.startsWith("https") ? https : http;
    client.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        followRedirects(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
      } else {
        resolve(url);
      }
    }).on("error", reject);
  });
}

function extractCoordsFromGoogleMapsUrl(url: string): Array<{ lat: number; lng: number }> {
  const coords: Array<{ lat: number; lng: number }> = [];

  const dirMatch = url.match(/\/dir\/(.*?)(?:\?|$|@)/);
  if (dirMatch) {
    const parts = dirMatch[1].split("/").filter(Boolean);
    for (const part of parts) {
      const coordMatch = part.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
      if (coordMatch) {
        coords.push({ lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) });
      }
    }
  }

  if (coords.length === 0) {
    const dataMatch = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/g);
    if (dataMatch) {
      for (const m of dataMatch) {
        const latLng = m.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
        if (latLng) {
          coords.push({ lat: parseFloat(latLng[1]), lng: parseFloat(latLng[2]) });
        }
      }
    }
  }

  if (coords.length === 0) {
    const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) {
      coords.push({ lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) });
    }
  }

  return coords;
}

router.post("/api/custom-routes/:id/import-gmaps", async (req, res) => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Non autenticato" });

    const route = await storage.getCustomRoute(req.params.id);
    if (!route) return res.status(404).json({ error: "Percorso non trovato" });
    if (route.userId !== userId) return res.status(403).json({ error: "Non autorizzato" });

    const { gmapsLink } = req.body;
    if (!gmapsLink || typeof gmapsLink !== "string") {
      return res.status(400).json({ error: "Link Google Maps obbligatorio" });
    }

    const trimmed = gmapsLink.trim();
    if (!trimmed.includes("google.com/maps") && !trimmed.includes("maps.app.goo.gl") && !trimmed.includes("goo.gl/maps")) {
      return res.status(400).json({ error: "Il link deve essere un link di Google Maps" });
    }

    let expandedUrl = trimmed;
    if (trimmed.includes("goo.gl")) {
      try {
        expandedUrl = await followRedirects(trimmed);
      } catch {
        return res.status(400).json({ error: "Impossibile risolvere il link abbreviato" });
      }
    }

    const coords = extractCoordsFromGoogleMapsUrl(expandedUrl);
    if (coords.length < 2) {
      return res.status(400).json({
        error: "Impossibile estrarre le coordinate dal link. Assicurati di aver condiviso un percorso con almeno 2 punti.",
        expandedUrl,
      });
    }

    const existingWaypoints = await storage.getCustomRouteWaypoints(route.id);
    for (const wp of existingWaypoints) {
      await storage.deleteCustomRouteWaypoint(wp.id);
    }

    const waypointTypes = (idx: number, total: number) => {
      if (idx === 0) return "start";
      if (idx === total - 1) return "end";
      return "stop";
    };

    const waypointNames = (idx: number, total: number) => {
      if (idx === 0) return "Partenza";
      if (idx === total - 1) return "Arrivo";
      return `Tappa ${idx}`;
    };

    const newWaypoints = [];
    for (let i = 0; i < coords.length; i++) {
      const wp = await storage.createCustomRouteWaypoint({
        routeId: route.id,
        name: waypointNames(i, coords.length),
        description: null,
        latitude: coords[i].lat,
        longitude: coords[i].lng,
        waypointType: waypointTypes(i, coords.length),
        orderIndex: i,
      });
      newWaypoints.push(wp);
    }

    let totalDistance = 0;
    for (let i = 1; i < coords.length; i++) {
      const R = 6371;
      const dLat = ((coords[i].lat - coords[i - 1].lat) * Math.PI) / 180;
      const dLng = ((coords[i].lng - coords[i - 1].lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((coords[i - 1].lat * Math.PI) / 180) *
          Math.cos((coords[i].lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      totalDistance += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    await storage.updateCustomRoute(route.id, { totalDistanceKm: totalDistance });

    res.json({
      success: true,
      waypoints: newWaypoints,
      expandedUrl,
      coordsExtracted: coords.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
