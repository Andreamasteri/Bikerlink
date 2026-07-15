/**
 * Task #47 — DR correction engine: GPS-recovery distance-accounting integration test.
 *
 * Regression guard for the "recovery-window undercount" bug: when GPS returns after
 * a blackout the recovery is only trusted after RECOVERY_FIXES_REQUIRED coherent
 * fixes. Distance accumulation MUST stay continuous across that multi-fix wait —
 * neither the dead-reckoning path nor the GPS-segment path may drop the movement
 * that happens between the first usable recovery fix and confirmation.
 *
 * The bug was that onNativeLocation marked GPS "fresh" (lastUsableFixMsRef) on the
 * FIRST recovery fix, which flips the fusion loop out of sensors_only (stopping DR)
 * while the GPS segment path is still bypassed (drGapKm>0) until confirmation — so
 * the recovery-window movement was counted by NEITHER path.
 *
 * Strategy: drive the REAL onNativeLocation with a mock ref graph, and run a
 * faithful re-implementation of the production fusion sensors_only step that reads
 * `lastUsableFixMsRef` the same way the real fusion timer does. If onNativeLocation
 * marks GPS fresh too early, the simulated DR loop stops and the asserted total is
 * short — exactly the regression we guard against.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeDestinationPoint, haversineKm, TRACKING_FUSION } from "@shared/tracking-fusion";
import { RECOVERY_FIXES_REQUIRED } from "@shared/dr-correction";

// Native shims: useTrackingEffects imports RN + expo-location at module scope. The
// test only drives the pure onNativeLocation closure, so stub them out.
vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
  Animated: { timing: vi.fn(), sequence: vi.fn(), delay: vi.fn(), Value: vi.fn() },
}));
vi.mock("expo-location", () => ({
  startLocationUpdatesAsync: vi.fn(), stopLocationUpdatesAsync: vi.fn(),
  Accuracy: { Balanced: 3, High: 4, BestForNavigation: 6 },
  ActivityType: { AutomotiveNavigation: 3 },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), removeMany: vi.fn(() => Promise.resolve()), getAllKeys: vi.fn(() => Promise.resolve([])) },
}));

const reportDrDeviation = vi.fn();
vi.mock("@/lib/dr-deviation-uploader", () => ({ reportDrDeviation: (s: unknown) => reportDrDeviation(s) }));
vi.mock("@/lib/query-client", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/crash-logger", () => ({ markAsyncError: vi.fn(() => Promise.resolve()) }));
vi.mock("@/hooks/useMapTelemetry", () => ({ emitMapsTelemetry: vi.fn() }));
vi.mock("@/lib/tracking-active", () => ({ setHandsOffBroadcast: vi.fn(), setSprintMeasuringBroadcast: vi.fn() }));
vi.mock("@/lib/gps-logger", () => ({ logGpsError: vi.fn() }));

import { useOnNativeLocation } from "@/hooks/tracking/useTrackingEffects";

const ANCHOR_LAT = 45.4642;
const ANCHOR_LNG = 9.19;
const HEADING = 90; // due east
const DR_SPEED_KMH = 60;

function ref<T>(current: T) { return { current }; }

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeDeps() {
  const gps = {
    emaSpeedRef: ref(DR_SPEED_KMH),
    setCurrentSpeed: vi.fn(), setGpsAccuracy: vi.fn(), setCurrentCoord: vi.fn(),
    lastAccuracyRef: ref<number | null>(null),
    lastGpsEventMsRef: ref(0),
    lastUsableFixMsRef: ref(0),
    gpsFixAcquiredRef: ref(true), setGpsFixAcquired: vi.fn(),
    lastPosRef: ref<{ lat: number; lng: number; time: number } | null>(null),
    drGapKmRef: ref(0),
    drRecoveryPendingRef: ref<any>(null),
    drSpeedKmhRef: ref(DR_SPEED_KMH),
    totalKmRef: ref(0), setTotalKm: vi.fn(),
    mapCoordsRef: ref<any[]>([]), setMapCoords: vi.fn(),
    maxSpeedRef: ref(0), setMaxSpeed: vi.fn(),
    maxAltRef: ref(-Infinity), setMaxAltitude: vi.fn(),
    divergenceCountRef: ref(0),
    fusionModeRef: ref("gps_sensors"),
  };
  const refs = {
    drEstPosRef: ref<{ lat: number; lon: number } | null>(null),
    routeIdRef: ref<string | null>("route-1"),
    headingRef: ref(HEADING),
    pointsBufferRef: ref<any[]>([]),
    telemetryAccumRef: ref<any[]>([]),
    drCorrectionRef: ref({ distanceScale: 1 }),
  };
  const sensors = {
    currentAccelGRef: ref(0), currentTiltDegRef: ref(0),
    sensorSourceRef: ref("accel"), linearAccelFwdRef: ref(0),
  };
  const deps: any = {
    t: (k: string) => k, gps, sensors, refs,
    sprint: { sprintPhaseRef: ref("idle"), sprintStartTimeRef: ref(0), setSprintPhase: vi.fn(), sprint0to100MsRef: ref(0), setSprint0to100Ms: vi.fn() },
    bg: { bgTrackingActiveRef: ref(false), bgPointsCountRef: ref(0) },
    session: { phaseRef: ref("active") },
    stats: { isPausedRef: ref(false), isIdleRef: ref(false), idleStartRef: ref<number | null>(null), idleMsRef: ref(0), setPointsBuffered: vi.fn() },
    settings: { is0100EnabledRef: ref(false), showMyRoute: false, sensorsEnabledRef: ref(true), handsOffEnabledRef: ref(false), handsOffSpeedRef: ref(999) },
    handsOffActive: false, setHandsOffActive: vi.fn(), setVolumeUI: vi.fn(),
    totalGpsPointsRef: ref(0),
    lastLowAccuracyTelemetryRef: ref(0),
    handsOffDismissedForRideRef: ref(false),
  };
  return deps;
}

/** Faithful re-implementation of the production fusion sensors_only step (useTrackingState). */
function fusionTick(deps: any, nowMs: number, dtSec: number) {
  const { gps, refs, sensors, settings } = deps;
  const lastFix = gps.lastUsableFixMsRef.current || 0;
  const gpsFresh = gps.gpsFixAcquiredRef.current && lastFix > 0 && nowMs - lastFix < TRACKING_FUSION.GPS_STALE_MS;
  const sensorsActive = settings.sensorsEnabledRef.current && sensors.sensorSourceRef.current !== "none";
  const mode = gpsFresh ? "gps_sensors" : sensorsActive ? "sensors_only" : "gps_only";
  if (mode !== "sensors_only") { refs.drEstPosRef.current = null; return; }
  const rawDistKm = (gps.drSpeedKmhRef.current / 3600) * dtSec;
  const distanceScale = refs.drCorrectionRef?.current?.distanceScale ?? 1;
  const distKm = rawDistKm * distanceScale;
  if (rawDistKm > 0) {
    gps.totalKmRef.current += distKm;
    gps.drGapKmRef.current += rawDistKm;
  }
  const base = refs.drEstPosRef.current ?? (gps.lastPosRef.current ? { lat: gps.lastPosRef.current.lat, lon: gps.lastPosRef.current.lng } : null);
  if (base && distKm > 0) {
    const next = computeDestinationPoint(base.lat, base.lon, distKm, refs.headingRef.current);
    refs.drEstPosRef.current = { lat: next.lat, lon: next.lng };
  }
}

