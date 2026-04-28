import { storage } from "./storage";
import { db } from "./db";
import { motoClubMembers, type Proposal } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";

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

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function timeRangesOverlap(from1: Date | null, to1: Date | null, from2: Date | null, to2: Date | null): boolean {
  if (!from1 || !to1 || !from2 || !to2) return true;
  const f1 = new Date(from1).getTime();
  const t1 = new Date(to1).getTime();
  const f2 = new Date(from2).getTime();
  const t2 = new Date(to2).getTime();
  return f1 <= t2 && f2 <= t1;
}

function sameDay(d1: Date | null, d2: Date | null): boolean {
  if (!d1 || !d2) return true;
  const a = new Date(d1);
  const b = new Date(d2);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type MatchRule = {
  searchType1: string;
  searchType2: string;
};

const MATCH_RULES: MatchRule[] = [
  { searchType1: "find_a_friend", searchType2: "find_a_friend" },
  { searchType1: "find_a_guest", searchType2: "find_a_biker" },
  { searchType1: "hitcher", searchType2: "hitchhiker" },
  { searchType1: "find_a_guest", searchType2: "hitchhiker" },
  { searchType1: "hitcher", searchType2: "find_a_biker" },
];

function areCompatible(p1: Proposal, p2: Proposal): boolean {
  if (!p1.searchType || !p2.searchType) return false;
  if (p1.userId === p2.userId) return false;

  const ruleMatch = MATCH_RULES.some(
    (r) =>
      (r.searchType1 === p1.searchType && r.searchType2 === p2.searchType) ||
      (r.searchType1 === p2.searchType && r.searchType2 === p1.searchType)
  );
  if (!ruleMatch) return false;

  const date1 = p1.scheduledAt || p1.departureTimeFrom;
  const date2 = p2.scheduledAt || p2.departureTimeFrom;
  if (!sameDay(date1, date2)) return false;

  if (!timeRangesOverlap(p1.departureTimeFrom, p1.departureTimeTo, p2.departureTimeFrom, p2.departureTimeTo)) return false;

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
    let matchCount = 0;

    for (let i = 0; i < activeProposals.length; i++) {
      for (let j = i + 1; j < activeProposals.length; j++) {
        const p1 = activeProposals[i];
        const p2 = activeProposals[j];

        if (!areCompatible(p1, p2)) continue;
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
          await storage.createNotification({
            userId: p1.userId,
            title: "New proposal match found!",
            body: "A compatible proposal has been found for your trip.",
            notificationType: "proposal_match",
            referenceType: "proposal_match",
            referenceId: newMatch.id,
          });
          await storage.createNotification({
            userId: p2.userId,
            title: "New proposal match found!",
            body: "A compatible proposal has been found for your trip.",
            notificationType: "proposal_match",
            referenceType: "proposal_match",
            referenceId: newMatch.id,
          });
        } catch (notifErr) {
          console.error("[ProposalMatching] Error sending match notifications:", notifErr);
        }
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

        if (wish.brand) {
          if (moto.brand && wish.brand.toLowerCase() === moto.brand.toLowerCase()) {
            compatible = true;
          }
        } else if (wish.motorcycleType) {
          if (moto.motorcycleType && wish.motorcycleType.toLowerCase() === moto.motorcycleType.toLowerCase()) {
            compatible = true;
          }
        }

        if (!compatible) continue;

        const key = `${bikerId}:${zavarrinaId}:${moto.id}:${wish.id}`;
        if (existingKeys.has(key)) { skipCount++; continue; }

        const isSupermatch = !!(
          wish.brand &&
          moto.brand &&
          wish.brand.toLowerCase() === moto.brand.toLowerCase() &&
          wish.model &&
          moto.model &&
          wish.model.toLowerCase() === moto.model.toLowerCase() &&
          wish.motorcycleType &&
          moto.motorcycleType &&
          wish.motorcycleType.toLowerCase() === moto.motorcycleType.toLowerCase() &&
          wish.ridingStyle &&
          moto.ridingStyle &&
          wish.ridingStyle.toLowerCase() === moto.ridingStyle.toLowerCase()
        );

        await storage.createMatch({
          bikerId,
          zavarrinaId,
          bikerMotorcycleId: moto.id,
          wishlistMotoId: wish.id,
          status: "new",
          isSupermatch,
        });

        existingKeys.add(key);
        matchCount++;
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
            motorcycleModel: m1.model,
            status: "new",
            isSupermatch,
          });
          if (inserted) { matchCount++; bucketCount++; }
          else skipCount++;
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

export async function runMatchingForUser(userId: string): Promise<{ bikerBiker: number; zavarrina: number }> {
  try {
    const user = await storage.getUser(userId);
    if (!user) return { bikerBiker: 0, zavarrina: 0 };

    const countriesSetting = await storage.getAppSetting("matching_countries");
    let matchingCountries: string[] | undefined;
    if (countriesSetting?.value) {
      try { matchingCountries = JSON.parse(countriesSetting.value); } catch {}
      if (!Array.isArray(matchingCountries) || matchingCountries.length === 0) matchingCountries = undefined;
    }

    const isBiker = ["biker", "coppia"].includes(user.userType || "");
    const isZavarrina = user.userType === "zavorrina" || user.userType === "coppia";

    let bikerBikerCount = 0;
    let zavarrinaCount = 0;

    const blockedUserIds = new Set(await storage.getBlockedUserIds(userId));

    const allBikerMotos = await storage.getAllBikerMotorcyclesWithUsers(matchingCountries);
    const userMotos = allBikerMotos.filter(bm => bm.userId === userId);

    // 1. BIKER-BIKER: match this user with ALL brand-compatible bikers
    if (isBiker && userMotos.length > 0) {
      const acceptedBikerPairs = await storage.getAcceptedBikerBikerPairKeys(userId);

      const userBrands = new Set(
        userMotos.map(bm => bm.motorcycle.brand?.toLowerCase()).filter((b): b is string => !!b)
      );

      for (const brand of userBrands) {
        const seen = new Set<string>();
        const compatibles = allBikerMotos.filter(bm => {
          if (bm.userId === userId) return false;
          if (bm.motorcycle.brand?.toLowerCase() !== brand) return false;
          if (seen.has(bm.userId)) return false;
          if (blockedUserIds.has(bm.userId)) return false;
          seen.add(bm.userId);
          return true;
        });

        const userMotoBrand = userMotos.find(bm => bm.motorcycle.brand?.toLowerCase() === brand)!;

        for (const other of compatibles) {
          const idA = userId < other.userId ? userId : other.userId;
          const idB = userId < other.userId ? other.userId : userId;
          if (acceptedBikerPairs.has(`${idA}:${idB}`)) continue;
          const isSupermatch = !!(
            userMotoBrand.motorcycle.model && other.motorcycle.model &&
            userMotoBrand.motorcycle.model.toLowerCase() === other.motorcycle.model.toLowerCase() &&
            userMotoBrand.motorcycle.motorcycleType && other.motorcycle.motorcycleType &&
            userMotoBrand.motorcycle.motorcycleType.toLowerCase() === other.motorcycle.motorcycleType.toLowerCase() &&
            userMotoBrand.motorcycle.ridingStyle && other.motorcycle.ridingStyle &&
            userMotoBrand.motorcycle.ridingStyle.toLowerCase() === other.motorcycle.ridingStyle.toLowerCase()
          );
          const inserted = await storage.createBikerBikerMatch({
            biker1Id: idA,
            biker2Id: idB,
            motorcycleBrand: userMotoBrand.motorcycle.brand,
            motorcycleModel: userMotoBrand.motorcycle.model || "",
            status: "new",
            isSupermatch,
          });
          if (inserted) bikerBikerCount++;
        }
      }
      console.log(`[MatchingForUser] biker-biker per ${userId}: ${bikerBikerCount} nuovi match`);
    }

    // 2. ZAVARRINA: biker → find zavarrine interested in user's motorcycles
    if (isBiker && userMotos.length > 0) {
      const allWishlist = await storage.getAllWishlistMotosWithUsers(matchingCountries);
      const existingKeys = await storage.getAllExistingBikerZavarrinaMatchKeys();

      for (const moto of userMotos) {
        const bike = moto.motorcycle;
        if (!bike.id) continue;

        for (const wm of allWishlist) {
          if (wm.userId === userId) continue;
          const wish = wm.wishlistMoto;

          let compatible = false;
          if (wish.brand && bike.brand && wish.brand.toLowerCase() === bike.brand.toLowerCase()) {
            compatible = true;
          } else if (!wish.brand && wish.motorcycleType && bike.motorcycleType &&
                     wish.motorcycleType.toLowerCase() === bike.motorcycleType.toLowerCase()) {
            compatible = true;
          }
          if (!compatible) continue;

          const key = `${userId}:${wm.userId}:${bike.id}:${wish.id}`;
          if (existingKeys.has(key)) continue;

          const isSupermatch = !!(
            wish.brand && bike.brand && wish.brand.toLowerCase() === bike.brand.toLowerCase() &&
            wish.model && bike.model && wish.model.toLowerCase() === bike.model.toLowerCase() &&
            wish.motorcycleType && bike.motorcycleType && wish.motorcycleType.toLowerCase() === bike.motorcycleType.toLowerCase() &&
            wish.ridingStyle && bike.ridingStyle && wish.ridingStyle.toLowerCase() === bike.ridingStyle.toLowerCase()
          );

          const inserted = await storage.createMatch({
            bikerId: userId,
            zavarrinaId: wm.userId,
            bikerMotorcycleId: bike.id,
            wishlistMotoId: wish.id,
            status: "new",
            isSupermatch,
          });
          if (inserted) { existingKeys.add(key); zavarrinaCount++; }
          else existingKeys.add(key);
        }
      }
    }

    // 3. ZAVARRINA: zavarrina → find bikers with motorcycles matching user's wishlist
    if (isZavarrina) {
      const allWishlist = await storage.getAllWishlistMotosWithUsers(matchingCountries);
      const userWishes = allWishlist.filter(wm => wm.userId === userId);

      if (userWishes.length > 0) {
        const existingKeys = await storage.getAllExistingBikerZavarrinaMatchKeys();
        for (const wm of userWishes) {
          const wish = wm.wishlistMoto;
          for (const bm of allBikerMotos) {
            if (bm.userId === userId) continue;
            const bike = bm.motorcycle;

            let compatible = false;
            if (wish.brand && bike.brand && wish.brand.toLowerCase() === bike.brand.toLowerCase()) {
              compatible = true;
            } else if (!wish.brand && wish.motorcycleType && bike.motorcycleType &&
                       wish.motorcycleType.toLowerCase() === bike.motorcycleType.toLowerCase()) {
              compatible = true;
            }
            if (!compatible) continue;

            const key = `${bm.userId}:${userId}:${bike.id}:${wish.id}`;
            if (existingKeys.has(key)) continue;

            const isSupermatch = !!(
              wish.brand && bike.brand && wish.brand.toLowerCase() === bike.brand.toLowerCase() &&
              wish.model && bike.model && wish.model.toLowerCase() === bike.model.toLowerCase() &&
              wish.motorcycleType && bike.motorcycleType && wish.motorcycleType.toLowerCase() === bike.motorcycleType.toLowerCase() &&
              wish.ridingStyle && bike.ridingStyle && wish.ridingStyle.toLowerCase() === bike.ridingStyle.toLowerCase()
            );

            const inserted2 = await storage.createMatch({
              bikerId: bm.userId,
              zavarrinaId: userId,
              bikerMotorcycleId: bike.id,
              wishlistMotoId: wish.id,
              status: "new",
              isSupermatch,
            });
            if (inserted2) { existingKeys.add(key); zavarrinaCount++; }
            else existingKeys.add(key);
          }
        }
      }
    }

    console.log(`[MatchingForUser] userId ${userId}: ${bikerBikerCount} bb + ${zavarrinaCount} zav nuovi match`);
    return { bikerBiker: bikerBikerCount, zavarrina: zavarrinaCount };
  } catch (error) {
    console.error("[MatchingForUser] error:", error);
    return { bikerBiker: 0, zavarrina: 0 };
  }
}

export async function runProposalMatchingForUser(userId: string): Promise<number> {
  try {
    const activeProposals = await storage.getActiveProposalsWithLocation();
    const userProposals = activeProposals.filter(p => p.userId === userId);
    if (userProposals.length === 0) return 0;

    const existingKeys = await storage.getAllExistingProposalMatchKeys();
    // Task #1124 vuln 2: same club-membership prefetch as runMatching().
    // Prevents the on-demand /api/matching/trigger path from creating
    // matches that cross the club boundary.
    const clubProposals = activeProposals.filter((p) => !!p.clubId);
    const clubUserIds = [...new Set(clubProposals.map((p) => p.userId))];
    const clubIds = [...new Set(clubProposals.map((p) => p.clubId as string))];
    const membershipKeys = await getActiveClubMembershipKeys(clubUserIds, clubIds);
    let matchCount = 0;

    for (const up of userProposals) {
      for (const other of activeProposals) {
        if (other.userId === userId) continue;
        if (!areCompatible(up, other)) continue;
        if (!clubScopeAllows(up, other, membershipKeys)) continue;

        const p1Id = up.id < other.id ? up.id : other.id;
        const p2Id = up.id < other.id ? other.id : up.id;
        if (existingKeys.has(`${p1Id}:${p2Id}`)) continue;

        const p1 = up.id < other.id ? up : other;
        const p2 = up.id < other.id ? other : up;

        const newMatch = await storage.createProposalMatch({
          proposalId1: p1.id,
          proposalId2: p2.id,
          userId1: p1.userId,
          userId2: p2.userId,
          status: "pending",
          acceptedByUser1: false,
          acceptedByUser2: false,
        });

        existingKeys.add(`${p1Id}:${p2Id}`);
        existingKeys.add(`${p2Id}:${p1Id}`);
        matchCount++;

        try {
          await storage.createNotification({
            userId: p1.userId,
            title: "New proposal match found!",
            body: "A compatible proposal has been found for your trip.",
            notificationType: "proposal_match",
            referenceType: "proposal_match",
            referenceId: newMatch.id,
          });
          await storage.createNotification({
            userId: p2.userId,
            title: "New proposal match found!",
            body: "A compatible proposal has been found for your trip.",
            notificationType: "proposal_match",
            referenceType: "proposal_match",
            referenceId: newMatch.id,
          });
        } catch (notifErr) {
          console.error("[ProposalMatchingForUser] Error sending match notifications:", notifErr);
        }
      }
    }

    console.log(`[ProposalMatchingForUser] userId ${userId}: ${matchCount} nuovi match proposta`);
    return matchCount;
  } catch (error) {
    console.error("[ProposalMatchingForUser] error:", error);
    return 0;
  }
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

async function runFakeZavorrineRotation(): Promise<void> {
  try {
    await storage.toggleFakeZavorrineAvailability();
  } catch (error) {
    console.error("Fake zavorrine rotation error:", error);
  }
}

interface MatchingCycleMeta {
  completedAt: string;
  durationMs: number;
  zavarrinaMatchesNew: number;
  bikerBikerMatchesNew: number;
}

let lastCycleMeta: MatchingCycleMeta | null = null;
let lastMatchingRunAt: number = 0;
let isMatchingRunning: boolean = false;

const DEBOUNCE_MS = 5 * 60 * 1000;

export function getLastMatchingCycleMeta(): MatchingCycleMeta | null {
  return lastCycleMeta;
}

export function triggerMatchingRun(): { started: boolean; reason?: string } {
  const now = Date.now();

  if (isMatchingRunning) {
    return { started: false, reason: "already_running" };
  }

  if (now - lastMatchingRunAt < DEBOUNCE_MS) {
    const secondsAgo = Math.round((now - lastMatchingRunAt) / 1000);
    return { started: false, reason: `debounced (last run ${secondsAgo}s ago, min interval ${DEBOUNCE_MS / 1000}s)` };
  }

  isMatchingRunning = true;
  lastMatchingRunAt = now;

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

export function stopMatchingEngine(): void {
  for (const t of _engineTimers) clearInterval(t);
  _engineTimers.length = 0;
  console.log("[Matching] Engine fermato (graceful shutdown)");
}
