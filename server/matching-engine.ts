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

/**
 * Task #1124 vuln 2: club-boundary enforcement for proposal matching.
 *
 * Pre-fetches active membership rows for `(userId in userIds, clubId in clubIds,
 * status='active')` and returns a Set of `${userId}:${clubId}` keys for O(1)
 * lookup inside the matching loops. Used to block:
 *   - matches where exactly one side has a clubId (public<->club leak)
 *   - matches where the two clubIds differ (cross-club leak)
 *   - matches where either user has dropped active membership in the proposal's
 *     club between proposal creation and the matching cycle
 *
 * Without this gate the engine pairs club proposals against any compatible
 * proposal globally, and then GET /api/proposals/matches and the accept route
 * become an exfiltration primitive for club-only ride details.
 */
async function getActiveClubMembershipKeys(
  userIds: string[],
  clubIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0 || clubIds.length === 0) return new Set();
  const rows = await db
    .select({ userId: motoClubMembers.userId, clubId: motoClubMembers.clubId })
    .from(motoClubMembers)
    .where(and(
      inArray(motoClubMembers.userId, userIds),
      inArray(motoClubMembers.clubId, clubIds),
      eq(motoClubMembers.status, "active"),
    ));
  return new Set(rows.map((r) => `${r.userId}:${r.clubId}`));
}

/**
 * Returns true when two proposals belong to the same club scope:
 *   - both have no clubId (public matching), OR
 *   - both have the same clubId AND both authors are still active members.
 *
 * Caller must pass a precomputed membership-key set
 * (see getActiveClubMembershipKeys).
 */
function clubScopeAllows(
  p1: Proposal,
  p2: Proposal,
  membershipKeys: Set<string>,
): boolean {
  const c1 = p1.clubId ?? null;
  const c2 = p2.clubId ?? null;
  if (c1 === null && c2 === null) return true;
  if (c1 !== c2) return false;
  // c1 === c2 and not null
  return membershipKeys.has(`${p1.userId}:${c1}`) && membershipKeys.has(`${p2.userId}:${c2}`);
}

function sameDay(d1: Date | null, d2: Date | null): boolean {
  if (!d1 || !d2) return true;
  const a = new Date(d1);
  const b = new Date(d2);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Maps each targetUserType declared on a proposal to the set of author
 * userType values that represent valid counterparts.
 *
 * | targetUserType | authorUserType pool     |
 * |----------------|-------------------------|
 * | biker          | biker, coppia           |
 * | zavorrina      | zavorrina               |
 * | hitchhiker     | biker, zavorrina, coppia|
 * | hotcher        | biker, coppia           |
 * | hitcher        | biker, coppia           | (zavorrina request alias)
 */
const TARGET_TO_POOL: Record<string, string[]> = {
  biker: ["biker", "coppia"],
  zavorrina: ["zavorrina"],
  hitchhiker: ["biker", "zavorrina", "coppia"],
  hotcher: ["biker", "coppia"],
  hitcher: ["biker", "coppia"],
};

/**
 * Given an array of targetUserTypes declared on a proposal, returns the
 * union of authorUserType values that would be valid counterparts.
 */
function resolveMatchPool(targetTypes: string[]): string[] {
  const pool = new Set<string>();
  for (const t of targetTypes) {
    const p = TARGET_TO_POOL[t];
    if (p) for (const u of p) pool.add(u);
  }
  return [...pool];
}

/**
 * Derives a targetUserTypes array from a legacy searchType so that old
 * proposals (created before the targetUserTypes field existed) are still
 * matched with the new engine.
 */
function deriveTargetUserTypes(searchType: string | null | undefined): string[] {
  switch (searchType) {
    case "find_a_friend": return ["biker"];
    case "find_a_guest":  return ["zavorrina"];
    case "hitcher":       return ["hitchhiker"];
    case "hitchhiker":    return ["hotcher"];
    case "find_a_biker":  return ["biker", "hotcher"];
    default:              return [];
  }
}

type ProposalWithAuthor = Proposal & { authorUserType?: string | null };

/**
 * Samples N+1 evenly-spaced points along the great-circle segment
 * departure→destination (linear interpolation in lat/lng space — close
 * enough for the route-crossing check over typical moto-trip distances).
 */
function sampleSegment(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  n: number = 10,
): Array<{ lat: number; lng: number }> {
  const pts: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ lat: lat1 + (lat2 - lat1) * t, lng: lng1 + (lng2 - lng1) * t });
  }
  return pts;
}

