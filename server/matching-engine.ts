import { storage } from "./storage";
import type { Proposal } from "@shared/schema";

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

  if (!p1.departureLatitude || !p1.departureLongitude || !p2.departureLatitude || !p2.departureLongitude) return false;

  const distance = haversineDistance(
    p1.departureLatitude, p1.departureLongitude,
    p2.departureLatitude, p2.departureLongitude
  );

  const radius1 = p1.searchRadius || 50;
  const radius2 = p2.searchRadius || 50;
  const maxAllowedDistance = Math.min(radius1, radius2);

  if (distance > maxAllowedDistance) return false;

  const date1 = p1.scheduledAt || p1.departureTimeFrom;
  const date2 = p2.scheduledAt || p2.departureTimeFrom;
  if (!sameDay(date1, date2)) return false;

  if (!timeRangesOverlap(p1.departureTimeFrom, p1.departureTimeTo, p2.departureTimeFrom, p2.departureTimeTo)) return false;

  return true;
}

async function runMatching(): Promise<number> {
  try {
    const activeProposals = await storage.getActiveProposalsWithLocation();
    if (activeProposals.length < 2) return 0;

    const existingKeys = await storage.getAllExistingProposalMatchKeys();
    let matchCount = 0;

    for (let i = 0; i < activeProposals.length; i++) {
      for (let j = i + 1; j < activeProposals.length; j++) {
        const p1 = activeProposals[i];
        const p2 = activeProposals[j];

        if (!areCompatible(p1, p2)) continue;

        if (existingKeys.has(`${p1.id}:${p2.id}`)) continue;

        await storage.createProposalMatch({
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
      }
    }

    return matchCount;
  } catch (error) {
    console.error("Matching engine error:", error);
    return 0;
  }
}

async function runWishlistMatching(): Promise<number> {
  try {
    const wishlistMotos = await storage.getAllWishlistMotosWithUsers();
    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers();

    console.log(`[WishlistMatching] wishlist entries: ${wishlistMotos.length}, biker motorcycles: ${bikerMotorcycles.length}`);

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

      for (const bm of bikerMotorcycles) {
        if (matchCount >= MAX_MATCHES_PER_RUN) break outer;

        const bikerId = bm.userId;
        const moto = bm.motorcycle;

        if (bikerId === zavarrinaId) continue;

        let compatible = false;

        if (wish.brand && wish.model) {
          if (
            moto.brand &&
            moto.model &&
            wish.brand.toLowerCase() === moto.brand.toLowerCase() &&
            (moto.model.toLowerCase().includes(wish.model.toLowerCase()) ||
             wish.model.toLowerCase().includes(moto.model.toLowerCase()))
          ) {
            compatible = true;
          }
        } else if (wish.brand) {
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

        await storage.createMatch({
          bikerId,
          zavarrinaId,
          bikerMotorcycleId: moto.id,
          wishlistMotoId: wish.id,
          status: "new",
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

async function runBikerBikerMatching(): Promise<number> {
  try {
    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers();
    console.log(`[BikerBikerMatching] moto biker trovate: ${bikerMotorcycles.length}`);
    if (bikerMotorcycles.length < 2) {
      console.warn("[BikerBikerMatching] WARN: meno di 2 moto biker trovate, matching impossibile");
      return 0;
    }

    const buckets = new Map<string, Array<{ userId: string; brand: string; model: string }>>();
    for (const bm of bikerMotorcycles) {
      if (!bm.motorcycle.brand || !bm.motorcycle.model) continue;
      const key = `${bm.motorcycle.brand.toLowerCase()}|${baseModelName(bm.motorcycle.model)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push({ userId: bm.userId, brand: bm.motorcycle.brand, model: bm.motorcycle.model });
    }

    const bucketsWithMultiple = [...buckets.values()].filter(m => m.length > 1);
    console.log(`[BikerBikerMatching] bucket creati: ${buckets.size}, con più di 1 membro: ${bucketsWithMultiple.length}`);
    for (const [key, members] of buckets.entries()) {
      if (members.length > 1) {
        console.log(`[BikerBikerMatching] bucket "${key}" → ${members.length} utenti`);
      }
    }

    let matchCount = 0;
    let skipCount = 0;
    const MAX_MATCHES_PER_RUN = 200;

    const shuffledBuckets = [...buckets.values()].sort(() => Math.random() - 0.5);

    for (const members of shuffledBuckets) {
      if (members.length < 2) continue;
      const uniqueMembers = members
        .filter((m, idx) => members.findIndex(x => x.userId === m.userId) === idx)
        .sort(() => Math.random() - 0.5);
      if (uniqueMembers.length < 2) continue;

      for (let i = 0; i < uniqueMembers.length && matchCount < MAX_MATCHES_PER_RUN; i++) {
        for (let j = i + 1; j < uniqueMembers.length && matchCount < MAX_MATCHES_PER_RUN; j++) {
          const m1 = uniqueMembers[i];
          const m2 = uniqueMembers[j];
          const idA = m1.userId < m2.userId ? m1.userId : m2.userId;
          const idB = m1.userId < m2.userId ? m2.userId : m1.userId;

          const inserted = await storage.createBikerBikerMatch({
            biker1Id: idA,
            biker2Id: idB,
            motorcycleBrand: m1.brand,
            motorcycleModel: m1.model,
            status: "new",
          });
          if (inserted) matchCount++;
          else skipCount++;
        }
      }

      if (matchCount >= MAX_MATCHES_PER_RUN) break;
    }

    console.log(`[BikerBikerMatching] nuovi match: ${matchCount}, saltati (già esistenti): ${skipCount}`);

    return matchCount;
  } catch (error) {
    console.error("Biker-biker matching error:", error);
    return 0;
  }
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

export function startMatchingEngine(): void {
  console.log("[Matching] Engine avviato — modalità on-demand (trigger da login utente)");

  runFakeZavorrineRotation();
  setInterval(runFakeZavorrineRotation, 5 * 60 * 1000);
  console.log("[Matching] Fake zavorrine availability rotation started (5min interval)");

  setInterval(async () => {
    try {
      const expired = await runCleanup();
      if (expired > 0) console.log(`[Cleanup] Scadute ${expired} proposte`);
      const deleted = await storage.deleteExpiredProposals();
      if (deleted > 0) console.log(`[Cleanup] Eliminate ${deleted} proposte scadute`);
    } catch (err) {
      console.error("[Cleanup] Errore pulizia oraria:", err);
    }
  }, 60 * 60 * 1000);
  console.log("[Matching] Cleanup orario proposte scadute avviato");
}
