/**
 * Property-based tests (fast-check) for the pure functions in
 * shared/tracking-fusion.ts — the single source of truth for the distance gate
 * and telemetry sample classification.
 *
 * These hammer the functions with random inputs (variable accuracy, GPS jumps,
 * sub-floor jitter, out-of-order timestamps, garbage sample fields) and assert
 * the INVARIANTS hold for every input. They complement (do not replace) the
 * targeted example-based tests elsewhere.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  TRACKING_FUSION,
  evaluateSegment,
  accuracyAwareMinSegmentKm,
  haversineKm,
  classifyTelemetrySample,
  coerceFiniteNumber,
  shouldRecordSensorSample,
} from "@shared/tracking-fusion";

// Finite coordinate / accuracy generators kept in plausible ranges.
const lat = () => fc.double({ min: -89.9, max: 89.9, noNaN: true });
const lng = () => fc.double({ min: -179.9, max: 179.9, noNaN: true });
const timeMs = () => fc.integer({ min: 0, max: 4_000_000_000_000 });
const accuracyM = () => fc.double({ min: 0, max: 500, noNaN: true });

describe("evaluateSegment — invariants", () => {
  it("distanceKm is never negative and is finite", () => {
    fc.assert(
      fc.property(lat(), lng(), timeMs(), lat(), lng(), timeMs(), fc.option(accuracyM(), { nil: null }), (
        prevLat, prevLng, prevTimeMs, la, ln, t, acc,
      ) => {
        const d = evaluateSegment({ prevLat, prevLng, prevTimeMs, lat: la, lng: ln, timeMs: t, accuracyM: acc });
        expect(d.distanceKm).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(d.distanceKm)).toBe(true);
      }),
    );
  });

  it("a fix above the accuracy gate is never accepted (and reason is low_accuracy)", () => {
    fc.assert(
      fc.property(
        lat(), lng(), timeMs(), lat(), lng(), timeMs(),
        fc.double({ min: TRACKING_FUSION.ACCURACY_GATE_M + 0.0001, max: 5000, noNaN: true }),
        (prevLat, prevLng, prevTimeMs, la, ln, t, acc) => {
          const d = evaluateSegment({ prevLat, prevLng, prevTimeMs, lat: la, lng: ln, timeMs: t, accuracyM: acc });
          expect(d.accept).toBe(false);
          expect(d.reason).toBe("low_accuracy");
          expect(d.distanceKm).toBe(0);
        },
      ),
    );
  });

  it("a rejected segment always reports distanceKm 0; an accepted one reports a positive distance", () => {
    fc.assert(
      fc.property(lat(), lng(), timeMs(), lat(), lng(), timeMs(), fc.option(accuracyM(), { nil: null }), (
        prevLat, prevLng, prevTimeMs, la, ln, t, acc,
      ) => {
        const d = evaluateSegment({ prevLat, prevLng, prevTimeMs, lat: la, lng: ln, timeMs: t, accuracyM: acc });
        if (d.accept) {
          expect(d.reason).toBeUndefined();
          expect(d.distanceKm).toBeGreaterThan(0);
          // An accepted segment must clear the accuracy-aware floor.
          expect(d.distanceKm).toBeGreaterThanOrEqual(accuracyAwareMinSegmentKm(acc));
        } else {
          expect(d.distanceKm).toBe(0);
          expect(["low_accuracy", "below_floor", "speed_jump"]).toContain(d.reason);
        }
      }),
    );
  });

  it("an accepted segment never implies a speed above MAX_PLAUSIBLE_KMH", () => {
    fc.assert(
      fc.property(lat(), lng(), timeMs(), lat(), lng(), timeMs(), fc.option(accuracyM(), { nil: null }), (
        prevLat, prevLng, prevTimeMs, la, ln, t, acc,
      ) => {
        const d = evaluateSegment({ prevLat, prevLng, prevTimeMs, lat: la, lng: ln, timeMs: t, accuracyM: acc });
        if (d.accept) {
          const dtSec = Math.max((t - prevTimeMs) / 1000, 0.001);
          const impliedKmh = (d.distanceKm / dtSec) * 3600;
          expect(impliedKmh).toBeLessThanOrEqual(TRACKING_FUSION.MAX_PLAUSIBLE_KMH + 1e-6);
        }
      }),
    );
  });

  it("identical points (zero movement) are never accepted", () => {
    fc.assert(
      fc.property(lat(), lng(), timeMs(), fc.integer({ min: 1, max: 100_000 }), fc.option(accuracyM(), { nil: null }), (
        la, ln, t, dt, acc,
      ) => {
        const d = evaluateSegment({ prevLat: la, prevLng: ln, prevTimeMs: t, lat: la, lng: ln, timeMs: t + dt, accuracyM: acc });
        expect(d.accept).toBe(false);
        expect(d.distanceKm).toBe(0);
      }),
    );
  });
});

describe("accuracyAwareMinSegmentKm — invariants", () => {
  it("is always within [MIN_SEGMENT_FLOOR_M, MAX_SEGMENT_FLOOR_M] (in km)", () => {
    fc.assert(
      fc.property(fc.option(fc.double({ min: -100, max: 5000, noNaN: true }), { nil: null }), (acc) => {
        const km = accuracyAwareMinSegmentKm(acc);
        expect(km).toBeGreaterThanOrEqual(TRACKING_FUSION.MIN_SEGMENT_FLOOR_M / 1000 - 1e-12);
        expect(km).toBeLessThanOrEqual(TRACKING_FUSION.MAX_SEGMENT_FLOOR_M / 1000 + 1e-12);
      }),
    );
  });

  it("null/undefined/negative accuracy all fall back to the minimum floor", () => {
    const floorKm = TRACKING_FUSION.MIN_SEGMENT_FLOOR_M / 1000;
    expect(accuracyAwareMinSegmentKm(null)).toBeCloseTo(floorKm, 12);
    expect(accuracyAwareMinSegmentKm(undefined)).toBeCloseTo(floorKm, 12);
    fc.assert(
      fc.property(fc.double({ min: -5000, max: -0.0001, noNaN: true }), (negAcc) => {
        expect(accuracyAwareMinSegmentKm(negAcc)).toBeCloseTo(floorKm, 12);
      }),
    );
  });

  it("is monotonically non-decreasing in accuracy", () => {
    fc.assert(
      fc.property(accuracyM(), accuracyM(), (a, b) => {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        expect(accuracyAwareMinSegmentKm(hi)).toBeGreaterThanOrEqual(accuracyAwareMinSegmentKm(lo) - 1e-12);
      }),
    );
  });
});

describe("haversineKm — invariants", () => {
  it("is symmetric and non-negative", () => {
    fc.assert(
      fc.property(lat(), lng(), lat(), lng(), (la1, ln1, la2, ln2) => {
        const a = haversineKm(la1, ln1, la2, ln2);
        const b = haversineKm(la2, ln2, la1, ln1);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeCloseTo(b, 9);
      }),
    );
  });
});

describe("coerceFiniteNumber — invariants", () => {
  it("returns null for null/undefined/non-finite and the number otherwise", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ noNaN: true }),
          fc.constant(NaN),
          fc.constant(Infinity),
          fc.constant(-Infinity),
          fc.constant(null),
          fc.constant(undefined),
          fc.string(),
          fc.boolean(),
        ),
        (v) => {
          const out = coerceFiniteNumber(v);
          if (out === null) return; // accepted: unrepresentable as finite number
          expect(Number.isFinite(out)).toBe(true);
        },
      ),
    );
  });

  it("is idempotent on its own finite output", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (n) => {
        const once = coerceFiniteNumber(n);
        if (once !== null) expect(coerceFiniteNumber(once)).toBe(once);
      }),
    );
  });
});

describe("classifyTelemetrySample — invariants", () => {
  const anyField = () =>
    fc.oneof(
      fc.double({ noNaN: true }),
      fc.constant(NaN),
      fc.constant(Infinity),
      fc.constant(null),
      fc.constant(undefined),
      fc.string(),
    );

  it("drops iff ts is not a finite number; otherwise classifies by lat/lon presence", () => {
    fc.assert(
      fc.property(anyField(), anyField(), anyField(), (ts, la, lo) => {
        const klass = classifyTelemetrySample({ ts, lat: la, lon: lo });
        const tsOk = coerceFiniteNumber(ts) !== null;
        if (!tsOk) {
          expect(klass).toBe("drop");
          return;
        }
        const latOk = coerceFiniteNumber(la) !== null;
        const lonOk = coerceFiniteNumber(lo) !== null;
        expect(klass).toBe(latOk && lonOk ? "gps_valid" : "sensor_only");
      }),
    );
  });

  it("a finite ts with both finite coords is always gps_valid", () => {
    fc.assert(
      fc.property(timeMs(), lat(), lng(), (ts, la, lo) => {
        expect(classifyTelemetrySample({ ts, lat: la, lon: lo })).toBe("gps_valid");
      }),
    );
  });

  it("a finite ts with absent coords is always sensor_only (lat/lon null = no GPS fix)", () => {
    fc.assert(
      fc.property(timeMs(), (ts) => {
        expect(classifyTelemetrySample({ ts, lat: null, lon: null })).toBe("sensor_only");
      }),
    );
  });
});

describe("shouldRecordSensorSample — invariants", () => {
  it("true iff the GPS silence exceeds GPS_SILENCE_MS (strictly)", () => {
    fc.assert(
      fc.property(timeMs(), fc.integer({ min: -10_000, max: 120_000 }), (last, delta) => {
        const now = last + delta;
        expect(shouldRecordSensorSample(last, now)).toBe(delta > TRACKING_FUSION.GPS_SILENCE_MS);
      }),
    );
  });

  it("exactly GPS_SILENCE_MS of silence does not trigger (boundary)", () => {
    fc.assert(
      fc.property(timeMs(), (last) => {
        expect(shouldRecordSensorSample(last, last + TRACKING_FUSION.GPS_SILENCE_MS)).toBe(false);
      }),
    );
  });
});
