/**
 * Unit tests for shared/tracking-fusion.ts pure geometry helpers.
 *
 * Blindati:
 *   (1) computeDestinationPoint — roundtrip: walk D km along bearing B from P,
 *       haversineKm(P, destination) ≈ D within 1 m tolerance.
 *   (2) Longitude wrap near the antimeridian: starting east of 179°, heading
 *       east, the result normalises to [-180, 180) without overflowing > 180.
 *   (3) haversineKm(P, P) = 0, haversineKm symmetry, known short-range value.
 */

import { describe, it, expect } from "vitest";
import {
  computeDestinationPoint,
  haversineKm,
  evaluateSegment,
  accuracyAwareMinSegmentKm,
  TRACKING_FUSION,
} from "@shared/tracking-fusion";

// ─── Tolerance ────────────────────────────────────────────────────────────────
const TOLERANCE_KM = 0.001; // 1 m — acceptable roundtrip error

// ─── (1) computeDestinationPoint — roundtrip tests ───────────────────────────

describe("computeDestinationPoint — roundtrip haversine consistency", () => {
  it("walk 1 km north from Milan, haversineKm back ≈ 1 km", () => {
    const lat0 = 45.4642, lng0 = 9.1900;
    const dest = computeDestinationPoint(lat0, lng0, 1, 0);
    const back = haversineKm(lat0, lng0, dest.lat, dest.lng);
    expect(Math.abs(back - 1)).toBeLessThan(TOLERANCE_KM);
  });

  it("walk 5 km east from Milan, haversineKm back ≈ 5 km", () => {
    const lat0 = 45.4642, lng0 = 9.1900;
    const dest = computeDestinationPoint(lat0, lng0, 5, 90);
    const back = haversineKm(lat0, lng0, dest.lat, dest.lng);
    expect(Math.abs(back - 5)).toBeLessThan(TOLERANCE_KM);
  });

  it("walk 10 km south-west (bearing 225°), haversineKm back ≈ 10 km", () => {
    const lat0 = 44.0, lng0 = 12.0;
    const dest = computeDestinationPoint(lat0, lng0, 10, 225);
    const back = haversineKm(lat0, lng0, dest.lat, dest.lng);
    expect(Math.abs(back - 10)).toBeLessThan(TOLERANCE_KM);
  });

  it("walk 0.5 km north-east (bearing 45°), haversineKm back ≈ 0.5 km", () => {
    const lat0 = 51.5074, lng0 = -0.1278; // London
    const dest = computeDestinationPoint(lat0, lng0, 0.5, 45);
    const back = haversineKm(lat0, lng0, dest.lat, dest.lng);
    expect(Math.abs(back - 0.5)).toBeLessThan(TOLERANCE_KM);
  });

  it("walk 100 km south (bearing 180°) from high latitude, roundtrip ≈ 100 km", () => {
    const lat0 = 70.0, lng0 = 25.0; // Northern Norway
    const dest = computeDestinationPoint(lat0, lng0, 100, 180);
    const back = haversineKm(lat0, lng0, dest.lat, dest.lng);
    expect(Math.abs(back - 100)).toBeLessThan(TOLERANCE_KM);
  });

  it("walk 2 km west from the Prime Meridian, roundtrip ≈ 2 km", () => {
    const lat0 = 51.477, lng0 = 0.0; // Greenwich
    const dest = computeDestinationPoint(lat0, lng0, 2, 270);
    const back = haversineKm(lat0, lng0, dest.lat, dest.lng);
    expect(Math.abs(back - 2)).toBeLessThan(TOLERANCE_KM);
    expect(dest.lng).toBeLessThan(0); // west → negative longitude
  });
});

// ─── (2) Longitude wrap near the antimeridian ────────────────────────────────

