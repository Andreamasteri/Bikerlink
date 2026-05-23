/**
 * Tests: motion-simulator physics sanity checks
 *
 * Validates that:
 *   1. applyDelta never moves a rider more than ~2 km in one 30-second cycle
 *      (highway max ≈ 1.1 km, absolute hard ceiling 2 km)
 *   2. pickSpeedProfile honours the 50/30/20 weight distribution within
 *      statistical tolerance (±5 pp over 10 000 samples)
 *   3. stepSpeed never changes currentSpeedKph by more than accelKphPerCycle
 *      in a single call, and never pushes speed outside [minKph, maxKph]
 */

import { describe, it, expect } from "vitest";
import {
  SPEED_PROFILES,
  MOTION_CRON_INTERVAL_MS,
  applyDelta,
  pickSpeedProfile,
  stepSpeed,
  UserMotionState,
  SpeedProfile,
} from "../motion-simulator";

// ── Helpers ──────────────────────────────────────────────────────────────────

const INTERVAL_SECONDS = MOTION_CRON_INTERVAL_MS / 1000; // 30 s
const KM_PER_LAT_DEG = 111.32;

/** Great-circle approximation between two close points (km). */
function distanceKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const latRad = (lat1 * Math.PI) / 180;
  const kmPerLngDeg = KM_PER_LAT_DEG * Math.cos(latRad);
  const dlat = (lat2 - lat1) * KM_PER_LAT_DEG;
  const dlng = (lng2 - lng1) * kmPerLngDeg;
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

/** Build a minimal UserMotionState for the given profile and speed. */
function makeState(
  profile: SpeedProfile,
  currentSpeedKph: number,
  overrides: Partial<UserMotionState> = {},
): UserMotionState {
  const cfg = SPEED_PROFILES[profile];
  return {
    userId: "test-user",
    lat: 45,
    lng: 12,
    schedule: [],
    scheduleStartMs: 0,
    currentSlotIdx: 0,
    speedProfile: profile,
    currentSpeedKph,
    targetSpeedKph: currentSpeedKph,
    headingRad: 0,
    offsetLat: 0,
    offsetLng: 0,
    ...overrides,
  };
}

// ── applyDelta: distance bounds ───────────────────────────────────────────────

describe("applyDelta: distance bounds per profile", () => {
  const SAMPLES = 200;

  for (const profile of ["city", "highway", "mountain"] as SpeedProfile[]) {
    const cfg = SPEED_PROFILES[profile];

    // Theoretical maximum distance for this profile in one cycle (km).
    // Speed after stepSpeed is capped at cfg.maxKph.
    const maxDistKm = (cfg.maxKph / 3600) * INTERVAL_SECONDS;

    it(`${profile}: single cycle never exceeds theoretical max (${maxDistKm.toFixed(3)} km)`, () => {
      for (let i = 0; i < SAMPLES; i++) {
        const state = makeState(profile, cfg.maxKph, { targetSpeedKph: cfg.maxKph });
        const { lat: newLat, lng: newLng } = applyDelta(45, 12, state);
        const dist = distanceKm(45, 12, newLat, newLng);
        expect(dist).toBeLessThanOrEqual(maxDistKm + 0.001); // 1 m float tolerance
      }
    });
  }

  it("no profile ever moves a rider more than 2 km in one cycle", () => {
    const HARD_CEILING_KM = 2;
    for (const profile of ["city", "highway", "mountain"] as SpeedProfile[]) {
      const cfg = SPEED_PROFILES[profile];
      for (let i = 0; i < SAMPLES; i++) {
        // Start at max speed so the check is as tight as possible
        const state = makeState(profile, cfg.maxKph, { targetSpeedKph: cfg.maxKph });
        const { lat: newLat, lng: newLng } = applyDelta(45, 12, state);
        const dist = distanceKm(45, 12, newLat, newLng);
        expect(dist).toBeLessThan(HARD_CEILING_KM);
      }
    }
  });

  it("highway max cycle distance is approximately 1.1 km", () => {
    // 130 km/h × 30 s = 1.0833… km
    const EXPECTED_MAX_KM = (SPEED_PROFILES.highway.maxKph / 3600) * INTERVAL_SECONDS;
    expect(EXPECTED_MAX_KM).toBeGreaterThan(1.0);
    expect(EXPECTED_MAX_KM).toBeLessThan(1.15);
  });
});

