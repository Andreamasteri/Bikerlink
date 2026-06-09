/**
 * Task #2528 — Matcher `planned_route_invite`.
 *
 * Per ogni planned route pubblica (o community) con `geohash_cells` non vuoto
 * e analizzata, trova i top K biker compatibili usando:
 *   - geo overlap: % di celle della route presenti nella fingerprint del biker
 *   - curvy match: |curvyAvgRoute - userAvgCurvy| / 100 → bonus se vicini
 *   - prossimità centro fingerprint vs centro route (≤ PROXIMITY_KM)
 *   - filtri preferenze: entrambi devono avere `plannedRouteInvite=true`
 *
 * Output: inserisce in `planned_route_invites` con onConflictDoNothing
 * sull'indice unique (route_id, suggested_user_id).
 *
 * Rispetta il toggle admin `matching_integration` (app_setting).
 */

import { db } from "../db";
import { storage } from "../storage";
import {
  users,
  plannedRoutes,
  userRouteFingerprints,
  userCurvyProfile,
  plannedRouteInvites,
  matchPreferences,
} from "@shared/db";
import { loadMatchingDisabledSet } from "./filters";
import { and, eq, sql, gte, inArray, isNotNull } from "drizzle-orm";
import type { CellMap } from "./route-fingerprint";
import ngeohash from "ngeohash";

const MIN_CELLS_ROUTE = 5;
const MIN_GEO_OVERLAP = 0.15;
const SCORE_THRESHOLD = 0.25;
const PROXIMITY_KM = 300;
const TOP_K_PER_ROUTE = 10;
const MAX_ROUTES_PER_RUN = 200;

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

function routeCenter(cells: string[]): { lat: number; lon: number } | null {
  if (cells.length === 0) return null;
  let lat = 0;
  let lon = 0;
  for (const c of cells) {
    const d = ngeohash.decode(c);
    lat += d.latitude;
    lon += d.longitude;
  }
  return { lat: lat / cells.length, lon: lon / cells.length };
}

export interface PlannedRouteAffinityResult {
  routesProcessed: number;
  invitesCreated: number;
  errors: number;
  durationMs: number;
}