function usableFix(deps: any, onLoc: (l: any) => void, nowMs: number, lat: number, lng: number) {
  onLoc({ coords: { latitude: lat, longitude: lng, altitude: 0, speed: DR_SPEED_KMH / 3.6, accuracy: 8, heading: HEADING }, timestamp: nowMs });
}

describe("useOnNativeLocation — GPS-recovery distance accounting (Task #47)", () => {
  beforeEach(() => reportDrDeviation.mockClear());

  it("keeps distance continuous across the multi-fix recovery wait (no undercount, no double count)", () => {
    const deps = makeDeps();
    const onLoc = useOnNativeLocation(deps);
    const { gps, refs } = deps;

    // Pre-blackout: a solid GPS anchor exists and GPS is fresh.
    let now = 1_700_000_000_000;
    gps.lastPosRef.current = { lat: ANCHOR_LAT, lng: ANCHOR_LNG, time: now };
    gps.lastUsableFixMsRef.current = now;

    // ── Blackout: 10 s of dead reckoning at 60 km/h (GPS stale) ──────────────
    now += TRACKING_FUSION.GPS_STALE_MS + 1000; // ensure gpsFresh=false
    const BLACKOUT_TICKS = 10;
    for (let i = 0; i < BLACKOUT_TICKS; i++) { now += 1000; fusionTick(deps, now, 1); }
    const gapAfterBlackout = gps.drGapKmRef.current;
    const totalAfterBlackout = gps.totalKmRef.current;
    expect(gapAfterBlackout).toBeGreaterThan(0);

    // ── Recovery: N coherent usable fixes, with a DR tick BETWEEN each ────────
    // Position the recovery fixes along the true (eastward) path near the DR est.
    let drEndLng = refs.drEstPosRef.current!.lon;
    let recoveryTicks = 0;
    for (let f = 1; f <= RECOVERY_FIXES_REQUIRED; f++) {
      now += 1000;
      // fix lands ~1 s of travel further east (coherent, plausible speed)
      const fixDest = computeDestinationPoint(ANCHOR_LAT, drEndLng, (DR_SPEED_KMH / 3600) * 1, HEADING);
      drEndLng = fixDest.lng;
      usableFix(deps, onLoc, now, fixDest.lat, fixDest.lng);
      if (f < RECOVERY_FIXES_REQUIRED) {
        // Before confirmation the fusion loop MUST still be in sensors_only:
        // lastUsableFixMsRef must NOT have advanced to this recovery fix.
        expect(gps.lastUsableFixMsRef.current).toBeLessThan(now);
        expect(gps.drGapKmRef.current).toBeGreaterThan(0); // gap not yet reconciled
        // DR keeps accumulating during the wait.
        now += 1000; fusionTick(deps, now, 1); recoveryTicks++;
      }
    }

    // ── Confirmation happened on the last fix ────────────────────────────────
    // Deviation reported exactly once, with the FULL accumulated gap (blackout +
    // recovery-window DR), proving fresh-at-confirmation reads (not a stale snapshot).
    expect(reportDrDeviation).toHaveBeenCalledTimes(1);
    const sample = reportDrDeviation.mock.calls[0][0];
    const expectedGap = (DR_SPEED_KMH / 3600) * (BLACKOUT_TICKS + recoveryTicks);
    expect(sample.drDistanceKm).toBeCloseTo(expectedGap, 6);
    expect(sample.recoveryFixCount).toBe(RECOVERY_FIXES_REQUIRED);
    expect(sample.gpsDistanceKm).toBeGreaterThan(0);

    // Gap reconciled to zero and GPS marked fresh again for fusion.
    expect(gps.drGapKmRef.current).toBe(0);
    expect(gps.lastUsableFixMsRef.current).toBe(now);

    // ── No distance lost: live total == all DR distance accumulated, and NO GPS
    // bridging segment was added during recovery (no double count). ───────────
    const expectedTotal = (DR_SPEED_KMH / 3600) * (BLACKOUT_TICKS + recoveryTicks);
    expect(gps.totalKmRef.current).toBeCloseTo(expectedTotal, 6);
    // The recovery-window DR distance (post-blackout) is fully retained.
    expect(gps.totalKmRef.current).toBeGreaterThan(totalAfterBlackout);

    // ── Forward correctness: with the gap cleared, the next GPS fix resumes the
    // normal segment path from the reseeded anchor (adds real GPS distance). ──
    const beforeForward = gps.totalKmRef.current;
    now += 10_000;
    const fwd = computeDestinationPoint(gps.lastPosRef.current!.lat, gps.lastPosRef.current!.lng, 0.1, HEADING);
    usableFix(deps, onLoc, now, fwd.lat, fwd.lng);
    const added = gps.totalKmRef.current - beforeForward;
    expect(added).toBeGreaterThan(0);
    expect(added).toBeCloseTo(haversineKm(gps.lastPosRef.current!.lat, gps.lastPosRef.current!.lng, fwd.lat, fwd.lng) === 0 ? added : 0.1, 2);
  });

  it("a single recovery fix alone does NOT confirm (no premature reconciliation)", () => {
    const deps = makeDeps();
    const onLoc = useOnNativeLocation(deps);
    const { gps } = deps;
    let now = 1_700_000_000_000;
    gps.lastPosRef.current = { lat: ANCHOR_LAT, lng: ANCHOR_LNG, time: now };
    gps.lastUsableFixMsRef.current = now;
    gps.drGapKmRef.current = 0.2; // simulate DR having covered a blackout

    now += TRACKING_FUSION.GPS_STALE_MS + 5000;
    const dest = computeDestinationPoint(ANCHOR_LAT, ANCHOR_LNG, 0.19, HEADING);
    usableFix(deps, onLoc, now, dest.lat, dest.lng);

    // One fix: pending created, but NOT confirmed → gap intact, GPS still stale.
    expect(reportDrDeviation).not.toHaveBeenCalled();
    expect(gps.drGapKmRef.current).toBeCloseTo(0.2, 6);
    expect(gps.drRecoveryPendingRef.current?.fixCount).toBe(1);
    expect(gps.lastUsableFixMsRef.current).toBeLessThan(now);
  });

  it("an incoherent (jumpy) recovery fix resets the streak", () => {
    const deps = makeDeps();
    const onLoc = useOnNativeLocation(deps);
    const { gps } = deps;
    let now = 1_700_000_000_000;
    gps.lastPosRef.current = { lat: ANCHOR_LAT, lng: ANCHOR_LNG, time: now };
    gps.lastUsableFixMsRef.current = now;
    gps.drGapKmRef.current = 0.2;
    now += TRACKING_FUSION.GPS_STALE_MS + 5000;

    // Fix 1 — establishes streak.
    const d1 = computeDestinationPoint(ANCHOR_LAT, ANCHOR_LNG, 0.19, HEADING);
    now += 1000; usableFix(deps, onLoc, now, d1.lat, d1.lng);
    expect(gps.drRecoveryPendingRef.current?.fixCount).toBe(1);

    // Fix 2 — a wild jump (hundreds of km in 1 s) → implausible → streak resets to 1.
    const jump = computeDestinationPoint(ANCHOR_LAT, ANCHOR_LNG, 500, HEADING);
    now += 1000; usableFix(deps, onLoc, now, jump.lat, jump.lng);
    expect(gps.drRecoveryPendingRef.current?.fixCount).toBe(1);
    expect(reportDrDeviation).not.toHaveBeenCalled();
    expect(gps.drGapKmRef.current).toBeCloseTo(0.2, 6);
  });
});