describe("computeDestinationPoint — longitude normalisation [-180, 180)", () => {
  it("heading east from 179.9° stays within [-180, 180)", () => {
    const lat0 = 0, lng0 = 179.9;
    const dest = computeDestinationPoint(lat0, lng0, 50, 90);
    expect(dest.lng).toBeGreaterThanOrEqual(-180);
    expect(dest.lng).toBeLessThan(180);
  });

  it("heading east from 179.9° wraps longitude to negative (crosses antimeridian)", () => {
    const lat0 = 0, lng0 = 179.9;
    const dest = computeDestinationPoint(lat0, lng0, 50, 90);
    expect(dest.lng).toBeLessThan(0);
  });

  it("heading west from -179.9° wraps longitude to positive (crosses antimeridian)", () => {
    const lat0 = 0, lng0 = -179.9;
    const dest = computeDestinationPoint(lat0, lng0, 50, 270);
    expect(dest.lng).toBeGreaterThanOrEqual(-180);
    expect(dest.lng).toBeLessThan(180);
    expect(dest.lng).toBeGreaterThan(0);
  });

  it("roundtrip near antimeridian: haversineKm still accurate after wrap", () => {
    const lat0 = 10, lng0 = 179.8;
    const dist = 30; // km — enough to cross the antimeridian
    const dest = computeDestinationPoint(lat0, lng0, dist, 90);
    const back = haversineKm(lat0, lng0, dest.lat, dest.lng);
    expect(Math.abs(back - dist)).toBeLessThan(TOLERANCE_KM);
  });
});

// ─── (3) haversineKm — basic invariants ──────────────────────────────────────

describe("haversineKm — invariants", () => {
  it("same point → 0 km", () => {
    expect(haversineKm(45.0, 9.0, 45.0, 9.0)).toBe(0);
  });

  it("symmetry: haversineKm(A,B) === haversineKm(B,A)", () => {
    const d1 = haversineKm(45.4642, 9.19, 41.9028, 12.4964);
    const d2 = haversineKm(41.9028, 12.4964, 45.4642, 9.19);
    expect(Math.abs(d1 - d2)).toBeLessThan(1e-10);
  });

  it("Milan → Rome: ~477 km (±5 km tolerance for approximate check)", () => {
    const d = haversineKm(45.4642, 9.1900, 41.9028, 12.4964);
    expect(d).toBeGreaterThan(472);
    expect(d).toBeLessThan(482);
  });
});

// ─── (4) accuracyAwareMinSegmentKm — clamping behaviour ──────────────────────

describe("accuracyAwareMinSegmentKm — floor clamping", () => {
  it("perfect accuracy (0 m) clamps to MIN_SEGMENT_FLOOR_M", () => {
    const minKm = accuracyAwareMinSegmentKm(0);
    expect(minKm).toBeCloseTo(TRACKING_FUSION.MIN_SEGMENT_FLOOR_M / 1000, 6);
  });

  it("accuracy below 2×MIN produces same floor (scale factor 0.5 keeps it at min)", () => {
    // acc=4 → 4*0.5=2 < MIN_SEGMENT_FLOOR_M(3) → clamps to 3 m
    const minKm = accuracyAwareMinSegmentKm(4);
    expect(minKm).toBeCloseTo(TRACKING_FUSION.MIN_SEGMENT_FLOOR_M / 1000, 6);
  });

  it("null accuracy falls back to MIN_SEGMENT_FLOOR_M floor", () => {
    const minKm = accuracyAwareMinSegmentKm(null);
    expect(minKm).toBeCloseTo(TRACKING_FUSION.MIN_SEGMENT_FLOOR_M / 1000, 6);
  });

  it("undefined accuracy falls back to MIN_SEGMENT_FLOOR_M floor", () => {
    const minKm = accuracyAwareMinSegmentKm(undefined);
    expect(minKm).toBeCloseTo(TRACKING_FUSION.MIN_SEGMENT_FLOOR_M / 1000, 6);
  });

  it("accuracy that would exceed MAX_SEGMENT_FLOOR_M clamps to MAX_SEGMENT_FLOOR_M", () => {
    // acc=100 → 100*0.5=50 > MAX_SEGMENT_FLOOR_M(8) → clamps to 8 m
    const minKm = accuracyAwareMinSegmentKm(100);
    expect(minKm).toBeCloseTo(TRACKING_FUSION.MAX_SEGMENT_FLOOR_M / 1000, 6);
  });

  it("accuracy at exactly 2×MAX_SEGMENT_FLOOR_M clamps to MAX_SEGMENT_FLOOR_M", () => {
    // acc=16 → 16*0.5=8 === MAX_SEGMENT_FLOOR_M(8) → stays at 8 m
    const minKm = accuracyAwareMinSegmentKm(TRACKING_FUSION.MAX_SEGMENT_FLOOR_M * 2);
    expect(minKm).toBeCloseTo(TRACKING_FUSION.MAX_SEGMENT_FLOOR_M / 1000, 6);
  });

  it("accuracy between the two floors scales linearly", () => {
    // acc=10 → 10*0.5=5; MIN=3, MAX=8 → result is 5 m = 0.005 km
    const minKm = accuracyAwareMinSegmentKm(10);
    expect(minKm).toBeCloseTo(0.005, 6);
  });
});

