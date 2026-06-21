/**
 * Offline ride tracking — tests for exported pure helpers.
 *
 * Both helpers live in shared/tracking-fusion.ts (zero native dependencies),
 * so no vi.mock() setup is required and the tests run identically in any
 * Node/Vitest environment.
 *
 *   (A) applyDistanceUpload:
 *       The "uploaded" marker (kmAtLastUpload) advances ONLY when flush()
 *       succeeds. A failed upload is silently retried on the next sample,
 *       not skipped.
 *
 *   (B) deadReckonStep:
 *       - Returns {lat, lon, stepKm, estimated:true} when dead-reckoning
 *         engages (heading + speed > 0.5 km/h).
 *       - Returns null when speed is ≤ 0.5 km/h (or there is no prior GPS
 *         fix to extrapolate from), keeping lat/lon null in the hook.
 */

import { describe, it, expect, vi } from "vitest";

import {
  applyDistanceUpload,
  deadReckonStep,
} from "@shared/tracking-fusion";

// ─── (A) applyDistanceUpload — marker-advancement contract ────────────────────

describe("applyDistanceUpload — marker only advances on success", () => {
  it("does NOT call flush below the 5 km threshold", async () => {
    let kmAtLastUpload = 0;
    const flush = vi.fn(async () => true);
    applyDistanceUpload(4.99, kmAtLastUpload, flush, (at) => { kmAtLastUpload = at; });
    await Promise.resolve();
    expect(flush).not.toHaveBeenCalled();
    expect(kmAtLastUpload).toBe(0);
  });

  it("triggers at exactly 5 km (condition is <, so >= 5 fires)", async () => {
    let kmAtLastUpload = 0;
    const flush = vi.fn(async () => true);
    applyDistanceUpload(5.0, kmAtLastUpload, flush, (at) => { kmAtLastUpload = at; });
    await flush.mock.results[0]?.value;
    expect(flush).toHaveBeenCalledOnce();
    expect(kmAtLastUpload).toBe(5.0);
  });

  it("advances marker to totalKm when upload succeeds (flush returns true)", async () => {
    let kmAtLastUpload = 0;
    const flush = vi.fn(async () => true);
    applyDistanceUpload(7.3, kmAtLastUpload, flush, (at) => { kmAtLastUpload = at; });
    await flush.mock.results[0]?.value;
    expect(kmAtLastUpload).toBe(7.3);
  });

  it("does NOT advance marker when upload fails (flush returns false)", async () => {
    let kmAtLastUpload = 0;
    const flush = vi.fn(async () => false);
    applyDistanceUpload(6.0, kmAtLastUpload, flush, (at) => { kmAtLastUpload = at; });
    await flush.mock.results[0]?.value;
    expect(kmAtLastUpload).toBe(0); // unchanged — will retry at next sample
  });

  it("failed upload is retried at next sample (marker still behind threshold)", async () => {
    let kmAtLastUpload = 0;

    // First call — flush fails
    const flushFail = vi.fn(async () => false);
    applyDistanceUpload(6.0, kmAtLastUpload, flushFail, (at) => { kmAtLastUpload = at; });
    await flushFail.mock.results[0]?.value;
    expect(kmAtLastUpload).toBe(0); // marker not advanced

    // Same totalKm on next sample — threshold still exceeded → retries
    const flushSuccess = vi.fn(async () => true);
    applyDistanceUpload(6.0, kmAtLastUpload, flushSuccess, (at) => { kmAtLastUpload = at; });
    await flushSuccess.mock.results[0]?.value;
    expect(flushSuccess).toHaveBeenCalledOnce();
    expect(kmAtLastUpload).toBe(6.0); // now advanced
  });

  it("after a successful upload, a 4.9 km increment does NOT re-trigger", async () => {
    let kmAtLastUpload = 0;

    // First successful upload at 6 km
    const flush1 = vi.fn(async () => true);
    applyDistanceUpload(6.0, kmAtLastUpload, flush1, (at) => { kmAtLastUpload = at; });
    await flush1.mock.results[0]?.value;
    expect(kmAtLastUpload).toBe(6.0);

    // Only 4.9 km more — still below threshold
    const flush2 = vi.fn(async () => true);
    applyDistanceUpload(10.9, kmAtLastUpload, flush2, (at) => { kmAtLastUpload = at; });
    await Promise.resolve();
    expect(flush2).not.toHaveBeenCalled();
    expect(kmAtLastUpload).toBe(6.0);
  });

  it("custom uploadEveryKm threshold is respected", async () => {
    let kmAtLastUpload = 0;
    const flush = vi.fn(async () => true);
    // below a custom 2 km threshold
    applyDistanceUpload(1.9, kmAtLastUpload, flush, (at) => { kmAtLastUpload = at; }, 2);
    await Promise.resolve();
    expect(flush).not.toHaveBeenCalled();
    // at the threshold
    applyDistanceUpload(2.0, kmAtLastUpload, flush, (at) => { kmAtLastUpload = at; }, 2);
    await flush.mock.results[0]?.value;
    expect(flush).toHaveBeenCalledOnce();
    expect(kmAtLastUpload).toBe(2.0);
  });
});

