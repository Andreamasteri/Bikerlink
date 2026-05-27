/**
 * Extract Route Cells Job — BikerLink Matching Fase Route Affinity
 *
 * Per ogni traccia GPS chiusa (routes.stoppedAt non null) dell'utente:
 *  1. Campiona i punti GPS ogni ~500m
 *  2. Estrae il set di geohash precisione 6 (~1.2km) attraversati
 *  3. Applica un decay esponenziale (half-life 90 giorni) sui pesi delle celle
 *  4. Aggrega in `user_route_fingerprints.cells` (jsonb)
 *
 * Esecuzione:
 *   - Modalità batch (rebuild totale di tutti gli utenti): runExtractRouteCellsJob()
 *   - Modalità incrementale (singola route appena chiusa): updateUserFingerprintForRoute(routeId)
 *
 * Configurazione:
 *   DISABLE_ROUTE_FINGERPRINT_JOB=1  → disabilita il job batch
 *   ROUTE_FINGERPRINT_LOOKBACK_DAYS  → giorni di lookback per le route (default 365)
 */

import { db } from "../../db";
import { routes, routePoints, users, userRouteFingerprints } from "@shared/db";
import { and, eq, isNotNull, gte, sql } from "drizzle-orm";
import {
  extractCellsFromPoints,
  temporalWeight,
  mergeCells,
  fingerprintCenter,
  type CellMap,
} from "../route-fingerprint";

const LOOKBACK_DAYS = (() => {
  const v = parseInt(process.env.ROUTE_FINGERPRINT_LOOKBACK_DAYS ?? "365", 10);
  return Number.isFinite(v) && v > 0 ? v : 365;
})();

let isRunning = false;

export function isRouteFingerprintJobRunning(): boolean {
  return isRunning;
}

export interface RouteFingerprintJobResult {
  usersProcessed: number;
  routesProcessed: number;
  cellsTotal: number;
  errors: string[];
  durationMs: number;
}

/**
 * Job batch: ricalcola la fingerprint per TUTTI gli utenti con tracce GPS recenti.
 * Usato dallo scheduler orario (prima del matcher route-affinity).
 */
export async function runExtractRouteCellsJob(): Promise<RouteFingerprintJobResult> {
  if (isRunning) {
    return { usersProcessed: 0, routesProcessed: 0, cellsTotal: 0, errors: ["Job already running"], durationMs: 0 };
  }
  if (process.env.DISABLE_ROUTE_FINGERPRINT_JOB === "1") {
    return { usersProcessed: 0, routesProcessed: 0, cellsTotal: 0, errors: ["Disabled via env"], durationMs: 0 };
  }
  isRunning = true;
  const start = Date.now();
  const errors: string[] = [];
  let usersProcessed = 0;
  let routesProcessed = 0;
  let cellsTotal = 0;

  console.log("[RouteFingerprint] Avvio estrazione celle (modalità batch)");

  try {
    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    // Distinct user_id con almeno una route chiusa recente
    const userRows = await db
      .selectDistinct({ userId: routes.userId })
      .from(routes)
      .innerJoin(users, eq(routes.userId, users.id))
      .where(and(
        isNotNull(routes.stoppedAt),
        gte(routes.stoppedAt!, cutoff),
        eq(users.isFake, false),
      ));

    for (const { userId } of userRows) {
      try {
        const r = await rebuildFingerprintForUser(userId, cutoff);
        usersProcessed++;
        routesProcessed += r.routesProcessed;
        cellsTotal += r.cellsTotal;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`user ${userId}: ${msg.slice(0, 200)}`);
      }
    }

    const durationMs = Date.now() - start;
    console.log(
      `[RouteFingerprint] Batch completato in ${(durationMs / 1000).toFixed(1)}s — ` +
      `utenti: ${usersProcessed}, route: ${routesProcessed}, celle: ${cellsTotal}`,
    );
    return { usersProcessed, routesProcessed, cellsTotal, errors, durationMs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[RouteFingerprint] Errore fatale:", msg);
    errors.push(`Fatal: ${msg.slice(0, 200)}`);
    return { usersProcessed, routesProcessed, cellsTotal, errors, durationMs: Date.now() - start };
  } finally {
    isRunning = false;
  }
}

