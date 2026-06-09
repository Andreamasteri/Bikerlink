import { storage } from "../storage";
import { db } from "../db";
import { motoClubs, motoClubMembers, users } from "@shared/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { loadMatchPreferencesMap, prefEnabled, loadMatchingDisabledSet, neitherMatchingDisabled } from "./filters";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";

export async function runClubBrandMatching(): Promise<number> {
  try {
    const prefsMap = await loadMatchPreferencesMap();
    const matchingDisabledSet = await loadMatchingDisabledSet();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    const allClubs = await db
      .select({ id: motoClubs.id, brandName: motoClubs.brandName })
      .from(motoClubs)
      .where(and(isNotNull(motoClubs.brandName), eq(motoClubs.isApproved, true)));

    if (allClubs.length === 0) return 0;

    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers();
    if (bikerMotorcycles.length === 0) return 0;

    let matchCount = 0;
    let skipCount = 0;
    const MAX_CLUB_MATCHES = 200;

    for (const club of allClubs) {
      if (!club.brandName || matchCount >= MAX_CLUB_MATCHES) break;
      const brand = club.brandName.toLowerCase();

      const memberRows = await db
        .select({ userId: motoClubMembers.userId })
        .from(motoClubMembers)
        .where(and(
          eq(motoClubMembers.clubId, club.id),
          eq(motoClubMembers.status, "active")
        ));
      if (memberRows.length === 0) continue;
      const memberIds = memberRows.map(m => m.userId);

      const brandOwners = bikerMotorcycles.filter(bm =>
        bm.motorcycle.brand?.toLowerCase() === brand
      );

      for (const bm of brandOwners) {
        if (matchCount >= MAX_CLUB_MATCHES) break;
        if (!prefEnabled(prefsMap, bm.userId, "bikerClubBrand")) continue;

        for (const memberId of memberIds) {
          if (matchCount >= MAX_CLUB_MATCHES) break;
          if (memberId === bm.userId) continue;
          if (blockedSet.has(`${bm.userId}:${memberId}`)) { skipCount++; continue; }
          if (!neitherMatchingDisabled(matchingDisabledSet, bm.userId, memberId)) { skipCount++; continue; }
          if (!prefEnabled(prefsMap, memberId, "bikerClubBrand")) { skipCount++; continue; }

          const idA = bm.userId < memberId ? bm.userId : memberId;
          const idB = bm.userId < memberId ? memberId : bm.userId;

          const inserted = await storage.createBikerBikerMatch({
            biker1Id: idA,
            biker2Id: idB,
            motorcycleBrand: `club:${club.id}:${brand}`,
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

    console.log(`[ClubBrandMatching] ${matchCount} nuovi biker-club-brand matches, saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[ClubBrandMatching] error:", error);
    return 0;
  }
}

export async function runZavTypeStyleMatching(): Promise<number> {
  try {
    const prefsMap = await loadMatchPreferencesMap();
    const matchingDisabledSet = await loadMatchingDisabledSet();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers();
    const zavProfiles = await db
      .select({ userId: users.id, motoType: sql<string>`preferred_moto_type`, rideStyle: sql<string>`preferred_ride_style` })
      .from(users)
      .where(and(
        eq(users.userType, "zavorrina"),
        eq(users.isFake, false),
        eq(users.matchingDisabled, false),
        isNotNull(sql`preferred_moto_type`),
        isNotNull(sql`preferred_ride_style`)
      ));

    if (bikerMotorcycles.length === 0 || zavProfiles.length === 0) return 0;

    const zavByTypeStyle = new Map<string, string[]>();
    for (const z of zavProfiles) {
      const key = `${z.motoType!.toLowerCase()}|${z.rideStyle!.toLowerCase()}`;
      if (!zavByTypeStyle.has(key)) zavByTypeStyle.set(key, []);
      zavByTypeStyle.get(key)!.push(z.userId);
    }

    let matchCount = 0;
    let skipCount = 0;
    const MAX = 200;

    for (const bm of bikerMotorcycles) {
      if (matchCount >= MAX) break;
      const mtype = bm.motorcycle.motorcycleType?.toLowerCase();
      const rstyle = bm.motorcycle.ridingStyle?.toLowerCase();
      if (!mtype || !rstyle) continue;
      if (matchingDisabledSet.has(bm.userId)) continue;
      if (!prefEnabled(prefsMap, bm.userId, "bikerZavarrinaTypeStyle")) continue;

      const key = `${mtype}|${rstyle}`;
      const zavIds = zavByTypeStyle.get(key);
      if (!zavIds || zavIds.length === 0) continue;

      for (const zavId of zavIds) {
        if (matchCount >= MAX) break;
        if (zavId === bm.userId) continue;
        if (blockedSet.has(`${bm.userId}:${zavId}`)) { skipCount++; continue; }
        if (matchingDisabledSet.has(zavId)) { skipCount++; continue; }
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