/**
 * Returns true when the departure→destination segments of two proposals
 * pass within `threshold` km of each other at any sampled point pair.
 * Threshold is the minimum of both proposals' search radii.
 */
function routesIntersect(p1: ProposalWithAuthor, p2: ProposalWithAuthor): boolean {
  if (
    p1.departureLatitude == null || p1.departureLongitude == null ||
    p1.destinationLatitude == null || p1.destinationLongitude == null ||
    p2.departureLatitude == null || p2.departureLongitude == null ||
    p2.destinationLatitude == null || p2.destinationLongitude == null
  ) return false;

  const threshold = Math.min(p1.searchRadius || 50, p2.searchRadius || 50);
  const pts1 = sampleSegment(p1.departureLatitude, p1.departureLongitude, p1.destinationLatitude, p1.destinationLongitude);
  const pts2 = sampleSegment(p2.departureLatitude, p2.departureLongitude, p2.destinationLatitude, p2.destinationLongitude);

  for (const a of pts1) {
    for (const b of pts2) {
      if (haversineDistance(a.lat, a.lng, b.lat, b.lng) <= threshold) return true;
    }
  }
  return false;
}

function areCompatible(p1: ProposalWithAuthor, p2: ProposalWithAuthor): boolean {
  if (p1.userId === p2.userId) return false;

  const t1 = (p1.targetUserTypes && p1.targetUserTypes.length > 0)
    ? p1.targetUserTypes
    : deriveTargetUserTypes(p1.searchType);
  const t2 = (p2.targetUserTypes && p2.targetUserTypes.length > 0)
    ? p2.targetUserTypes
    : deriveTargetUserTypes(p2.searchType);

  if (t1.length === 0 || t2.length === 0) return false;

  const pool1 = resolveMatchPool(t1);
  const pool2 = resolveMatchPool(t2);

  const author1 = p1.authorUserType ?? "biker";
  const author2 = p2.authorUserType ?? "biker";

  if (!pool2.includes(author1)) return false;
  if (!pool1.includes(author2)) return false;

  const date1 = p1.scheduledAt || p1.departureTimeFrom;
  const date2 = p2.scheduledAt || p2.departureTimeFrom;
  if (!sameDay(date1, date2)) return false;

  if (p1.departureLatitude != null && p1.departureLongitude != null && p2.departureLatitude != null && p2.departureLongitude != null) {
    const distance = haversineDistance(
      p1.departureLatitude, p1.departureLongitude,
      p2.departureLatitude, p2.departureLongitude
    );
    const radius1 = p1.searchRadius || 50;
    const radius2 = p2.searchRadius || 50;
    if (distance <= Math.min(radius1, radius2)) return true;
  }

  if (p1.extendToDestination && p1.destinationLatitude != null && p1.destinationLongitude != null && p2.departureLatitude != null && p2.departureLongitude != null) {
    const destRadius1 = p1.destinationSearchRadius || 30;
    const distDest1 = haversineDistance(p1.destinationLatitude, p1.destinationLongitude, p2.departureLatitude, p2.departureLongitude);
    if (distDest1 <= destRadius1) return true;
  }

  if (p2.extendToDestination && p2.destinationLatitude != null && p2.destinationLongitude != null && p1.departureLatitude != null && p1.departureLongitude != null) {
    const destRadius2 = p2.destinationSearchRadius || 30;
    const distDest2 = haversineDistance(p2.destinationLatitude, p2.destinationLongitude, p1.departureLatitude, p1.departureLongitude);
    if (distDest2 <= destRadius2) return true;
  }

  if (routesIntersect(p1, p2)) return true;

  return false;
}

