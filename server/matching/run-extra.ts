import { db } from "../db";
import { storage } from "../storage";
import {
  users,
  userMusicTracks,
  routes,
  proposals,
  zavarrinaWishlists,
  zavarrinaWishlistMotos,
  eventParticipants,
} from "@shared/db";
import { and, eq, isNotNull, gt } from "drizzle-orm";
import { loadMatchPreferencesMap, bothPrefsEnabled, prefEnabled } from "./filters";
import { getVariantConfig, trackAbEvent } from "./ab";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";

// A/B experiment key for music affinity threshold tuning. Variants:
//   - control:     threshold = 0.65 (default)
//   - newScoring:  threshold multiplied by `weight` in variant config
// Used as the seed example for the A/B framework (Task #2525). The same pattern
// can be extended to any matcher: read variant config, branch, then track events.
const MUSIC_AFFINITY_EXPERIMENT = "bio_affinity_weight_v1";

export async function runMusicMatchBikerZavarrina(): Promise<number> {
  try {
    const prefsMap = await loadMatchPreferencesMap();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    const allTrackRows = await db
      .selectDistinct({ userId: userMusicTracks.userId, userType: users.userType })
      .from(userMusicTracks)
      .innerJoin(users, eq(userMusicTracks.userId, users.id))
      .where(eq(users.isFake, false));

    if (allTrackRows.length < 2) return 0;

    const tracksByUser = new Map<string, Set<string>>();
    const userTypeMap = new Map<string, string>();
    for (const row of allTrackRows) {
      userTypeMap.set(row.userId, row.userType);
      const tracks = await db
        .select({ lastfmTrackId: userMusicTracks.lastfmTrackId })
        .from(userMusicTracks)
        .where(eq(userMusicTracks.userId, row.userId));
      if (tracks.length > 0) {
        tracksByUser.set(row.userId, new Set(tracks.map(t => t.lastfmTrackId)));
      }
    }

    const userArr = allTrackRows.map(r => r.userId);
    let matchCount = 0;
    let skipCount = 0;
    const THRESHOLD = 0.65;
    const MAX_MATCHES = 200;

    const isBikerType = (t: string) => t === "biker" || t === "coppia";
    const isZavType = (t: string) => t === "zavorrina" || t === "coppia";

    outer:
    for (let i = 0; i < userArr.length; i++) {
      for (let j = i + 1; j < userArr.length; j++) {
        if (matchCount >= MAX_MATCHES) break outer;
        const uid1 = userArr[i];
        const uid2 = userArr[j];
        if (blockedSet.has(`${uid1}:${uid2}`)) { skipCount++; continue; }

        const t1 = userTypeMap.get(uid1) ?? "";
        const t2 = userTypeMap.get(uid2) ?? "";
        const isBikerPair = isBikerType(t1) && isBikerType(t2);
        const isZavPair = (isBikerType(t1) && isZavType(t2)) || (isZavType(t1) && isBikerType(t2));

        let brand = "";
        let musicPairType = "bb";
        if (isBikerPair && bothPrefsEnabled(prefsMap, uid1, uid2, "bikerBikerMusic")) {
          brand = "musica"; musicPairType = "bb";
        } else if (isZavPair && bothPrefsEnabled(prefsMap, uid1, uid2, "bikerZavarrinaMusic")) {
          brand = "musica_zav"; musicPairType = "bz";
        } else { skipCount++; continue; }

        const set1 = tracksByUser.get(uid1);
        const set2 = tracksByUser.get(uid2);
        if (!set1 || !set2) { skipCount++; continue; }

        const shared = [...set2].filter(t => set1.has(t)).length;
        const smaller = Math.min(set1.size, set2.size);
        // A/B branching: variant config { weight: number } scales the base threshold.
        // weight=1.0 -> control (0.65); weight=1.4 -> stricter (0.91).
        const variantA = await getVariantConfig(uid1, MUSIC_AFFINITY_EXPERIMENT);
        const weight = typeof variantA.config.weight === "number" ? variantA.config.weight : 1.0;
        const threshold = Math.min(0.99, THRESHOLD * weight);
        if (smaller === 0 || shared / smaller < threshold) { skipCount++; continue; }

        const idA = uid1 < uid2 ? uid1 : uid2;
        const idB = uid1 < uid2 ? uid2 : uid1;
        const inserted = await storage.createBikerBikerMatch({
          biker1Id: idA,
          biker2Id: idB,
          motorcycleBrand: brand,
          status: "new",
          isSupermatch: false,
          pairType: musicPairType,
        });
        if (inserted) {
          matchCount++;
          await dispatchMatchNotification({
            table: "biker_biker_matches",
            matchId: inserted.id,
            userIds: [idA, idB],
            priority: classifyMatch({}),
          });
          if (brand === "musica") {
            void trackAbEvent(idA, MUSIC_AFFINITY_EXPERIMENT, "match_created", { matchId: inserted.id, brand });
            void trackAbEvent(idB, MUSIC_AFFINITY_EXPERIMENT, "match_created", { matchId: inserted.id, brand });
          }
        } else skipCount++;
      }
    }

    console.log(`[MusicMatch] ${matchCount} music affinity matches (≥65% overlap), saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[MusicMatch] error:", error);
    return 0;
  }
}

export async function runGpsBasedMatching(): Promise<number> {
  try {
    const prefsMap = await loadMatchPreferencesMap();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    const routeRows = await db
      .select({
        userId: routes.userId,
        avgSpeedKmh: routes.avgSpeedKmh,
        durationSeconds: routes.durationSeconds,
        maxTiltDeg: routes.maxTiltDeg,
      })
      .from(routes)
      .innerJoin(users, eq(routes.userId, users.id))
      .where(and(
        isNotNull(routes.avgSpeedKmh),
        isNotNull(routes.durationSeconds),
        eq(users.isFake, false),
        gt(routes.durationSeconds!, 0),
      ));

    if (routeRows.length === 0) {
      console.log("[GpsBasedMatching] Nessun dato telemetrico, skip.");
      return 0;
    }

    const proposalRows = await db
      .select({
        userId: proposals.userId,
        scheduledAt: proposals.scheduledAt,
        departureTimeFrom: proposals.departureTimeFrom,
      })
      .from(proposals)
      .innerJoin(users, eq(proposals.userId, users.id))
      .where(and(
        eq(users.isFake, false),
        eq(proposals.status, "active"),
      ));

    type UserStats = { userId: string; avgSpeed: number; avgDuration: number; avgTilt: number; dayBracket: string; count: number };

    const userStatsMap = new Map<string, { totalSpeed: number; totalDuration: number; totalTilt: number; count: number; dayHours: number[] }>();

    for (const row of routeRows) {
      if (!row.avgSpeedKmh || !row.durationSeconds) continue;
      const uid = row.userId;
      if (!userStatsMap.has(uid)) {
        userStatsMap.set(uid, { totalSpeed: 0, totalDuration: 0, totalTilt: 0, count: 0, dayHours: [] });
      }
      const s = userStatsMap.get(uid)!;
      s.totalSpeed += row.avgSpeedKmh;
      s.totalDuration += row.durationSeconds;
      s.totalTilt += row.maxTiltDeg ?? 0;
      s.count++;
    }

    for (const row of proposalRows) {
      const uid = row.userId;
      const ts = row.departureTimeFrom ?? row.scheduledAt;
      if (!ts) continue;
      if (!userStatsMap.has(uid)) {
        userStatsMap.set(uid, { totalSpeed: 0, totalDuration: 0, totalTilt: 0, count: 0, dayHours: [] });
      }
      const d = new Date(ts);
      userStatsMap.get(uid)!.dayHours.push(d.getDay() * 24 + d.getHours());
    }

    const userStats: UserStats[] = [];
    for (const [userId, s] of userStatsMap.entries()) {
      if (s.count === 0) continue;
      const avgSpeed = s.totalSpeed / s.count;
      const avgDuration = s.totalDuration / s.count;
      const avgTilt = s.totalTilt / s.count;
      const medianDayHour = s.dayHours.length > 0 ? s.dayHours.sort((a, b) => a - b)[Math.floor(s.dayHours.length / 2)] : -1;
      const dayBracket = medianDayHour >= 0 ? `${Math.floor(medianDayHour / 24)}_${medianDayHour % 24 < 12 ? "morning" : medianDayHour % 24 < 18 ? "afternoon" : "evening"}` : "unknown";
      userStats.push({ userId, avgSpeed, avgDuration, avgTilt, dayBracket, count: s.count });
    }

    if (userStats.length < 2) return 0;

    const speedBracket = (spd: number) => spd < 50 ? "slow" : spd < 80 ? "medium" : "fast";
    const durationBracket = (secs: number) => secs < 7200 ? "short" : secs < 21600 ? "medium" : "long";
    const tiltBracket = (tilt: number) => tilt < 20 ? "low" : tilt < 35 ? "medium" : "high";

    let matchCount = 0;
    let skipCount = 0;
    const MAX_GPS_MATCHES = 300;

    outer:
    for (let i = 0; i < userStats.length; i++) {
      for (let j = i + 1; j < userStats.length; j++) {
        if (matchCount >= MAX_GPS_MATCHES) break outer;
        const a = userStats[i];
        const b = userStats[j];
        if (blockedSet.has(`${a.userId}:${b.userId}`)) { skipCount++; continue; }

        const idA = a.userId < b.userId ? a.userId : b.userId;
        const idB = a.userId < b.userId ? b.userId : a.userId;

        const sameSpeed = speedBracket(a.avgSpeed) === speedBracket(b.avgSpeed);
        const sameDuration = durationBracket(a.avgDuration) === durationBracket(b.avgDuration);
        const sameTilt = tiltBracket(a.avgTilt) === tiltBracket(b.avgTilt);
        const sameDay = a.dayBracket !== "unknown" && a.dayBracket === b.dayBracket;

        let gpsLabel: string | null = null;
        if (sameSpeed && sameDuration && sameTilt && sameDay &&
            bothPrefsEnabled(prefsMap, a.userId, b.userId, "bikerBikerAvgSpeed") &&
            bothPrefsEnabled(prefsMap, a.userId, b.userId, "bikerBikerAvgDuration") &&
            bothPrefsEnabled(prefsMap, a.userId, b.userId, "bikerBikerLeanAngle") &&
            bothPrefsEnabled(prefsMap, a.userId, b.userId, "bikerBikerDayTime")) {
          gpsLabel = "gps_full";
        } else if (sameSpeed && sameDuration && bothPrefsEnabled(prefsMap, a.userId, b.userId, "bikerBikerAvgSpeed") &&
                   bothPrefsEnabled(prefsMap, a.userId, b.userId, "bikerBikerAvgDuration")) {
          gpsLabel = "gps_speed";
        } else if (sameTilt && a.count >= 3 && b.count >= 3 &&
                   bothPrefsEnabled(prefsMap, a.userId, b.userId, "bikerBikerLeanAngle")) {
          gpsLabel = "gps_tilt";
        } else if (sameDay && bothPrefsEnabled(prefsMap, a.userId, b.userId, "bikerBikerDayTime")) {
          gpsLabel = "gps_day";
        }

        if (!gpsLabel) { skipCount++; continue; }

        const inserted = await storage.createBikerBikerMatch({
          biker1Id: idA,
          biker2Id: idB,
          motorcycleBrand: gpsLabel,
          status: "new",
          isSupermatch: gpsLabel === "gps_full",
        });
        if (inserted) {
          matchCount++;
          const isSupermatch = gpsLabel === "gps_full";
          await dispatchMatchNotification({
            table: "biker_biker_matches",
            matchId: inserted.id,
            userIds: [idA, idB],
            priority: classifyMatch({ isSupermatch }),
            isSupermatch,
          });
        } else skipCount++;
      }
    }

    console.log(`[GpsBasedMatching] ${matchCount} GPS-based matches persisted, saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[GpsBasedMatching] error:", error);
    return 0;
  }
}

export async function runEventMatching(): Promise<number> {
  try {
    const rows = await db
      .select({ userId: eventParticipants.userId, eventId: eventParticipants.eventId })
      .from(eventParticipants)
      .innerJoin(users, eq(eventParticipants.userId, users.id))
      .where(eq(users.isFake, false));

    if (rows.length === 0) {
      console.log("[EventMatching] Nessun partecipante eventi, skip.");
      return 0;
    }

    const prefsMap = await loadMatchPreferencesMap();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    const eventBuckets = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!eventBuckets.has(row.eventId)) eventBuckets.set(row.eventId, new Set());
      eventBuckets.get(row.eventId)!.add(row.userId);
    }

    let matchCount = 0;
    let skipCount = 0;
    const MAX_EVENT_MATCHES = 200;

    outer:
    for (const [, members] of eventBuckets.entries()) {
      const arr = [...members];
      if (arr.length < 2) continue;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          if (matchCount >= MAX_EVENT_MATCHES) break outer;
          const uid1 = arr[i];
          const uid2 = arr[j];
          if (blockedSet.has(`${uid1}:${uid2}`)) { skipCount++; continue; }
          if (!bothPrefsEnabled(prefsMap, uid1, uid2, "bikerBikerEvents")) { skipCount++; continue; }

          const idA = uid1 < uid2 ? uid1 : uid2;
          const idB = uid1 < uid2 ? uid2 : uid1;

          const inserted = await storage.createBikerBikerMatch({
            biker1Id: idA,
            biker2Id: idB,
            motorcycleBrand: "eventi",
            status: "new",
            isSupermatch: false,
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
      }
    }

    console.log(`[EventMatching] ${matchCount} event-based matches persisted, saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[EventMatching] error:", error);
    return 0;
  }
}

export async function runBikerZavarrinaTypeStyleMatching(): Promise<number> {
  try {
    const prefsMap = await loadMatchPreferencesMap();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers();
    if (bikerMotorcycles.length === 0) return 0;

    const zavWishRows = await db
      .select({
        userId: zavarrinaWishlists.userId,
        motorcycleType: zavarrinaWishlistMotos.motorcycleType,
        ridingStyle: zavarrinaWishlistMotos.ridingStyle,
      })
      .from(zavarrinaWishlists)
      .innerJoin(zavarrinaWishlistMotos, eq(zavarrinaWishlistMotos.wishlistId, zavarrinaWishlists.id))
      .where(and(isNotNull(zavarrinaWishlistMotos.motorcycleType), isNotNull(zavarrinaWishlistMotos.ridingStyle)));

    if (zavWishRows.length === 0) return 0;

    const zavByTypeStyle = new Map<string, string[]>();
    for (const row of zavWishRows) {
      if (!row.motorcycleType || !row.ridingStyle) continue;
      const key = `${row.motorcycleType.toLowerCase()}|${row.ridingStyle.toLowerCase()}`;
      if (!zavByTypeStyle.has(key)) zavByTypeStyle.set(key, []);
      zavByTypeStyle.get(key)!.push(row.userId);
    }

    let matchCount = 0;
    let skipCount = 0;
    const MAX = 200;

    for (const bm of bikerMotorcycles) {
      if (matchCount >= MAX) break;
      const mtype = bm.motorcycle.motorcycleType?.toLowerCase();
      const rstyle = bm.motorcycle.ridingStyle?.toLowerCase();
      if (!mtype || !rstyle) continue;
      if (!prefEnabled(prefsMap, bm.userId, "bikerZavarrinaTypeStyle")) continue;

      const key = `${mtype}|${rstyle}`;
      const zavIds = zavByTypeStyle.get(key);
      if (!zavIds || zavIds.length === 0) continue;

      for (const zavId of zavIds) {
        if (matchCount >= MAX) break;
        if (zavId === bm.userId) continue;
        if (blockedSet.has(`${bm.userId}:${zavId}`)) { skipCount++; continue; }
        if (!prefEnabled(prefsMap, zavId, "bikerZavarrinaTypeStyle")) { skipCount++; continue; }

        const idA = bm.userId < zavId ? bm.userId : zavId;
        const idB = bm.userId < zavId ? zavId : bm.userId;
        const inserted = await storage.createBikerBikerMatch({
          biker1Id: idA,
          biker2Id: idB,
          motorcycleBrand: `tipo_zav:${mtype}`,
          status: "new",
          isSupermatch: false,
          pairType: "bz",
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
    }

    console.log(`[ZavTypeStyleMatching] ${matchCount} biker-zavarrina type+style matches, saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[ZavTypeStyleMatching] error:", error);
    return 0;
  }
}
