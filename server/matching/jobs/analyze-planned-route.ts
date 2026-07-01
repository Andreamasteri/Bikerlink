/**
 * Task #2528 — Job di analisi planned_routes.
 *
 * Per ogni rotta pianificata:
 *  1. Decodifica la polyline (o ricostruisce dai waypoints) e semplifica
 *     scartando i punti molto vicini.
 *  2. Estrae le celle geohash precisione 6 attraversate (riusa #2520).
 *  3. Calcola un curvy-score medio (riusa `computeBikerScoreFromPoints`
 *     che misura la sinuosità dei segmenti).
 *  4. Stima una departure window (dow/hour/durationMin) da metadata o
 *     dalla `durationMinutes` salvata.
 *  5. Calcola i `derivedTags` con `deriveRouteTags`.
 *  6. Aggiorna `planned_routes` in un singolo update (idempotente).
 *
 * Esecuzione:
 *  - Fire-and-forget via `triggerAnalyzePlannedRoute(routeId)` dopo
 *    create/update (hook in `crud.ts`).
 *  - Batch backfill via `backfillAnalyzeAllPlannedRoutes()`.
 *
 * Se BullMQ è disponibile e il toggle admin `matching_integration` è on,
 * il job viene enqueued sulla coda `route-fingerprint`; altrimenti esegue
 * inline. Lo skill anche se DragonflyDB non c'è.
 */

import { db } from "../../db";
import { plannedRoutes } from "@shared/db";
import { eq, isNull, sql } from "drizzle-orm";
import { extractCellsFromPoints } from "../route-fingerprint";
import { decodePolyline, computeBikerScoreFromPoints } from "../../routes/planned-routes/utils";
import { deriveRouteTags } from "../derive-route-tags";
import { storage } from "../../storage";

type Waypoint = { lat: number; lng: number; name?: string };

function pointsFromRoute(polyline: string | null, waypoints: Waypoint[]): Array<{ latitude: number; longitude: number }> {
  if (polyline) {
    const pts = decodePolyline(polyline);
    return pts.map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
  }
  return waypoints
    .filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lng))
    .map((w) => ({ latitude: w.lat, longitude: w.lng }));
}

/**
 * Simplify: scarta i punti che non aumentano la distanza cumulata.
 * Equivalente a un Douglas-Peucker povero: tiene 1 punto ogni ~50m.
 */
function simplifyPoints(
  pts: Array<{ latitude: number; longitude: number }>,
  minMeters = 50,
): Array<{ latitude: number; longitude: number }> {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const dLat = (b.latitude - a.latitude) * 111_320;
    const dLon = (b.longitude - a.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
    const d = Math.sqrt(dLat * dLat + dLon * dLon);
    if (d >= minMeters) out.push(b);
  }
  return out;
}

function estimateDepartureWindow(meta: Record<string, unknown> | null | undefined, durationMin: number) {
  const out: { dow?: number; hour?: number; durationMin?: number } = {};
  if (Number.isFinite(durationMin) && durationMin > 0) out.durationMin = Math.round(durationMin);
  if (meta && typeof meta === "object") {
    const m = meta as Record<string, unknown>;
    const dep = (m["departureAt"] ?? m["departure"] ?? m["departureTime"]) as string | number | undefined;
    if (dep != null) {
      try {
        const d = new Date(dep);
        if (!isNaN(d.getTime())) {
          out.dow = d.getUTCDay();
          out.hour = d.getUTCHours();
        }
      } catch { /* ignore */ }
    }
    if (out.dow == null && typeof m["dow"] === "number") out.dow = m["dow"] as number;
    if (out.hour == null && typeof m["hour"] === "number") out.hour = m["hour"] as number;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function analyzePlannedRoute(routeId: string): Promise<void> {
  try {
    if (await isIntegrationDisabled()) return;
    const route = await storage.getPlannedRoute(routeId);
    if (!route) return;

    const waypoints = (route.waypoints as Waypoint[] | null) ?? [];
    const raw = pointsFromRoute(route.polyline ?? null, waypoints);
    const points = simplifyPoints(raw, 50);

    let geohashCells: string[] = [];
    if (points.length >= 2) {
      const set = extractCellsFromPoints(points);
      geohashCells = Array.from(set);
    }

    let curvyScoreAvg: number | null = null;
    if (points.length >= 3) {
      const ptsForScore = points.map((p) => ({ lat: p.latitude, lng: p.longitude }));
      curvyScoreAvg = computeBikerScoreFromPoints(ptsForScore);
    }

    const estimatedDepartureWindow = estimateDepartureWindow(
      (route.metadata as Record<string, unknown> | null) ?? null,
      route.durationMinutes ?? 0,
    );

    const derivedTags = deriveRouteTags({
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      bikerScore: route.bikerScore,
      curvyScoreAvg,
      elevationGainM: route.elevationGainM,
      altitudeMaxM: route.altitudeMaxM,
      isMultiDay: route.isMultiDay,
      style: route.style,
    });

    await db
      .update(plannedRoutes)
      .set({
        geohashCells,
        curvyScoreAvg: curvyScoreAvg ?? undefined,
        estimatedDepartureWindow,
        derivedTags,
        analyzedAt: new Date(),
      })
      .where(eq(plannedRoutes.id, routeId));
  } catch (err) {
    console.error("[analyzePlannedRoute] error:", err);
  }
}

let integrationCache: { v: boolean; at: number } | null = null;
async function isIntegrationDisabled(): Promise<boolean> {
  const now = Date.now();
  if (integrationCache && now - integrationCache.at < 30_000) return !integrationCache.v;
  try {
    const setting = await storage.getAppSetting("matching_integration");
    const enabled = setting?.value !== "false";
    integrationCache = { v: enabled, at: now };
    return !enabled;
  } catch {
    return false;
  }
}

export function invalidateMatchingIntegrationCache(): void {
  integrationCache = null;
}

/**
 * Hook fire-and-forget richiamabile da crud.ts/waypoints.ts.
 * Enqueues su BullMQ se DragonflyDB disponibile, altrimenti setImmediate.
 */
export function triggerAnalyzePlannedRoute(routeId: string): void {
  setImmediate(() => {
    (async () => {
      try {
        const { getQueue } = await import("../../cache/queues");
        const q = getQueue("route-fingerprint");
        if (q) {
          await q.add("analyze-planned-route", { routeId }, { jobId: `analyze-planned-${routeId}` });
          return;
        }
      } catch { /* fallback inline */ }
      analyzePlannedRoute(routeId).catch((e) =>
        console.error("[analyzePlannedRoute] inline failed:", e),
      );
    })();
  });
}

/** Backfill batch — usato manualmente o al primo boot dopo migration. */
export async function backfillAnalyzeAllPlannedRoutes(): Promise<{ processed: number; errors: number }> {
  const rows = await db
    .select({ id: plannedRoutes.id })
    .from(plannedRoutes)
    .where(isNull(plannedRoutes.analyzedAt));
  let processed = 0;
  let errors = 0;
  for (const r of rows) {
    try {
      await analyzePlannedRoute(r.id);
      processed++;
    } catch {
      errors++;
    }
  }
  console.log(`[analyzePlannedRoute] backfill: ${processed} ok, ${errors} errori (su ${rows.length})`);
  return { processed, errors };
}

// Re-export per scheduler/admin
export { sql as _sql };