async function runMatching(): Promise<number> {
  try {
    const activeProposals = await storage.getActiveProposalsWithLocation();
    console.log(`[ProposalMatching] proposte attive: ${activeProposals.length} (admin esclusi)`);
    if (activeProposals.length < 2) return 0;

    const existingKeys = await storage.getAllExistingProposalMatchKeys();
    // Task #1124 vuln 2: prefetch active club memberships ONLY for the
    // (userId, clubId) pairs that appear on club-scoped proposals. This is
    // tiny in practice (most proposals are public) and lets us reject
    // cross-club / non-member matches in O(1) inside the loop.
    const clubProposals = activeProposals.filter((p) => !!p.clubId);
    const clubUserIds = [...new Set(clubProposals.map((p) => p.userId))];
    const clubIds = [...new Set(clubProposals.map((p) => p.clubId as string))];
    const membershipKeys = await getActiveClubMembershipKeys(clubUserIds, clubIds);
    const proposalPrefsMap = await loadMatchPreferencesMap();
    let matchCount = 0;

    for (let i = 0; i < activeProposals.length; i++) {
      for (let j = i + 1; j < activeProposals.length; j++) {
        const p1 = activeProposals[i];
        const p2 = activeProposals[j];

        if (!areCompatible(p1, p2)) continue;

        // Biker-biker match when both authors are bikers/coppie (no zavorrina involved)
        const author1 = p1.authorUserType ?? p1.searchType ?? "";
        const author2 = p2.authorUserType ?? p2.searchType ?? "";
        const BIKER_USER_TYPES = new Set(["biker", "coppia"]);
        const isBikerBikerProposal = BIKER_USER_TYPES.has(author1) && BIKER_USER_TYPES.has(author2);
        if (isBikerBikerProposal) {
          if (!bothPrefsEnabled(proposalPrefsMap, p1.userId, p2.userId, "bikerBikerDistance")) continue;
        } else {
          if (!bothPrefsEnabled(proposalPrefsMap, p1.userId, p2.userId, "bikerZavarrinaDistance")) continue;
        }

        // Task #1124 vuln 2: enforce club boundary. Blocks public<->club,
        // cross-club, and former-member matches BEFORE the row is created
        // — the safest place since downstream consumers (GET
        // /api/proposals/matches, accept, reject, conversation creation)
        // historically have not reliably re-checked membership.
        if (!clubScopeAllows(p1, p2, membershipKeys)) continue;

        if (existingKeys.has(`${p1.id}:${p2.id}`)) continue;

        const newMatch = await storage.createProposalMatch({
          proposalId1: p1.id,
          proposalId2: p2.id,
          userId1: p1.userId,
          userId2: p2.userId,
          status: "pending",
          acceptedByUser1: false,
          acceptedByUser2: false,
        });

        existingKeys.add(`${p1.id}:${p2.id}`);
        existingKeys.add(`${p2.id}:${p1.id}`);
        matchCount++;

        try {
          const proposalMatchTitle = it["push.proposalMatch.title"] ?? "Hai un nuovo match proposta! 🔥";
          const proposalMatchBody = it["push.proposalMatch.body"] ?? "Una proposta compatibile è stata trovata per il tuo viaggio.";
          await storage.createNotification({
            userId: p1.userId,
            title: proposalMatchTitle,
            body: proposalMatchBody,
            notificationType: "proposal_match",
            referenceType: "proposal_match",
            referenceId: newMatch.id,
          });
          await storage.createNotification({
            userId: p2.userId,
            title: proposalMatchTitle,
            body: proposalMatchBody,
            notificationType: "proposal_match",
            referenceType: "proposal_match",
            referenceId: newMatch.id,
          });
        } catch (notifErr) {
          console.error("[ProposalMatching] Error sending match notifications:", notifErr);
        }
        sendMatchPushNotifications([p1.userId, p2.userId]);
      }
    }

    return matchCount;
  } catch (error) {
    console.error("Matching engine error:", error);
    return 0;
  }
}