// ─── (5) evaluateSegment — rejection paths ───────────────────────────────────

const BASE_LAT = 45.4642;
const BASE_LNG = 9.1900;
const BASE_TIME_MS = 1_700_000_000_000;

describe("evaluateSegment — speed_jump rejection", () => {
  it("segment implying > MAX_PLAUSIBLE_KMH is rejected with reason speed_jump", () => {
    // 1 km in 1 second → 3 600 km/h >> 360 km/h limit
    const dest = computeDestinationPoint(BASE_LAT, BASE_LNG, 1, 0);
    const result = evaluateSegment({
      prevLat: BASE_LAT,
      prevLng: BASE_LNG,
      prevTimeMs: BASE_TIME_MS,
      lat: dest.lat,
      lng: dest.lng,
      timeMs: BASE_TIME_MS + 1_000,
      accuracyM: 5,
    });
    expect(result.accept).toBe(false);
    expect(result.reason).toBe("speed_jump");
    expect(result.distanceKm).toBe(0);
  });

  it("segment well below MAX_PLAUSIBLE_KMH (200 km/h) is NOT rejected for speed", () => {
    // 200 km/h for 10 s → ~0.556 km — clearly within the plausible range
    const distKm = (200 / 3600) * 10;
    const dest = computeDestinationPoint(BASE_LAT, BASE_LNG, distKm, 0);
    const result = evaluateSegment({
      prevLat: BASE_LAT,
      prevLng: BASE_LNG,
      prevTimeMs: BASE_TIME_MS,
      lat: dest.lat,
      lng: dest.lng,
      timeMs: BASE_TIME_MS + 10_000,
      accuracyM: 5,
    });
    expect(result.reason).not.toBe("speed_jump");
  });
});

