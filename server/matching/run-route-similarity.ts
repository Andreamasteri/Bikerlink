/**
 * Route Similarity Matcher — BikerLink
 *
 * Per ogni utente con ≥ MIN_CELLS celle nella fingerprint:
 *  1. Trova candidati con centro fingerprint entro PROXIMITY_KM
 *  2. Calcola routeSimilarity (Jaccard pesato + rarity bonus)
 *  3. Crea match `route_affinity` se score ≥ THRESHOLD
 *  4. Estrae 3 "luoghi simbolo" dal lookup geo_cell_labels
 *
 * Rispetta il toggle preference `routeAffinity` (default true) di entrambi gli utenti.
 * Unique su (LEAST(a,b), GREATEST(a,b)): non duplica match esistenti.
 */

import { db } from "../db";
import { storage } from "../storage";
import {
  users,
  userRouteFingerprints,
  geoCellLabels,
  routeAffinityMatches,
} from "@shared/db";
import { and, eq, gte, sql, inArray } from "drizzle-orm";
import { sendMatchPushNotifications } from "../push-notifications";
import { loadMatchPreferencesMap, bothPrefsEnabled, loadMatchingDisabledSet, neitherMatchingDisabled } from "./filters";
import {
  routeSimilarity,
  topCommonCells,
  type CellMap,
  ngeohash,
} from "./route-fingerprint";
import { loadGlobalCellCounts } from "./jobs/extract-route-cells";

