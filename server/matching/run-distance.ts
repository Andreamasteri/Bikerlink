import { storage } from "../storage";
import { db } from "../db";
import { haversineDistance } from "../geo";
import { routes, routePoints, users } from "@shared/db";
import { and, avg, eq, isNotNull } from "drizzle-orm";
import { loadMatchPreferencesMap, bothPrefsEnabled } from "./filters";
import { routeProfileOf } from "./scoring";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";

export async function runDistanceMatching(): Promise<number> {
  try {
    const prefsMap = await loadMatchPreferencesMap();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    const centroidRows = await db
      .select({
        userId: routes.userId,
        userType: users.userType,
        avgLat: avg(routePoints.latitude),
        avgLng: avg(routePoints.longitude),
      })
      .from(routes)
      .innerJoin(routePoints, eq(routePoints.routeId, routes.id))
      .innerJoin(users, eq(routes.userId, users.id))
      .where(eq(users.isFake, false))
      .groupBy(routes.userId, users.userType);

    const userCentroids = new Map<string, { lat: number; lng: number; userType: string }>();
    for (const row of centroidRows) {
      const lat = parseFloat(row.avgLat ?? "0");
      const lng = parseFloat(row.avgLng ?? "0");
      if (lat === 0 && lng === 0) continue;
      userCentroids.set(row.userId, { lat, lng, userType: row.userType || "" });
    }

    const userArr = [...userCentroids.entries()];
    if (userArr.length < 2) return 0;

    const DISTANCE_THRESHOLD_KM = 150;
    let matchCount = 0;
    let skipCount = 0;
    const MAX = 200;
    const isBikerType = (t: string) => t === "biker" || t === "coppia";
    const isZavType = (t: string) => t === "zavorrina" || t === "coppia";

    outer:
    for (let i = 0; i < userArr.length; i++) {
      for (let j = i + 1; j < userArr.length; j++) {
        if (matchCount >= MAX) break outer;
        const [uid1, c1] = userArr[i];
        const [uid2, c2] = userArr[j];
        if (uid1 === uid2) continue;
        if (blockedSet.has(`${uid1}:${uid2}`)) { skipCount++; continue; }

        const distKm = haversineDistance(c1.lat, c1.lng, c2.lat, c2.lng);
        if (distKm > DISTANCE_THRESHOLD_KM) { skipCount++; continue; }

        const isBikerPair = isBikerType(c1.userType) && isBikerType(c2.userType);
        const isZavPair = (isBikerType(c1.userType) && isZavType(c2.userType)) ||
                          (isZavType(c1.userType) && isBikerType(c2.userType));

        let brand = "";
        let pairType = "bb";
        if (isBikerPair && bothPrefsEnabled(prefsMap, uid1, uid2, "bikerBikerDistance")) {
          brand = "distanza"; pairType = "bb";
        } else if (isZavPair && bothPrefsEnabled(prefsMap, uid1, uid2, "bikerZavarrinaDistance")) {
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
    }

    console.log(`[DistanceMatching] ${matchCount} match di distanza creati, saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[DistanceMatching] error:", error);
    return 0;
  }
}

export async function runRouteTypeZoneMatching(): Promise<number> {
  try {
    const prefsMap = await loadMatchPreferencesMap();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    const routeStats = await db
      .select({
        userId: routes.userId,
        userType: users.userType,
        avgSpeed: avg(routes.avgSpeedKmh),
        avgTilt: avg(routes.maxTiltDeg),
        avgDist: avg(routes.totalDistanceKm),
        avgLat: avg(routePoints.latitude),
        avgLng: avg(routePoints.longitude),
      })
      .from(routes)
      .innerJoin(routePoints, eq(routePoints.routeId, routes.id))
      .innerJoin(users, eq(routes.userId, users.id))
      .where(and(eq(users.isFake, false), isNotNull(routes.avgSpeedKmh)))
      .groupBy(routes.userId, users.userType);

    if (routeStats.length < 2) return 0;

    const userArr = routeStats.map(row => ({
      userId: row.userId,
      userType: row.userType || "",
      profile: routeProfileOf(
        parseFloat(row.avgSpeed ?? "0"),
        parseFloat(row.avgTilt ?? "0"),
        parseFloat(row.avgDist ?? "0")
      ),
      lat: parseFloat(row.avgLat ?? "0"),
      lng: parseFloat(row.avgLng ?? "0"),
    }));

    let matchCount = 0;
    let skipCount = 0;
    const MAX = 200;
    const DISTANCE_THRESHOLD = 200;

    outer:
    for (let i = 0; i < userArr.length; i++) {
      for (let j = i + 1; j < userArr.length; j++) {
        if (matchCount >= MAX) break outer;
        const u1 = userArr[i];
        const u2 = userArr[j];
        if (u1.profile !== u2.profile) continue;
        if (blockedSet.has(`${u1.userId}:${u2.userId}`)) { skipCount++; continue; }

        const dist = haversineDistance(u1.lat, u1.lng, u2.lat, u2.lng);
        if (dist > DISTANCE_THRESHOLD) continue;

        const isBikerPair = u1.userType === "biker" && u2.userType === "biker";
        const isZavPair = (u1.userType === "biker" && u2.userType === "zavorrina") ||
                          (u1.userType === "zavorrina" && u2.userType === "biker");

        let brand = "";
        let pairType = "bb";
        if (isBikerPair && bothPrefsEnabled(prefsMap, u1.userId, u2.userId, "bikerBikerTypeStyle")) {
          brand = `percorso:${u1.profile}`; pairType = "bb";
        } else if (isZavPair && bothPrefsEnabled(prefsMap, u1.userId, u2.userId, "bikerZavarrinaTypeStyle")) {
          brand = `percorso_zav:${u1.profile}`; pairType = "bz";
        } else { continue; }

        const idA = u1.userId < u2.userId ? u1.userId : u2.userId;
        const idB = u1.userId < u2.userId ? u2.userId : u1.userId;
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
            priority: classifyMatch({ distanceKm: dist }),
            distanceKm: dist,
          });
        } else skipCount++;
      }
    }

    console.log(`[RouteTypeMatching] ${matchCount} match per tipologia percorso, saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[RouteTypeMatching] error:", error);
    return 0;
  }
}
