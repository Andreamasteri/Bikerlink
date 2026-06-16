/**
 * Endpoint Valhalla: Isochrone + Matrix — BikerLink
 *
 * Espone le funzioni native Valhalla non disponibili in GraphHopper:
 *   POST /api/routing/isochrone  — area raggiungibile in X minuti (GeoJSON)
 *   POST /api/routing/matrix     — matrice tempi/distanze tra N punti
 *
 * Entrambi richiedono autenticazione (sessione utente).
 * Se Valhalla non è configurato o offline → 503 con messaggio chiaro.
 * Nessun fallback a GraphHopper (GH non supporta queste funzioni).
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../lib/auth-middleware";
import { getIsochrone, getMatrix } from "../../routing/valhalla-client";
import { sendError } from "../../lib/api-response";

const router = Router();

const VALHALLA_URL = process.env.VALHALLA_URL?.trim() ?? "";

function isValhallaConfigured(): boolean {
  return VALHALLA_URL.length > 0;
}

function handleValhallaError(err: unknown, res: Response, endpoint: string): Response {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[routing/${endpoint}] Valhalla error:`, msg);

  if (!isValhallaConfigured() || msg.includes("VALHALLA_URL non configurato")) {
    sendError(res, 503, "Valhalla non configurato: impostare VALHALLA_URL per usare questa funzione.");
    return res;
  }

  const isOffline =
    err instanceof TypeError ||
    (err instanceof Error && err.name === "AbortError") ||
    /error 5\d{2}/.test(msg);

  if (isOffline) {
    sendError(res, 503, "Valhalla non raggiungibile. Riprovare più tardi.");
    return res;
  }

  sendError(res, 502, msg.slice(0, 300));
  return res;
}

// ─── Schemi di validazione ───────────────────────────────────────────────────

const isochroneSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  minutes: z
    .array(z.number().int().min(1).max(120))
    .min(1)
    .max(10)
    .default([15, 30]),
});

const latLonSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const matrixSchema = z.object({
  origins: z.array(latLonSchema).min(1).max(25),
  destinations: z.array(latLonSchema).min(1).max(25),
});

// ─── POST /api/routing/isochrone ─────────────────────────────────────────────

/**
 * Restituisce l'area raggiungibile da un punto in X minuti.
 *
 * Body: { lat: number, lon: number, minutes?: number[] }
 * Response: GeoJSON FeatureCollection (un Polygon per contorno)
 */
router.post("/isochrone", requireAuth, async (req: Request, res: Response) => {
  if (!isValhallaConfigured()) {
    return sendError(res, 503, "Valhalla non configurato: impostare VALHALLA_URL per usare questa funzione.");
  }

  const parsed = isochroneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Input non valido",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { lat, lon, minutes } = parsed.data;

  try {
    const result = await getIsochrone(lat, lon, minutes);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return handleValhallaError(err, res, "isochrone");
  }
});

// ─── POST /api/routing/matrix ────────────────────────────────────────────────

/**
 * Calcola la matrice tempi/distanze tra N origini e M destinazioni.
 *
 * Body: { origins: [{lat, lon}], destinations: [{lat, lon}] }
 * Response: { origins, destinations, matrix: MatrixCell[][] }
 */
router.post("/matrix", requireAuth, async (req: Request, res: Response) => {
  if (!isValhallaConfigured()) {
    return sendError(res, 503, "Valhalla non configurato: impostare VALHALLA_URL per usare questa funzione.");
  }

  const parsed = matrixSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Input non valido",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { origins, destinations } = parsed.data;

  try {
    const result = await getMatrix(origins, destinations);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return handleValhallaError(err, res, "matrix");
  }
});

export default router;
