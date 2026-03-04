import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { storage } from "../storage";

export const trackingRouter = Router();

trackingRouter.post("/start", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { trackingFrequency } = req.body;

    const route = await storage.createRoute(user.id, trackingFrequency || "5s");
    res.status(201).json({ route });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'avvio tracciamento" });
  }
});

trackingRouter.post("/:id/point", requireAuth, async (req, res) => {
  try {
    const { latitude, longitude, altitude, speed, isStop } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: "Coordinate obbligatorie" });
    }

    const point = await storage.addRoutePoint({
      routeId: req.params.id,
      latitude,
      longitude,
      altitude,
      speed,
      isStop,
    });

    res.status(201).json({ point });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'aggiunta punto" });
  }
});

trackingRouter.post("/:id/stop", requireAuth, async (req, res) => {
  try {
    const routeId = req.params.id;
    const route = await storage.getRoute(routeId);
    if (!route) return res.status(404).json({ message: "Percorso non trovato" });

    const points = await storage.getRoutePoints(routeId);
    if (points.length < 2) {
      const updated = await storage.updateRoute(routeId, {
        endTime: new Date(),
        totalDistanceKm: 0,
        maxSpeedKmh: 0,
        minAltitudeM: points.length === 1 && points[0].altitude != null ? Math.round(points[0].altitude) : null,
        maxAltitudeM: points.length === 1 && points[0].altitude != null ? Math.round(points[0].altitude) : null,
        totalDurationMinutes: 0,
      });
      return res.json({ route: updated, pointCount: points.length });
    }

    let totalDistanceKm = 0;
    let maxSpeedKmh = 0;
    let minAltitudeM: number | null = null;
    let maxAltitudeM: number | null = null;

    for (let i = 0; i < points.length; i++) {
      const curr = points[i];

      if (i > 0) {
        const prev = points[i - 1];
        totalDistanceKm += haversineDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
      }

      if (curr.speed !== null && curr.speed !== undefined) {
        const speedKmh = curr.speed * 3.6;
        if (speedKmh > maxSpeedKmh) maxSpeedKmh = speedKmh;
      }

      if (curr.altitude !== null && curr.altitude !== undefined) {
        if (minAltitudeM === null || curr.altitude < minAltitudeM) minAltitudeM = curr.altitude;
        if (maxAltitudeM === null || curr.altitude > maxAltitudeM) maxAltitudeM = curr.altitude;
      }
    }

    const startTime = new Date(points[0].timestamp);
    const endTime = new Date(points[points.length - 1].timestamp);
    const totalDurationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

    const updated = await storage.updateRoute(routeId, {
      endTime,
      totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
      maxSpeedKmh: Math.round(maxSpeedKmh * 10) / 10,
      minAltitudeM: minAltitudeM !== null ? Math.round(minAltitudeM) : null,
      maxAltitudeM: maxAltitudeM !== null ? Math.round(maxAltitudeM) : null,
      totalDurationMinutes,
    });

    res.json({ route: updated, pointCount: points.length });
  } catch (err) {
    console.error("Errore stop tracking:", err);
    res.status(500).json({ message: "Errore nel completamento tracciamento" });
  }
});

trackingRouter.post("/:id/photo", requireAuth, async (req, res) => {
  try {
    const { photoUrl, caption } = req.body;
    if (!photoUrl) return res.status(400).json({ message: "URL foto obbligatorio" });

    const photo = await storage.addRoutePhoto(req.params.id, photoUrl, caption);
    res.status(201).json({ photo });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'aggiunta foto" });
  }
});

trackingRouter.put("/:id/publish", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const route = await storage.getRoute(req.params.id);
    if (!route) return res.status(404).json({ message: "Percorso non trovato" });
    if (route.userId !== user.id) return res.status(403).json({ message: "Non autorizzato" });

    const title = req.body?.title;
    const updated = await storage.updateRoute(req.params.id, { isPublished: true, ...(title ? { title } : {}) });
    res.json({ route: updated });
  } catch (err: any) {
    console.error("Errore pubblicazione route:", err?.message || err);
    res.status(500).json({ message: "Errore nella pubblicazione" });
  }
});

trackingRouter.get("/", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;

    const routes = await storage.getPublishedRoutes(limit, offset);
    const result = await Promise.all(
      routes.map(async (r) => {
        const likeCount = await storage.getRouteLikeCount(r.route.id);
        const hasLiked = await storage.hasUserLikedRoute(r.route.id, (req as any).user.id);
        const photos = await storage.getRoutePhotos(r.route.id);
        const { passwordHash: _, ...safeUser } = r.user;
        return { ...r.route, user: safeUser, likeCount, hasLiked, photos };
      })
    );

    res.json({ routes: result });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento percorsi" });
  }
});

trackingRouter.get("/my", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const routes = await storage.getPublishedRoutes(100, 0);
    const myRoutes = routes.filter(r => r.route.userId === user.id);
    res.json({
      routes: myRoutes.map(r => {
        const { passwordHash: _, ...safeUser } = r.user;
        return { ...r.route, user: safeUser };
      })
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento percorsi" });
  }
});

trackingRouter.get("/:id", requireAuth, async (req, res) => {
  try {
    const route = await storage.getRoute(req.params.id);
    if (!route) return res.status(404).json({ message: "Percorso non trovato" });

    const points = await storage.getRoutePoints(req.params.id);
    const photos = await storage.getRoutePhotos(req.params.id);
    const likeCount = await storage.getRouteLikeCount(req.params.id);
    const hasLiked = await storage.hasUserLikedRoute(req.params.id, (req as any).user.id);

    res.json({ route, points, photos, likeCount, hasLiked });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento percorso" });
  }
});

trackingRouter.post("/:id/like", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const added = await storage.likeRoute(req.params.id, user.id);
    const count = await storage.getRouteLikeCount(req.params.id);
    res.json({ liked: added, likeCount: count });
  } catch (err) {
    res.status(500).json({ message: "Errore nel like" });
  }
});

trackingRouter.delete("/:id/like", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    await storage.unlikeRoute(req.params.id, user.id);
    const count = await storage.getRouteLikeCount(req.params.id);
    res.json({ liked: false, likeCount: count });
  } catch (err) {
    res.status(500).json({ message: "Errore nella rimozione like" });
  }
});

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
