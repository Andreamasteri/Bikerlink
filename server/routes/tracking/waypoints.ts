import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { gpsRejectionStats, addRoutePointsSchema } from "@shared/schema";
import { sql as drizzleSql } from "drizzle-orm";
import { sendAdminGpsAlertPush } from "../../push-notifications";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}

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

    const parsedPoints = addRoutePointsSchema.safeParse(req.body);
    if (!parsedPoints.success) {
      // Check for invalid coordinates specifically to log GPS rejections before returning 400
      const rawPoints = Array.isArray(req.body?.points) ? req.body.points : [];
      const invalidPoints = rawPoints.filter(
        (p: any) =>
          typeof p.latitude !== "number" || !isFinite(p.latitude) ||
          typeof p.longitude !== "number" || !isFinite(p.longitude)
      );
      if (invalidPoints.length > 0) {
        const payload = JSON.stringify(invalidPoints);
        console.warn(
          `[tracking] Coordinate non valide rifiutate — userId=${userId} routeId=${id} count=${invalidPoints.length} payload=${payload}`
        );
        (async () => {
          try {
            // Log rejection to gpsRejectionStats
            for (const p of invalidPoints) {
              await db.insert(gpsRejectionStats)
                .values({
                  userId,
                  routeId: id,
                  rejectionType: "invalid_coordinates",
                  lat: typeof p.latitude === "number" ? p.latitude : null,
                  lng: typeof p.longitude === "number" ? p.longitude : null,
                  speedKmh: typeof p.speedKmh === "number" ? p.speedKmh : null,
                  accelG: typeof p.accelG === "number" ? p.accelG : null,
                  tiltDeg: typeof p.tiltDeg === "number" ? p.tiltDeg : null,
                  rejectedAt: new Date(),
                });
            }

            // Optional: send push alert if there are many rejections
            // Note: original code used a different schema for aggregation which is not in gpsRejectionStats
            // We'll skip the aggregation/alert logic for now as it doesn't match the schema
          } catch (err) {
            console.error("[tracking] gps_rejection_stats insert error:", err);
          }
        })();
        return res.status(400).json({
          message: "Coordinate GPS non valide: latitudine e longitudine devono essere numeri finiti",
          invalidCount: invalidPoints.length,
        });
      }
      return res.status(400).json({ message: parsedPoints.error.issues[0].message });
    }

    const { points } = parsedPoints.data;
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

export default router;
