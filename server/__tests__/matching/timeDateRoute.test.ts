import { describe, it, expect, vi } from "vitest";

vi.mock("../../db", () => ({ db: {}, pool: {} }));
vi.mock("@shared/schema", () => ({ matchPreferences: {}, motoClubMembers: {} }));

import { sameDay, timeRangesOverlap } from "../../matching/filters";
import { routesIntersect } from "../../matching/scoring";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

type RouteProposal = Parameters<typeof routesIntersect>[0];

function makeRouteProposal(overrides: Partial<RouteProposal> = {}): RouteProposal {
  return {
    id: "p1",
    userId: "user1",
    searchType: "find_a_friend",
    searchTypes: [],
    targetUserTypes: [],
    authorUserType: "biker",
    departureLatitude: 45.46,
    departureLongitude: 9.19,
    destinationLatitude: null,
    destinationLongitude: null,
    searchRadius: 50,
    destinationSearchRadius: 30,
    extendToDestination: false,
    scheduledAt: null,
    departureTimeFrom: new Date("2026-06-01T08:00:00Z"),
    departureTimeTo: new Date("2026-06-01T10:00:00Z"),
    clubId: null,
    ...overrides,
  } as unknown as RouteProposal;
}

// ---------------------------------------------------------------------------
// sameDay
// ---------------------------------------------------------------------------