// ─── (B) deadReckonStep — estimated flag + null-position contract ─────────────

describe("deadReckonStep — estimated flag and null-position contract", () => {
  const SAMPLE_INTERVAL_MS = 1000;
  const origin = { lat: 45.4642, lon: 9.19 };

  it("speed ≤ 0.5 km/h (idle) → returns null (no DR step)", () => {
    expect(deadReckonStep(origin, 90, 0.5, SAMPLE_INTERVAL_MS)).toBeNull();
  });

  it("speed 0 km/h → returns null", () => {
    expect(deadReckonStep(origin, 0, 0, SAMPLE_INTERVAL_MS)).toBeNull();
  });

  it("speed just above 0.5 km/h → DR engages, returns non-null", () => {
    const result = deadReckonStep(origin, 90, 0.51, SAMPLE_INTERVAL_MS);
    expect(result).not.toBeNull();
  });

  it("result carries estimated: true when DR engages", () => {
    const result = deadReckonStep(origin, 0, 50, SAMPLE_INTERVAL_MS);
    expect(result?.estimated).toBe(true);
  });

  it("result lat/lon are finite numbers (non-null) when DR engages", () => {
    const result = deadReckonStep(origin, 0, 60, SAMPLE_INTERVAL_MS);
    expect(typeof result?.lat).toBe("number");
    expect(typeof result?.lon).toBe("number");
    expect(Number.isFinite(result?.lat)).toBe(true);
    expect(Number.isFinite(result?.lon)).toBe(true);
  });

  it("result lat/lon are very close to origin for a 1-second step at 120 km/h", () => {
    // 120 km/h for 1 s = 0.0333 km — destination should be within ~0.1 degree
    const result = deadReckonStep(origin, 0, 120, SAMPLE_INTERVAL_MS);
    expect(Math.abs(result!.lat - origin.lat)).toBeLessThan(0.1);
    expect(Math.abs(result!.lon - origin.lon)).toBeLessThan(0.1);
  });

  it("stepKm is included in the result and > 0", () => {
    const result = deadReckonStep(origin, 90, 60, SAMPLE_INTERVAL_MS);
    expect(result?.stepKm).toBeGreaterThan(0);
  });

  it("stepKm matches (speed / 3600) * (intervalMs / 1000)", () => {
    const speedKmh = 60;
    const result = deadReckonStep(origin, 0, speedKmh, SAMPLE_INTERVAL_MS);
    const expected = (speedKmh / 3600) * (SAMPLE_INTERVAL_MS / 1000);
    expect(Math.abs(result!.stepKm - expected)).toBeLessThan(1e-10);
  });

  it("speed-decay to ≤ 0.5 eventually stops dead-reckoning (DR_SPEED_DECAY = 0.98)", () => {
    const DR_SPEED_DECAY = 0.98;
    let speed = 1.0;
    let result = deadReckonStep(origin, 90, speed, SAMPLE_INTERVAL_MS);
    while (result !== null && speed > 0) {
      speed *= DR_SPEED_DECAY;
      result = deadReckonStep(origin, 90, speed, SAMPLE_INTERVAL_MS);
    }
    expect(result).toBeNull(); // DR disengages once speed drops to ≤ 0.5
  });

  it("null return when speed is too low means hook leaves lat/lon null (contract)", () => {
    // deadReckonStep returns null → hook does not update lastKnownLoc, lat/lon
    // remain null when there was never a GPS fix.
    const noStep = deadReckonStep({ lat: 0, lon: 0 }, 0, 0.1, SAMPLE_INTERVAL_MS);
    expect(noStep).toBeNull();
  });
});