export async function runWishlistMatching(): Promise<number> {
  try {
    const countriesSetting = await storage.getAppSetting("matching_countries");
    let matchingCountries: string[] | undefined;
    if (countriesSetting?.value) {
      try { matchingCountries = JSON.parse(countriesSetting.value); } catch {}
      if (!Array.isArray(matchingCountries) || matchingCountries.length === 0) matchingCountries = undefined;
    }

    const wishlistMotos = await storage.getAllWishlistMotosWithUsers(matchingCountries);
    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers(matchingCountries);
    const shuffledBikers = [...bikerMotorcycles].sort(() => Math.random() - 0.5);

    console.log(`[WishlistMatching] wishlist entries: ${wishlistMotos.length}, biker motorcycles: ${bikerMotorcycles.length} (admin esclusi da entrambi i pool)`);

    if (wishlistMotos.length === 0 || bikerMotorcycles.length === 0) {
      if (wishlistMotos.length === 0) console.warn("[WishlistMatching] WARN: nessuna wishlist trovata");
      if (bikerMotorcycles.length === 0) console.warn("[WishlistMatching] WARN: nessuna moto biker trovata — eseguire /api/admin/reconcile-fake-moto");
      return 0;
    }

    const prefsMap = await loadMatchPreferencesMap();
    const existingKeys = await storage.getAllExistingBikerZavarrinaMatchKeys();
    let matchCount = 0;
    let skipCount = 0;
    const MAX_MATCHES_PER_RUN = 500;

    outer:
    for (const wm of wishlistMotos) {
      const zavarrinaId = wm.userId;
      const wish = wm.wishlistMoto;

      for (const bm of shuffledBikers) {
        if (matchCount >= MAX_MATCHES_PER_RUN) break outer;

        const bikerId = bm.userId;
        const moto = bm.motorcycle;

        if (bikerId === zavarrinaId) continue;

        let compatible = false;

        if (wish.brand && moto.brand && wish.brand.toLowerCase() === moto.brand.toLowerCase()) {
          compatible = true;
        } else if (wish.motorcycleType && moto.motorcycleType &&
                   wish.motorcycleType.toLowerCase() === moto.motorcycleType.toLowerCase()) {
          compatible = true;
        }

        if (!compatible) continue;

        if (!bothPrefsEnabled(prefsMap, bikerId, zavarrinaId, "bikerZavorrinaBrand")) { skipCount++; continue; }

        const key = `${bikerId}:${zavarrinaId}:${moto.id}:${wish.id}`;
        if (existingKeys.has(key)) { skipCount++; continue; }

        const isSupermatch = !!(
          wish.brand &&
          moto.brand &&
          wish.brand.toLowerCase() === moto.brand.toLowerCase() &&
          wish.model &&
          moto.model &&
          baseModelName(wish.model) === baseModelName(moto.model) &&
          wish.motorcycleType &&
          moto.motorcycleType &&
          wish.motorcycleType.toLowerCase() === moto.motorcycleType.toLowerCase() &&
          wish.ridingStyle &&
          moto.ridingStyle &&
          wish.ridingStyle.toLowerCase() === moto.ridingStyle.toLowerCase()
        );

        const inserted = await storage.createMatch({
          bikerId,
          zavarrinaId,
          bikerMotorcycleId: moto.id,
          wishlistMotoId: wish.id,
          status: "new",
          isSupermatch,
        });

        existingKeys.add(key);
        matchCount++;
        if (inserted) sendMatchPushNotifications([bikerId, zavarrinaId]);
      }
    }

    console.log(`[WishlistMatching] nuovi match: ${matchCount}, saltati (già esistenti): ${skipCount}`);

    if (matchCount >= MAX_MATCHES_PER_RUN) {
      console.log(`[WishlistMatching] Cap raggiunto (${MAX_MATCHES_PER_RUN} match/ciclo). Riprenderà al prossimo run.`);
    }

    return matchCount;
  } catch (error) {
    console.error("Wishlist matching error:", error);
    return 0;
  }
}