/** Ricostruisce da zero la fingerprint di un utente sulla base delle route nel lookback. */
async function rebuildFingerprintForUser(
  userId: string,
  cutoff: Date,
): Promise<{ routesProcessed: number; cellsTotal: number }> {
  const userRoutes = await db
    .select({ id: routes.id, stoppedAt: routes.stoppedAt })
    .from(routes)
    .where(and(
      eq(routes.userId, userId),
      isNotNull(routes.stoppedAt),
      gte(routes.stoppedAt!, cutoff),
    ))
    .orderBy(routes.stoppedAt);

  const cellMap: CellMap = {};
  let routesProcessed = 0;
  let lastRouteAt: Date | null = null;

  for (const r of userRoutes) {
    if (!r.stoppedAt) continue;
    const points = await db
      .select({ latitude: routePoints.latitude, longitude: routePoints.longitude })
      .from(routePoints)
      .where(eq(routePoints.routeId, r.id))
      .orderBy(routePoints.timestamp);
    if (points.length < 2) continue;

    const cells = extractCellsFromPoints(points);
    const ageDays = (Date.now() - r.stoppedAt.getTime()) / (24 * 60 * 60 * 1000);
    const w = temporalWeight(ageDays);
    mergeCells(cellMap, cells, w);
    routesProcessed++;
    if (!lastRouteAt || r.stoppedAt > lastRouteAt) lastRouteAt = r.stoppedAt;
  }

  const cellCount = Object.keys(cellMap).length;
  const center = fingerprintCenter(cellMap);

  await db.execute(sql`
    INSERT INTO user_route_fingerprints (user_id, cells, cell_count, center_lat, center_lon, last_route_at, updated_at)
    VALUES (${userId}, ${JSON.stringify(cellMap)}::jsonb, ${cellCount}, ${center?.lat ?? null}, ${center?.lon ?? null}, ${lastRouteAt}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      cells = EXCLUDED.cells,
      cell_count = EXCLUDED.cell_count,
      center_lat = EXCLUDED.center_lat,
      center_lon = EXCLUDED.center_lon,
      last_route_at = EXCLUDED.last_route_at,
      updated_at = NOW()
  `);

  // Aggiorna anche il visit_count globale (per rarity bonus)
  if (cellCount > 0) {
    const keys = Object.keys(cellMap);
    const values = keys.map((k) => sql`(${k}, 1, NOW(), NOW())`);
    await db.execute(sql`
      INSERT INTO geo_cell_labels (geohash, label, created_at, updated_at)
      SELECT geohash, '' AS label, NOW(), NOW() FROM (VALUES ${sql.join(values, sql`, `)}) AS v(geohash, visit, c, u)
      ON CONFLICT (geohash) DO NOTHING
    `);
  }

  return { routesProcessed, cellsTotal: cellCount };
}

/**
 * Aggiornamento incrementale per una singola route appena chiusa.
 * Calcola le celle nuove e le somma alla fingerprint esistente (senza ricostruire tutto).
 * Fire-and-forget dal route-handler che chiude la traccia GPS.
 */
export async function updateUserFingerprintForRoute(routeId: string): Promise<void> {
  try {
    const [route] = await db
      .select({ id: routes.id, userId: routes.userId, stoppedAt: routes.stoppedAt })
      .from(routes)
      .where(eq(routes.id, routeId))
      .limit(1);
    if (!route || !route.stoppedAt) return;

    const points = await db
      .select({ latitude: routePoints.latitude, longitude: routePoints.longitude })
      .from(routePoints)
      .where(eq(routePoints.routeId, routeId))
      .orderBy(routePoints.timestamp);
    if (points.length < 2) return;

    const newCells = extractCellsFromPoints(points);
    if (newCells.size === 0) return;

    const ageDays = (Date.now() - route.stoppedAt.getTime()) / (24 * 60 * 60 * 1000);
    const w = temporalWeight(ageDays);

    // Carica fingerprint esistente
    const [existing] = await db
      .select({ cells: userRouteFingerprints.cells })
      .from(userRouteFingerprints)
      .where(eq(userRouteFingerprints.userId, route.userId))
      .limit(1);

    const cellMap: CellMap = (existing?.cells as CellMap | null) ?? {};
    mergeCells(cellMap, newCells, w);

    const cellCount = Object.keys(cellMap).length;
    const center = fingerprintCenter(cellMap);

    await db.execute(sql`
      INSERT INTO user_route_fingerprints (user_id, cells, cell_count, center_lat, center_lon, last_route_at, updated_at)
      VALUES (${route.userId}, ${JSON.stringify(cellMap)}::jsonb, ${cellCount}, ${center?.lat ?? null}, ${center?.lon ?? null}, ${route.stoppedAt}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        cells = EXCLUDED.cells,
        cell_count = EXCLUDED.cell_count,
        center_lat = EXCLUDED.center_lat,
        center_lon = EXCLUDED.center_lon,
        last_route_at = EXCLUDED.last_route_at,
        updated_at = NOW()
    `);
  } catch (err) {
    console.error("[RouteFingerprint] updateUserFingerprintForRoute error:", err);
  }
}

/** Carica il count globale di utenti che hanno visitato ciascuna cella (per rarity). */
export async function loadGlobalCellCounts(): Promise<Map<string, number>> {
  const rows = await db.execute<{ cell: string; cnt: string }>(sql`
    SELECT key AS cell, COUNT(*)::text AS cnt
    FROM user_route_fingerprints, jsonb_object_keys(cells) AS key
    GROUP BY key
  `);
  const out = new Map<string, number>();
  for (const r of rows.rows) out.set(r.cell, parseInt(r.cnt, 10));
  return out;
}

/** Fire-and-forget hook richiamabile da route-handler tracking. */
export function triggerFingerprintUpdate(routeId: string): void {
  setImmediate(() => {
    updateUserFingerprintForRoute(routeId).catch((e) =>
      console.error("[RouteFingerprint] async update failed:", e),
    );
  });
}
