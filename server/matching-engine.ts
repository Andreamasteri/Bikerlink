export * from "./matching/engine";
export { MatchResult } from "./matching/types";

import {
  motoClubs,
  motoClubMembers,
  proposalZoneNotifications,
  proposalProfileMatches,
  proposals,
  userProfiles,
  users,
  userMusicTracks,
  routes,
  routePoints,
  eventParticipants,
  matchPreferences,
  zavarrinaWishlists,
  zavarrinaWishlistMotos,
  type Proposal,
} from "@shared/schema";
import { systemAccountConditions } from "./lib/system-account-filter";
import { and, avg, eq, inArray, isNotNull, gt, lt, sql, ne } from "drizzle-orm";
import { sendMatchPushNotifications, sendZoneProposalPushNotifications } from "./push-notifications";
import it from "../lib/i18n/it";
import { storage } from "./storage";
import { db } from "./db";
import { haversineDistance } from "./geo";
import {
  runMatching,
  runWishlistMatching,
  runBikerBikerMatching,
  runBikerBikerTypeStyleMatching,
  runClubBrandMatching,
  runDistanceMatching,
  runRouteTypeZoneMatching,
  runMatchingForUser,
  runProposalMatchingForUser,
  runProposalZoneNotifications,
  loadMatchPreferencesMap,
  bothPrefsEnabled,
  prefEnabled,
  baseModelName,
} from "./matching/engine";

