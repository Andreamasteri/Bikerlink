import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { loadMatchPreferencesMap, bothPrefsEnabled } from "./filters";
import { routeProfileOf } from "./scoring";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";
import { protectedNicknamesSqlArray } from "./protection-filter";

/**
 * Task #2510: i centroidi degli utenti (media lat/lng dei route_points) sono
 * calcolati una volta sola in SQL, materializzati come `geography(Point, 4326)`
 * e poi accoppiati via `ST_DWithin` — l'indice GIST su `user_profiles.geom`
 * non aiuta qui (i centroidi sono on-the-fly) ma PostGIS calcola comunque le
 * distanze in C anziché in JS, evitando il loop O(n²) Haversine.
 */

const DISTANCE_THRESHOLD_KM = 150;
const ROUTE_TYPE_DISTANCE_KM = 200;
const MAX_PAIRS = 200;

type CentroidPairRow = {
  user_id_1: string;
  user_id_2: string;
  user_type_1: string | null;
  user_type_2: string | null;
  dist_km: string | number;
};

async function fetchCentroidPairs(radiusKm: number): Promise<CentroidPairRow[]> {
  const radiusMeters = radiusKm * 1000;
  const result = await db.execute<CentroidPairRow>(sql`
    WITH centroids AS (
      SELECT
        r.user_id,
        u.user_type,
        ST_SetSRID(ST_MakePoint(AVG(rp.longitude), AVG(rp.latitude)), 4326)::geography AS geom
      FROM routes r
      INNER JOIN route_points rp ON rp.route_id = r.id
      INNER JOIN users u ON u.id = r.user_id
      WHERE u.is_fake = false
        AND u.is_system = false
        AND u.matching_disabled = false
        AND u.nickname <> ALL(${sql.raw(protectedNicknamesSqlArray())})
      GROUP BY r.user_id, u.user_type
      HAVING AVG(rp.latitude) IS NOT NULL AND AVG(rp.longitude) IS NOT NULL
    )
    SELECT
      c1.user_id   AS user_id_1,
      c2.user_id   AS user_id_2,
      c1.user_type AS user_type_1,
      c2.user_type AS user_type_2,
      ST_Distance(c1.geom, c2.geom) / 1000.0 AS dist_km
    FROM centroids c1
    INNER JOIN centroids c2 ON c2.user_id > c1.user_id
    WHERE ST_DWithin(c1.geom, c2.geom, ${radiusMeters})
  `);
  return result.rows as CentroidPairRow[];
}

