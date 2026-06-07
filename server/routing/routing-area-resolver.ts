/**
 * Resolver Routing ad Aree — BikerLink (Task #3122)
 *
 * Dato l'insieme dei waypoint di una richiesta, determina quale istanza
 * GraphHopper per-area deve servirla, oppure restituisce un esito bloccante
 * tipizzato (cross_group / area_not_enabled).
 *
 * Il match punto-in-area usa PostGIS (già abilitato in DB): per ogni waypoint
 * si verifica `ST_Contains(ST_MakeEnvelope(bbox), punto)` contro le bounding box
 * del registro condiviso (shared/routing-areas.ts). Nessuna nuova tabella né
 * migrazione: le geometrie (envelope) sono costruite a runtime dai bbox del
 * registro passati come parametri, così si evita il rischio deploy delle
 * migrazioni che toccano lo schema PostGIS.
 *
 * Regole:
 *   - I punti GraphHopper sono nel formato [lon, lat].
 *   - Se il punto di PARTENZA non cade in alcun bbox → "area_not_enabled"
 *     (copertura assente nel paese di partenza).
 *   - Si calcola l'intersezione dei gruppi candidati di TUTTI i waypoint
 *     (ordine ROUTING_AREAS = dal più stretto). Se vuota → "cross_group".
 *   - Tra i gruppi comuni si sceglie il primo ABILITATO; se nessuno è abilitato
 *     → "area_not_enabled" (gruppo esistente ma spento).
 *   - Senza base self-hosted non possiamo indirizzare l'istanza → "area_not_enabled".
 */

import { sql } from "drizzle-orm";
import {
  ROUTING_AREAS,
  routingAreaUrl,
  type RoutingArea,
  type RoutingAreaCode,
} from "@shared/routing-areas";
import { db } from "../db";
import { getAreaEnabledMap } from "./routing-area-state";
import { SELF_HOSTED_BASE_URL, isSelfHosted } from "../graphhopper-client";

export type RoutingAreaResolution =
  | { kind: "ok"; area: RoutingArea; url: string }
  | { kind: "cross_group"; codes: RoutingAreaCode[] }
  | { kind: "area_not_enabled"; area: RoutingArea | null };

/**
 * PostGIS: per ciascun punto ([lon, lat]) restituisce i codici dei gruppi il cui
 * bbox (envelope) contiene il punto, in ordine di registro (ROUTING_AREAS = dal
 * più stretto). Una sola query per tutti i waypoint.
 */
async function candidateCodesPerPoint(
  points: [number, number][],
): Promise<RoutingAreaCode[][]> {
  const codes = ROUTING_AREAS.map((a) => a.codice);
  const minLons = ROUTING_AREAS.map((a) => a.bbox.minLon);
  const minLats = ROUTING_AREAS.map((a) => a.bbox.minLat);
  const maxLons = ROUTING_AREAS.map((a) => a.bbox.maxLon);
  const maxLats = ROUTING_AREAS.map((a) => a.bbox.maxLat);
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);

  const result = await db.execute<{ point_index: number; code: string }>(sql`
    SELECT p.idx::int AS point_index, a.code AS code
    FROM unnest(${lons}::float8[], ${lats}::float8[]) WITH ORDINALITY AS p(lon, lat, idx)
    CROSS JOIN unnest(
      ${codes}::text[],
      ${minLons}::float8[],
      ${minLats}::float8[],
      ${maxLons}::float8[],
      ${maxLats}::float8[]
    ) WITH ORDINALITY AS a(code, min_lon, min_lat, max_lon, max_lat, ord)
    WHERE ST_Contains(
      ST_MakeEnvelope(a.min_lon, a.min_lat, a.max_lon, a.max_lat, 4326),
      ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326)
    )
    ORDER BY p.idx, a.ord
  `);

  const perPoint: RoutingAreaCode[][] = points.map(() => []);
  for (const row of result.rows) {
    const i = Number(row.point_index) - 1;
    if (i >= 0 && i < perPoint.length) {
      perPoint[i].push(row.code as RoutingAreaCode);
    }
  }
  return perPoint;
}

/**
 * Risolve l'area di routing per i punti dati ([lon, lat][]).
 */
export async function resolveRoutingArea(
  points: [number, number][],
): Promise<RoutingAreaResolution> {
  if (!points || points.length === 0) {
    return { kind: "area_not_enabled", area: null };
  }

  // Gruppi candidati per ciascun waypoint (point-in-bbox via PostGIS).
  const candidateSets = await candidateCodesPerPoint(points);

  // Il punto di partenza deve essere coperto da almeno un gruppo.
  if (candidateSets[0].length === 0) {
    return { kind: "area_not_enabled", area: null };
  }

  // Intersezione: gruppi che contengono TUTTI i waypoint (più stretto prima).
  const common = ROUTING_AREAS.filter((a) =>
    candidateSets.every((set) => set.includes(a.codice)),
  );

  if (common.length === 0) {
    const codes = Array.from(new Set(candidateSets.flat()));
    return { kind: "cross_group", codes };
  }

  const enabledMap = await getAreaEnabledMap();
  const enabled = common.find((a) => enabledMap[a.codice]);
  if (!enabled) {
    return { kind: "area_not_enabled", area: common[0] };
  }

  if (!isSelfHosted || !SELF_HOSTED_BASE_URL) {
    // Senza istanza self-hosted non c'è un URL per-area da indirizzare.
    return { kind: "area_not_enabled", area: enabled };
  }

  return { kind: "ok", area: enabled, url: routingAreaUrl(enabled, SELF_HOSTED_BASE_URL) };
}
