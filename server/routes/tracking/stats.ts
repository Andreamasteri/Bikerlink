import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { routeStatsSchema, stopRouteSchema, updateRouteTitleSchema } from "@shared/validators";
import { evaluateSegment, TRACKING_FUSION } from "@shared/tracking-fusion";
import { requireUserId } from "../../lib/auth-middleware";
import { sendSuccess, sendError } from "../../lib/api-response";

const router = Router();

router.put("/:id/stop", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const route = await storage.getRoute(id);

    if (!route) {
      return sendError(res, 404, "Percorso non trovato");
    }
    if (route.userId !== userId) {
      return sendError(res, 403, "Non autorizzato");
    }
    if (route.status === "armed" || !route.startedAt) {
      return sendError(res, 409, "La misurazione non è ancora iniziata");
    }
    // A client can lose the response after the database update and retry the
    // same stop request. Returning the already completed row makes the
    // endpoint idempotent and prevents a second profile counter increment.
    if (route.status === "completed") {
      return res.json(route);
    }

    const stoppedAt = new Date();

    const parsedStop = stopRouteSchema.safeParse(req.body);
    if (!parsedStop.success) {
      return sendError(res, 400, parsedStop.error.issues[0].message);
    }
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
    } = parsedStop.data;

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

      // Mirror the client live accumulation (useTrackingEffects.onNativeLocation):
      // advance the reference point ONLY when a segment is accepted, so rejected
      // jitter doesn't move the origin and sub-floor moves in curves accumulate
      // across fixes. Idle time is still measured per consecutive pair.
      let lastAccepted: { lat: number; lng: number; timeMs: number } | null = null;
      for (let i = 0; i < allPoints.length; i++) {
        const pt = allPoints[i];
        if (pt.speedKmh !== null && pt.speedKmh !== undefined) {
          if (pt.speedKmh > maxSpeedKmh) maxSpeedKmh = pt.speedKmh;
        }
        if (pt.altitude !== null && pt.altitude !== undefined) {
          if (pt.altitude > maxAltitude) maxAltitude = pt.altitude;
        }
        const ptTimeMs = new Date(pt.timestamp).getTime();
        if (i > 0) {
          const prev = allPoints[i - 1];
          const intervalSec = Math.abs(ptTimeMs - new Date(prev.timestamp).getTime()) / 1000;
          const speed = pt.speedKmh ?? 0;
          if (speed < TRACKING_FUSION.IDLE_THRESHOLD_KMH) {
            idleTimeSec += intervalSec;
          }
        }
        if (lastAccepted === null) {
          lastAccepted = { lat: pt.latitude, lng: pt.longitude, timeMs: ptTimeMs };
          continue;
        }
        const decision = evaluateSegment({
          prevLat: lastAccepted.lat, prevLng: lastAccepted.lng, prevTimeMs: lastAccepted.timeMs,
          lat: pt.latitude, lng: pt.longitude, timeMs: ptTimeMs,
          accuracyM: null, // route points don't persist accuracy → floor-only gate
        });
        if (decision.accept) {
          totalDistanceKm += decision.distanceKm;
          lastAccepted = { lat: pt.latitude, lng: pt.longitude, timeMs: ptTimeMs };
        }
        // Reject: leave the accepted anchor (position AND time) untouched, exactly
        // like the client. Mutating the anchor time would shrink dt for the next
        // candidate and diverge from the live total (speed-jump self-lock).
      }

      durationSeconds = Math.floor((stoppedAt.getTime() - new Date(route.startedAt).getTime()) / 1000);
      idleTimeSeconds = Math.round(idleTimeSec);
      const netTravelSeconds = Math.max(durationSeconds - idleTimeSeconds, 1);
      avgSpeedKmh = totalDistanceKm > 0 ? totalDistanceKm / (netTravelSeconds / 3600) : 0;
    }

    const updatePayload: Partial<import("@shared/db").InsertRoute> = {
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
    // Fire-and-forget: aggiorna fingerprint celle GPS (route_affinity matching)
    try {
      const { triggerFingerprintUpdate } = await import("../../matching/jobs/extract-route-cells");
      triggerFingerprintUpdate(id);
    } catch (err) {
      console.warn("[tracking/stats] triggerFingerprintUpdate skipped:", err);
    }

    const profile = await storage.getUserProfile(userId);
    if (profile) {
      await storage.updateUserProfile(userId, {
        totalKm: (profile.totalKm || 0) + totalDistanceKm,
        totalRides: (profile.totalRides || 0) + 1,
      });
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
              metadata: {
                ...(pr.metadata as object ?? {}),
                realCurvatureScore,
                matchedRideId: id,
                matchedAt: new Date().toISOString(),
              },
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
    return sendError(res, 500, "Errore interno del server");
  }
});

router.patch("/:id/stats", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const route = await storage.getRoute(id);

    if (!route) {
      return sendError(res, 404, "Percorso non trovato");
    }
    if (route.userId !== userId) {
      return sendError(res, 403, "Non autorizzato");
    }
    if (route.status !== "active") {
      return sendError(res, 400, "Il percorso non è attivo");
    }

    const parsedStats = routeStatsSchema.safeParse(req.body);
    if (!parsedStats.success) {
      return sendError(res, 400, parsedStats.error.issues[0].message);
    }
    const { totalDistanceKm, maxSpeedKmh, avgSpeedKmh, maxAltitude, idleTimeSeconds } = parsedStats.data;
    const updates: Partial<import("@shared/db").InsertRoute> = {};
    if (totalDistanceKm !== undefined) updates.totalDistanceKm = totalDistanceKm;
    if (maxSpeedKmh !== undefined) updates.maxSpeedKmh = maxSpeedKmh;
    if (avgSpeedKmh !== undefined) updates.avgSpeedKmh = avgSpeedKmh;
    if (maxAltitude !== undefined) updates.maxAltitude = maxAltitude;
    if (idleTimeSeconds !== undefined) updates.idleTimeSeconds = idleTimeSeconds;

    if (Object.keys(updates).length > 0) {
      await storage.updateRoute(id, updates);
    }

    return sendSuccess(res);
  } catch (error) {
    console.error("Update route stats error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.patch("/:id/title", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const route = await storage.getRoute(id);

    if (!route) {
      return sendError(res, 404, "Percorso non trovato");
    }
    if (route.userId !== userId) {
      return sendError(res, 403, "Non autorizzato");
    }

    const parsedTitle = updateRouteTitleSchema.safeParse(req.body);
    if (!parsedTitle.success) {
      return sendError(res, 400, parsedTitle.error.issues[0].message);
    }
    const { title } = parsedTitle.data;
    const titleUpdate: Partial<import("@shared/db").InsertRoute> = { title: title.trim() };
    await storage.updateRoute(id, titleUpdate);
    return sendSuccess(res);
  } catch (error) {
    console.error("Patch route title error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