function baseModelName(model: string): string {
  return model.toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export async function runBikerBikerMatching(): Promise<number> {
  try {
    const countriesSetting = await storage.getAppSetting("matching_countries");
    let matchingCountries: string[] | undefined;
    if (countriesSetting?.value) {
      try { matchingCountries = JSON.parse(countriesSetting.value); } catch {}
      if (!Array.isArray(matchingCountries) || matchingCountries.length === 0) matchingCountries = undefined;
    }

    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers(matchingCountries);
    console.log(`[BikerBikerMatching] moto biker trovate: ${bikerMotorcycles.length} (admin esclusi dal pool)`);
    if (bikerMotorcycles.length < 2) {
      console.warn("[BikerBikerMatching] WARN: meno di 2 moto biker trovate, matching impossibile");
      return 0;
    }

    const buckets = new Map<string, Array<{ userId: string; brand: string; model: string; motorcycleType: string; ridingStyle: string }>>();
    for (const bm of bikerMotorcycles) {
      if (!bm.motorcycle.brand) continue;
      const key = bm.motorcycle.brand.toLowerCase();
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push({
        userId: bm.userId,
        brand: bm.motorcycle.brand,
        model: bm.motorcycle.model || "",
        motorcycleType: bm.motorcycle.motorcycleType || "",
        ridingStyle: bm.motorcycle.ridingStyle || "",
      });
    }

    const bucketsWithMultiple = [...buckets.values()].filter(m => m.length > 1);
    console.log(`[BikerBikerMatching] bucket creati: ${buckets.size}, con più di 1 membro: ${bucketsWithMultiple.length}`);
    for (const [key, members] of buckets.entries()) {
      if (members.length > 1) {
        console.log(`[BikerBikerMatching] bucket "${key}" → ${members.length} utenti`);
      }
    }

    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );
    const isPairBlocked = (id1: string, id2: string) => blockedSet.has(`${id1}:${id2}`);
    const prefsMap = await loadMatchPreferencesMap();

    let matchCount = 0;
    let skipCount = 0;
    const MAX_MATCHES_PER_BUCKET = 100;

    const shuffledBuckets = [...buckets.values()].sort(() => Math.random() - 0.5);

    for (const members of shuffledBuckets) {
      if (members.length < 2) continue;
      const uniqueMembers = members
        .filter((m, idx) => members.findIndex(x => x.userId === m.userId) === idx)
        .sort(() => Math.random() - 0.5);
      if (uniqueMembers.length < 2) continue;

      let bucketCount = 0;
      const maxPairs = (uniqueMembers.length * (uniqueMembers.length - 1)) / 2;
      const bucketCap = Math.min(MAX_MATCHES_PER_BUCKET, maxPairs);

      outer:
      for (let i = 0; i < uniqueMembers.length; i++) {
        for (let j = i + 1; j < uniqueMembers.length; j++) {
          if (bucketCount >= bucketCap) break outer;
          const m1 = uniqueMembers[i];
          const m2 = uniqueMembers[j];
          const idA = m1.userId < m2.userId ? m1.userId : m2.userId;
          const idB = m1.userId < m2.userId ? m2.userId : m1.userId;

          if (isPairBlocked(m1.userId, m2.userId)) { skipCount++; continue; }
          if (!bothPrefsEnabled(prefsMap, m1.userId, m2.userId, "bikerBikerBrand")) { skipCount++; continue; }

          const isSupermatch = !!(
            m1.model && m2.model &&
            m1.model.toLowerCase() === m2.model.toLowerCase() &&
            m1.motorcycleType && m2.motorcycleType &&
            m1.motorcycleType.toLowerCase() === m2.motorcycleType.toLowerCase() &&
            m1.ridingStyle && m2.ridingStyle &&
            m1.ridingStyle.toLowerCase() === m2.ridingStyle.toLowerCase()
          );

          const inserted = await storage.createBikerBikerMatch({
            biker1Id: idA,
            biker2Id: idB,
            motorcycleBrand: m1.brand,
            status: "new",
            isSupermatch,
          });
          if (inserted) {
            matchCount++; bucketCount++;
            sendMatchPushNotifications([idA, idB]);
          } else skipCount++;
        }
      }
    }

    console.log(`[BikerBikerMatching] nuovi match: ${matchCount}, saltati (già esistenti): ${skipCount}`);

    return matchCount;
  } catch (error) {
    console.error("Biker-biker matching error:", error);
    return 0;
  }
}