const MIN_CELLS = 50;
const SIM_THRESHOLD = 0.18;
const PROXIMITY_KM = 250;
const MAX_NEW_MATCHES_PER_RUN = 500;
const MAX_CANDIDATES_PER_USER = 80;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export async function runRouteSimilarityMatching(): Promise<number> {
  const startedAt = Date.now();
  try {
    const prefsMap = await loadMatchPreferencesMap();
    const matchingDisabledSet = await loadMatchingDisabledSet();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap((b) => [
        `${b.blockerId}:${b.blockedId}`,
        `${b.blockedId}:${b.blockerId}`,
      ]),
    );

    const rows = await db
      .select({
        userId: userRouteFingerprints.userId,
        cells: userRouteFingerprints.cells,
        cellCount: userRouteFingerprints.cellCount,
        centerLat: userRouteFingerprints.centerLat,
        centerLon: userRouteFingerprints.centerLon,
      })
      .from(userRouteFingerprints)
      .innerJoin(users, eq(userRouteFingerprints.userId, users.id))
      .where(and(
        gte(userRouteFingerprints.cellCount, MIN_CELLS),
        eq(users.isFake, false),
      ));

    if (rows.length < 2) {
      console.log(`[RouteAffinity] Solo ${rows.length} utenti con fingerprint ≥${MIN_CELLS} celle, skip.`);
      return 0;
    }

    const globalCounts = await loadGlobalCellCounts();

    type FP = {
      userId: string;
      cells: CellMap;
      cellCount: number;
      centerLat: number | null;
      centerLon: number | null;
    };
    const fps: FP[] = rows.map((r) => ({
      userId: r.userId,
      cells: (r.cells as CellMap | null) ?? {},
      cellCount: r.cellCount,
      centerLat: r.centerLat,
      centerLon: r.centerLon,
    }));

    let matchCount = 0;
    const newPlacesToResolve = new Set<string>();
    const created: Array<{ userAId: string; userBId: string }> = [];

    outer:
    for (let i = 0; i < fps.length; i++) {
      const a = fps[i];
      let candidates = 0;
      for (let j = i + 1; j < fps.length; j++) {
        if (matchCount >= MAX_NEW_MATCHES_PER_RUN) break outer;
        if (candidates >= MAX_CANDIDATES_PER_USER) break;
        const b = fps[j];
        if (a.userId === b.userId) continue;
        if (blockedSet.has(`${a.userId}:${b.userId}`)) continue;
        if (!bothPrefsEnabled(prefsMap, a.userId, b.userId, "routeAffinity")) continue;
        if (!neitherMatchingDisabled(matchingDisabledSet, a.userId, b.userId)) continue;

        // Filtro prossimità
        if (a.centerLat != null && a.centerLon != null && b.centerLat != null && b.centerLon != null) {
          const d = haversineKm(a.centerLat, a.centerLon, b.centerLat, b.centerLon);
          if (d > PROXIMITY_KM) continue;
        }
        candidates++;

        const { score, common } = routeSimilarity(a.cells, b.cells, globalCounts);
        if (score < SIM_THRESHOLD || common.length < 5) continue;

        const top = topCommonCells(a.cells, b.cells, 3);
        for (const t of top) newPlacesToResolve.add(t.cell);

        const [userAId, userBId] = a.userId < b.userId ? [a.userId, b.userId] : [b.userId, a.userId];

        try {
          const inserted = await db
            .insert(routeAffinityMatches)
            .values({
              userAId,
              userBId,
              commonCells: common.length,
              score: Math.round(score * 10000) / 10000,
              topPlaces: top.map((t) => ({ cell: t.cell, weight: Math.round(t.weight * 100) / 100 })),
            })
            .onConflictDoNothing()
            .returning({ id: routeAffinityMatches.id });
          if (inserted.length > 0) {
            matchCount++;
            created.push({ userAId, userBId });
          }
        } catch (err) {
          console.error("[RouteAffinity] insert error:", err);
        }
      }
    }

    // Risolvi etichette per le celle top (best-effort, opportunistic)
    if (newPlacesToResolve.size > 0) {
      await ensureCellLabels(Array.from(newPlacesToResolve));
    }

    // Push notifications (best-effort)
    if (created.length > 0) {
      const userIds = Array.from(new Set(created.flatMap((m) => [m.userAId, m.userBId])));
      try {
        await sendMatchPushNotifications(userIds);
      } catch (err) {
        console.warn("[RouteAffinity] push notifications failed:", err);
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[RouteAffinity] ${matchCount} nuovi match in ${elapsed}s (su ${rows.length} fingerprint)`);
    return matchCount;
  } catch (error) {
    console.error("[RouteAffinity] error:", error);
    return 0;
  }
}

/**
 * Lookup etichette per le celle top.
 * Per le celle senza etichetta nota, crea entry con label vuota basata sul centro decode geohash
 * (popolata in modo opportunistico tramite reverse geocoding esterno se configurato).
 *
 * Reverse geocoding esterno NON è implementato qui per evitare costi/dipendenze:
 * il label viene fornito vuoto e popolato da un job admin separato (cfr. task downstream
 * "Pannello Admin Matching — Hub, Audit e Consolidamento").
 */
async function ensureCellLabels(cells: string[]): Promise<void> {
  if (cells.length === 0) return;
  try {
    const existing = await db
      .select({ geohash: geoCellLabels.geohash })
      .from(geoCellLabels)
      .where(inArray(geoCellLabels.geohash, cells));
    const existingSet = new Set(existing.map((r) => r.geohash));
    const missing = cells.filter((c) => !existingSet.has(c));
    if (missing.length === 0) return;

    const values = missing.map((c) => {
      const { latitude, longitude } = ngeohash.decode(c);
      return sql`(${c}, '', ${latitude}, ${longitude}, NOW(), NOW())`;
    });
    await db.execute(sql`
      INSERT INTO geo_cell_labels (geohash, label, center_lat, center_lon, created_at, updated_at)
      VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT (geohash) DO NOTHING
    `);
  } catch (err) {
    console.error("[RouteAffinity] ensureCellLabels error:", err);
  }
}

/** Helper esposto per UI: arricchisce topPlaces con etichetta umana se disponibile. */
export async function enrichTopPlaces(
  topPlaces: Array<{ cell: string; weight?: number }>,
): Promise<Array<{ cell: string; label: string; lat: number; lon: number; weight?: number }>> {
  if (!Array.isArray(topPlaces) || topPlaces.length === 0) return [];
  const cells = topPlaces.map((p) => p.cell);
  const labels = await db
    .select()
    .from(geoCellLabels)
    .where(inArray(geoCellLabels.geohash, cells));
  const map = new Map(labels.map((r) => [r.geohash, r]));
  return topPlaces.map((p) => {
    const row = map.get(p.cell);
    const decoded = ngeohash.decode(p.cell);
    return {
      cell: p.cell,
      label: row?.label || `${decoded.latitude.toFixed(2)}, ${decoded.longitude.toFixed(2)}`,
      lat: row?.centerLat ?? decoded.latitude,
      lon: row?.centerLon ?? decoded.longitude,
      weight: p.weight,
    };
  });
}
