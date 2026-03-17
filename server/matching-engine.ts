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

    if (wishlistMotos.length === 0 || bikerMotorcycles.length === 0) return 0;

    const existingKeys = await storage.getAllExistingBikerZavarrinaMatchKeys();
    let matchCount = 0;

    for (const wm of wishlistMotos) {
      const zavarrinaId = wm.userId;
      const wish = wm.wishlistMoto;

      for (const bm of bikerMotorcycles) {
        const bikerId = bm.userId;
        const moto = bm.motorcycle;

        if (bikerId === zavarrinaId) continue;

        let compatible = false;

        if (wish.brand && wish.model) {
          // Wish specifica marca + modello: devono combaciare entrambi
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
          // Wish specifica solo marca: basta che la marca combaci
          if (moto.brand && wish.brand.toLowerCase() === moto.brand.toLowerCase()) {
            compatible = true;
          }
        } else if (wish.motorcycleType) {
          // Wish specifica solo tipo moto: basta che il tipo combaci
          if (moto.motorcycleType && wish.motorcycleType.toLowerCase() === moto.motorcycleType.toLowerCase()) {
            compatible = true;
          }
        }

        if (!compatible) continue;

        const key = `${bikerId}:${zavarrinaId}:${moto.id}:${wish.id}`;
        if (existingKeys.has(key)) continue;

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

    return matchCount;
  } catch (error) {
    console.error("Wishlist matching error:", error);
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

const BASE_INTERVAL_MS = 60 * 1000;
const MAX_INTERVAL_MS = 16 * 60 * 1000;
const LOAD_THRESHOLD = 0.85;

let currentIntervalMs = BASE_INTERVAL_MS;
let adminNotifiedAt = 0;

async function notifyAdminOverload(intervalSec: number, cycleDurationSec: number): Promise<void> {
  const now = Date.now();
  if (now - adminNotifiedAt < 30 * 60 * 1000) return;

  try {
    const adminUser = await storage.getUserByNickname("admin");
    if (!adminUser) return;

    await storage.createNotification({
      userId: adminUser.id,
      title: "Matching Engine sotto carico",
      body: `Il ciclo di matching ha impiegato ${cycleDurationSec.toFixed(1)}s. L'intervallo è stato raddoppiato a ${intervalSec}s. È tempo di implementare una soluzione per i troppi calcoli!`,
      notificationType: "system",
      referenceType: "system",
      referenceId: "matching-engine",
    });

    adminNotifiedAt = now;
    console.warn(`[Matching] Notifica inviata all'admin: intervallo raddoppiato a ${intervalSec}s`);
  } catch (err) {
    console.error("[Matching] Errore invio notifica admin:", err);
  }
}

export function startMatchingEngine(): void {
  console.log(`Matching engine started (${currentIntervalMs / 1000}s interval)`);

  const run = async () => {
    const cycleStart = Date.now();

    const expired = await runCleanup();
    if (expired > 0) console.log(`Expired ${expired} proposals`);

    try {
      const deleted = await storage.deleteExpiredProposals();
      if (deleted > 0) console.log(`Deleted ${deleted} expired proposals`);
    } catch (err) {
      console.error("Error deleting expired proposals:", err);
    }

    const autoMatchSetting = await storage.getAppSetting("auto_matching_enabled");
    const autoMatchEnabled = autoMatchSetting?.value !== "false";

    if (autoMatchEnabled) {
      const matches = await runMatching();
      if (matches > 0) console.log(`Found ${matches} new proposal matches`);

      const garageMatches = await runWishlistMatching();
      if (garageMatches > 0) console.log(`Found ${garageMatches} new garage matches`);
    } else {
      console.log("Auto matching disabled by admin, skipping");
    }

    const cycleDuration = Date.now() - cycleStart;
    const loadRatio = cycleDuration / currentIntervalMs;

    console.log(`[Matching] Ciclo completato in ${(cycleDuration / 1000).toFixed(1)}s (${(loadRatio * 100).toFixed(0)}% dell'intervallo di ${currentIntervalMs / 1000}s)`);

    if (loadRatio > LOAD_THRESHOLD && currentIntervalMs < MAX_INTERVAL_MS) {
      const oldInterval = currentIntervalMs;
      currentIntervalMs = Math.min(currentIntervalMs * 2, MAX_INTERVAL_MS);
      console.warn(`[Matching] CARICO ELEVATO: ciclo ${(cycleDuration / 1000).toFixed(1)}s > 85% di ${oldInterval / 1000}s. Intervallo raddoppiato a ${currentIntervalMs / 1000}s`);
      await notifyAdminOverload(currentIntervalMs / 1000, cycleDuration / 1000);
    } else if (loadRatio < 0.3 && currentIntervalMs > BASE_INTERVAL_MS) {
      currentIntervalMs = Math.max(currentIntervalMs / 2, BASE_INTERVAL_MS);
      console.log(`[Matching] Carico basso: intervallo ridotto a ${currentIntervalMs / 1000}s`);
    }

    scheduleNext();
  };

  const scheduleNext = () => {
    setTimeout(run, currentIntervalMs);
  };

  run();

  runFakeZavorrineRotation();
  setInterval(runFakeZavorrineRotation, 5 * 60 * 1000);
  console.log("Fake zavorrine availability rotation started (5min interval)");
}