// ── pickSpeedProfile: weight distribution ────────────────────────────────────

describe("pickSpeedProfile: 50/30/20 weight distribution", () => {
  const SAMPLES = 10_000;
  const TOLERANCE = 0.05; // ±5 percentage points

  it("city is selected ~50 % of the time", () => {
    let count = 0;
    for (let i = 0; i < SAMPLES; i++) if (pickSpeedProfile() === "city") count++;
    const ratio = count / SAMPLES;
    expect(ratio).toBeGreaterThan(0.50 - TOLERANCE);
    expect(ratio).toBeLessThan(0.50 + TOLERANCE);
  });

  it("highway is selected ~30 % of the time", () => {
    let count = 0;
    for (let i = 0; i < SAMPLES; i++) if (pickSpeedProfile() === "highway") count++;
    const ratio = count / SAMPLES;
    expect(ratio).toBeGreaterThan(0.30 - TOLERANCE);
    expect(ratio).toBeLessThan(0.30 + TOLERANCE);
  });

  it("mountain is selected ~20 % of the time", () => {
    let count = 0;
    for (let i = 0; i < SAMPLES; i++) if (pickSpeedProfile() === "mountain") count++;
    const ratio = count / SAMPLES;
    expect(ratio).toBeGreaterThan(0.20 - TOLERANCE);
    expect(ratio).toBeLessThan(0.20 + TOLERANCE);
  });

  it("all three profiles are always returned (never undefined)", () => {
    for (let i = 0; i < SAMPLES; i++) {
      const p = pickSpeedProfile();
      expect(["city", "highway", "mountain"]).toContain(p);
    }
  });
});

// ── stepSpeed: acceleration cap and speed bounds ─────────────────────────────

describe("stepSpeed: acceleration cap never exceeded", () => {
  const SAMPLES = 500;

  for (const profile of ["city", "highway", "mountain"] as SpeedProfile[]) {
    const cfg = SPEED_PROFILES[profile];

    it(`${profile}: speed change per cycle ≤ accelKphPerCycle (${cfg.accelKphPerCycle} km/h)`, () => {
      for (let i = 0; i < SAMPLES; i++) {
        // Random starting speed within profile range
        const startSpeed =
          cfg.minKph + Math.random() * (cfg.maxKph - cfg.minKph);
        // Random target far from current speed (worst-case acceleration demand)
        const targetSpeed =
          cfg.minKph + Math.random() * (cfg.maxKph - cfg.minKph);
        const state = makeState(profile, startSpeed, { targetSpeedKph: targetSpeed });

        stepSpeed(state);

        const change = Math.abs(state.currentSpeedKph - startSpeed);
        expect(change).toBeLessThanOrEqual(cfg.accelKphPerCycle + 0.001);
      }
    });

    it(`${profile}: speed stays within [minKph, maxKph] after stepSpeed`, () => {
      for (let i = 0; i < SAMPLES; i++) {
        const startSpeed =
          cfg.minKph + Math.random() * (cfg.maxKph - cfg.minKph);
        const state = makeState(profile, startSpeed);
        // Force extreme targets to stress-test clamping
        state.targetSpeedKph = i % 2 === 0 ? cfg.maxKph + 100 : cfg.minKph - 100;

        stepSpeed(state);

        expect(state.currentSpeedKph).toBeGreaterThanOrEqual(cfg.minKph - 0.001);
        expect(state.currentSpeedKph).toBeLessThanOrEqual(cfg.maxKph + 0.001);
      }
    });
  }

  it("speed converges toward target over multiple cycles", () => {
    const state = makeState("city", 30, { targetSpeedKph: 60 });
    const initialDiff = Math.abs(state.targetSpeedKph - state.currentSpeedKph);
    // Run enough cycles to close a 30 km/h gap at 10 km/h per cycle
    for (let i = 0; i < 5; i++) stepSpeed(state);
    const finalDiff = Math.abs(state.targetSpeedKph - state.currentSpeedKph);
    expect(finalDiff).toBeLessThan(initialDiff);
  });
});
