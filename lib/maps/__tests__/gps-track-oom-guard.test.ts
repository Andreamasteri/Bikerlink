import { describe, it, expect, vi } from "vitest";

vi.mock("../../leaflet-bundle", () => ({
  LEAFLET_JS: "/* leaflet-js-stub */",
  LEAFLET_CSS: "/* leaflet-css-stub */",
}));

import { buildLeafletGpsTrackHtml, GpsSample } from "../../leaflet-gps-track-html";
import { buildLeafletTrackingMapHtml } from "../../leaflet-tracking-map-html";
import { decimateTrack } from "../track-decimate";

const SIZE_LIMIT_BYTES = 500 * 1024;
const MAX_POINTS = 1500;

function byteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

function makeSamples(count: number): GpsSample[] {
  const samples: GpsSample[] = [];
  for (let i = 0; i < count; i++) {
    const frac = i / count;
    samples.push({
      ts: Date.now() + i * 1000,
      lat: 41.0 + frac * 5,
      lon: 12.0 + frac * 5,
      speedKmh: 60 + (i % 80),
      leanAngle: (i % 60) - 30,
    });
  }
  return samples;
}

function makeTrackPoints(count: number): Array<{ lat: number; lng: number }> {
  return Array.from({ length: count }, (_, i) => ({
    lat: 41.0 + (i / count) * 5,
    lng: 12.0 + (i / count) * 5,
  }));
}

/**
 * Extract the decimatePoints function body from the embedded HTML/JS and return
 * it as a callable Node function. This lets us verify the WebView-side decimation
 * logic without spinning up a real browser.
 */
function extractDecimatePointsFn(html: string): (pts: unknown[], maxPts: number) => unknown[] {
  const match = html.match(/function decimatePoints\(pts, maxPts\)([\s\S]*?\n  \})/);
  if (!match) throw new Error("decimatePoints not found in tracking map HTML");
  // eslint-disable-next-line no-new-func
  const fn = new Function("pts", "maxPts", match[1]) as (pts: unknown[], maxPts: number) => unknown[];
  return fn;
}

describe("decimateTrack — OOM guard", () => {
  it("caps 20 000 points to at most DEFAULT_MAX_POINTS (1500)", () => {
    const input = makeSamples(20_000);
    const output = decimateTrack(input);
    expect(output.length).toBeLessThanOrEqual(MAX_POINTS);
  });

  it("preserves the first and last point", () => {
    const input = makeSamples(20_000);
    const output = decimateTrack(input);
    expect(output[0]).toBe(input[0]);
    expect(output[output.length - 1]).toBe(input[input.length - 1]);
  });

  it("leaves short arrays untouched", () => {
    const input = makeSamples(100);
    const output = decimateTrack(input);
    expect(output).toHaveLength(100);
    expect(output).toBe(input);
  });

  it("respects a custom maxPoints parameter", () => {
    const input = makeSamples(5_000);
    const output = decimateTrack(input, 300);
    expect(output.length).toBeLessThanOrEqual(300);
    expect(output.length).toBeGreaterThanOrEqual(2);
  });
});

describe("buildLeafletGpsTrackHtml — payload size guard", () => {
  it("produces HTML under 500 KB for a 20 000-point ride (speed mode)", () => {
    const samples = makeSamples(20_000);
    const html = buildLeafletGpsTrackHtml(
      "https://tile.example/{z}/{x}/{y}.png",
      19,
      samples,
      "#FF6600",
      "speed"
    );
    expect(byteLength(html)).toBeLessThan(SIZE_LIMIT_BYTES);
  });

  it("produces HTML under 500 KB for a 20 000-point ride (lean mode)", () => {
    const samples = makeSamples(20_000);
    const html = buildLeafletGpsTrackHtml(
      "https://tile.example/{z}/{x}/{y}.png",
      19,
      samples,
      "#FF6600",
      "lean"
    );
    expect(byteLength(html)).toBeLessThan(SIZE_LIMIT_BYTES);
  });

  it("embeds at most 1500 sample objects in the HTML payload", () => {
    const samples = makeSamples(20_000);
    const html = buildLeafletGpsTrackHtml(
      "https://tile.example/{z}/{x}/{y}.png",
      19,
      samples
    );
    const match = html.match(/var samples = (\[[\s\S]*?\]);/);
    expect(match).not.toBeNull();
    const parsed: unknown[] = JSON.parse(match![1]);
    expect(parsed.length).toBeLessThanOrEqual(MAX_POINTS);
  });

  it("handles an empty sample list without throwing", () => {
    const html = buildLeafletGpsTrackHtml(
      "https://tile.example/{z}/{x}/{y}.png",
      19,
      []
    );
    expect(html).toContain("<!DOCTYPE html>");
  });
});

describe("buildLeafletTrackingMapHtml — runtime decimation guard", () => {
  it("embeds the decimatePoints function in the inline JS", () => {
    const html = buildLeafletTrackingMapHtml(
      "https://tile.example/{z}/{x}/{y}.png",
      19
    );
    expect(html).toContain("function decimatePoints");
    expect(html).toContain("MAX_TRACK_POINTS");
  });

  it("decimatePoints caps 20 000 live points to at most 1500", () => {
    const html = buildLeafletTrackingMapHtml(
      "https://tile.example/{z}/{x}/{y}.png",
      19
    );
    const decimatePoints = extractDecimatePointsFn(html);
    const input = makeTrackPoints(20_000);
    const output = decimatePoints(input, 1500);
    expect(output.length).toBeLessThanOrEqual(MAX_POINTS);
  });

  it("decimatePoints preserves first and last point for large arrays", () => {
    const html = buildLeafletTrackingMapHtml(
      "https://tile.example/{z}/{x}/{y}.png",
      19
    );
    const decimatePoints = extractDecimatePointsFn(html);
    const input = makeTrackPoints(20_000);
    const output = decimatePoints(input, 1500) as typeof input;
    expect(output[0]).toEqual(input[0]);
    expect(output[output.length - 1]).toEqual(input[input.length - 1]);
  });

  it("decimatePoints passes short arrays through unchanged", () => {
    const html = buildLeafletTrackingMapHtml(
      "https://tile.example/{z}/{x}/{y}.png",
      19
    );
    const decimatePoints = extractDecimatePointsFn(html);
    const input = makeTrackPoints(100);
    const output = decimatePoints(input, 1500);
    expect(output).toBe(input);
  });

  it("applyUpdate uses decimatePoints (MAX_TRACK_POINTS referenced in update path)", () => {
    const html = buildLeafletTrackingMapHtml(
      "https://tile.example/{z}/{x}/{y}.png",
      19
    );
    expect(html).toContain("MAX_TRACK_POINTS");
    expect(html).toMatch(/decimatePoints\([\s\S]+?,\s*MAX_TRACK_POINTS\)/);
  });

  it("template size stays under 500 KB (with Leaflet CSS+JS stubs)", () => {
    const html = buildLeafletTrackingMapHtml(
      "https://tile.example/{z}/{x}/{y}.png",
      19
    );
    expect(byteLength(html)).toBeLessThan(SIZE_LIMIT_BYTES);
  });
});

describe("decimateTrack — edge cases", () => {
  it("clamps maxPoints to a minimum of 2", () => {
    const input = makeSamples(100);
    const output = decimateTrack(input, 0);
    expect(output.length).toBeGreaterThanOrEqual(2);
  });

  it("handles a single-element array without throwing", () => {
    const input = makeSamples(1);
    const output = decimateTrack(input);
    expect(output).toHaveLength(1);
  });
});
