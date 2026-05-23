import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { addRoutePointsSchema } from "@shared/validators";
import { sql as drizzleSql } from "drizzle-orm";

import { requireUserId } from "../../lib/auth-middleware";

const router = Router();

router.post("/:id/points", async (req: Request, res: Response) => {
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

    const parsedPoints = addRoutePointsSchema.safeParse(req.body);
    if (!parsedPoints.success) {
      const rawPoints = Array.isArray(req.body?.points) ? req.body.points : [];
      type RawPoint = { latitude?: unknown; longitude?: unknown };
      const invalidPoints = rawPoints.filter(
        (p: RawPoint) =>
          typeof p.latitude !== "number" || !isFinite(p.latitude as number) ||
          typeof p.longitude !== "number" || !isFinite(p.longitude as number)
      );
      if (invalidPoints.length > 0) {
        const payload = JSON.stringify(invalidPoints);
        console.warn(
          `[tracking] Coordinate non valide rifiutate — userId=${userId} routeId=${id} count=${invalidPoints.length} payload=${payload}`
        );
        (async () => {
          try {
            await db.execute(
              drizzleSql`
                INSERT INTO gps_rejection_stats (user_id, device_id, rejection_count, last_rejected_payload, last_rejected_at, last_source)
                VALUES (${userId}, 'unknown', 1, ${payload}, NOW(), 'api')
                ON CONFLICT (user_id, device_id) DO UPDATE SET
                  rejection_count = gps_rejection_stats.rejection_count + 1,
                  last_rejected_payload = EXCLUDED.last_rejected_payload,
                  last_rejected_at = EXCLUDED.last_rejected_at,
                  last_source = EXCLUDED.last_source
              `
            );
          } catch (err) {
            console.error("[tracking] gps_rejection_stats upsert error:", err);
          }
        })();
        return res.status(400).json({
          message: "Coordinate GPS non valide: latitudine e longitudine devono essere numeri finiti",
          invalidCount: invalidPoints.length,
        });
      }
      return sendError(res, 400, parsedPoints.error.issues[0].message);
    }

    const { points } = parsedPoints.data;
    const routePoints = points.map((p) => ({
      routeId: id as string,
      latitude: p.latitude as number,
      longitude: p.longitude as number,
      altitude: p.altitude ?? null,
      speedKmh: p.speedKmh ?? null,
      accelG: p.accelG ?? null,
      tiltDeg: p.tiltDeg ?? null,
      timestamp: p.timestamp ? new Date(p.timestamp) : new Date(),
    }));

    await storage.createRoutePoints(routePoints);

    return res.json({ added: routePoints.length });
  } catch (err) {
    console.error("[tracking] add points error:", err);
    return sendError(res, 500, "Errore aggiunta punti GPS");
  }
});

export default router;
