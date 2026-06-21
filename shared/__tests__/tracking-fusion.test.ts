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
