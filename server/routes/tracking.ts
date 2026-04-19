import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const existingRoutes = await storage.getRoutes(userId);
    for (const r of existingRoutes) {
      if (r.status !== "active" || !r.startedAt) continue;
      const startedAt = new Date(r.startedAt);
      const hasDistance = r.totalDistanceKm !== null && r.totalDistanceKm !== undefined && r.totalDistanceKm > 0;
      try {
        if (!hasDistance && startedAt < tenMinutesAgo) {
          await storage.deleteRoute(r.id);
        } else if (hasDistance && startedAt < twoHoursAgo) {
          const stoppedAt = new Date();
          const durationSeconds = Math.floor((stoppedAt.getTime() - startedAt.getTime()) / 1000);
          await storage.updateRoute(r.id, {
            status: "completed",
            stoppedAt,
            durationSeconds,
          } as any);
        }
      } catch {
      }
    }

    const { title, trackingFrequency, isSprint } = req.body;

    const route = await storage.createRoute({
      userId,
      title: title || null,
      trackingFrequency: trackingFrequency || 5,
      status: "active",
      isSprint: isSprint === true,
      startedAt: new Date(),
    });

    return res.status(201).json(route);
  } catch (error) {
    console.error("Create route error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/:id/points", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const route = await storage.getRoute(id);

    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    if (route.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    if (route.status !== "active") {
      return res.status(400).json({ message: "Il percorso non è attivo" });
    }

    const { points } = req.body;
    if (!Array.isArray(points) || points.length === 0) {
      return res.status(400).json({ message: "Nessun punto GPS fornito" });
    }

    const routePoints = points.map((p: any) => ({
      routeId: id as string,
      latitude: p.latitude,
      longitude: p.longitude,
      altitude: p.altitude ?? null,
      speedKmh: p.speedKmh ?? null,
      timestamp: p.timestamp ? new Date(p.timestamp) : new Date(),
    }));

    const created = await storage.createRoutePoints(routePoints);
    return res.status(201).json(created);
  } catch (error) {
    console.error("Add route points error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/:id/stop", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const route = await storage.getRoute(id);

    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    if (route.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const stoppedAt = new Date();

    const {
      totalDistanceKm: clientDistanceKm,
      maxSpeedKmh: clientMaxSpeed,
      avgSpeedKmh: clientAvgSpeed,
      maxAltitude: clientMaxAlt,
      durationSeconds: clientDuration,
      idleTimeSeconds: clientIdleTime,
      maxTiltDeg: clientMaxTilt,
      maxAccelerationG: clientMaxAccel,
      maxDecelerationG: clientMaxDecel,
      sprint0to100Ms: clientSprint0to100Ms,
    } = req.body;

    let totalDistanceKm: number;
    let maxSpeedKmh: number;
    let avgSpeedKmh: number;
    let maxAltitude: number;
    let durationSeconds: number;
    let idleTimeSeconds: number;
    const maxTiltDeg = Number(clientMaxTilt) || 0;
    const maxAccelerationG = Number(clientMaxAccel) || 0;
    const maxDecelerationG = Number(clientMaxDecel) || 0;
    const sprint0to100Ms = clientSprint0to100Ms != null ? Number(clientSprint0to100Ms) : null;

    if (
      clientDistanceKm !== undefined &&
      clientMaxSpeed !== undefined &&
      clientDuration !== undefined
    ) {
      totalDistanceKm = Number(clientDistanceKm) || 0;
      maxSpeedKmh = Number(clientMaxSpeed) || 0;
      avgSpeedKmh = Number(clientAvgSpeed) || 0;
      maxAltitude = Number(clientMaxAlt) || 0;
      durationSeconds = Number(clientDuration) || 0;
      idleTimeSeconds = Math.round(Number(clientIdleTime) || 0);
    } else {
      const allPoints = await storage.getRoutePoints(id);

      totalDistanceKm = 0;
      maxSpeedKmh = 0;
      maxAltitude = 0;
      let idleTimeSec = 0;

      for (let i = 0; i < allPoints.length; i++) {
        const pt = allPoints[i];
        if (pt.speedKmh !== null && pt.speedKmh !== undefined) {
          if (pt.speedKmh > maxSpeedKmh) maxSpeedKmh = pt.speedKmh;
        }
        if (pt.altitude !== null && pt.altitude !== undefined) {
          if (pt.altitude > maxAltitude) maxAltitude = pt.altitude;
        }
        if (i > 0) {
          const prev = allPoints[i - 1];
          totalDistanceKm += haversineKm(prev.latitude, prev.longitude, pt.latitude, pt.longitude);
          const intervalSec = Math.abs(new Date(pt.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
          const speed = pt.speedKmh ?? 0;
          if (speed < 3) {
            idleTimeSec += intervalSec;
          }
        }
      }

      durationSeconds = Math.floor((stoppedAt.getTime() - new Date(route.startedAt).getTime()) / 1000);
      idleTimeSeconds = Math.round(idleTimeSec);
      const netTravelSeconds = Math.max(durationSeconds - idleTimeSeconds, 1);
      avgSpeedKmh = totalDistanceKm > 0 ? totalDistanceKm / (netTravelSeconds / 3600) : 0;
    }

    const updatePayload: Partial<import("../../shared/schema").InsertRoute> = {
      status: "completed",
      totalDistanceKm,
      maxSpeedKmh,
      avgSpeedKmh,
      maxAltitude,
      durationSeconds,
      idleTimeSeconds,
      maxTiltDeg,
      maxAccelerationG,
      maxDecelerationG,
      stoppedAt,
    };
    if (sprint0to100Ms !== null) {
      updatePayload.sprint0to100Ms = sprint0to100Ms;
    }
    const updated = await storage.updateRoute(id, updatePayload);

    const profile = await storage.getUserProfile(userId);
    if (profile) {
      await storage.updateUserProfile(userId, {
        totalKm: (profile.totalKm || 0) + totalDistanceKm,
        totalRides: (profile.totalRides || 0) + 1,
      } as any);
    }

    return res.json(updated);
  } catch (error) {
    console.error("Stop route error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.patch("/:id/stats", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const route = await storage.getRoute(id);

    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    if (route.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }
    if (route.status !== "active") {
      return res.status(400).json({ message: "Il percorso non è attivo" });
    }

    const { totalDistanceKm, maxSpeedKmh, avgSpeedKmh, maxAltitude, idleTimeSeconds } = req.body;
    const updates: any = {};
    if (totalDistanceKm !== undefined) updates.totalDistanceKm = totalDistanceKm;
    if (maxSpeedKmh !== undefined) updates.maxSpeedKmh = maxSpeedKmh;
    if (avgSpeedKmh !== undefined) updates.avgSpeedKmh = avgSpeedKmh;
    if (maxAltitude !== undefined) updates.maxAltitude = maxAltitude;
    if (idleTimeSeconds !== undefined) updates.idleTimeSeconds = idleTimeSeconds;

    if (Object.keys(updates).length > 0) {
      await storage.updateRoute(id, updates);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("Update route stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const userRoutes = await storage.getRoutes(userId);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const filtered = userRoutes.filter((r: any) => {
      const isOrphan =
        r.status === "active" &&
        (r.totalDistanceKm === null || r.totalDistanceKm === undefined || r.totalDistanceKm === 0) &&
        r.startedAt &&
        new Date(r.startedAt) < tenMinutesAgo;
      return !isOrphan;
    });
    return res.json(filtered);
  } catch (error) {
    console.error("Get routes error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const route = await storage.getRoute(id);

    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    if (route.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const points = await storage.getRoutePoints(id);
    return res.json({ ...route, points });
  } catch (error) {
    console.error("Get route error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.patch("/:id/title", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const route = await storage.getRoute(id);

    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    if (route.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const { title } = req.body;
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ message: "Titolo non valido" });
    }

    const titleUpdate: Partial<import("../../shared/schema").InsertRoute> = { title: title.trim() };
    await storage.updateRoute(id, titleUpdate);
    return res.json({ ok: true });
  } catch (error) {
    console.error("Patch route title error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const route = await storage.getRoute(id);

    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    if (route.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    await storage.deleteRoute(id);
    return res.json({ ok: true });
  } catch (error) {
    console.error("Delete route error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/:id/like", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const route = await storage.getRoute(id);

    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }

    const updated = await storage.updateRoute(id, {
      likes: (route.likes || 0) + 1,
    } as any);

    return res.json(updated);
  } catch (error) {
    console.error("Like route error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export default router;
