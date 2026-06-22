import { Router } from "express";
import { storage } from "../storage";
import { haversineKm } from "../geo";
import { users } from "@shared/db";
import profileRouter from "./users/profile";
import discoveryRouter from "./users/discovery";
import discoveryNextRouter from "./users/discovery.next";
import actionsRouter from "./users/actions";
import miscRouter from "./users/misc";

const router = Router();

// Re-exporting helpers needed by sub-routers to avoid duplication or complex imports
export function applyPositionFuzz(lat: number, lng: number, radiusKm: number): { lat: number; lng: number } {
  const R = 6371;
  const r = radiusKm * Math.sqrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;
  const dlat = (r / R) * (180 / Math.PI);
  const dlng = dlat / Math.cos((lat * Math.PI) / 180);
  return { lat: lat + dlat * Math.sin(theta), lng: lng + dlng * Math.cos(theta) };
}

export function fuzzedCoordsForViewer(
  lat: number | null | undefined,
  lng: number | null | undefined,
  profile: { positionFuzz?: boolean | null; positionFuzzKm?: number | null } | null | undefined,
  isOwner: boolean
): { latitude: number | null; longitude: number | null } {
  if (lat == null || lng == null) return { latitude: null, longitude: null };
  if (!isOwner && profile?.positionFuzz && (profile.positionFuzzKm ?? 0) > 0) {
    const fuzzed = applyPositionFuzz(lat, lng, profile.positionFuzzKm ?? 1);
    return { latitude: fuzzed.lat, longitude: fuzzed.lng };
  }
  return { latitude: lat, longitude: lng };
}

export function isPositionFuzzed(profile: { positionFuzz?: boolean | null; positionFuzzKm?: number | null } | null | undefined, isOwner: boolean): boolean {
  if (isOwner) return false;
  return !!(profile?.positionFuzz && (profile?.positionFuzzKm ?? 0) > 0);
}

export function applyFakeZones(
  lat: number,
  lng: number,
  profile: { fakeHomeEnabled?: boolean | null; homeLatitude?: number | null; homeLongitude?: number | null; fakeHomeLatitude?: number | null; fakeHomeLongitude?: number | null; fakeHomeRadiusKm?: number | null; fakeHomeRadius?: number | null; fakeWorkEnabled?: boolean | null; workLatitude?: number | null; workLongitude?: number | null; fakeWorkLatitude?: number | null; fakeWorkLongitude?: number | null; fakeWorkRadiusKm?: number | null; fakeWorkRadius?: number | null; fakeWhateverEnabled?: boolean | null; whateverLatitude?: number | null; whateverLongitude?: number | null; fakeWhateverLatitude?: number | null; fakeWhateverLongitude?: number | null; fakeWhateverRadius?: number | null } | null | undefined
): { lat: number; lng: number; applied: boolean } {
  if (profile?.fakeHomeEnabled &&
      profile.homeLatitude != null && profile.homeLongitude != null &&
      profile.fakeHomeLatitude != null && profile.fakeHomeLongitude != null) {
    const dist = haversineKm(lat, lng, profile.homeLatitude, profile.homeLongitude);
    if (dist <= (profile.fakeHomeRadius ?? 2)) {
      return { lat: profile.fakeHomeLatitude, lng: profile.fakeHomeLongitude, applied: true };
    }
  }
  if (profile?.fakeWorkEnabled &&
      profile.workLatitude != null && profile.workLongitude != null &&
      profile.fakeWorkLatitude != null && profile.fakeWorkLongitude != null) {
    const dist = haversineKm(lat, lng, profile.workLatitude, profile.workLongitude);
    if (dist <= (profile.fakeWorkRadius ?? 2)) {
      return { lat: profile.fakeWorkLatitude, lng: profile.fakeWorkLongitude, applied: true };
    }
  }
  if (profile?.fakeWhateverEnabled &&
      profile.whateverLatitude != null && profile.whateverLongitude != null &&
      profile.fakeWhateverLatitude != null && profile.fakeWhateverLongitude != null) {
    const dist = haversineKm(lat, lng, profile.whateverLatitude, profile.whateverLongitude);
    if (dist <= (profile.fakeWhateverRadius ?? 2)) {
      return { lat: profile.fakeWhateverLatitude, lng: profile.fakeWhateverLongitude, applied: true };
    }
  }
  return { lat, lng, applied: false };
}

export async function captureFirstAvailabilityLocation(
  userId: string,
  requestLat?: number | null,
  requestLng?: number | null,
  profileLat?: number | null,
  profileLng?: number | null
): Promise<void> {
  try {
    const currentUser = await storage.getUser(userId);
    if (!currentUser || (currentUser.firstLoginLat !== null && currentUser.firstLoginLng !== null)) return;
    const resolvedLat = requestLat ?? profileLat;
    const resolvedLng = requestLng ?? profileLng;
    if (typeof resolvedLat !== "number" || typeof resolvedLng !== "number") return;
    await storage.updateUser(userId, {
      firstLoginLat: resolvedLat,
      firstLoginLng: resolvedLng,
    });
  } catch (err) {
    console.warn("[captureFirstAvailabilityLocation] fallita:", err);
  }
} 

export function systemAccountConditions(usersTable: typeof users) {
  const { systemAccountConditions: baseConditions } = require("../lib/system-account-filter");
  return baseConditions(usersTable);
}

export const _discoveryCapabilities = {
  mapFilterKey: "map_visibility_filter" as const,
  coordTransforms: [fuzzedCoordsForViewer, fuzzedCoordsForViewer, fuzzedCoordsForViewer, fuzzedCoordsForViewer],
};

// Sub-routers
router.use("/", profileRouter);
router.use("/", discoveryRouter);
router.use("/", discoveryNextRouter);
router.use("/", actionsRouter);
router.use("/", miscRouter);

export default router;