const MATCH_DEBOUNCE_MS = 10_000;

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
        if (smaller === 0 || shared / smaller < THRESHOLD) { skipCount++; continue; }

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
          sendMatchPushNotifications([idA, idB]);
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

    type UserStats = {
      userId: string;
      avgSpeed: number;
      avgDuration: number;
      avgTilt: number;
      dayBracket: string;
      count: number;
    };

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
          sendMatchPushNotifications([idA, idB]);
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
            sendMatchPushNotifications([idA, idB]);
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
        if (inserted) { matchCount++; sendMatchPushNotifications([idA, idB]); }
        else skipCount++;
      }
    }

    console.log(`[ZavTypeStyleMatching] ${matchCount} biker-zavarrina type+style matches, saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[ZavTypeStyleMatching] error:", error);
    return 0;
  }
}

export async function runProposalToProfileMatching(
  filterProposalId?: string,
  filterZavarrinaId?: string,
): Promise<number> {
  try {
    const GUEST_TYPES = new Set(["find_a_guest", "hitcher"]);

    let activeProposals: Proposal[] = await storage.getActiveProposalsWithLocation();
    activeProposals = activeProposals.filter(
      (p) => p.searchType && GUEST_TYPES.has(p.searchType)
        && p.departureLatitude != null
        && p.departureLongitude != null
    );

    if (filterProposalId) {
      activeProposals = activeProposals.filter((p) => p.id === filterProposalId);
    }
    if (activeProposals.length === 0) return 0;

    const existingKeys = await storage.getAllExistingProposalProfileMatchKeys();
    const actedUponPairs = await storage.getActedUponBikerZavarrinaPairs();

    const allZavorrine = await db
      .select({
        userId: users.id,
        lat: userProfiles.latitude,
        lng: userProfiles.longitude,
      })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(
        and(
          eq(users.status, "active"),
          eq(users.isFake, false),
          ...systemAccountConditions(users),
          isNotNull(userProfiles.latitude),
          isNotNull(userProfiles.longitude),
          inArray(users.userType, ["zavorrina", "coppia"]),
        )
      );

    let zavarrine = allZavorrine;
    if (filterZavarrinaId) {
      zavarrine = allZavorrine.filter((z) => z.userId === filterZavarrinaId);
    }
    if (zavarrine.length === 0) return 0;

    let matchCount = 0;

    for (const proposal of activeProposals) {
      const pLat = proposal.departureLatitude!;
      const pLng = proposal.departureLongitude!;
      const radius = proposal.searchRadius ?? 50;

      for (const zav of zavarrine) {
        if (zav.userId === proposal.userId) continue;
        if (zav.lat == null || zav.lng == null) continue;

        const key = `${proposal.id}:${zav.userId}`;
        if (existingKeys.has(key)) continue;

        const pairKey = `${proposal.userId}:${zav.userId}`;
        if (actedUponPairs.has(pairKey)) continue;

        const distKm = haversineDistance(pLat, pLng, zav.lat, zav.lng);
        if (distKm > radius) continue;

        const created = await storage.createProposalProfileMatch({
          proposalId: proposal.id,
          bikerId: proposal.userId,
          zavarrinaId: zav.userId,
          distanceKm: Math.round(distKm * 10) / 10,
          status: "new",
        });

        if (created) {
          existingKeys.add(key);
          matchCount++;
          try {
            const title = it["push.proposalMatch.title"] ?? "Hai un nuovo match proposta! 🔥";
            const body = it["push.proposalMatch.body"] ?? "Una proposta compatibile è stata trovata per il tuo viaggio.";
            await storage.createNotification({
              userId: proposal.userId,
              title,
              body,
              notificationType: "proposal_match",
              referenceType: "proposal_profile_match",
              referenceId: created.id,
            });
            await storage.createNotification({
              userId: zav.userId,
              title,
              body,
              notificationType: "proposal_match",
              referenceType: "proposal_profile_match",
              referenceId: created.id,
            });
          } catch (notifErr) {
            console.error("[ProposalProfileMatching] Error sending notifications:", notifErr);
          }
          sendMatchPushNotifications([proposal.userId, zav.userId]);
        }
      }
    }

    if (matchCount > 0) {
      console.log(`[ProposalProfileMatching] nuovi match: ${matchCount}`);
    }
    return matchCount;
  } catch (err) {
    console.error("[ProposalProfileMatching] errore:", err);
    return 0;
  }
}

/**
 * Trigger proposal matching + zone notifications immediately after a new proposal
 * is created. Fire-and-forget — does not block the HTTP response.
 */
export function triggerProposalCreatedMatching(proposal: Proposal): void {
  setImmediate(async () => {
    try {
      const matchCount = await runProposalMatchingForUser(proposal.userId);
      if (matchCount > 0) {
        console.log(`[ProposalCreated] ${matchCount} match trovati per proposta ${proposal.id}`);
      }
    } catch (err) {
      console.error("[ProposalCreated] Errore matching immediato:", err);
    }
    try {
      await runProposalToProfileMatching(proposal.id);
    } catch (err) {
      console.error("[ProposalCreated] Errore proposal-profile matching:", err);
    }
    try {
      await runProposalZoneNotifications(proposal);
    } catch (err) {
      console.error("[ProposalCreated] Errore zone notifications:", err);
    }
  });
}

const lastZavarrinaProfileMatchAt = new Map<string, number>();
const ZAVORRINA_PROFILE_MATCH_DEBOUNCE_MS = 2 * 60 * 1000;

/**
 * Trigger proposal-profile matching when a zavorrina updates her location.
 * Fire-and-forget with debounce to avoid hammering on rapid GPS updates.
 */
export function triggerProposalProfileMatchingForZavorrina(userId: string): void {
  const now = Date.now();
  const last = lastZavarrinaProfileMatchAt.get(userId) ?? 0;
  if (now - last < ZAVORRINA_PROFILE_MATCH_DEBOUNCE_MS) return;
  lastZavarrinaProfileMatchAt.set(userId, now);
  setImmediate(async () => {
    try {
      const count = await runProposalToProfileMatching(undefined, userId);
      if (count > 0) {
        console.log(`[ProposalProfileMatching] ${count} match per zavorrina ${userId}`);
      }
    } catch (err) {
      console.error("[ProposalProfileMatching] Errore zavorrina hook:", err);
    }
  });
}

const lastUserMatchingAt = new Map<string, number>();
const USER_MATCH_DEBOUNCE_MS = 2 * 60 * 1000;

export function triggerMatchingForUser(userId: string): void {
  const now = Date.now();
  const last = lastUserMatchingAt.get(userId) ?? 0;
  if (now - last < USER_MATCH_DEBOUNCE_MS) return;
  lastUserMatchingAt.set(userId, now);
  (async () => {
    try {
      const { bikerBiker, zavarrina } = await runMatchingForUser(userId);
      if (bikerBiker > 0 || zavarrina > 0) {
        console.log(`[MatchingForUser] completato per ${userId}: ${bikerBiker} bb + ${zavarrina} zav`);
      }
    } catch (err) {
      console.error("[MatchingForUser] errore background:", err);
    }
  })();
}

async function runCleanup(): Promise<number> {
  try {
    return await storage.expireOldProposals();
  } catch (error) {
    console.error("Cleanup error:", error);
    return 0;
  }
}

async function pruneStaleProposalProfileMatches(): Promise<number> {
  try {
    const activeProposalIds = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(eq(proposals.status, "active"));
    const activeIds = activeProposalIds.map((r) => r.id);
    if (activeIds.length === 0) {
      const result = await db
        .delete(proposalProfileMatches)
        .returning({ id: proposalProfileMatches.id });
      return result.length;
    }
    const result = await db
      .delete(proposalProfileMatches)
      .where(
        sql`${proposalProfileMatches.proposalId} NOT IN (${sql.join(activeIds.map((id) => sql`${id}`), sql`, `)})`
      )
      .returning({ id: proposalProfileMatches.id });
    return result.length;
  } catch (error) {
    console.error("[Cleanup] Errore pulizia proposal_profile_matches stale:", error);
    return 0;
  }
}

async function pruneOldZoneNotifications(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await db
      .delete(proposalZoneNotifications)
      .where(lt(proposalZoneNotifications.sentAt, cutoff))
      .returning({ id: proposalZoneNotifications.id });
    return result.length;
  } catch (error) {
    console.error("[Cleanup] Errore prune proposal_zone_notifications:", error);
    return 0;
  }
}

async function runFakeZavorrineRotation(): Promise<void> {
  try {
    await storage.toggleFakeZavorrineAvailability();
  } catch (error) {
    console.error("Fake zavorrine rotation error:", error);
  }
}


let isMatchingRunning = false;
let lastMatchingStart: number | null = null;
let lastCycleMeta: {
  completedAt: string;
  durationMs: number;
  zavarrinaMatchesNew: number;
  bikerBikerMatchesNew: number;
} | null = null;

export function getLastMatchingCycleMeta() {
  return lastCycleMeta;
}

export function triggerMatchingRun(): { started: boolean; reason?: string } {
  if (isMatchingRunning) {
    return { started: false, reason: "already_running" };
  }
  if (lastMatchingStart && Date.now() - lastMatchingStart < MATCH_DEBOUNCE_MS) {
    const ago = Math.floor((Date.now() - lastMatchingStart) / 1000);
    return { started: false, reason: `debounced — last run ${ago}s ago` };
  }
  isMatchingRunning = true;
  lastMatchingStart = Date.now();

  (async () => {
    const cycleStart = Date.now();
    console.log("[Matching] Ciclo on-demand avviato");

    try {
      const expired = await runCleanup();
      if (expired > 0) console.log(`[Matching] Scadute ${expired} proposte`);

      try {
        const deleted = await storage.deleteExpiredProposals();
        if (deleted > 0) console.log(`[Matching] Eliminate ${deleted} proposte scadute`);
      } catch (err) {
        console.error("[Matching] Errore eliminazione proposte scadute:", err);
      }

      const autoMatchSetting = await storage.getAppSetting("auto_matching_enabled");
      const autoMatchEnabled = autoMatchSetting?.value !== "false";

      let garageMatches = 0;
      let bikerBikerMatchCount = 0;

      if (autoMatchEnabled) {
        const matches = await runMatching();
        if (matches > 0) console.log(`[Matching] Found ${matches} new proposal matches`);

        garageMatches = await runWishlistMatching();
        if (garageMatches > 0) console.log(`[Matching] Found ${garageMatches} new garage matches`);

        bikerBikerMatchCount = await runBikerBikerMatching();
        if (bikerBikerMatchCount > 0) console.log(`[Matching] Found ${bikerBikerMatchCount} new biker-biker matches`);

        try {
          const typeStyleCount = await runBikerBikerTypeStyleMatching();
          if (typeStyleCount > 0) console.log(`[Matching] Found ${typeStyleCount} new type-style matches`);
        } catch (err) {
          console.error("[Matching] TypeStyle matching error (non-blocking):", err);
        }

        try {
          await runClubBrandMatching();
        } catch (err) {
          console.error("[Matching] ClubBrand matching error (non-blocking):", err);
        }

        try {
          await runMusicMatchBikerZavarrina();
        } catch (err) {
          console.error("[Matching] MusicBikerZav matching error (non-blocking):", err);
        }

        try {
          await runGpsBasedMatching();
        } catch (err) {
          console.error("[Matching] GpsBased matching error (non-blocking):", err);
        }

        try {
          await runEventMatching();
        } catch (err) {
          console.error("[Matching] Event matching error (non-blocking):", err);
        }

        try {
          const zavTypeStyleCount = await runBikerZavarrinaTypeStyleMatching();
          if (zavTypeStyleCount > 0) console.log(`[Matching] Found ${zavTypeStyleCount} new zav type-style matches`);
        } catch (err) {
          console.error("[Matching] ZavTypeStyle matching error (non-blocking):", err);
        }

        try {
          const distCount = await runDistanceMatching();
          if (distCount > 0) console.log(`[Matching] Found ${distCount} new distance matches`);
        } catch (err) {
          console.error("[Matching] Distance matching error (non-blocking):", err);
        }

        try {
          const zoneCount = await runRouteTypeZoneMatching();
          if (zoneCount > 0) console.log(`[Matching] Found ${zoneCount} new route-zone matches`);
        } catch (err) {
          console.error("[Matching] RouteTypeZone matching error (non-blocking):", err);
        }

        try {
          const ppCount = await runProposalToProfileMatching();
          if (ppCount > 0) console.log(`[Matching] Found ${ppCount} new proposal-profile matches`);
        } catch (err) {
          console.error("[Matching] ProposalProfile matching error (non-blocking):", err);
        }
      } else {
        console.log("[Matching] Auto matching disabilitato dall'admin, skip");
      }

      const cycleDuration = Date.now() - cycleStart;
      lastCycleMeta = {
        completedAt: new Date().toISOString(),
        durationMs: cycleDuration,
        zavarrinaMatchesNew: garageMatches,
        bikerBikerMatchesNew: bikerBikerMatchCount,
      };

      console.log(`[Matching] Ciclo on-demand completato in ${(cycleDuration / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error("[Matching] Errore nel ciclo on-demand:", err);
    } finally {
      isMatchingRunning = false;
    }
  })();
  return { started: true };
}

