/**
 * Task #3917 — Biker↔Zavorrina base (intento ruolo).
 *
 * Abbina biker (userType in biker/coppia, searchPreference in zavorrina/both)
 * con zavarrine (userType=zavorrina, searchPreference in biker/both).
 * Non richiede moto né wishlist: criterio minimo di compatibilità.
 * Usa motorcycleBrand="base_intent" in biker_biker_matches (pair_type="bz").
 *
 * Preference gating: riusa bikerZavorrinaBrand come toggle generale biker↔zav
 * (nessun nuovo campo in match_preferences — fuori scope del task).
 *
 * Deduplication: salta coppie già in biker_biker_matches (pair_type='bz')
 * O in biker_zavorrina_matches (wishlist-based), evitando match ridondanti.
 *
 * Negative filters: applica età/distanza/foto/tipo via loadNegativePreferencesMap +
 * isExcludedByNegativePrefs con coordinate reali da user_profiles.
 */
import { db } from "../db";
import { storage } from "../storage";
import { users, userProfiles } from "@shared/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { loadMatchPreferencesMap, prefEnabled } from "./filters";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";
import { protectedNicknamesSqlArray } from "./protection-filter";
import {
  loadNegativePreferencesMap,
  loadCandidateProfiles,
  isExcludedByNegativePrefs,
} from "./negative-filters";

