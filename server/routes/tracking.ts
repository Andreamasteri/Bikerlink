import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { gpsRejectionStats } from "@shared/schema";
import { sql as drizzleSql } from "drizzle-orm";

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

    const invalidPoints = points.filter(
      (p: any) =>
        typeof p.latitude !== "number" || !isFinite(p.latitude) ||
        typeof p.longitude !== "number" || !isFinite(p.longitude)
    );
    if (invalidPoints.length > 0) {
      const payload = JSON.stringify(invalidPoints);
      console.warn(
        `[tracking] Coordinate non valide rifiutate — userId=${userId} routeId=${id} count=${invalidPoints.length} payload=${payload}`
      );
      const rawDeviceId =
        (req.headers["expo-device-id"] as string | undefined) ||
        (req.headers["expo-installation-id"] as string | undefined) ||
        "unknown";
      const deviceId = rawDeviceId.substring(0, 128);
      const platform = (req.headers["expo-platform"] as string | undefined)?.substring(0, 20) ?? null;
      db.insert(gpsRejectionStats)
        .values({
          userId,
          deviceId,
          platform,
          rejectionCount: 1,
          lastRejectedPayload: payload.slice(0, 2000),
          lastRejectedAt: new Date(),
          lastSource: "tracking",
        })
        .onConflictDoUpdate({
          target: [gpsRejectionStats.userId, gpsRejectionStats.deviceId],
          set: {
            rejectionCount: drizzleSql`${gpsRejectionStats.rejectionCount} + 1`,
            platform,
            lastRejectedPayload: payload.slice(0, 2000),
            lastRejectedAt: new Date(),
            lastSource: "tracking",
          },
        })
        .catch((err: unknown) => console.error("[tracking] gps_rejection_stats upsert error:", err));
      return res.status(400).json({
        message: "Coordinate GPS non valide: latitudine e longitudine devono essere numeri finiti",
        invalidCount: invalidPoints.length,
      });
    }

    const routePoints = points.map((p: any) => ({
      routeId: id as string,
      latitude: p.latitude,
      longitude: p.longitude,
      altitude: p.altitude ?? null,
      speedKmh: p.speedKmh ?? null,
      accelG: typeof p.accelG === "number" && isFinite(p.accelG) ? p.accelG : null,
      tiltDeg: typeof p.tiltDeg === "number" && isFinite(p.tiltDeg) ? p.tiltDeg : null,
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
      maxLateralG: clientMaxLateralG,
      sprint0to100Ms: clientSprint0to100Ms,
      gpsBlackoutCount: clientGpsBlackoutCount,
      gpsBlackoutSeconds: clientGpsBlackoutSeconds,
    } = req.body;

    let totalDistanceKm: number;
    let maxSpeedKmh: number;
    let avgSpeedKmh: number;
    let maxAltitude: number;
    let durationSeconds: number;
    let idleTimeSeconds: number;
    // Preserve null when client sends null (no sensor data collected).
    // A null value in DB means "sensor was not active"; 0 means "active but measured near-zero".
    const toNullableFloat = (v: unknown): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };
    const maxTiltDeg = toNullableFloat(clientMaxTilt);
    const maxAccelerationG = toNullableFloat(clientMaxAccel);
    const maxDecelerationG = toNullableFloat(clientMaxDecel);
    const maxLateralG = toNullableFloat(clientMaxLateralG);
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
          if (speed < 2) {
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
      maxLateralG,
      stoppedAt,
    };
    if (sprint0to100Ms !== null) {
      updatePayload.sprint0to100Ms = sprint0to100Ms;
    }
    updatePayload.gpsBlackoutCount = Math.max(0, Math.floor(Number(clientGpsBlackoutCount) || 0));
    updatePayload.gpsBlackoutSeconds = Math.max(0, Math.floor(Number(clientGpsBlackoutSeconds) || 0));
    const updated = await storage.updateRoute(id, updatePayload);

    const profile = await storage.getUserProfile(userId);
    if (profile) {
      await storage.updateUserProfile(userId, {
        totalKm: (profile.totalKm || 0) + totalDistanceKm,
        totalRides: (profile.totalRides || 0) + 1,
      } as any);
    }

    // Async post-ride map-matching: compute real curvature score from GPS points
    // and update any matching planned route for this user (non-blocking, fire-and-forget)
    setImmediate(async () => {
      try {
        const allPoints = await storage.getRoutePoints(id);
        if (allPoints.length < 3) return;

        // Compute real curvature score from actual GPS track
        let totalAngle = 0;
        for (let i = 1; i < allPoints.length - 1; i++) {
          const v1 = [
            allPoints[i].latitude - allPoints[i - 1].latitude,
            allPoints[i].longitude - allPoints[i - 1].longitude,
          ];
          const v2 = [
            allPoints[i + 1].latitude - allPoints[i].latitude,
            allPoints[i + 1].longitude - allPoints[i].longitude,
          ];
          const dot = v1[0] * v2[0] + v1[1] * v2[1];
          const mag1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2);
          const mag2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2);
          if (mag1 > 0 && mag2 > 0) {
            const cosA = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
            totalAngle += Math.acos(cosA);
          }
        }
        const realCurvatureScore = Math.round(Math.min(1, totalAngle / (allPoints.length * 0.3)) * 100) / 100;

        // Find planned routes by this user whose start point is within 5km of ride start
        const rideStart = allPoints[0];
        const userPlannedRoutes = await storage.getPlannedRoutes(userId);
        for (const pr of userPlannedRoutes) {
          const wps = (pr.waypoints as Array<{ lat: number; lng: number }>) ?? [];
          if (!wps.length) continue;
          const startWp = wps[0];
          if (!startWp?.lat || !startWp?.lng) continue;
          // Haversine distance: planned route start vs actual ride start
          const R = 6371;
          const dLat = (startWp.lat - rideStart.latitude) * Math.PI / 180;
          const dLng = (startWp.lng - rideStart.longitude) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(rideStart.latitude * Math.PI / 180) * Math.cos(startWp.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
          const distKm = 2 * R * Math.asin(Math.sqrt(a));

          if (distKm < 5) {
            // Match found — store real GPS-derived curvature score both in dedicated
            // column and in metadata for historical audit.
            // IMPORTANT: do NOT overwrite bikerScore (planned curvature estimate);
            // realCurvatureScore is the post-ride validation measurement.
            await storage.updatePlannedRoute(pr.id, {
              realCurvatureScore,
              metadata: {
                ...(pr.metadata as object ?? {}),
                realCurvatureScore,
                matchedRideId: id,
                matchedAt: new Date().toISOString(),
              } as any,
            });
            console.log(`[post-ride] Updated planned route ${pr.id} metadata.realCurvatureScore=${realCurvatureScore} from ride ${id}`);
            break;
          }
        }
      } catch (e) {
        console.warn("[post-ride map-matching] error:", e);
      }
    });

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

    const rawPoints = await storage.getRoutePoints(id);
    const simplified = req.query.simplified !== "false";
    const points = simplified ? decimateRoutePoints(rawPoints, 450) : rawPoints;
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
    if (title.trim().length > 200) {
      return res.status(400).json({ message: "Titolo troppo lungo (max 200 caratteri)" });
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

type RawPoint = { latitude: number; longitude: number; [key: string]: any };

function perpendicularDistance(p: RawPoint, a: RawPoint, b: RawPoint): number {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  if (dx === 0 && dy === 0) {
    return Math.sqrt((p.longitude - a.longitude) ** 2 + (p.latitude - a.latitude) ** 2);
  }
  const t = ((p.longitude - a.longitude) * dx + (p.latitude - a.latitude) * dy) / (dx * dx + dy * dy);
  const closestLng = a.longitude + t * dx;
  const closestLat = a.latitude + t * dy;
  return Math.sqrt((p.longitude - closestLng) ** 2 + (p.latitude - closestLat) ** 2);
}

function rdp(points: RawPoint[], epsilon: number): RawPoint[] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, maxIdx + 1), epsilon);
    const right = rdp(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function decimateRoutePoints(points: RawPoint[], maxPoints: number): RawPoint[] {
  if (points.length <= maxPoints) return points;
  const EPSILON_START = 0.0001;
  let epsilon = EPSILON_START;
  let result = rdp(points, epsilon);
  while (result.length > maxPoints && epsilon < 0.1) {
    epsilon *= 1.5;
    result = rdp(points, epsilon);
  }
  if (result.length > maxPoints) {
    const step = (result.length - 1) / (maxPoints - 1);
    const sampled: RawPoint[] = [result[0]];
    for (let i = 1; i < maxPoints - 1; i++) sampled.push(result[Math.round(i * step)]);
    sampled.push(result[result.length - 1]);
    return sampled;
  }
  return result;
}

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

// ─── GPX Export ────────────────────────────────────────────────────────────────
router.get("/:id/export.gpx", async (req: Request, res: Response) => {
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

    const routeName = (route.title || `BikerLink-${id.slice(0, 8)}`).replace(/[<>&"]/g, (c) =>
      c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : "&quot;"
    );
    const creatorTime = route.startedAt
      ? new Date(route.startedAt).toISOString()
      : new Date().toISOString();

    const trkpts = points
      .map((p) => {
        const time = new Date(p.timestamp).toISOString();
        const ele = p.altitude != null ? `\n        <ele>${p.altitude.toFixed(2)}</ele>` : "";
        const spd =
          p.speedKmh != null
            ? `\n        <extensions><speed>${(p.speedKmh / 3.6).toFixed(3)}</speed></extensions>`
            : "";
        return `    <trkpt lat="${p.latitude.toFixed(7)}" lon="${p.longitude.toFixed(7)}">${ele}\n        <time>${time}</time>${spd}\n    </trkpt>`;
      })
      .join("\n");

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BikerLink" xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${routeName}</name>
    <time>${creatorTime}</time>
  </metadata>
  <trk>
    <name>${routeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;

    const safeName = routeName.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 60);
    res.setHeader("Content-Type", "application/gpx+xml");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.gpx"`);
    return res.send(gpx);
  } catch (error) {
    console.error("GPX export error:", error);
    return res.status(500).json({ message: "Errore durante l'esportazione GPX" });
  }
});

export default router;
