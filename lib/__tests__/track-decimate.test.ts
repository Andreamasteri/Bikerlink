import { describe, it, expect } from "vitest";
import { decimateTrack, decimateTrackCurvatureAware } from "../maps/track-decimate";

function makeTrack(n: number): Array<{ lat: number; lng: number }> {
  return Array.from({ length: n }, (_, i) => ({
    lat: 45 + i * 0.0001,
    lng: 10 + i * 0.0001,
  }));
}

function makeTrackWithSpeed(
  n: number
): Array<{ lat: number; lng: number; speedKmh: number }> {
  return Array.from({ length: n }, (_, i) => ({
    lat: 45 + i * 0.0001,
    lng: 10 + i * 0.0001,
    speedKmh: i % 10,
  }));
}

describe("decimateTrack", () => {
  it("returns the original array unchanged when length <= maxPoints", () => {
    const pts = makeTrack(1500);
    const result = decimateTrack(pts);
    expect(result).toBe(pts);
    expect(result.length).toBe(1500);
  });

  it("returns the original array unchanged when length < maxPoints", () => {
    const pts = makeTrack(100);
    const result = decimateTrack(pts);
    expect(result).toBe(pts);
    expect(result.length).toBe(100);
  });

  it("reduces 50 000-point track to exactly maxPoints (1500)", () => {
    const pts = makeTrack(50_000);
    const result = decimateTrack(pts);
    expect(result.length).toBe(1500);
  });

  it("reduces 50 000-point track to a custom maxPoints when provided", () => {
    const pts = makeTrack(50_000);
    const result = decimateTrack(pts, 500);
    expect(result.length).toBe(500);
  });

  it("always preserves the first point", () => {
    const pts = makeTrack(50_000);
    const result = decimateTrack(pts);
    expect(result[0]).toBe(pts[0]);
  });

  it("always preserves the last point", () => {
    const pts = makeTrack(50_000);
    const result = decimateTrack(pts);
    expect(result[result.length - 1]).toBe(pts[pts.length - 1]);
  });

  it("preserves first and last with a non-default maxPoints", () => {
    const pts = makeTrack(10_000);
    const result = decimateTrack(pts, 200);
    expect(result[0]).toBe(pts[0]);
    expect(result[result.length - 1]).toBe(pts[pts.length - 1]);
  });

  it("handles an empty array without throwing", () => {
    const result = decimateTrack([]);
    expect(result).toEqual([]);
  });

  it("handles a single-point array without throwing", () => {
    const pts = makeTrack(1);
    const result = decimateTrack(pts);
    expect(result).toBe(pts);
    expect(result.length).toBe(1);
  });

  it("handles a two-point array (boundary: equal to clampedMax=2 for maxPoints=2)", () => {
    const pts = makeTrack(2);
    const result = decimateTrack(pts, 2);
    expect(result).toBe(pts);
    expect(result.length).toBe(2);
  });

  it("preserves speed data on sampled points", () => {
    const pts = makeTrackWithSpeed(50_000);
    const result = decimateTrack(pts);
    expect(result.length).toBe(1500);
    for (const p of result) {
      expect(typeof p.speedKmh).toBe("number");
    }
  });

  it("preserves speed data on the first sampled point", () => {
    const pts = makeTrackWithSpeed(50_000);
    const result = decimateTrack(pts);
    expect(result[0].speedKmh).toBe(pts[0].speedKmh);
  });

  it("preserves speed data on the last sampled point", () => {
    const pts = makeTrackWithSpeed(50_000);
    const result = decimateTrack(pts);
    const last = result[result.length - 1];
    expect(last.speedKmh).toBe(pts[pts.length - 1].speedKmh);
  });

  it("clamps maxPoints to at least 2 when given 0", () => {
    const pts = makeTrack(10);
    const result = decimateTrack(pts, 0);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(pts[0]);
    expect(result[result.length - 1]).toBe(pts[pts.length - 1]);
  });

  it("clamps maxPoints to at least 2 when given 1", () => {
    const pts = makeTrack(10);
    const result = decimateTrack(pts, 1);
    expect(result.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Synthetic hairpin used in multiple curvature-aware tests.
// The track goes north (indices 0-4), reaches the apex at index 5 (lat 44.5),
// then returns south-east (indices 6-10).  The direction reversal at index 5
// produces ~180° bearing change — the sharpest possible bend.
// ---------------------------------------------------------------------------
function makeHairpinTrack(): Array<{ lat: number; lng: number }> {
  return [
    { lat: 44.0, lng: 10.0 },
    { lat: 44.1, lng: 10.0 },
    { lat: 44.2, lng: 10.0 },
    { lat: 44.3, lng: 10.0 },
    { lat: 44.4, lng: 10.0 },
    { lat: 44.5, lng: 10.0 }, // apex — sharp U-turn
    { lat: 44.4, lng: 10.001 },
    { lat: 44.3, lng: 10.001 },
    { lat: 44.2, lng: 10.001 },
    { lat: 44.1, lng: 10.001 },
    { lat: 44.0, lng: 10.001 },
  ];
}

describe("decimateTrackCurvatureAware", () => {
  it("returns the original array unchanged when length <= maxPoints", () => {
    const pts = makeTrack(1500);
    const result = decimateTrackCurvatureAware(pts);
    expect(result).toBe(pts);
  });

  it("returns at most maxPoints", () => {
    const pts = makeTrack(50_000);
    const result = decimateTrackCurvatureAware(pts, 500);
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it("always preserves the first point", () => {
    const pts = makeTrack(50_000);
    const result = decimateTrackCurvatureAware(pts, 500);
    expect(result[0]).toBe(pts[0]);
  });

  it("always preserves the last point", () => {
    const pts = makeTrack(50_000);
    const result = decimateTrackCurvatureAware(pts, 500);
    expect(result[result.length - 1]).toBe(pts[pts.length - 1]);
  });

  it("handles an empty array without throwing", () => {
    expect(decimateTrackCurvatureAware([])).toEqual([]);
  });

  it("handles a two-point array without throwing", () => {
    const pts = [
      { lat: 44.0, lng: 10.0 },
      { lat: 44.1, lng: 10.0 },
    ];
    const result = decimateTrackCurvatureAware(pts, 10);
    expect(result).toBe(pts);
  });

  it("preserves the hairpin apex that uniform stride would drop", () => {
    const pts = makeHairpinTrack();
    // Uniform stride with 4 points picks indices 0, 3, 6, 10 — missing apex (5).
    // Curvature-aware must include index 5 (lat 44.5).
    const result = decimateTrackCurvatureAware(pts, 4);
    const lats = result.map((p) => p.lat);
    expect(lats).toContain(44.5);
  });

  it("uniform stride misses the same apex that curvature-aware keeps", () => {
    const pts = makeHairpinTrack();
    const result = decimateTrack(pts, 4);
    const lats = result.map((p) => p.lat);
    // Confirm the regression being fixed: apex is absent in the naïve approach.
    expect(lats).not.toContain(44.5);
  });

  it("preserves start and end on the hairpin track with tight budget", () => {
    const pts = makeHairpinTrack();
    const result = decimateTrackCurvatureAware(pts, 3);
    expect(result[0]).toEqual(pts[0]);
    expect(result[result.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it("preserves the apex even when the budget equals 2 (only endpoints)", () => {
    // With budget=2 we can only keep start+end; apex must yield to the hard
    // constraint.  The result must still be exactly 2 points without crashing.
    const pts = makeHairpinTrack();
    const result = decimateTrackCurvatureAware(pts, 2);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual(pts[0]);
    expect(result[result.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it("does not produce more points than the input for a straight track", () => {
    const pts = makeTrack(20);
    const result = decimateTrackCurvatureAware(pts, 1500);
    expect(result.length).toBe(20);
  });

  it("result contains only points from the original array (no interpolation)", () => {
    const pts = makeHairpinTrack();
    const result = decimateTrackCurvatureAware(pts, 5);
    for (const rp of result) {
      expect(pts).toContainEqual(rp);
    }
  });

  it("result is ordered by original track index (no reordering)", () => {
    const pts = makeHairpinTrack();
    const result = decimateTrackCurvatureAware(pts, 5);
    let prevIdx = -1;
    for (const rp of result) {
      const idx = pts.findIndex((p) => p.lat === rp.lat && p.lng === rp.lng);
      expect(idx).toBeGreaterThan(prevIdx);
      prevIdx = idx;
    }
  });
});
