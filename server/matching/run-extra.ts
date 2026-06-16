import { db } from "../db";
import { storage } from "../storage";
import {
  users,
  routes,
  proposals,
  zavorrinaWishlists,
  zavorrinaWishlistMotos,
  eventParticipants,
  entityTags,
  tags,
  tagCategories,
} from "@shared/db";
import { and, eq, isNotNull, gt, inArray } from "drizzle-orm";
import { loadMatchPreferencesMap, bothPrefsEnabled, prefEnabled, loadMatchingDisabledSet, neitherMatchingDisabled } from "./filters";
import { getVariantConfig, trackAbEvent } from "./ab";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";
import {
  tagOverlap,
  loadMatchThresholds,
  getThresholdSync,
  getSupermatchMinCategories,
  isSupermatchByBreakdown,
  type ScoreBreakdown,
} from "./scoring";

/**
 * Carica i tag di una categoria per un insieme di entità (user o motorcycle).
 * Ritorna Map<entityId, Set<tagSlug>>.
 */
async function loadTagSetsByCategory(
  entityType: "user" | "motorcycle",
  entityIds: string[],
  categorySlug: string,
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (entityIds.length === 0) return out;
  const rows = await db
    .select({ entityId: entityTags.entityId, slug: tags.slug })
    .from(entityTags)
    .innerJoin(tags, eq(tags.id, entityTags.tagId))
    .innerJoin(tagCategories, eq(tagCategories.id, tags.categoryId))
    .where(and(
      eq(entityTags.entityType, entityType),
      inArray(entityTags.entityId, entityIds),
      eq(tagCategories.slug, categorySlug),
    ));
  for (const r of rows) {
    let set = out.get(r.entityId);
    if (!set) { set = new Set(); out.set(r.entityId, set); }
    set.add(r.slug);
  }
  return out;
}

// A/B experiment key for music affinity threshold tuning. Variants:
//   - control:     threshold = 0.65 (default)
//   - newScoring:  threshold multiplied by `weight` in variant config
// Used as the seed example for the A/B framework (Task #2525). The same pattern
// can be extended to any matcher: read variant config, branch, then track events.
const MUSIC_AFFINITY_EXPERIMENT = "bio_affinity_weight_v1";