describe("sameDay", () => {
  it("returns true for two dates on the same calendar day", () => {
    const a = new Date("2026-06-01T08:00:00Z");
    const b = new Date("2026-06-01T23:59:59Z");
    expect(sameDay(a, b)).toBe(true);
  });

  it("returns true for the exact same Date object", () => {
    const d = new Date("2026-06-01T12:00:00Z");
    expect(sameDay(d, d)).toBe(true);
  });

  it("returns false when dates are on different days", () => {
    const a = new Date("2026-06-01T23:59:59Z");
    const b = new Date("2026-06-02T00:00:00Z");
    expect(sameDay(a, b)).toBe(false);
  });

  it("returns false when dates are in different months", () => {
    const a = new Date("2026-06-01T10:00:00Z");
    const b = new Date("2026-07-01T10:00:00Z");
    expect(sameDay(a, b)).toBe(false);
  });

  it("returns false when dates are in different years", () => {
    const a = new Date("2025-06-01T10:00:00Z");
    const b = new Date("2026-06-01T10:00:00Z");
    expect(sameDay(a, b)).toBe(false);
  });

  it("returns true when d1 is null (permissive)", () => {
    expect(sameDay(null, new Date("2026-06-01T08:00:00Z"))).toBe(true);
  });

  it("returns true when d2 is null (permissive)", () => {
    expect(sameDay(new Date("2026-06-01T08:00:00Z"), null)).toBe(true);
  });

  it("returns true when both are null", () => {
    expect(sameDay(null, null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// timeRangesOverlap
// ---------------------------------------------------------------------------

describe("timeRangesOverlap", () => {
  const t = (iso: string) => new Date(iso);

  it("returns true for fully overlapping ranges", () => {
    expect(timeRangesOverlap(
      t("2026-06-01T08:00:00Z"), t("2026-06-01T12:00:00Z"),
      t("2026-06-01T10:00:00Z"), t("2026-06-01T14:00:00Z"),
    )).toBe(true);
  });

  it("returns true when range1 contains range2 entirely", () => {
    expect(timeRangesOverlap(
      t("2026-06-01T06:00:00Z"), t("2026-06-01T14:00:00Z"),
      t("2026-06-01T08:00:00Z"), t("2026-06-01T10:00:00Z"),
    )).toBe(true);
  });

  it("returns true when range2 contains range1 entirely", () => {
    expect(timeRangesOverlap(
      t("2026-06-01T08:00:00Z"), t("2026-06-01T10:00:00Z"),
      t("2026-06-01T06:00:00Z"), t("2026-06-01T14:00:00Z"),
    )).toBe(true);
  });

  it("returns true when boundaries touch exactly (adjacent / meeting point)", () => {
    // range1 ends exactly when range2 starts → f1<=t2 && f2<=t1 both true
    expect(timeRangesOverlap(
      t("2026-06-01T08:00:00Z"), t("2026-06-01T10:00:00Z"),
      t("2026-06-01T10:00:00Z"), t("2026-06-01T12:00:00Z"),
    )).toBe(true);
  });

  it("returns true when boundaries touch the other way (range2 ends when range1 starts)", () => {
    expect(timeRangesOverlap(
      t("2026-06-01T10:00:00Z"), t("2026-06-01T12:00:00Z"),
      t("2026-06-01T08:00:00Z"), t("2026-06-01T10:00:00Z"),
    )).toBe(true);
  });

  it("returns false when range1 ends before range2 starts (gap between them)", () => {
    expect(timeRangesOverlap(
      t("2026-06-01T08:00:00Z"), t("2026-06-01T09:00:00Z"),
      t("2026-06-01T10:00:00Z"), t("2026-06-01T12:00:00Z"),
    )).toBe(false);
  });

  it("returns false when range2 ends before range1 starts", () => {
    expect(timeRangesOverlap(
      t("2026-06-01T10:00:00Z"), t("2026-06-01T12:00:00Z"),
      t("2026-06-01T08:00:00Z"), t("2026-06-01T09:00:00Z"),
    )).toBe(false);
  });

  it("returns true when from1 is null (permissive)", () => {
    expect(timeRangesOverlap(
      null, t("2026-06-01T10:00:00Z"),
      t("2026-06-01T08:00:00Z"), t("2026-06-01T12:00:00Z"),
    )).toBe(true);
  });

  it("returns true when to1 is null (permissive)", () => {
    expect(timeRangesOverlap(
      t("2026-06-01T08:00:00Z"), null,
      t("2026-06-01T08:00:00Z"), t("2026-06-01T12:00:00Z"),
    )).toBe(true);
  });

  it("returns true when from2 is null (permissive)", () => {
    expect(timeRangesOverlap(
      t("2026-06-01T08:00:00Z"), t("2026-06-01T10:00:00Z"),
      null, t("2026-06-01T12:00:00Z"),
    )).toBe(true);
  });

  it("returns true when to2 is null (permissive)", () => {
    expect(timeRangesOverlap(
      t("2026-06-01T08:00:00Z"), t("2026-06-01T10:00:00Z"),
      t("2026-06-01T09:00:00Z"), null,
    )).toBe(true);
  });

  it("returns true when all four values are null", () => {
    expect(timeRangesOverlap(null, null, null, null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// routesIntersect
// ---------------------------------------------------------------------------

describe("routesIntersect — departure to departure", () => {
  it("returns true when both departures are at the same point (distance = 0)", () => {
    const p1 = makeRouteProposal({ departureLatitude: 45.46, departureLongitude: 9.19, searchRadius: 50 });
    const p2 = makeRouteProposal({ departureLatitude: 45.46, departureLongitude: 9.19, searchRadius: 50 });
    expect(routesIntersect(p1, p2)).toBe(true);
  });

  it("returns true when departures are within the minimum search radius (~5 km apart, radius 50)", () => {
    // ~0.045 deg lat ≈ 5 km
    const p1 = makeRouteProposal({ departureLatitude: 45.46, departureLongitude: 9.19, searchRadius: 50 });
    const p2 = makeRouteProposal({ departureLatitude: 45.505, departureLongitude: 9.19, searchRadius: 50 });
    expect(routesIntersect(p1, p2)).toBe(true);
  });

  it("returns false when departures are far apart (>100 km) with default radius (50 km)", () => {
    // ~1 degree lat ≈ 111 km
    const p1 = makeRouteProposal({ departureLatitude: 45.46, departureLongitude: 9.19, searchRadius: 50 });
    const p2 = makeRouteProposal({ departureLatitude: 46.46, departureLongitude: 9.19, searchRadius: 50 });
    expect(routesIntersect(p1, p2)).toBe(false);
  });

  it("uses the minimum of the two radii for the distance check", () => {
    // p2 has radius 200 but p1 has radius 10 → min = 10 → ~60 km distance is outside
    const p1 = makeRouteProposal({ departureLatitude: 45.46, departureLongitude: 9.19, searchRadius: 10 });
    const p2 = makeRouteProposal({ departureLatitude: 45.46, departureLongitude: 10.09, searchRadius: 200 });
    // ~0.9 deg longitude at lat 45 ≈ 62 km → outside min(10, 200) = 10
    expect(routesIntersect(p1, p2)).toBe(false);
  });

  it("returns false when departure coordinates are null on either side (no departure match)", () => {
    const p1 = makeRouteProposal({ departureLatitude: null, departureLongitude: null, extendToDestination: false });
    const p2 = makeRouteProposal({ departureLatitude: 45.46, departureLongitude: 9.19 });
    expect(routesIntersect(p1, p2)).toBe(false);
  });

  it("returns false when both departure coordinates are null", () => {
    const p1 = makeRouteProposal({ departureLatitude: null, departureLongitude: null, extendToDestination: false });
    const p2 = makeRouteProposal({ departureLatitude: null, departureLongitude: null, extendToDestination: false });
    expect(routesIntersect(p1, p2)).toBe(false);
  });
});

describe("routesIntersect — destination-overlap path (extendToDestination)", () => {
  it("returns true when p1 extends to destination and p2 departure is within destination radius", () => {
    // p1 destination = Milan, p2 departure = Milan → distance 0 → within 30 km
    const p1 = makeRouteProposal({
      departureLatitude: 44.0, departureLongitude: 8.0, // far away departure
      destinationLatitude: 45.46, destinationLongitude: 9.19,
      destinationSearchRadius: 30,
      extendToDestination: true,
      searchRadius: 50,
    });
    const p2 = makeRouteProposal({
      departureLatitude: 45.46, departureLongitude: 9.19,
      searchRadius: 50,
      extendToDestination: false,
    });
    expect(routesIntersect(p1, p2)).toBe(true);
  });

  it("returns true when p2 extends to destination and p1 departure is within destination radius", () => {
    const p1 = makeRouteProposal({
      departureLatitude: 45.46, departureLongitude: 9.19,
      searchRadius: 50,
      extendToDestination: false,
    });
    const p2 = makeRouteProposal({
      departureLatitude: 44.0, departureLongitude: 8.0,
      destinationLatitude: 45.46, destinationLongitude: 9.19,
      destinationSearchRadius: 30,
      extendToDestination: true,
      searchRadius: 50,
    });
    expect(routesIntersect(p2, p1)).toBe(true);
  });

  it("returns false when p1 extends to destination but p2 departure is far from it", () => {
    // p1 destination = Milan (45.46, 9.19), p2 departure = Rome (41.9, 12.5) → ~470 km
    const p1 = makeRouteProposal({
      departureLatitude: 44.0, departureLongitude: 8.0,
      destinationLatitude: 45.46, destinationLongitude: 9.19,
      destinationSearchRadius: 30,
      extendToDestination: true,
      searchRadius: 50,
    });
    const p2 = makeRouteProposal({
      departureLatitude: 41.9, departureLongitude: 12.5,
      searchRadius: 50,
      extendToDestination: false,
    });
    expect(routesIntersect(p1, p2)).toBe(false);
  });

  it("does not trigger destination check when extendToDestination is false even if coords are set", () => {
    const p1 = makeRouteProposal({
      departureLatitude: 44.0, departureLongitude: 8.0,
      destinationLatitude: 45.46, destinationLongitude: 9.19,
      destinationSearchRadius: 30,
      extendToDestination: false, // key: disabled
      searchRadius: 50,
    });
    const p2 = makeRouteProposal({
      departureLatitude: 45.46, departureLongitude: 9.19,
      searchRadius: 50,
      extendToDestination: false,
    });
    // p1 departure (44.0,8.0) is far from p2 departure (45.46,9.19) ≈ 200 km → no match
    expect(routesIntersect(p1, p2)).toBe(false);
  });

  it("returns false when extendToDestination is true but destination coords are null", () => {
    const p1 = makeRouteProposal({
      departureLatitude: 44.0, departureLongitude: 8.0,
      destinationLatitude: null, destinationLongitude: null,
      extendToDestination: true,
      searchRadius: 50,
    });
    const p2 = makeRouteProposal({
      departureLatitude: 45.46, departureLongitude: 9.19,
      searchRadius: 50,
    });
    // departure check: p1 (44.0,8.0) vs p2 (45.46,9.19) is ~200 km → fails
    // destination check: skipped because destinationLatitude is null
    expect(routesIntersect(p1, p2)).toBe(false);
  });

  it("uses destinationSearchRadius defaulting to 30 when not set", () => {
    // destination exactly at p2 departure → distance 0 → within default 30 km radius
    const p1 = makeRouteProposal({
      departureLatitude: 44.0, departureLongitude: 8.0,
      destinationLatitude: 45.46, destinationLongitude: 9.19,
      destinationSearchRadius: undefined as unknown as number,
      extendToDestination: true,
      searchRadius: 50,
    });
    const p2 = makeRouteProposal({
      departureLatitude: 45.46, departureLongitude: 9.19,
      searchRadius: 50,
    });
    expect(routesIntersect(p1, p2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// routesIntersect — zero-radius edge cases
// The implementation uses `radius || 50` / `destRadius || 30`, so a radius of
// 0 is treated as falsy and falls back to the default.  These tests pin that
// behaviour so future refactors cannot silently change it.
// ---------------------------------------------------------------------------

describe("routesIntersect — zero-radius edge cases", () => {
  it("searchRadius 0 on p1 falls back to 50 km default: nearby departures still match", () => {
    // ~5 km apart; with default 50 km both are well within range
    const p1 = makeRouteProposal({ departureLatitude: 45.46, departureLongitude: 9.19, searchRadius: 0 });
    const p2 = makeRouteProposal({ departureLatitude: 45.505, departureLongitude: 9.19, searchRadius: 50 });
    // min(0||50, 50) = 50 → distance ~5 km ≤ 50 → true
    expect(routesIntersect(p1, p2)).toBe(true);
  });

  it("searchRadius 0 on both proposals falls back to 50/50: same departure point still matches", () => {
    const p1 = makeRouteProposal({ departureLatitude: 45.46, departureLongitude: 9.19, searchRadius: 0 });
    const p2 = makeRouteProposal({ departureLatitude: 45.46, departureLongitude: 9.19, searchRadius: 0 });
    // min(0||50, 0||50) = 50 → distance 0 ≤ 50 → true
    expect(routesIntersect(p1, p2)).toBe(true);
  });

  it("searchRadius 0 on p1 with asymmetric far departure: minimum radius is still 50 from fallback", () => {
    // ~200 km apart; even with fallback 50 km they won't match
    const p1 = makeRouteProposal({ departureLatitude: 45.46, departureLongitude: 9.19, searchRadius: 0 });
    const p2 = makeRouteProposal({ departureLatitude: 43.72, departureLongitude: 7.41, searchRadius: 50 });
    // ~200 km > 50 km → false
    expect(routesIntersect(p1, p2)).toBe(false);
  });

  it("destinationSearchRadius 0 falls back to 30 km default when extendToDestination is true", () => {
    // destination exactly at p2 departure → distance 0 → within default 30 km
    const p1 = makeRouteProposal({
      departureLatitude: 44.0, departureLongitude: 8.0,
      destinationLatitude: 45.46, destinationLongitude: 9.19,
      destinationSearchRadius: 0,
      extendToDestination: true,
      searchRadius: 50,
    });
    const p2 = makeRouteProposal({
      departureLatitude: 45.46, departureLongitude: 9.19,
      searchRadius: 50,
    });
    // 0 || 30 = 30 → distance 0 ≤ 30 → true
    expect(routesIntersect(p1, p2)).toBe(true);
  });

  it("destinationSearchRadius 0 fallback 30 km: destination far from p2 departure still fails", () => {
    // destination at Milan (45.46, 9.19), p2 departure at Rome (41.9, 12.5) ≈ 470 km
    const p1 = makeRouteProposal({
      departureLatitude: 44.0, departureLongitude: 8.0,
      destinationLatitude: 45.46, destinationLongitude: 9.19,
      destinationSearchRadius: 0,
      extendToDestination: true,
      searchRadius: 50,
    });
    const p2 = makeRouteProposal({
      departureLatitude: 41.9, departureLongitude: 12.5,
      searchRadius: 50,
    });
    // ~470 km > 30 km fallback → false
    expect(routesIntersect(p1, p2)).toBe(false);
  });
});