export async function runDistanceMatching(): Promise<number> {
  try {
    const prefsMap = await loadMatchPreferencesMap();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    const pairs = await fetchCentroidPairs(DISTANCE_THRESHOLD_KM);
    if (pairs.length === 0) return 0;

    let matchCount = 0;
    let skipCount = 0;
    const isBikerType = (t: string) => t === "biker" || t === "coppia";
    const isZavType = (t: string) => t === "zavorrina" || t === "coppia";

    for (const row of pairs) {
      if (matchCount >= MAX_PAIRS) break;
      const uid1 = row.user_id_1;
      const uid2 = row.user_id_2;
      const t1 = row.user_type_1 ?? "";
      const t2 = row.user_type_2 ?? "";
      const distKm = typeof row.dist_km === "string" ? parseFloat(row.dist_km) : row.dist_km;

      if (blockedSet.has(`${uid1}:${uid2}`)) { skipCount++; continue; }

      const isBikerPair = isBikerType(t1) && isBikerType(t2);
      const isZavPair = (isBikerType(t1) && isZavType(t2)) || (isZavType(t1) && isBikerType(t2));

      let brand = "";
      let pairType = "bb";
      if (isBikerPair && bothPrefsEnabled(prefsMap, uid1, uid2, "bikerBikerDistance")) {
        brand = "distanza"; pairType = "bb";
      } else if (isZavPair && bothPrefsEnabled(prefsMap, uid1, uid2, "bikerZavorrinaDistance")) {
        brand = "distanza_zav"; pairType = "bz";
      } else { skipCount++; continue; }

      const idA = uid1 < uid2 ? uid1 : uid2;
      const idB = uid1 < uid2 ? uid2 : uid1;
      const inserted = await storage.createBikerBikerMatch({
        biker1Id: idA,
        biker2Id: idB,
        motorcycleBrand: brand,
        status: "new",
        isSupermatch: false,
        pairType,
      });
      if (inserted) {
        matchCount++;
        await dispatchMatchNotification({
          table: "biker_biker_matches",
          matchId: inserted.id,
          userIds: [idA, idB],
          priority: classifyMatch({ distanceKm: distKm }),
          distanceKm: distKm,
        });
      } else skipCount++;
    }

    console.log(`[DistanceMatching] ${matchCount} match di distanza (PostGIS), saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[DistanceMatching] error:", error);
    return 0;
  }
}

type RouteTypePairRow = {
  user_id_1: string;
  user_id_2: string;
  user_type_1: string | null;
  user_type_2: string | null;
  avg_speed_1: string | number | null; avg_speed_2: string | number | null;
  avg_tilt_1: string | number | null;  avg_tilt_2: string | number | null;
  avg_dist_1: string | number | null;  avg_dist_2: string | number | null;
};

export async function runRouteTypeZoneMatching(): Promise<number> {
  try {
    const prefsMap = await loadMatchPreferencesMap();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    const radiusMeters = ROUTE_TYPE_DISTANCE_KM * 1000;
    const result = await db.execute<RouteTypePairRow>(sql`
      WITH user_stats AS (
        SELECT
          r.user_id,
          u.user_type,
          AVG(r.avg_speed_kmh)        AS avg_speed,
          AVG(r.max_tilt_deg)         AS avg_tilt,
          AVG(r.total_distance_km)    AS avg_dist,
          ST_SetSRID(ST_MakePoint(AVG(rp.longitude), AVG(rp.latitude)), 4326)::geography AS geom
        FROM routes r
        INNER JOIN route_points rp ON rp.route_id = r.id
        INNER JOIN users u ON u.id = r.user_id
        WHERE u.is_fake = false AND u.is_system = false AND u.matching_disabled = false AND r.avg_speed_kmh IS NOT NULL
          AND u.nickname <> ALL(${sql.raw(protectedNicknamesSqlArray())})
        GROUP BY r.user_id, u.user_type
        HAVING AVG(rp.latitude) IS NOT NULL AND AVG(rp.longitude) IS NOT NULL
      )
      SELECT
        s1.user_id   AS user_id_1,
        s2.user_id   AS user_id_2,
        s1.user_type AS user_type_1,
        s2.user_type AS user_type_2,
        s1.avg_speed AS avg_speed_1, s2.avg_speed AS avg_speed_2,
        s1.avg_tilt  AS avg_tilt_1,  s2.avg_tilt  AS avg_tilt_2,
        s1.avg_dist  AS avg_dist_1,  s2.avg_dist  AS avg_dist_2
      FROM user_stats s1
      INNER JOIN user_stats s2 ON s2.user_id > s1.user_id
      WHERE ST_DWithin(s1.geom, s2.geom, ${radiusMeters})
    `);

    const rows = result.rows;
    const num = (v: string | number | null) => v == null ? 0 : (typeof v === "string" ? parseFloat(v) : v);

    let matchCount = 0;
    let skipCount = 0;

    for (const r of rows) {
      if (matchCount >= MAX_PAIRS) break;
      const profile1 = routeProfileOf(num(r.avg_speed_1), num(r.avg_tilt_1), num(r.avg_dist_1));
      const profile2 = routeProfileOf(num(r.avg_speed_2), num(r.avg_tilt_2), num(r.avg_dist_2));
      if (profile1 !== profile2) continue;

      const uid1 = r.user_id_1;
      const uid2 = r.user_id_2;
      const t1 = r.user_type_1 ?? "";
      const t2 = r.user_type_2 ?? "";

      if (blockedSet.has(`${uid1}:${uid2}`)) { skipCount++; continue; }

      const isBikerPair = t1 === "biker" && t2 === "biker";
      const isZavPair = (t1 === "biker" && t2 === "zavorrina") || (t1 === "zavorrina" && t2 === "biker");

      let brand = "";
      let pairType = "bb";
      if (isBikerPair && bothPrefsEnabled(prefsMap, uid1, uid2, "bikerBikerTypeStyle")) {
        brand = `percorso:${profile1}`; pairType = "bb";
      } else if (isZavPair && bothPrefsEnabled(prefsMap, uid1, uid2, "bikerZavorrinaTypeStyle")) {
        brand = `percorso_zav:${profile1}`; pairType = "bz";
      } else { continue; }

      const idA = uid1 < uid2 ? uid1 : uid2;
      const idB = uid1 < uid2 ? uid2 : uid1;
      const inserted = await storage.createBikerBikerMatch({
        biker1Id: idA,
        biker2Id: idB,
        motorcycleBrand: brand,
        status: "new",
        isSupermatch: false,
        pairType,
      });
      if (inserted) {
        matchCount++;
        await dispatchMatchNotification({
          table: "biker_biker_matches",
          matchId: inserted.id,
          userIds: [idA, idB],
          priority: classifyMatch({}),
        });
      } else skipCount++;
    }

    console.log(`[RouteTypeMatching] ${matchCount} match per tipologia percorso (PostGIS), saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[RouteTypeMatching] error:", error);
    return 0;
  }
}