export async function runMusicMatchBikerZavorrina(): Promise<number> {
  try {
    const prefsMap = await loadMatchPreferencesMap();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    // Task #2513: caricamento via tag musica (entity_type='user') invece
    // di lastfm track ID. Un utente entra nel pool se ha almeno 1 tag musica.
    const userRows = await db
      .selectDistinct({ userId: entityTags.entityId, userType: users.userType })
      .from(entityTags)
      .innerJoin(tags, eq(tags.id, entityTags.tagId))
      .innerJoin(tagCategories, and(eq(tagCategories.id, tags.categoryId), eq(tagCategories.slug, "musica")))
      .innerJoin(users, eq(users.id, entityTags.entityId))
      .where(and(eq(entityTags.entityType, "user"), eq(users.isFake, false), eq(users.isSystem, false), eq(users.matchingDisabled, false)));

    if (userRows.length < 2) return 0;

    const userTypeMap = new Map<string, string>();
    for (const r of userRows) userTypeMap.set(r.userId, r.userType);
    const userIds = userRows.map(r => r.userId);
    const tagsByUser = await loadTagSetsByCategory("user", userIds, "musica");

    const thresholds = await loadMatchThresholds();
    const musicThreshold = getThresholdSync("musica", thresholds);
    const minCategories = await getSupermatchMinCategories();

    let matchCount = 0;
    let skipCount = 0;
    const MAX_MATCHES = 200;

    const isBikerType = (t: string) => t === "biker" || t === "coppia";
    const isZavType = (t: string) => t === "zavorrina" || t === "coppia";

    outer:
    for (let i = 0; i < userIds.length; i++) {
      for (let j = i + 1; j < userIds.length; j++) {
        if (matchCount >= MAX_MATCHES) break outer;
        const uid1 = userIds[i];
        const uid2 = userIds[j];
        if (blockedSet.has(`${uid1}:${uid2}`)) { skipCount++; continue; }

        const t1 = userTypeMap.get(uid1) ?? "";
        const t2 = userTypeMap.get(uid2) ?? "";
        const isBikerPair = isBikerType(t1) && isBikerType(t2);
        const isZavPair = (isBikerType(t1) && isZavType(t2)) || (isZavType(t1) && isBikerType(t2));

        let brand = "";
        let musicPairType = "bb";
        if (isBikerPair && bothPrefsEnabled(prefsMap, uid1, uid2, "bikerBikerMusic")) {
          brand = "musica"; musicPairType = "bb";
        } else if (isZavPair && bothPrefsEnabled(prefsMap, uid1, uid2, "bikerZavorrinaMusic")) {
          brand = "musica_zav"; musicPairType = "bz";
        } else { skipCount++; continue; }

        const set1 = tagsByUser.get(uid1);
        const set2 = tagsByUser.get(uid2);
        if (!set1 || !set2) { skipCount++; continue; }

        const ov = tagOverlap(set1, set2);
        // A/B branching: variant config { weight: number } scales the base
        // Jaccard threshold. weight=1.0 -> default; weight=1.4 -> più severo.
        const variantA = await getVariantConfig(uid1, MUSIC_AFFINITY_EXPERIMENT);
        const weight = typeof variantA.config.weight === "number" ? variantA.config.weight : 1.0;
        const threshold = Math.min(0.99, musicThreshold.jaccardThreshold * weight);
        if (ov.common < musicThreshold.minCommonTags || ov.jaccard < threshold) { skipCount++; continue; }

        const breakdown: ScoreBreakdown = {
          musicScore: Number(ov.jaccard.toFixed(4)),
          musicCommon: ov.common,
        };
        const isSupermatch = isSupermatchByBreakdown(breakdown, thresholds, minCategories);

        const idA = uid1 < uid2 ? uid1 : uid2;
        const idB = uid1 < uid2 ? uid2 : uid1;
        const inserted = await storage.createBikerBikerMatch({
          biker1Id: idA,
          biker2Id: idB,
          motorcycleBrand: brand,
          status: "new",
          isSupermatch,
          pairType: musicPairType,
          scoreBreakdown: breakdown,
        });
        if (inserted) {
          matchCount++;
          await dispatchMatchNotification({
            table: "biker_biker_matches",
            matchId: inserted.id,
            userIds: [idA, idB],
            priority: classifyMatch({ isSupermatch }),
            isSupermatch,
          });
          if (brand === "musica") {
            void trackAbEvent(idA, MUSIC_AFFINITY_EXPERIMENT, "match_created", { matchId: inserted.id, brand });
            void trackAbEvent(idB, MUSIC_AFFINITY_EXPERIMENT, "match_created", { matchId: inserted.id, brand });
          }
        } else skipCount++;
      }
    }

    console.log(`[MusicMatch] ${matchCount} music affinity matches (tag-overlap jaccard≥${musicThreshold.jaccardThreshold}), saltati: ${skipCount}`);
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
        eq(users.isSystem, false),
        eq(users.matchingDisabled, false),
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
      .where(and(eq(users.isFake, false), eq(users.isSystem, false), eq(users.matchingDisabled, false)));

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

export async function runBikerZavorrinaTypeStyleMatching(): Promise<number> {
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
        wishId: zavorrinaWishlistMotos.id,
        userId: zavorrinaWishlists.userId,
      })
      .from(zavorrinaWishlists)
      .innerJoin(zavorrinaWishlistMotos, eq(zavorrinaWishlistMotos.wishlistId, zavorrinaWishlists.id));

    if (zavWishRows.length === 0) return 0;

    // Task #2513: scoring per tag-overlap (stile_guida + tipo_moto). I tag
    // sono associati alle moto biker (entity 'motorcycle') e — per le
    // wishlist — temporaneamente derivate dai campi motorcycle_type /
    // riding_style della wishlist (in attesa del task tagging wishlist).
    const thresholds = await loadMatchThresholds();
    const tipoThreshold = getThresholdSync("tipo_moto", thresholds);
    const stileThreshold = getThresholdSync("stile_guida", thresholds);
    const minCategories = await getSupermatchMinCategories();

    const motoIds = bikerMotorcycles.map(b => b.motorcycle.id);
    const [motoTipoTags, motoStileTags] = await Promise.all([
      loadTagSetsByCategory("motorcycle", motoIds, "tipo_moto"),
      loadTagSetsByCategory("motorcycle", motoIds, "stile_guida"),
    ]);

    // Wishlist: aggregato per utente (Set di tipo_moto / stile_guida slug).
    const zavTipoByUser = new Map<string, Set<string>>();
    const zavStileByUser = new Map<string, Set<string>>();
    const wishRowsFull = await db
      .select({
        userId: zavorrinaWishlists.userId,
        motorcycleType: zavorrinaWishlistMotos.motorcycleType,
        ridingStyle: zavorrinaWishlistMotos.ridingStyle,
      })
      .from(zavorrinaWishlists)
      .innerJoin(zavorrinaWishlistMotos, eq(zavorrinaWishlistMotos.wishlistId, zavorrinaWishlists.id));
    for (const r of wishRowsFull) {
      if (r.motorcycleType) {
        const s = zavTipoByUser.get(r.userId) ?? new Set<string>();
        s.add(r.motorcycleType.toLowerCase());
        zavTipoByUser.set(r.userId, s);
      }
      if (r.ridingStyle) {
        const s = zavStileByUser.get(r.userId) ?? new Set<string>();
        s.add(r.ridingStyle.toLowerCase());
        zavStileByUser.set(r.userId, s);
      }
    }

    let matchCount = 0;
    let skipCount = 0;
    const MAX = 200;
    const zavIds = [...new Set(zavWishRows.map(r => r.userId))];

    const matchingDisabledSet = await loadMatchingDisabledSet();

    for (const bm of bikerMotorcycles) {
      if (matchCount >= MAX) break;
      if (matchingDisabledSet.has(bm.userId)) continue;
      if (!prefEnabled(prefsMap, bm.userId, "bikerZavorrinaTypeStyle")) continue;
      const motoTipo = motoTipoTags.get(bm.motorcycle.id) ?? new Set<string>();
      const motoStile = motoStileTags.get(bm.motorcycle.id) ?? new Set<string>();
      if (motoTipo.size === 0 && motoStile.size === 0) continue;
      const primaryTipo = bm.motorcycle.motorcycleType?.toLowerCase() ?? "x";

      for (const zavId of zavIds) {
        if (matchCount >= MAX) break;
        if (zavId === bm.userId) continue;
        if (blockedSet.has(`${bm.userId}:${zavId}`)) { skipCount++; continue; }
        if (matchingDisabledSet.has(zavId)) { skipCount++; continue; }
        if (!prefEnabled(prefsMap, zavId, "bikerZavorrinaTypeStyle")) { skipCount++; continue; }

        const zavTipo = zavTipoByUser.get(zavId) ?? new Set<string>();
        const zavStile = zavStileByUser.get(zavId) ?? new Set<string>();
        const tipoOv = tagOverlap(motoTipo, zavTipo);
        const stileOv = tagOverlap(motoStile, zavStile);

        const tipoOk = tipoOv.common >= tipoThreshold.minCommonTags && tipoOv.jaccard >= tipoThreshold.jaccardThreshold;
        const stileOk = stileOv.common >= stileThreshold.minCommonTags && stileOv.jaccard >= stileThreshold.jaccardThreshold;
        if (!tipoOk && !stileOk) { skipCount++; continue; }

        const breakdown: ScoreBreakdown = {
          bikeTypeScore: Number(tipoOv.jaccard.toFixed(4)),
          bikeTypeCommon: tipoOv.common,
          styleScore: Number(stileOv.jaccard.toFixed(4)),
          styleCommon: stileOv.common,
        };
        const isSupermatch = isSupermatchByBreakdown(breakdown, thresholds, minCategories);

        const idA = bm.userId < zavId ? bm.userId : zavId;
        const idB = bm.userId < zavId ? zavId : bm.userId;
        const inserted = await storage.createBikerBikerMatch({
          biker1Id: idA,
          biker2Id: idB,
          motorcycleBrand: `tipo_zav:${primaryTipo}`,
          status: "new",
          isSupermatch,
          pairType: "bz",
          scoreBreakdown: breakdown,
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

    console.log(`[ZavTypeStyleMatching] ${matchCount} biker-zavorrina type+style matches, saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[ZavTypeStyleMatching] error:", error);
    return 0;
  }
}