export async function runBikerBikerTypeStyleMatching(): Promise<number> {
  try {
    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers();
    if (bikerMotorcycles.length < 2) return 0;

    const prefsMap = await loadMatchPreferencesMap();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    const typeStyleBuckets = new Map<string, Array<{ userId: string; motorcycleType: string; ridingStyle: string }>>();
    for (const bm of bikerMotorcycles) {
      const mtype = bm.motorcycle.motorcycleType?.toLowerCase();
      const rstyle = bm.motorcycle.ridingStyle?.toLowerCase();
      if (!mtype || !rstyle) continue;
      const key = `${mtype}|${rstyle}`;
      if (!typeStyleBuckets.has(key)) typeStyleBuckets.set(key, []);
      typeStyleBuckets.get(key)!.push({ userId: bm.userId, motorcycleType: mtype, ridingStyle: rstyle });
    }

    let matchCount = 0;
    let skipCount = 0;
    const MAX_PER_BUCKET = 50;

    for (const members of typeStyleBuckets.values()) {
      if (members.length < 2) continue;
      const unique = members
        .filter((m, i) => members.findIndex(x => x.userId === m.userId) === i)
        .sort(() => Math.random() - 0.5);
      if (unique.length < 2) continue;

      let bucketCount = 0;
      outer:
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          if (bucketCount >= MAX_PER_BUCKET) break outer;
          const m1 = unique[i];
          const m2 = unique[j];
          if (m1.userId === m2.userId) continue;
          if (blockedSet.has(`${m1.userId}:${m2.userId}`)) { skipCount++; continue; }
          if (!bothPrefsEnabled(prefsMap, m1.userId, m2.userId, "bikerBikerTypeStyle")) { skipCount++; continue; }

          const idA = m1.userId < m2.userId ? m1.userId : m2.userId;
          const idB = m1.userId < m2.userId ? m2.userId : m1.userId;

          const inserted = await storage.createBikerBikerMatch({
            biker1Id: idA,
            biker2Id: idB,
            motorcycleBrand: "tipo:" + m1.motorcycleType,
            status: "new",
            isSupermatch: false,
          });
          if (inserted) {
            matchCount++; bucketCount++;
            sendMatchPushNotifications([idA, idB]);
          } else skipCount++;
        }
      }
    }

    console.log(`[TypeStyleMatching] nuovi match: ${matchCount}, saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[TypeStyleMatching] error:", error);
    return 0;
  }
}

export async function runClubBrandMatching(): Promise<number> {
  try {
    const prefsMap = await loadMatchPreferencesMap();
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
          if (!prefEnabled(prefsMap, memberId, "bikerClubBrand")) { skipCount++; continue; }

          const idA = bm.userId < memberId ? bm.userId : memberId;
          const idB = bm.userId < memberId ? memberId : bm.userId;
          const inserted = await storage.createBikerBikerMatch({
            biker1Id: idA,
            biker2Id: idB,
            motorcycleBrand: `club:${brand}`,
            status: "new",
            isSupermatch: false,
          });
          if (inserted) { matchCount++; sendMatchPushNotifications([idA, idB]); }
          else skipCount++;
        }
      }

      const zavWishRows = await db
        .select({ userId: zavarrinaWishlists.userId })
        .from(zavarrinaWishlists)
        .innerJoin(
          zavarrinaWishlistMotos,
          eq(zavarrinaWishlistMotos.wishlistId, zavarrinaWishlists.id)
        )
        .where(sql`LOWER(${zavarrinaWishlistMotos.brand}) = ${brand}`);

      for (const zavRow of zavWishRows) {
        if (matchCount >= MAX_CLUB_MATCHES) break;
        if (!prefEnabled(prefsMap, zavRow.userId, "zavarrinaClubBrand")) continue;

        for (const memberId of memberIds) {
          if (matchCount >= MAX_CLUB_MATCHES) break;
          if (memberId === zavRow.userId) continue;
          if (blockedSet.has(`${zavRow.userId}:${memberId}`)) { skipCount++; continue; }
          if (!prefEnabled(prefsMap, memberId, "bikerClubBrand")) { skipCount++; continue; }

          const idA = zavRow.userId < memberId ? zavRow.userId : memberId;
          const idB = zavRow.userId < memberId ? memberId : zavRow.userId;
          const inserted = await storage.createBikerBikerMatch({
            biker1Id: idA,
            biker2Id: idB,
            motorcycleBrand: `club_zav:${brand}`,
            status: "new",
            isSupermatch: false,
            pairType: "bz",
          });
          if (inserted) { matchCount++; sendMatchPushNotifications([idA, idB]); }
          else skipCount++;
        }
      }
    }

    console.log(`[ClubBrandMatching] ${matchCount} club-brand matches persisted, saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[ClubBrandMatching] error:", error);
    return 0;
  }
}

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
/**
 * After a new proposal is created, find active users in the area who:
 *   (a) have a known GPS position updated in the last 7 days
 *   (b) are role-compatible with the new proposal's searchType
 *   (c) do NOT already have an active proposal (they are not already matched)
 *   (d) have NOT already received a zone notification for this proposal (deduplication)
 * and send them a push notification "C'è una proposta nella tua zona!".
 */