export async function runPlannedRouteAffinity(): Promise<PlannedRouteAffinityResult> {
  const startedAt = Date.now();
  let invitesCreated = 0;
  let errors = 0;

  // Toggle admin
  const integration = await storage.getAppSetting("matching_integration").catch(() => null);
  if (integration?.value === "false") {
    console.log("[plannedRouteAffinity] disabilitato da admin (matching_integration=false)");
    return { routesProcessed: 0, invitesCreated: 0, errors: 0, durationMs: Date.now() - startedAt };
  }

  // Carica fingerprint utenti (con curvy profile opzionale)
  const fpRows = await db
    .select({
      userId: userRouteFingerprints.userId,
      cells: userRouteFingerprints.cells,
      centerLat: userRouteFingerprints.centerLat,
      centerLon: userRouteFingerprints.centerLon,
    })
    .from(userRouteFingerprints)
    .innerJoin(users, eq(users.id, userRouteFingerprints.userId))
    .where(eq(users.isFake, false));

  if (fpRows.length === 0) {
    return { routesProcessed: 0, invitesCreated: 0, errors: 0, durationMs: Date.now() - startedAt };
  }

  // Curvy profile lookup
  const curvyRows = await db.select().from(userCurvyProfile);
  const curvyMap = new Map<string, number>();
  for (const c of curvyRows) curvyMap.set(c.userId, c.avgCurvy);

  // Preferenze (chi accetta inviti planned_route)
  const prefs = await db
    .select({ userId: matchPreferences.userId, on: matchPreferences.plannedRouteInvite })
    .from(matchPreferences);
  const allowMap = new Map<string, boolean>();
  for (const p of prefs) allowMap.set(p.userId, p.on);

  // Blocked pairs
  const blocked = await storage.getAllBlockedPairs().catch(() => []);
  const blockedSet = new Set<string>(
    blocked.flatMap((b) => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`]),
  );
  const matchingDisabledSet = await loadMatchingDisabledSet();

  // Routes candidate
  const routes = await db
    .select({
      id: plannedRoutes.id,
      userId: plannedRoutes.userId,
      cells: plannedRoutes.geohashCells,
      curvy: plannedRoutes.curvyScoreAvg,
      visibility: plannedRoutes.visibility,
    })
    .from(plannedRoutes)
    .where(and(
      isNotNull(plannedRoutes.analyzedAt),
      inArray(plannedRoutes.visibility, ["public", "community"]),
    ))
    .limit(MAX_ROUTES_PER_RUN);

  let processed = 0;
  for (const route of routes) {
    const rcells = (route.cells as string[] | null) ?? [];
    if (rcells.length < MIN_CELLS_ROUTE) continue;
    const rcellSet = new Set(rcells);
    const center = routeCenter(rcells);
    if (!center) continue;

    type Candidate = { userId: string; score: number; reasons: Record<string, unknown> };
    const candidates: Candidate[] = [];

    for (const fp of fpRows) {
      if (fp.userId === route.userId) continue;
      if (blockedSet.has(`${route.userId}:${fp.userId}`)) continue;
      if (allowMap.get(fp.userId) === false) continue;
      if (allowMap.get(route.userId) === false) continue;
      if (matchingDisabledSet.has(fp.userId) || matchingDisabledSet.has(route.userId)) continue;

      if (fp.centerLat != null && fp.centerLon != null) {
        const d = haversineKm(center.lat, center.lon, fp.centerLat, fp.centerLon);
        if (d > PROXIMITY_KM) continue;
      }

      const cellMap = (fp.cells as CellMap | null) ?? {};
      let common = 0;
      for (const c of rcellSet) if (cellMap[c] != null) common++;
      const overlap = common / rcellSet.size;
      if (overlap < MIN_GEO_OVERLAP) continue;

      // Curvy affinity
      let curvyBonus = 0;
      const userCurvy = curvyMap.get(fp.userId);
      if (userCurvy != null && route.curvy != null) {
        const diff = Math.abs(userCurvy - route.curvy);
        curvyBonus = Math.max(0, 0.3 - diff) * 0.5;
      }

      const score = Math.min(1, overlap * 0.7 + curvyBonus + Math.min(common, 20) / 200);
      if (score < SCORE_THRESHOLD) continue;

      candidates.push({
        userId: fp.userId,
        score,
        reasons: {
          geoOverlap: Math.round(overlap * 100) / 100,
          commonCells: common,
          curvyBonus: Math.round(curvyBonus * 100) / 100,
          userCurvy: userCurvy ?? null,
          routeCurvy: route.curvy ?? null,
        },
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, TOP_K_PER_ROUTE);
    for (const c of top) {
      const priority = c.score >= 0.55 ? "high" : "normal";
      try {
        const inserted = await db
          .insert(plannedRouteInvites)
          .values({
            routeId: route.id,
            ownerId: route.userId,
            suggestedUserId: c.userId,
            score: Math.round(c.score * 10000) / 10000,
            reasons: c.reasons,
            priority,
            status: "suggested",
          })
          .onConflictDoNothing()
          .returning({ id: plannedRouteInvites.id });
        if (inserted.length > 0) invitesCreated++;
      } catch (err) {
        errors++;
        console.error("[plannedRouteAffinity] insert error:", err instanceof Error ? err.message : err);
      }
    }
    processed++;
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[plannedRouteAffinity] ${invitesCreated} inviti su ${processed} route in ${(durationMs / 1000).toFixed(1)}s`,
  );
  return { routesProcessed: processed, invitesCreated, errors, durationMs };
}

// Silence unused-imports warning per `gte` / `sql` se non usati dopo trimming.
void gte;
void sql;