export async function runBikerZavarrinaBase(): Promise<number> {
  try {
    const prefsMap = await loadMatchPreferencesMap();
    const allBlockedPairs = await storage.getAllBlockedPairs?.() ?? [];
    const blockedSet = new Set(
      allBlockedPairs.flatMap((b: { blockerId: string; blockedId: string }) => [
        `${b.blockerId}:${b.blockedId}`,
        `${b.blockedId}:${b.blockerId}`,
      ])
    );

    const bikerRows = await db
      .select({ userId: users.id })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(
        inArray(users.userType, ["biker", "coppia"]),
        eq(users.isFake, false),
        eq(users.matchingDisabled, false),
        eq(users.status, "active"),
        inArray(userProfiles.searchPreference, ["zavorrina", "both"]),
        sql`${users.nickname} <> ALL(${sql.raw(protectedNicknamesSqlArray())})`,
      ));

    const zavRows = await db
      .select({ userId: users.id })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(
        eq(users.userType, "zavorrina"),
        eq(users.isFake, false),
        eq(users.matchingDisabled, false),
        eq(users.status, "active"),
        inArray(userProfiles.searchPreference, ["biker", "both"]),
        sql`${users.nickname} <> ALL(${sql.raw(protectedNicknamesSqlArray())})`,
      ));

    if (bikerRows.length === 0 || zavRows.length === 0) {
      console.log("[BikerZavBase] Nessun candidato (biker o zav), skip.");
      return 0;
    }

    const bikerIds = bikerRows.map(r => r.userId);
    const zavIds = zavRows.map(r => r.userId);
    const allIds = [...bikerIds, ...zavIds];

    // Deduplication: coppie già in biker_biker_matches (pair_type='bz')
    const existingBbRes = await db.execute<{ a: string; b: string }>(sql`
      SELECT LEAST(biker1_id, biker2_id)::text AS a,
             GREATEST(biker1_id, biker2_id)::text AS b
      FROM biker_biker_matches
      WHERE pair_type = 'bz' AND archived_at IS NULL
    `);
    const existingPairSet = new Set<string>();
    for (const row of (existingBbRes.rows ?? []) as Array<{ a: string; b: string }>) {
      existingPairSet.add(`${row.a}:${row.b}`);
    }

    // Deduplication: coppie già in biker_zavorrina_matches (wishlist-based)
    const existingBzRes = await db.execute<{ bid: string; zid: string }>(sql`
      SELECT biker_id::text AS bid, zavorrina_id::text AS zid
      FROM biker_zavorrina_matches
      WHERE archived_at IS NULL
    `);
    const existingWishlistSet = new Set<string>();
    for (const row of (existingBzRes.rows ?? []) as Array<{ bid: string; zid: string }>) {
      existingWishlistSet.add(`${row.bid}:${row.zid}`);
    }

    // Negative preference filters: carica prefs + profili candidati
    const negPrefsMap = await loadNegativePreferencesMap(allIds);
    const candidateProfiles = negPrefsMap.size > 0
      ? await loadCandidateProfiles(allIds)
      : new Map<string, Awaited<ReturnType<typeof loadCandidateProfiles>> extends Map<string, infer V> ? V : never>();

    // Coordinate GPS per distance-based negative preferences
    const coordRows = await db
      .select({
        userId: userProfiles.userId,
        lat: userProfiles.latitude,
        lng: userProfiles.longitude,
      })
      .from(userProfiles)
      .where(inArray(userProfiles.userId, allIds));
    const coordMap = new Map<string, { lat: number | null; lng: number | null }>();
    for (const row of coordRows) {
      coordMap.set(row.userId, { lat: row.lat ?? null, lng: row.lng ?? null });
    }

    const MAX = 300;
    let matchCount = 0;
    let skipCount = 0;

    outer:
    for (const bikerId of bikerIds) {
      if (!prefEnabled(prefsMap, bikerId, "bikerZavorrinaBrand")) continue;
      const bikerPrefs = negPrefsMap.get(bikerId);
      const bikerCoord = coordMap.get(bikerId);

      for (const zavId of zavIds) {
        if (matchCount >= MAX) break outer;
        if (zavId === bikerId) continue;
        if (blockedSet.has(`${bikerId}:${zavId}`)) { skipCount++; continue; }
        if (!prefEnabled(prefsMap, zavId, "bikerZavorrinaBrand")) { skipCount++; continue; }

        // Negative filters: biker esclude la zavorrina?
        const zavProfile = candidateProfiles.get(zavId);
        const zavCoord = coordMap.get(zavId);
        if (bikerPrefs && bikerPrefs.length > 0) {
          const excl = isExcludedByNegativePrefs(
            bikerPrefs,
            zavProfile,
            bikerCoord?.lat != null && bikerCoord.lng != null
              ? { lat: bikerCoord.lat, lng: bikerCoord.lng, candidateLat: zavCoord?.lat, candidateLng: zavCoord?.lng }
              : undefined,
          );
          if (excl) { skipCount++; continue; }
        }
        // Negative filters: zavorrina esclude il biker?
        const bikerProfile = candidateProfiles.get(bikerId);
        const zavPrefs = negPrefsMap.get(zavId);
        if (zavPrefs && zavPrefs.length > 0) {
          const excl = isExcludedByNegativePrefs(
            zavPrefs,
            bikerProfile,
            zavCoord?.lat != null && zavCoord.lng != null
              ? { lat: zavCoord.lat, lng: zavCoord.lng, candidateLat: bikerCoord?.lat, candidateLng: bikerCoord?.lng }
              : undefined,
          );
          if (excl) { skipCount++; continue; }
        }

        // Skip se esiste già in biker_zavorrina_matches (wishlist)
        if (existingWishlistSet.has(`${bikerId}:${zavId}`)) { skipCount++; continue; }

        // Skip se esiste già in biker_biker_matches con pair_type='bz'
        const idA = bikerId < zavId ? bikerId : zavId;
        const idB = bikerId < zavId ? zavId : bikerId;
        const pairKey = `${idA}:${idB}`;
        if (existingPairSet.has(pairKey)) { skipCount++; continue; }

        const inserted = await storage.createBikerBikerMatch({
          biker1Id: idA,
          biker2Id: idB,
          motorcycleBrand: "base_intent",
          status: "new",
          isSupermatch: false,
          pairType: "bz",
        });
        if (inserted) {
          matchCount++;
          existingPairSet.add(pairKey);
          await dispatchMatchNotification({
            table: "biker_biker_matches",
            matchId: inserted.id,
            userIds: [idA, idB],
            priority: classifyMatch({}),
          });
        } else {
          skipCount++;
        }
      }
    }

    console.log(`[BikerZavBase] ${matchCount} base intent matches (biker↔zavorrina), saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[BikerZavBase] error:", error);
    return 0;
  }
}
