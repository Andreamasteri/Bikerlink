/**
 * custom-routes2.ts — Successore di custom-routes.ts
 *
 * Nuovo codice relativo al dominio custom-routes va aggiunto qui.
 * NON spostare il codice esistente da custom-routes.ts senza task dedicato.
 */

import { Router } from "express";
import { storage } from "../storage";
import { sendError } from "../lib/api-response";

const router = Router();

// ─── POST /api/custom-routes/:id/duplicate ────────────────────────────────────
// Duplica un percorso (e i suoi waypoint) assegnando la copia all'utente
// autenticato. Restituisce il nuovo percorso con i waypoint duplicati.
router.post("/api/custom-routes/:id/duplicate", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");

    const { id } = req.params;
    const original = await storage.getCustomRoute(id);
    if (!original) return sendError(res, 404, "Percorso non trovato");

    const isOwner = original.userId === userId;
    const isPublic =
      original.visibility === "public" ||
      (original.visibility !== "private" && original.isPublic);

    if (!isOwner && !isPublic) {
      return sendError(res, 403, "Accesso non consentito");
    }

    const copy = await storage.createCustomRoute({
      userId,
      title: `${original.title} (copia)`,
      description: original.description ?? undefined,
      totalDistanceKm: original.totalDistanceKm ?? 0,
      isPublic: false,
      visibility: "private",
    });

    const waypoints = await storage.getCustomRouteWaypoints(original.id);
    const copiedWaypoints = await Promise.all(
      waypoints.map((wp) =>
        storage.createCustomRouteWaypoint({
          routeId: copy.id,
          orderIndex: wp.orderIndex,
          name: wp.name,
          description: wp.description ?? undefined,
          latitude: wp.latitude,
          longitude: wp.longitude,
          waypointType: wp.waypointType,
        })
      )
    );

    return res.status(201).json({ route: copy, waypoints: copiedWaypoints });
  } catch (err: unknown) {
    console.error("[custom-routes2 duplicate] error:", err);
    return sendError(res, 500, "Errore durante la duplicazione del percorso");
  }
});

export default router;
