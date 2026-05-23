import { storage } from "../storage";
import { db } from "../db";
import { haversineDistance } from "../geo";
import { routes, routePoints, users } from "@shared/db";
import { and, avg, eq, isNotNull } from "drizzle-orm";
import { sendMatchPushNotifications } from "../push-notifications";
import { loadMatchPreferencesMap, bothPrefsEnabled } from "./filters";
import { baseModelName, routeProfileOf } from "./scoring";
import { MatchResult } from "./types";

export async function runMatchingForUser(userId: string): Promise<MatchResult> {
  try {
    const bikerMotorcycles = await storage.getUserMotorcycles(userId);
    const myMoto = bikerMotorcycles[0];
    const wishlistRecord = await storage.getWishlist(userId);
    const myWishlistMotos = wishlistRecord ? await storage.getWishlistMotos(wishlistRecord.id) : [];
    const myWish = myWishlistMotos[0];

    const allBikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers();
    const allWishlistMotos = await storage.getAllWishlistMotosWithUsers();
    const prefsMap = await loadMatchPreferencesMap();

    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    let bikerBikerCount = 0;
    let zavCount = 0;

    if (myMoto) {
      for (const bm of allBikerMotorcycles) {
        if (bm.userId === userId) continue;
        if (blockedSet.has(`${userId}:${bm.userId}`)) continue;

        let match = false;
        let isSupermatch = false;

        if (myMoto.brand && bm.motorcycle.brand && myMoto.brand.toLowerCase() === bm.motorcycle.brand.toLowerCase()) {
          if (bothPrefsEnabled(prefsMap, userId, bm.userId, "bikerBikerBrand")) match = true;
          if (match && myMoto.model && bm.motorcycle.model && baseModelName(myMoto.model) === baseModelName(bm.motorcycle.model)) {
            isSupermatch = true;
          }
        }

        if (!match && myMoto.motorcycleType && bm.motorcycle.motorcycleType && myMoto.motorcycleType.toLowerCase() === bm.motorcycle.motorcycleType.toLowerCase()) {
          if (bothPrefsEnabled(prefsMap, userId, bm.userId, "bikerBikerTypeStyle")) match = true;
        }

        if (match) {
          const inserted = await storage.createBikerBikerMatch({
            biker1Id: userId < bm.userId ? userId : bm.userId,
            biker2Id: userId < bm.userId ? bm.userId : userId,
            motorcycleBrand: myMoto.brand || "unknown",
            status: "new",
            isSupermatch,
          });
          if (inserted) {
            bikerBikerCount++;
            sendMatchPushNotifications([userId, bm.userId]);
          }
        }
      }

      for (const wm of allWishlistMotos) {
        if (wm.userId === userId) continue;
        if (blockedSet.has(`${userId}:${wm.userId}`)) continue;

        let match = false;
        let isSupermatch = false;

        if (myMoto.brand && wm.wishlistMoto.brand && myMoto.brand.toLowerCase() === wm.wishlistMoto.brand.toLowerCase()) {
          if (bothPrefsEnabled(prefsMap, userId, wm.userId, "bikerZavorrinaBrand")) match = true;
          if (match && myMoto.model && wm.wishlistMoto.model && baseModelName(myMoto.model) === baseModelName(wm.wishlistMoto.model)) {
            isSupermatch = true;
          }
        }

        if (!match && myMoto.motorcycleType && wm.wishlistMoto.motorcycleType && myMoto.motorcycleType.toLowerCase() === wm.wishlistMoto.motorcycleType.toLowerCase()) {
          if (bothPrefsEnabled(prefsMap, userId, wm.userId, "bikerZavarrinaTypeStyle")) match = true;
        }

        if (match) {
          const inserted = await storage.createMatch({
            bikerId: userId,
            zavarrinaId: wm.userId,
            bikerMotorcycleId: myMoto.id,
            wishlistMotoId: wm.wishlistMoto.id,
            status: "new",
            isSupermatch,
          });
          if (inserted) {
            zavCount++;
            sendMatchPushNotifications([userId, wm.userId]);
          }
        }
      }
    }

    if (myWish) {
      for (const bm of allBikerMotorcycles) {
        if (bm.userId === userId) continue;
        if (blockedSet.has(`${userId}:${bm.userId}`)) continue;

        let match = false;
        let isSupermatch = false;

        if (myWish.brand && bm.motorcycle.brand && myWish.brand.toLowerCase() === bm.motorcycle.brand.toLowerCase()) {
          if (bothPrefsEnabled(prefsMap, userId, bm.userId, "bikerZavorrinaBrand")) match = true;
          if (match && myWish.model && bm.motorcycle.model && baseModelName(myWish.model) === baseModelName(bm.motorcycle.model)) {
            isSupermatch = true;
          }
        }

        if (!match && myWish.motorcycleType && bm.motorcycle.motorcycleType && myWish.motorcycleType.toLowerCase() === bm.motorcycle.motorcycleType.toLowerCase()) {
          if (bothPrefsEnabled(prefsMap, userId, bm.userId, "bikerZavarrinaTypeStyle")) match = true;
        }

        if (match) {
          const inserted = await storage.createMatch({
            bikerId: bm.userId,
            zavarrinaId: userId,
            bikerMotorcycleId: bm.motorcycle.id,
            wishlistMotoId: myWish.id,
            status: "new",
            isSupermatch,
          });
          if (inserted) {
            zavCount++;
            sendMatchPushNotifications([userId, bm.userId]);
          }
        }
      }
    }

    const myRouteStats = await db
      .select({
        avgSpeed: avg(routes.avgSpeedKmh),
        avgTilt: avg(routes.maxTiltDeg),
        avgDist: avg(routes.totalDistanceKm),
        avgLat: avg(routePoints.latitude),
        avgLng: avg(routePoints.longitude),
      })
      .from(routes)
      .innerJoin(routePoints, eq(routePoints.routeId, routes.id))
      .where(eq(routes.userId, userId))
      .groupBy(routes.userId);

    if (myRouteStats.length > 0) {
      const myProfile = routeProfileOf(
        parseFloat(myRouteStats[0].avgSpeed ?? "0"),
        parseFloat(myRouteStats[0].avgTilt ?? "0"),
        parseFloat(myRouteStats[0].avgDist ?? "0")
      );
      const myLat = parseFloat(myRouteStats[0].avgLat ?? "0");
      const myLng = parseFloat(myRouteStats[0].avgLng ?? "0");
      const myType = (await storage.getUser(userId))?.userType || "";

      const otherRouteStats = await db
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
        .where(and(eq(users.isFake, false), eq(users.status, "active"), isNotNull(routes.avgSpeedKmh)))
        .groupBy(routes.userId, users.userType);

      for (const row of otherRouteStats) {
        if (row.userId === userId) continue;
        if (blockedSet.has(`${userId}:${row.userId}`)) continue;

        const otherProfile = routeProfileOf(
          parseFloat(row.avgSpeed ?? "0"),
          parseFloat(row.avgTilt ?? "0"),
          parseFloat(row.avgDist ?? "0")
        );
        const otherLat = parseFloat(row.avgLat ?? "0");
        const otherLng = parseFloat(row.avgLng ?? "0");

        const dist = haversineDistance(myLat, myLng, otherLat, otherLng);
        if (dist > 200) continue;

        let brand = "";
        let pairType = "bb";
        const isBikerPair = myType === "biker" && row.userType === "biker";
        const isZavPair = (myType === "biker" && row.userType === "zavorrina") ||
                          (myType === "zavorrina" && row.userType === "biker");

        if (myProfile === otherProfile) {
          if (isBikerPair && bothPrefsEnabled(prefsMap, userId, row.userId, "bikerBikerTypeStyle")) {
            brand = `percorso:${myProfile}`; pairType = "bb";
          } else if (isZavPair && bothPrefsEnabled(prefsMap, userId, row.userId, "bikerZavarrinaTypeStyle")) {
            brand = `percorso_zav:${myProfile}`; pairType = "bz";
          }
        } else if (dist < 100) {
          if (isBikerPair && bothPrefsEnabled(prefsMap, userId, row.userId, "bikerBikerDistance")) {
            brand = "distanza"; pairType = "bb";
          } else if (isZavPair && bothPrefsEnabled(prefsMap, userId, row.userId, "bikerZavarrinaDistance")) {
            brand = "distanza_zav"; pairType = "bz";
          }
        }

        if (brand) {
          const inserted = await storage.createBikerBikerMatch({
            biker1Id: userId < row.userId ? userId : row.userId,
            biker2Id: userId < row.userId ? row.userId : userId,
            motorcycleBrand: brand,
            status: "new",
            isSupermatch: false,
            pairType,
          });
          if (inserted) {
            if (pairType === "bb") bikerBikerCount++; else zavCount++;
            sendMatchPushNotifications([userId, row.userId]);
          }
        }
      }
    }

    return { bikerBiker: bikerBikerCount, zavarrina: zavCount };
  } catch (error) {
    console.error(`Error running matching for user ${userId}:`, error);
    return { bikerBiker: 0, zavarrina: 0 };
  }
}
