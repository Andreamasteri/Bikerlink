import { vi, describe, it, expect, beforeAll } from "vitest";

vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "/tmp/test-cache/",
}));

vi.mock("@/lib/maps/tile-cache", () => ({
  TILE_CACHE_BRIDGE_SCRIPT: "",
  MAPLIBRE_TILE_CACHE_PROTOCOL_SCRIPT: "",
  tileCacheGet: vi.fn(),
  tileCacheSet: vi.fn(),
}));

import { buildLeafletRouteMapHtml } from "../leaflet/map-builder";
import { buildMapLibreRouteHtml } from "../maplibre/secondary-builders";

const N = 50_000;

function makeLargeTrack(
  n: number
): Array<{ lat: number; lng: number; speedKmh: number }> {
  return Array.from({ length: n }, (_, i) => ({
    lat: 44 + i * 0.000002,
    lng: 11 + i * 0.000002,
    speedKmh: (i % 120) + 10,
  }));
}

function makeWaypoints(): Array<{
  lat: number;
  lng: number;
  name: string;
  waypointType: string;
}> {
  return [
    { lat: 44.0, lng: 11.0, name: "Start", waypointType: "start" },
    { lat: 44.1, lng: 11.1, name: "End", waypointType: "end" },
  ];
}

function extractJsonArray(html: string, varName: string): unknown[] {
  const marker = `var ${varName} = `;
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) {
    throw new Error(`Variable "${varName}" not found in HTML`);
  }
  const arrayStart = startIdx + marker.length;
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = arrayStart; i < html.length; i++) {
    const ch = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1)
    throw new Error(`Could not find closing bracket for "${varName}"`);
  return JSON.parse(html.slice(arrayStart, end + 1)) as unknown[];
}

describe("buildLeafletRouteMapHtml — decimation integration", () => {
  const waypoints = makeWaypoints();
  const typeColors = { start: "#4CAF50", end: "#E63946" };
  let track: ReturnType<typeof makeLargeTrack>;

  beforeAll(() => {
    track = makeLargeTrack(N);
  });

  it("embeds at most 1500 coordinate pairs for a 50 000-point track", () => {
    const html = buildLeafletRouteMapHtml(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      19,
      waypoints,
      "#FF6600",
      typeColors,
      true,
      track
    );
    const pts = extractJsonArray(html, "polylinePoints");
    expect(pts.length).toBeLessThanOrEqual(1500);
  });

  it("embeds at least 2 points (non-trivial output) for a 50 000-point track", () => {
    const html = buildLeafletRouteMapHtml(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      19,
      waypoints,
      "#FF6600",
      typeColors,
      true,
      track
    );
    const pts = extractJsonArray(html, "polylinePoints");
    expect(pts.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves the first track point in the embedded polyline", () => {
    const html = buildLeafletRouteMapHtml(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      19,
      waypoints,
      "#FF6600",
      typeColors,
      true,
      track
    );
    const pts = extractJsonArray(html, "polylinePoints") as Array<{
      lat: number;
      lng: number;
    }>;
    expect(pts[0].lat).toBeCloseTo(track[0].lat, 8);
    expect(pts[0].lng).toBeCloseTo(track[0].lng, 8);
  });

  it("preserves the last track point in the embedded polyline", () => {
    const html = buildLeafletRouteMapHtml(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      19,
      waypoints,
      "#FF6600",
      typeColors,
      true,
      track
    );
    const pts = extractJsonArray(html, "polylinePoints") as Array<{
      lat: number;
      lng: number;
    }>;
    const last = pts[pts.length - 1];
    expect(last.lat).toBeCloseTo(track[track.length - 1].lat, 8);
    expect(last.lng).toBeCloseTo(track[track.length - 1].lng, 8);
  });

  it("passes through a short track unchanged (no decimation)", () => {
    const shortTrack = makeLargeTrack(100);
    const html = buildLeafletRouteMapHtml(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      19,
      waypoints,
      "#FF6600",
      typeColors,
      true,
      shortTrack
    );
    const pts = extractJsonArray(html, "polylinePoints");
    expect(pts.length).toBe(100);
  });
});

describe("buildMapLibreRouteHtml — decimation integration", () => {
  const waypoints = [
    { lat: 44.0, lng: 11.0, name: "Start" },
    { lat: 44.1, lng: 11.1, name: "End" },
  ];
  let track: ReturnType<typeof makeLargeTrack>;

  beforeAll(() => {
    track = makeLargeTrack(N);
  });

  it("embeds at most 1500 coordinate pairs for a 50 000-point track", () => {
    const html = buildMapLibreRouteHtml("{}", waypoints, track);
    const pts = extractJsonArray(html, "track");
    expect(pts.length).toBeLessThanOrEqual(1500);
  });

  it("embeds at least 2 points (non-trivial output) for a 50 000-point track", () => {
    const html = buildMapLibreRouteHtml("{}", waypoints, track);
    const pts = extractJsonArray(html, "track");
    expect(pts.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves the first track point in the embedded track", () => {
    const html = buildMapLibreRouteHtml("{}", waypoints, track);
    const pts = extractJsonArray(html, "track") as Array<{
      lat: number;
      lng: number;
    }>;
    expect(pts[0].lat).toBeCloseTo(track[0].lat, 8);
    expect(pts[0].lng).toBeCloseTo(track[0].lng, 8);
  });

  it("preserves the last track point in the embedded track", () => {
    const html = buildMapLibreRouteHtml("{}", waypoints, track);
    const pts = extractJsonArray(html, "track") as Array<{
      lat: number;
      lng: number;
    }>;
    const last = pts[pts.length - 1];
    expect(last.lat).toBeCloseTo(track[track.length - 1].lat, 8);
    expect(last.lng).toBeCloseTo(track[track.length - 1].lng, 8);
  });

  it("passes through a short track unchanged (no decimation)", () => {
    const shortTrack = makeLargeTrack(500);
    const html = buildMapLibreRouteHtml("{}", waypoints, shortTrack);
    const pts = extractJsonArray(html, "track");
    expect(pts.length).toBe(500);
  });

  it("handles undefined trackPoints (falls back to empty array)", () => {
    const html = buildMapLibreRouteHtml("{}", waypoints, undefined);
    const pts = extractJsonArray(html, "track");
    expect(pts.length).toBe(0);
  });
});
