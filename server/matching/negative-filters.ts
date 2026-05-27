import { db } from "../db";
import {
  matchNegativePreferences,
  users,
  userMotorcycles,
  userPhotos,
  type MatchNegativePreference,
} from "@shared/db";
import { inArray } from "drizzle-orm";
import { haversineDistance } from "../geo";

export type NegativePrefsMap = Map<string, MatchNegativePreference[]>;

export interface CandidateProfile {
  userId: string;
  userType: string | null;
  birthYear: number | null;
  region: string | null;
  emailVerified: boolean;
  hasPhoto: boolean;
  bikeTypes: string[];
  lat?: number | null;
  lng?: number | null;
}

export async function loadNegativePreferencesMap(userIds?: string[]): Promise<NegativePrefsMap> {
  const rows = userIds && userIds.length > 0
    ? await db.select().from(matchNegativePreferences).where(inArray(matchNegativePreferences.userId, userIds))
    : await db.select().from(matchNegativePreferences);
  const map: NegativePrefsMap = new Map();
  for (const r of rows) {
    const arr = map.get(r.userId) ?? [];
    arr.push(r);
    map.set(r.userId, arr);
  }
  return map;
}

export async function loadCandidateProfiles(userIds: string[]): Promise<Map<string, CandidateProfile>> {
  if (userIds.length === 0) return new Map();
  const userRows = await db
    .select({
      id: users.id,
      userType: users.userType,
      birthYear: users.birthYear,
      region: users.region,
      emailVerified: users.emailVerified,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  const photoRows = await db
    .select({ userId: userPhotos.userId })
    .from(userPhotos)
    .where(inArray(userPhotos.userId, userIds));
  const photoSet = new Set(photoRows.map((r) => r.userId));

  const motoRows = await db
    .select({ userId: userMotorcycles.userId, motorcycleType: userMotorcycles.motorcycleType })
    .from(userMotorcycles)
    .where(inArray(userMotorcycles.userId, userIds));
  const motoMap = new Map<string, string[]>();
  for (const m of motoRows) {
    if (!m.motorcycleType) continue;
    const arr = motoMap.get(m.userId) ?? [];
    arr.push(m.motorcycleType.toLowerCase());
    motoMap.set(m.userId, arr);
  }

  const map = new Map<string, CandidateProfile>();
  for (const u of userRows) {
    map.set(u.id, {
      userId: u.id,
      userType: u.userType,
      birthYear: u.birthYear,
      region: u.region,
      emailVerified: u.emailVerified,
      hasPhoto: photoSet.has(u.id) || !!u.avatarUrl,
      bikeTypes: motoMap.get(u.id) ?? [],
    });
  }
  return map;
}

/**
 * Check if candidate is excluded by user's negative preferences.
 * Returns null if allowed, or a string with the reason if excluded.
 */
export function isExcludedByNegativePrefs(
  prefs: MatchNegativePreference[] | undefined,
  candidate: CandidateProfile | undefined,
  observerLatLng?: { lat: number; lng: number; candidateLat?: number | null; candidateLng?: number | null },
): string | null {
  if (!prefs || prefs.length === 0 || !candidate) return null;
  const currentYear = new Date().getFullYear();
  for (const p of prefs) {
    const v = p.value as Record<string, unknown>;
    switch (p.kind) {
      case "bike_type": {
        const t = String(v.type ?? "").toLowerCase();
        if (t && candidate.bikeTypes.includes(t)) return `bike_type:${t}`;
        break;
      }
      case "age_range": {
        if (!candidate.birthYear) break;
        const age = currentYear - candidate.birthYear;
        const min = typeof v.min === "number" ? v.min : undefined;
        const max = typeof v.max === "number" ? v.max : undefined;
        if (min !== undefined && age < min) return `age_below:${min}`;
        if (max !== undefined && age > max) return `age_above:${max}`;
        break;
      }
      case "max_distance": {
        if (!observerLatLng || observerLatLng.candidateLat == null || observerLatLng.candidateLng == null) break;
        const km = Number(v.km);
        if (!Number.isFinite(km)) break;
        const dist = haversineDistance(
          observerLatLng.lat,
          observerLatLng.lng,
          observerLatLng.candidateLat,
          observerLatLng.candidateLng,
        );
        if (dist > km) return `distance>${km}`;
        break;
      }
      case "requires_photo": {
        if (v.enabled && !candidate.hasPhoto) return "no_photo";
        break;
      }
      case "requires_verified": {
        if (v.enabled && !candidate.emailVerified) return "not_verified";
        break;
      }
      case "exclude_user_type": {
        const ut = String(v.userType ?? "").toLowerCase();
        if (ut && (candidate.userType ?? "").toLowerCase() === ut) return `user_type:${ut}`;
        break;
      }
      case "exclude_region": {
        const r = String(v.region ?? "").toLowerCase();
        if (r && (candidate.region ?? "").toLowerCase() === r) return `region:${r}`;
        break;
      }
    }
  }
  return null;
}

/**
 * Build a Set of `userId:candidateId` pairs that should be excluded based on
 * negative preferences for the given observer userIds against the candidate pool.
 * Pure pre-scoring filter — fast, in-memory, no scoring required.
 */
export async function buildNegativeExcludeSet(
  observerIds: string[],
  candidateIds: string[],
): Promise<Set<string>> {
  const prefsMap = await loadNegativePreferencesMap(observerIds);
  if (prefsMap.size === 0) return new Set();
  const candidateProfiles = await loadCandidateProfiles(candidateIds);
  const out = new Set<string>();
  for (const observerId of observerIds) {
    const prefs = prefsMap.get(observerId);
    if (!prefs || prefs.length === 0) continue;
    for (const candId of candidateIds) {
      if (candId === observerId) continue;
      const cand = candidateProfiles.get(candId);
      const reason = isExcludedByNegativePrefs(prefs, cand);
      if (reason) out.add(`${observerId}:${candId}`);
    }
  }
  return out;
}