const _engineTimers: ReturnType<typeof setInterval>[] = [];

export function startMatchingEngine(): void {
  console.log("[Matching] Engine avviato — modalità on-demand (trigger da login utente)");

  (async () => {
    try {
      const fakeUsersSetting = await storage.getAppSetting("fake_users_enabled");
      const fakeUsersEnabled = fakeUsersSetting?.value === "true";
      if (!fakeUsersEnabled) {
        console.log("[Matching] Fake zavorrine rotation skipped (fake users disabled)");
      } else {
        runFakeZavorrineRotation();
        _engineTimers.push(setInterval(runFakeZavorrineRotation, 5 * 60 * 1000));
        console.log("[Matching] Fake zavorrine availability rotation started (5min interval)");
      }
    } catch (err) {
      console.error("[Matching] Error checking fake_users_enabled for rotation — skipped (fake users disabled):", err);
    }
  })();

  _engineTimers.push(setInterval(async () => {
    try {
      const expired = await runCleanup();
      if (expired > 0) console.log(`[Cleanup] Scadute ${expired} proposte`);
      const deleted = await storage.deleteExpiredProposals();
      if (deleted > 0) console.log(`[Cleanup] Eliminate ${deleted} proposte scadute`);
      const prunedZoneNotifs = await pruneOldZoneNotifications();
      if (prunedZoneNotifs > 0) console.log(`[Cleanup] Eliminate ${prunedZoneNotifs} zone notifications più vecchie di 30 giorni`);
      const prunedStaleMatches = await pruneStaleProposalProfileMatches();
      if (prunedStaleMatches > 0) console.log(`[Cleanup] Eliminate ${prunedStaleMatches} proposal-profile matches di proposte non attive`);
    } catch (err) {
      console.error("[Cleanup] Errore pulizia oraria:", err);
    }

    // Purga lastUserMatchingAt: rimuovi entry inattive da più di 2 ore
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    let purgati = 0;
    for (const [uid, ts] of lastUserMatchingAt) {
      if (ts < cutoff) { lastUserMatchingAt.delete(uid); purgati++; }
    }

    // Log diagnostico memoria
    const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    console.log(
      `[MemDiag] rss=${memMb}MB | lastUserMatchingAt=${lastUserMatchingAt.size} (purgati=${purgati}) | ora=${new Date().toISOString()}`
    );
  }, 60 * 60 * 1000));
  console.log("[Matching] Cleanup orario proposte scadute avviato");
}
