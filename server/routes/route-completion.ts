// Route-completion endpoints: PATCH /routes/:id (con telemetria sensori),
// GET/POST /routes/:id/voice-notes, GET /routes/:id/points,
// GET /planned-routes/poi/:id/photos, GET /planned-routes/weather/:id.
// Estratto da wip-stubs.ts per rispettare il limite 600 righe.

import { Router, type Request, type Response } from "express";
import { eq, asc, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { requireAuth } from "../lib/auth-middleware";
import { sendError } from "../lib/api-response";
import {
  routes,
  routePoints,
  routeVoiceNotes,
  rideTelemetry,
} from "@shared/db";

const router = Router();

// ── /api/routes/:id/points (GET) ────────────────────────────────────────
router.get("/routes/:id/points", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const id = req.params.id as string;
    const route = await storage.getRoute(id);
    if (!route) return sendError(res, 404, "Route non trovata");
    if (route.userId !== userId) {
      const { isAdminOrModUser } = await import("./events-helpers");
      if (!(await isAdminOrModUser(userId))) return sendError(res, 403, "Non autorizzato");
    }
    const pts = await db.select({
      latitude: routePoints.latitude,
      longitude: routePoints.longitude,
      altitude: routePoints.altitude,
      speedKmh: routePoints.speedKmh,
      timestamp: routePoints.timestamp,
    }).from(routePoints).where(eq(routePoints.routeId, id)).orderBy(asc(routePoints.timestamp));
    return res.json({ points: pts });
  } catch (err) {
    console.error("[routes/:id/points GET]", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

// ── /api/routes/:id (PATCH) ─────────────────────────────────────────────
// Aggiorna title + campi di completamento corsa + telemetria sensori.
router.patch("/routes/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const id = req.params.id as string;
    const route = await storage.getRoute(id);
    if (!route) return sendError(res, 404, "Route non trovata");
    if (route.userId !== userId) return sendError(res, 403, "Non autorizzato");

    const body = (req.body ?? {}) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    const numKeys = [
      "totalDistanceKm", "maxSpeedKmh", "avgSpeedKmh", "maxAltitude",
      "durationSeconds", "idleTimeSeconds", "maxTiltDeg", "maxAccelerationG",
      "maxDecelerationG", "maxLateralG", "sprint0to100Ms",
      "gpsBlackoutCount", "gpsBlackoutSeconds",
    ] as const;
    for (const k of numKeys) {
      if (typeof body[k] === "number" && Number.isFinite(body[k] as number)) {
        updates[k] = body[k];
      }
    }
    if (typeof body.title === "string") updates.title = (body.title as string).slice(0, 200);
    if (typeof body.status === "string") updates.status = body.status;
    if (typeof body.isSprint === "boolean") updates.isSprint = body.isSprint;
    if (body.stoppedAt) {
      const d = new Date(body.stoppedAt as string);
      if (!isNaN(d.getTime())) updates.stoppedAt = d;
    }

    if (Object.keys(updates).length === 0) {
      return res.json({ route });
    }

    const [updated] = await db.update(routes).set(updates).where(eq(routes.id, id)).returning();

    // ── Telemetria sensori (Routes & Performance) ────────────────────────
    // Il client invia `telemetryData` come stringa JSON di array di campioni
    // con shape { timestamp, lat, lon, leanAngle, gForceX, speedKmh }.
    // Saltiamo silenziosamente se il campo è assente, vuoto o malformato.
    const rawTelemetry = body.telemetryData;
    if (typeof rawTelemetry === "string" && rawTelemetry.length > 0) {
      try {
        const parsed: unknown = JSON.parse(rawTelemetry);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Deduplicazione: se la sessione ha già campioni in DB, saltiamo.
          const existing = await db.execute(sql`
            SELECT 1 FROM ride_telemetry
            WHERE session_id = ${id}
            LIMIT 1
          `);
          if (existing.rows.length === 0) {
            type ClientSample = {
              timestamp?: unknown;
              lat?: unknown;
              lon?: unknown;
              leanAngle?: unknown;
              gForceX?: unknown;
              speedKmh?: unknown;
            };
            const rows: typeof rideTelemetry.$inferInsert[] = [];
            for (const s of parsed as ClientSample[]) {
              const ts = typeof s.timestamp === "number"
                ? s.timestamp
                : typeof s.timestamp === "string"
                  ? new Date(s.timestamp).getTime()
                  : NaN;
              const lat = typeof s.lat === "number" ? s.lat : Number(s.lat);
              const lon = typeof s.lon === "number" ? s.lon : Number(s.lon);
              if (!Number.isFinite(ts) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
              rows.push({
                userId,
                sessionId: id,
                sessionType: "ride",
                ts,
                lat,
                lon,
                leanAngle: s.leanAngle != null && Number.isFinite(Number(s.leanAngle)) ? Number(s.leanAngle) : null,
                gforceX: s.gForceX != null && Number.isFinite(Number(s.gForceX)) ? Number(s.gForceX) : null,
                speedKmh: s.speedKmh != null && Number.isFinite(Number(s.speedKmh)) ? Number(s.speedKmh) : null,
              });
            }
            if (rows.length > 0) {
              const CHUNK = 500;
              for (let i = 0; i < rows.length; i += CHUNK) {
                await db.insert(rideTelemetry).values(rows.slice(i, i + CHUNK));
              }
              console.log(`[routes/:id PATCH] telemetria: ${rows.length} campioni inseriti per sessione ${id}`);
            }
          } else {
            console.log(`[routes/:id PATCH] telemetria: sessione ${id} già presente in ride_telemetry, skip`);
          }
        }
      } catch (telErr) {
        console.warn("[routes/:id PATCH] telemetryData parse/insert failed (silenzioso):", telErr);
      }
    }

    return res.json({ route: updated });
  } catch (err) {
    console.error("[routes/:id PATCH]", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

// ── /api/routes/:id/voice-notes (POST) ──────────────────────────────────
// Appende una nota vocale trascritta alla corsa in corso.
router.post("/routes/:id/voice-notes", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const id = req.params.id as string;
    const route = await storage.getRoute(id);
    if (!route) return sendError(res, 404, "Route non trovata");
    if (route.userId !== userId) return sendError(res, 403, "Non autorizzato");

    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawText = body.text;
    if (typeof rawText !== "string" || rawText.trim().length === 0) {
      return sendError(res, 400, "Campo 'text' obbligatorio");
    }
    const text = rawText.slice(0, 2000);

    const [note] = await db
      .insert(routeVoiceNotes)
      .values({ routeId: id, text })
      .returning();

    return res.status(201).json({ note });
  } catch (err) {
    console.error("[routes/:id/voice-notes POST]", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

// ── /api/routes/:id/voice-notes (GET) ───────────────────────────────────
// Restituisce tutte le note vocali associate a una corsa.
router.get("/routes/:id/voice-notes", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const id = req.params.id as string;
    const route = await storage.getRoute(id);
    if (!route) return sendError(res, 404, "Route non trovata");
    if (route.userId !== userId) return sendError(res, 403, "Non autorizzato");

    const notes = await db
      .select()
      .from(routeVoiceNotes)
      .where(eq(routeVoiceNotes.routeId, id))
      .orderBy(asc(routeVoiceNotes.createdAt));

    return res.json({ notes });
  } catch (err) {
    console.error("[routes/:id/voice-notes GET]", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

// ── /api/planned-routes/poi/:id/photos (GET) ────────────────────────────
// Non esiste una tabella di "photos per POI" in DB: ritorna `{ photos: [] }`
// per evitare 404 nel sweep.
router.get("/planned-routes/poi/:id/photos", requireAuth, (_req: Request, res: Response) => {
  return res.json({ photos: [] });
});

// ── /api/planned-routes/weather/:id (GET) ───────────────────────────────
// Carica il planned-route, estrae i waypoint, calcola il meteo a partire
// da `?departureTime=ISO`. Riusa la stessa logica del POST /weather.
router.get("/planned-routes/weather/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const id = req.params.id as string;
    const route = await storage.getPlannedRoute(id);
    if (!route) return sendError(res, 404, "Percorso non trovato");
    if (route.userId !== userId && route.visibility !== "public") {
      return sendError(res, 403, "Non autorizzato");
    }

    const wps = ((route.waypoints as Array<{ lat: number; lng: number; name?: string }>) ?? [])
      .filter((wp) => wp && Number.isFinite(wp.lat) && Number.isFinite(wp.lng) && (wp.lat !== 0 || wp.lng !== 0))
      .slice(0, 8);
    if (wps.length === 0) return res.json({ waypoints: [] });

    const departureIso = req.query.departureTime as string | undefined;
    const departure = departureIso ? new Date(departureIso) : new Date();
    if (isNaN(departure.getTime())) return sendError(res, 400, "departureTime non valido");

    const { fetchWeatherForWaypoints } = await import("./planned-routes/weather-helper");
    const weather = await fetchWeatherForWaypoints(wps, departure, 70);
    return res.json({ waypoints: weather });
  } catch (err) {
    console.error("[planned-routes/weather/:id GET]", err);
    return sendError(res, 502, "Meteo non disponibile");
  }
});

export default router;
