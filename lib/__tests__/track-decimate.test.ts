import { describe, it, expect } from "vitest";
import { decimateTrack } from "../maps/track-decimate";

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