describe("evaluateSegment — low_accuracy rejection", () => {
  it("accuracyM > ACCURACY_GATE_M (35 m) is rejected with reason low_accuracy", () => {
    const dest = computeDestinationPoint(BASE_LAT, BASE_LNG, 0.5, 90);
    const result = evaluateSegment({
      prevLat: BASE_LAT,
      prevLng: BASE_LNG,
      prevTimeMs: BASE_TIME_MS,
      lat: dest.lat,
      lng: dest.lng,
      timeMs: BASE_TIME_MS + 30_000,
      accuracyM: TRACKING_FUSION.ACCURACY_GATE_M + 1,
    });
    expect(result.accept).toBe(false);
    expect(result.reason).toBe("low_accuracy");
    expect(result.distanceKm).toBe(0);
  });

  it("accuracyM exactly at ACCURACY_GATE_M (35 m) is NOT rejected for low_accuracy", () => {
    const dest = computeDestinationPoint(BASE_LAT, BASE_LNG, 0.5, 90);
    const result = evaluateSegment({
      prevLat: BASE_LAT,
      prevLng: BASE_LNG,
      prevTimeMs: BASE_TIME_MS,
      lat: dest.lat,
      lng: dest.lng,
      timeMs: BASE_TIME_MS + 30_000,
      accuracyM: TRACKING_FUSION.ACCURACY_GATE_M,
    });
    expect(result.reason).not.toBe("low_accuracy");
  });

  it("null accuracyM bypasses the accuracy gate entirely", () => {
    const dest = computeDestinationPoint(BASE_LAT, BASE_LNG, 0.5, 90);
    const result = evaluateSegment({
      prevLat: BASE_LAT,
      prevLng: BASE_LNG,
      prevTimeMs: BASE_TIME_MS,
      lat: dest.lat,
      lng: dest.lng,
      timeMs: BASE_TIME_MS + 30_000,
      accuracyM: null,
    });
    expect(result.reason).not.toBe("low_accuracy");
  });
});

describe("evaluateSegment — below_floor rejection", () => {
  it("sub-noise-floor jitter (1 m movement) is rejected with reason below_floor", () => {
    // 1 m north → 0.001 km < MIN_SEGMENT_FLOOR_M/1000 (0.003 km)
    const dest = computeDestinationPoint(BASE_LAT, BASE_LNG, 0.001, 0);
    const result = evaluateSegment({
      prevLat: BASE_LAT,
      prevLng: BASE_LNG,
      prevTimeMs: BASE_TIME_MS,
      lat: dest.lat,
      lng: dest.lng,
      timeMs: BASE_TIME_MS + 5_000,
      accuracyM: 5,
    });
    expect(result.accept).toBe(false);
    expect(result.reason).toBe("below_floor");
    expect(result.distanceKm).toBe(0);
  });

  it("movement just above the floor is accepted", () => {
    // 5 m north → 0.005 km > MIN_SEGMENT_FLOOR_M/1000 (0.003 km) at good accuracy
    const dest = computeDestinationPoint(BASE_LAT, BASE_LNG, 0.005, 0);
    const result = evaluateSegment({
      prevLat: BASE_LAT,
      prevLng: BASE_LNG,
      prevTimeMs: BASE_TIME_MS,
      lat: dest.lat,
      lng: dest.lng,
      timeMs: BASE_TIME_MS + 5_000,
      accuracyM: 5,
    });
    expect(result.accept).toBe(true);
    expect(result.distanceKm).toBeGreaterThan(0);
  });

  it("same coordinates rejected as below_floor (zero distance)", () => {
    const result = evaluateSegment({
      prevLat: BASE_LAT,
      prevLng: BASE_LNG,
      prevTimeMs: BASE_TIME_MS,
      lat: BASE_LAT,
      lng: BASE_LNG,
      timeMs: BASE_TIME_MS + 5_000,
      accuracyM: 5,
    });
    expect(result.accept).toBe(false);
    expect(result.reason).toBe("below_floor");
  });
});

describe("evaluateSegment — happy path (accepted segment)", () => {
  it("100 m segment in 10 s at good accuracy is accepted", () => {
    const dest = computeDestinationPoint(BASE_LAT, BASE_LNG, 0.1, 90);
    const result = evaluateSegment({
      prevLat: BASE_LAT,
      prevLng: BASE_LNG,
      prevTimeMs: BASE_TIME_MS,
      lat: dest.lat,
      lng: dest.lng,
      timeMs: BASE_TIME_MS + 10_000,
      accuracyM: 10,
    });
    expect(result.accept).toBe(true);
    expect(result.distanceKm).toBeCloseTo(0.1, 3);
    expect(result.reason).toBeUndefined();
  });
});
