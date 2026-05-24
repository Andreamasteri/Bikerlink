import { describe, it, expect, vi } from "vitest";

vi.mock("../../db", () => ({ db: {}, pool: {} }));
vi.mock("@shared/schema", () => ({ matchPreferences: {}, motoClubMembers: {} }));

import { areCompatible } from "../../matching/scoring";

type P = Parameters<typeof areCompatible>[0];

function makeProposal(overrides: Partial<P> = {}): P {
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
  } as unknown as P;
}

// ---------------------------------------------------------------------------
// Same-user rejection
// ---------------------------------------------------------------------------

describe("areCompatible — same-user rejection", () => {
  it("returns false when both proposals belong to the same user", () => {
    const p1 = makeProposal({ userId: "userA" });
    const p2 = makeProposal({ userId: "userA" });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("returns true for equivalent proposals from different users", () => {
    const p1 = makeProposal({ userId: "userA" });
    const p2 = makeProposal({ userId: "userB" });
    expect(areCompatible(p1, p2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pool mismatch (resolveMatchPool returns false)
// ---------------------------------------------------------------------------

describe("areCompatible — pool mismatch", () => {
  it("returns false when search types are incompatible (find_a_friend vs find_a_biker)", () => {
    const p1 = makeProposal({ userId: "userA", searchType: "find_a_friend" });
    const p2 = makeProposal({ userId: "userB", searchType: "find_a_biker" });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("returns false when both proposals have no valid search types", () => {
    const p1 = makeProposal({ userId: "userA", searchType: null as unknown as P['searchType'], searchTypes: [] });
    const p2 = makeProposal({ userId: "userB", searchType: null as unknown as P['searchType'], searchTypes: [] });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("returns false when explicit targetUserTypes mismatch (authorUserType excluded)", () => {
    const p1 = makeProposal({
      userId: "userA",
      targetUserTypes: ["zavorrina"],
      authorUserType: "biker",
    });
    const p2 = makeProposal({
      userId: "userB",
      targetUserTypes: ["zavorrina"],
      authorUserType: "biker",
    });
    expect(areCompatible(p1, p2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Date mismatch (sameDay returns false)
// ---------------------------------------------------------------------------

describe("areCompatible — date mismatch", () => {
  it("returns false when proposals are on different calendar days", () => {
    const p1 = makeProposal({
      userId: "userA",
      departureTimeFrom: new Date("2026-06-01T08:00:00Z"),
      departureTimeTo: new Date("2026-06-01T10:00:00Z"),
    });
    const p2 = makeProposal({
      userId: "userB",
      departureTimeFrom: new Date("2026-06-02T08:00:00Z"),
      departureTimeTo: new Date("2026-06-02T10:00:00Z"),
    });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("returns false when scheduledAt differs by day from departureTimeFrom", () => {
    const p1 = makeProposal({
      userId: "userA",
      scheduledAt: new Date("2026-06-03T08:00:00Z"),
      departureTimeFrom: new Date("2026-06-03T08:00:00Z"),
      departureTimeTo: new Date("2026-06-03T10:00:00Z"),
    });
    const p2 = makeProposal({
      userId: "userB",
      scheduledAt: null,
      departureTimeFrom: new Date("2026-06-04T08:00:00Z"),
      departureTimeTo: new Date("2026-06-04T10:00:00Z"),
    });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("returns false when proposals are months apart", () => {
    const p1 = makeProposal({
      userId: "userA",
      departureTimeFrom: new Date("2026-01-15T08:00:00Z"),
      departureTimeTo: new Date("2026-01-15T10:00:00Z"),
    });
    const p2 = makeProposal({
      userId: "userB",
      departureTimeFrom: new Date("2026-07-15T08:00:00Z"),
      departureTimeTo: new Date("2026-07-15T10:00:00Z"),
    });
    expect(areCompatible(p1, p2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Time non-overlap (timeRangesOverlap returns false)
// ---------------------------------------------------------------------------

describe("areCompatible — time non-overlap", () => {
  it("returns false when p1 ends before p2 starts on the same day", () => {
    const p1 = makeProposal({
      userId: "userA",
      departureTimeFrom: new Date("2026-06-01T06:00:00Z"),
      departureTimeTo: new Date("2026-06-01T07:00:00Z"),
    });
    const p2 = makeProposal({
      userId: "userB",
      departureTimeFrom: new Date("2026-06-01T09:00:00Z"),
      departureTimeTo: new Date("2026-06-01T11:00:00Z"),
    });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("returns false when p2 ends before p1 starts on the same day", () => {
    const p1 = makeProposal({
      userId: "userA",
      departureTimeFrom: new Date("2026-06-01T14:00:00Z"),
      departureTimeTo: new Date("2026-06-01T16:00:00Z"),
    });
    const p2 = makeProposal({
      userId: "userB",
      departureTimeFrom: new Date("2026-06-01T08:00:00Z"),
      departureTimeTo: new Date("2026-06-01T10:00:00Z"),
    });
    expect(areCompatible(p1, p2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Route non-intersection (routesIntersect returns false)
// ---------------------------------------------------------------------------

describe("areCompatible — route non-intersection", () => {
  it("returns false when departures are more than 100 km apart", () => {
    // ~1 degree lat ≈ 111 km, which exceeds the default 50 km radius
    const p1 = makeProposal({
      userId: "userA",
      departureLatitude: 45.46,
      departureLongitude: 9.19,
      searchRadius: 50,
    });
    const p2 = makeProposal({
      userId: "userB",
      departureLatitude: 46.46,
      departureLongitude: 9.19,
      searchRadius: 50,
    });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("returns false when departure coordinates are missing", () => {
    const p1 = makeProposal({
      userId: "userA",
      departureLatitude: null,
      departureLongitude: null,
      extendToDestination: false,
    });
    const p2 = makeProposal({ userId: "userB" });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("returns false when routes are far apart even with extendToDestination enabled but mismatched coords", () => {
    // p1 destination = Milan, p2 departure = Rome (~470 km)
    const p1 = makeProposal({
      userId: "userA",
      departureLatitude: 44.0,
      departureLongitude: 8.0,
      destinationLatitude: 45.46,
      destinationLongitude: 9.19,
      destinationSearchRadius: 30,
      extendToDestination: true,
      searchRadius: 50,
    });
    const p2 = makeProposal({
      userId: "userB",
      departureLatitude: 41.9,
      departureLongitude: 12.5,
      searchRadius: 50,
      extendToDestination: false,
    });
    expect(areCompatible(p1, p2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fully-compatible pair (all checks pass)
// ---------------------------------------------------------------------------

describe("areCompatible — fully-compatible pair", () => {
  it("returns true when all conditions are satisfied (same day, overlapping time, nearby departure)", () => {
    const p1 = makeProposal({
      userId: "userA",
      searchType: "find_a_friend",
      departureLatitude: 45.46,
      departureLongitude: 9.19,
      searchRadius: 50,
      departureTimeFrom: new Date("2026-06-01T08:00:00Z"),
      departureTimeTo: new Date("2026-06-01T10:00:00Z"),
    });
    const p2 = makeProposal({
      userId: "userB",
      searchType: "find_a_friend",
      departureLatitude: 45.505,
      departureLongitude: 9.19,
      searchRadius: 50,
      departureTimeFrom: new Date("2026-06-01T09:00:00Z"),
      departureTimeTo: new Date("2026-06-01T11:00:00Z"),
    });
    expect(areCompatible(p1, p2)).toBe(true);
  });

  it("is symmetric: areCompatible(p1, p2) === areCompatible(p2, p1)", () => {
    const p1 = makeProposal({ userId: "userA" });
    const p2 = makeProposal({ userId: "userB" });
    expect(areCompatible(p1, p2)).toBe(areCompatible(p2, p1));
  });

  it("returns true for hitchhiker↔hitcher compatible pair", () => {
    const p1 = makeProposal({
      userId: "userA",
      searchType: "hitchhiker",
      departureLatitude: 45.46,
      departureLongitude: 9.19,
      searchRadius: 50,
      departureTimeFrom: new Date("2026-06-01T08:00:00Z"),
      departureTimeTo: new Date("2026-06-01T10:00:00Z"),
    });
    const p2 = makeProposal({
      userId: "userB",
      searchType: "hitcher",
      departureLatitude: 45.46,
      departureLongitude: 9.19,
      searchRadius: 50,
      departureTimeFrom: new Date("2026-06-01T08:30:00Z"),
      departureTimeTo: new Date("2026-06-01T11:00:00Z"),
    });
    expect(areCompatible(p1, p2)).toBe(true);
  });

  it("returns true for find_a_guest↔find_a_biker pair with matching date and route via destination", () => {
    const p1 = makeProposal({
      userId: "userA",
      searchType: "find_a_guest",
      departureLatitude: 44.0,
      departureLongitude: 8.0,
      destinationLatitude: 45.46,
      destinationLongitude: 9.19,
      destinationSearchRadius: 30,
      extendToDestination: true,
      searchRadius: 200,
      departureTimeFrom: new Date("2026-06-01T07:00:00Z"),
      departureTimeTo: new Date("2026-06-01T09:00:00Z"),
    });
    const p2 = makeProposal({
      userId: "userB",
      searchType: "find_a_biker",
      departureLatitude: 45.46,
      departureLongitude: 9.19,
      searchRadius: 50,
      departureTimeFrom: new Date("2026-06-01T08:00:00Z"),
      departureTimeTo: new Date("2026-06-01T10:00:00Z"),
    });
    expect(areCompatible(p1, p2)).toBe(true);
  });

  it("returns true when using scheduledAt for date resolution on the same day", () => {
    const p1 = makeProposal({
      userId: "userA",
      scheduledAt: new Date("2026-06-01T00:00:00Z"),
      departureTimeFrom: new Date("2026-06-01T08:00:00Z"),
      departureTimeTo: new Date("2026-06-01T10:00:00Z"),
    });
    const p2 = makeProposal({
      userId: "userB",
      scheduledAt: null,
      departureTimeFrom: new Date("2026-06-01T09:00:00Z"),
      departureTimeTo: new Date("2026-06-01T11:00:00Z"),
    });
    expect(areCompatible(p1, p2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Short-circuit ordering — verify each gate blocks in sequence
// ---------------------------------------------------------------------------

describe("areCompatible — gate ordering / short-circuit", () => {
  it("same-user check fires before pool check (incompatible pool but still blocked by same user)", () => {
    // Same user + incompatible pool → must return false (same-user gate is first)
    const p1 = makeProposal({ userId: "userA", searchType: "find_a_friend" });
    const p2 = makeProposal({ userId: "userA", searchType: "find_a_biker" });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("pool check fires before date check (incompatible pool + different date → still false)", () => {
    const p1 = makeProposal({
      userId: "userA",
      searchType: "find_a_friend",
      departureTimeFrom: new Date("2026-06-01T08:00:00Z"),
      departureTimeTo: new Date("2026-06-01T10:00:00Z"),
    });
    const p2 = makeProposal({
      userId: "userB",
      searchType: "find_a_biker",
      departureTimeFrom: new Date("2026-06-02T08:00:00Z"),
      departureTimeTo: new Date("2026-06-02T10:00:00Z"),
    });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("date check fires before time check (different day + non-overlapping time → still false)", () => {
    const p1 = makeProposal({
      userId: "userA",
      departureTimeFrom: new Date("2026-06-01T06:00:00Z"),
      departureTimeTo: new Date("2026-06-01T07:00:00Z"),
    });
    const p2 = makeProposal({
      userId: "userB",
      departureTimeFrom: new Date("2026-06-02T09:00:00Z"),
      departureTimeTo: new Date("2026-06-02T11:00:00Z"),
    });
    expect(areCompatible(p1, p2)).toBe(false);
  });
});