export async function runProposalZoneNotifications(proposal: Proposal): Promise<void> {
  try {
    if (proposal.departureLatitude == null || proposal.departureLongitude == null) return;
    const hasSomeType = (proposal.targetUserTypes && proposal.targetUserTypes.length > 0) || !!proposal.searchType;
    if (!hasSomeType) return;

    const searchRadius = proposal.searchRadius || 50;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Resolve the pool of authorUserType values that are valid counterparts
    // using the new targetUserTypes field, falling back to legacy searchType derivation.
    const declaredTargets = (proposal.targetUserTypes && proposal.targetUserTypes.length > 0)
      ? proposal.targetUserTypes
      : deriveTargetUserTypes(proposal.searchType);
    const targetUserTypes = resolveMatchPool(declaredTargets).length > 0
      ? resolveMatchPool(declaredTargets)
      : ["biker", "zavorrina", "coppia"];

    // Fetch all active users with recent GPS position
    const usersWithProfiles = await db
      .select({
        userId: userProfiles.userId,
        latitude: userProfiles.latitude,
        longitude: userProfiles.longitude,
        coordinatesUpdatedAt: userProfiles.coordinatesUpdatedAt,
        userType: users.userType,
        role: users.role,
        status: users.status,
      })
      .from(userProfiles)
      .innerJoin(users, eq(userProfiles.userId, users.id))
      .where(
        and(
          isNotNull(userProfiles.latitude),
          isNotNull(userProfiles.longitude),
          gt(userProfiles.coordinatesUpdatedAt, sevenDaysAgo),
          eq(users.status, "active"),
        )
      );

    // Filter: same zone, compatible role, not the proposal creator
    const candidateIds = usersWithProfiles
      .filter((u) => {
        if (u.userId === proposal.userId) return false;
        if (u.role === "admin") return false;
        if (!targetUserTypes.includes(u.userType ?? "")) return false;
        if (u.latitude == null || u.longitude == null) return false;
        const dist = haversineDistance(
          proposal.departureLatitude!,
          proposal.departureLongitude!,
          u.latitude,
          u.longitude,
        );
        return dist <= searchRadius;
      })
      .map((u) => u.userId);

    if (candidateIds.length === 0) return;

    // Check which users already have an active proposal (exclude them)
    const activeProposals = await storage.getActiveProposalsWithLocation();
    const usersWithActiveProposal = new Set(activeProposals.map((p) => p.userId));

    // Deduplication: check who already received this notification
    const alreadySentRows = await db
      .select({ userId: proposalZoneNotifications.userId })
      .from(proposalZoneNotifications)
      .where(eq(proposalZoneNotifications.proposalId, proposal.id));
    const alreadySent = new Set(alreadySentRows.map((r) => r.userId));

    const toNotify = candidateIds.filter(
      (id) => !usersWithActiveProposal.has(id) && !alreadySent.has(id)
    );

    if (toNotify.length === 0) return;

    // Record sent notifications (deduplication)
    for (const userId of toNotify) {
      try {
        await db.insert(proposalZoneNotifications).values({
          userId,
          proposalId: proposal.id,
        }).onConflictDoNothing();

        await storage.createNotification({
          userId,
          title: it["push.zoneProposal.title"] ?? "C'è una proposta nella tua zona! 🏍️",
          body: it["push.zoneProposal.body"] ?? "Apri BikerLink per scoprirla",
          notificationType: "zone_proposal",
          referenceType: "proposal",
          referenceId: proposal.id,
        });
      } catch (err) {
        console.warn("[ZoneNotif] Error inserting zone notification record:", err);
      }
    }

    console.log(`[ZoneNotif] Invio notifica "proposta in zona" a ${toNotify.length} utenti per proposta ${proposal.id}`);
    sendZoneProposalPushNotifications(toNotify);
  } catch (err) {
    console.error("[ZoneNotif] Errore zone notifications:", err);
  }
}

/**
 * Proposal-to-Profile matching: for each active find_a_guest / hitcher proposal,
 * find zavorrine whose profile coordinates fall within the proposal's searchRadius
 * and create proposal_profile_matches records (idempotent via unique constraint).
 *
 * @param filterProposalId  when provided, only processes that single proposal
 * @param filterZavarrinaId when provided, only checks proposals near this zavorrina
 */
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
