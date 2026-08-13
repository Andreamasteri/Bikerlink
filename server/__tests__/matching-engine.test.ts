import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({
  db: {},
  pool: {},
}));

vi.mock("@shared/db", () => ({
  matchPreferences: {},
  motoClubMembers: {},
}));

import {
  deriveTargetUserTypes,
  resolveMatchPool,
  routesIntersect,
  areCompatible,
} from "../matching/scoring";

type P = Parameters<typeof areCompatible>[0];

function makeProposal(overrides: Partial<P> = {}): P {
  return {
    id: "p1",
    userId: "user1",
    searchType: "find_a_friend",
    targetUserTypes: [],
    authorUserType: "biker",
    departureLatitude: 45.0,
    departureLongitude: 9.0,
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
// deriveTargetUserTypes
// ---------------------------------------------------------------------------
describe("deriveTargetUserTypes", () => {
  it("returns explicit targetUserTypes when present", () => {
    const p = makeProposal({ targetUserTypes: ["zavorrina"] });
    expect(deriveTargetUserTypes(p)).toEqual(["zavorrina"]);
  });

  it("find_a_friend → biker + coppia", () => {
    const p = makeProposal({ searchType: "find_a_friend", targetUserTypes: [] });
    expect(deriveTargetUserTypes(p)).toEqual(["biker", "coppia"]);
  });

  it("find_a_biker → biker + coppia", () => {
    const p = makeProposal({ searchType: "find_a_biker", targetUserTypes: [] });
    expect(deriveTargetUserTypes(p)).toEqual(["biker", "coppia"]);
  });

  it("find_a_guest → zavorrina + coppia", () => {
    const p = makeProposal({ searchType: "find_a_guest", targetUserTypes: [] });
    expect(deriveTargetUserTypes(p)).toEqual(["zavorrina", "coppia"]);
  });

  it("hitchhiker → biker + coppia", () => {
    const p = makeProposal({ searchType: "hitchhiker", targetUserTypes: [] });
    expect(deriveTargetUserTypes(p)).toEqual(["biker", "coppia"]);
  });

  it("hitcher → zavorrina + coppia", () => {
    const p = makeProposal({ searchType: "hitcher", targetUserTypes: [] });
    expect(deriveTargetUserTypes(p)).toEqual(["zavorrina", "coppia"]);
  });

  it("unknown searchType → biker + zavorrina + coppia", () => {
    const p = makeProposal({ searchType: "something_else" as unknown as P['searchType'], targetUserTypes: [] });
    expect(deriveTargetUserTypes(p)).toEqual(["biker", "zavorrina", "coppia"]);
  });
});

// ---------------------------------------------------------------------------
// resolveMatchPool
// ---------------------------------------------------------------------------
describe("resolveMatchPool — rule-based (no explicit targetUserTypes)", () => {
  it("find_a_friend ↔ find_a_friend matches", () => {
    const p1 = makeProposal({ searchType: "find_a_friend", targetUserTypes: [] });
    const p2 = makeProposal({ searchType: "find_a_friend", targetUserTypes: [] });
    expect(resolveMatchPool(p1, p2)).toBe(true);
  });

  it("find_a_guest ↔ find_a_biker matches (both orders)", () => {
    const guest = makeProposal({ searchType: "find_a_guest", targetUserTypes: [] });
    const biker = makeProposal({ searchType: "find_a_biker", targetUserTypes: [] });
    expect(resolveMatchPool(guest, biker)).toBe(true);
    expect(resolveMatchPool(biker, guest)).toBe(true);
  });

  it("hitcher ↔ hitchhiker matches (both orders)", () => {
    const hitcher = makeProposal({ searchType: "hitcher", targetUserTypes: [] });
    const hitchhiker = makeProposal({ searchType: "hitchhiker", targetUserTypes: [] });
    expect(resolveMatchPool(hitcher, hitchhiker)).toBe(true);
    expect(resolveMatchPool(hitchhiker, hitcher)).toBe(true);
  });

  it("find_a_guest ↔ hitchhiker matches (cross-rule)", () => {
    const guest = makeProposal({ searchType: "find_a_guest", targetUserTypes: [] });
    const hitchhiker = makeProposal({ searchType: "hitchhiker", targetUserTypes: [] });
    expect(resolveMatchPool(guest, hitchhiker)).toBe(true);
    expect(resolveMatchPool(hitchhiker, guest)).toBe(true);
  });

  it("hitcher ↔ find_a_biker matches (cross-rule)", () => {
    const hitcher = makeProposal({ searchType: "hitcher", targetUserTypes: [] });
    const biker = makeProposal({ searchType: "find_a_biker", targetUserTypes: [] });
    expect(resolveMatchPool(hitcher, biker)).toBe(true);
    expect(resolveMatchPool(biker, hitcher)).toBe(true);
  });

  it("find_a_friend ↔ find_a_biker does NOT match", () => {
    const friend = makeProposal({ searchType: "find_a_friend", targetUserTypes: [] });
    const biker = makeProposal({ searchType: "find_a_biker", targetUserTypes: [] });
    expect(resolveMatchPool(friend, biker)).toBe(false);
  });

  it("hitcher ↔ find_a_friend does NOT match", () => {
    const hitcher = makeProposal({ searchType: "hitcher", targetUserTypes: [] });
    const friend = makeProposal({ searchType: "find_a_friend", targetUserTypes: [] });
    expect(resolveMatchPool(hitcher, friend)).toBe(false);
  });

  it("returns false when searchType is missing on either side", () => {
    const p1 = makeProposal({ searchType: null as unknown as P['searchType'], targetUserTypes: [] });
    const p2 = makeProposal({ searchType: "find_a_friend", targetUserTypes: [] });
    expect(resolveMatchPool(p1, p2)).toBe(false);
  });
});

describe("resolveMatchPool — explicit targetUserTypes (authorUserType-based)", () => {
  it("biker seeking zavorrina matches zavorrina seeking biker (explicit targets)", () => {
    const p1 = makeProposal({ authorUserType: "biker", targetUserTypes: ["zavorrina"] });
    const p2 = makeProposal({ authorUserType: "zavorrina", targetUserTypes: ["biker"] });
    expect(resolveMatchPool(p1, p2)).toBe(true);
  });

  it("fails when p2 author type not in p1 explicit targets", () => {
    const p1 = makeProposal({ authorUserType: "biker", targetUserTypes: ["biker"] });
    const p2 = makeProposal({ authorUserType: "zavorrina", targetUserTypes: ["biker"] });
    expect(resolveMatchPool(p1, p2)).toBe(false);
  });

  it("fails when only one direction is valid (p1 targets p2, but p2 does not target p1)", () => {
    const p1 = makeProposal({ authorUserType: "biker", targetUserTypes: ["zavorrina"] });
    const p2 = makeProposal({ authorUserType: "zavorrina", targetUserTypes: ["zavorrina"] });
    expect(resolveMatchPool(p1, p2)).toBe(false);
  });

  it("coppia author matches biker seeking coppia (both directions explicit)", () => {
    const p1 = makeProposal({ authorUserType: "coppia", targetUserTypes: ["biker"] });
    const p2 = makeProposal({ authorUserType: "biker", targetUserTypes: ["coppia"] });
    expect(resolveMatchPool(p1, p2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// routesIntersect
// ---------------------------------------------------------------------------
describe("routesIntersect", () => {
  it("returns true when departures are within combined search radius", () => {
    const p1 = makeProposal({ departureLatitude: 45.0, departureLongitude: 9.0, searchRadius: 50 });
    const p2 = makeProposal({ departureLatitude: 45.1, departureLongitude: 9.1, searchRadius: 50 });
    expect(routesIntersect(p1, p2)).toBe(true);
  });

  it("returns false when departures are too far apart", () => {
    const p1 = makeProposal({ departureLatitude: 45.0, departureLongitude: 9.0, searchRadius: 5 });
    const p2 = makeProposal({ departureLatitude: 46.0, departureLongitude: 10.0, searchRadius: 5 });
    expect(routesIntersect(p1, p2)).toBe(false);
  });

  it("returns true when p1 destination overlaps p2 departure (extendToDestination)", () => {
    const p1 = makeProposal({
      departureLatitude: 40.0,
      departureLongitude: 5.0,
      searchRadius: 5,
      extendToDestination: true,
      destinationLatitude: 45.0,
      destinationLongitude: 9.0,
      destinationSearchRadius: 50,
    });
    const p2 = makeProposal({
      departureLatitude: 45.1,
      departureLongitude: 9.1,
      searchRadius: 5,
    });
    expect(routesIntersect(p1, p2)).toBe(true);
  });

  it("returns true when p2 destination overlaps p1 departure (extendToDestination on p2)", () => {
    const p1 = makeProposal({
      departureLatitude: 45.1,
      departureLongitude: 9.1,
      searchRadius: 5,
    });
    const p2 = makeProposal({
      departureLatitude: 40.0,
      departureLongitude: 5.0,
      searchRadius: 5,
      extendToDestination: true,
      destinationLatitude: 45.0,
      destinationLongitude: 9.0,
      destinationSearchRadius: 50,
    });
    expect(routesIntersect(p1, p2)).toBe(true);
  });

  it("returns false when extendToDestination is false and departures don't overlap", () => {
    const p1 = makeProposal({
      departureLatitude: 40.0,
      departureLongitude: 5.0,
      searchRadius: 5,
      extendToDestination: false,
      destinationLatitude: 45.0,
      destinationLongitude: 9.0,
      destinationSearchRadius: 50,
    });
    const p2 = makeProposal({
      departureLatitude: 45.1,
      departureLongitude: 9.1,
      searchRadius: 5,
    });
    expect(routesIntersect(p1, p2)).toBe(false);
  });

  it("returns false when either departure coordinate is null", () => {
    const p1 = makeProposal({ departureLatitude: null as unknown as number, departureLongitude: null as unknown as number });
    const p2 = makeProposal({ departureLatitude: 45.0, departureLongitude: 9.0 });
    expect(routesIntersect(p1, p2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// areCompatible — full bidirectional check
// ---------------------------------------------------------------------------
describe("areCompatible", () => {
  const base: Partial<P> = {
    departureLatitude: 45.0,
    departureLongitude: 9.0,
    searchRadius: 50,
    departureTimeFrom: new Date("2026-06-01T08:00:00Z"),
    departureTimeTo: new Date("2026-06-01T10:00:00Z"),
    targetUserTypes: [],
  };

  it("returns true for two compatible find_a_friend proposals on same day in range", () => {
    const p1 = makeProposal({ ...base, userId: "u1", searchType: "find_a_friend" });
    const p2 = makeProposal({ ...base, userId: "u2", searchType: "find_a_friend" });
    expect(areCompatible(p1, p2)).toBe(true);
  });

  it("returns true both directions (symmetry)", () => {
    const p1 = makeProposal({ ...base, userId: "u1", searchType: "find_a_guest", targetUserTypes: [] });
    const p2 = makeProposal({ ...base, userId: "u2", searchType: "find_a_biker", targetUserTypes: [] });
    expect(areCompatible(p1, p2)).toBe(true);
    expect(areCompatible(p2, p1)).toBe(true);
  });

  it("returns false when userId is the same", () => {
    const p1 = makeProposal({ ...base, userId: "u1", searchType: "find_a_friend" });
    const p2 = makeProposal({ ...base, userId: "u1", searchType: "find_a_friend" });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("returns false when searchTypes are incompatible", () => {
    const p1 = makeProposal({ ...base, userId: "u1", searchType: "find_a_friend", targetUserTypes: [] });
    const p2 = makeProposal({ ...base, userId: "u2", searchType: "find_a_biker", targetUserTypes: [] });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("returns false when proposals are on different days", () => {
    const p1 = makeProposal({ ...base, userId: "u1", searchType: "find_a_friend", departureTimeFrom: new Date("2026-06-01T08:00:00Z"), departureTimeTo: new Date("2026-06-01T10:00:00Z") });
    const p2 = makeProposal({ ...base, userId: "u2", searchType: "find_a_friend", departureTimeFrom: new Date("2026-06-02T08:00:00Z"), departureTimeTo: new Date("2026-06-02T10:00:00Z") });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("returns false when time windows do not overlap", () => {
    const p1 = makeProposal({ ...base, userId: "u1", searchType: "find_a_friend", departureTimeFrom: new Date("2026-06-01T06:00:00Z"), departureTimeTo: new Date("2026-06-01T07:00:00Z") });
    const p2 = makeProposal({ ...base, userId: "u2", searchType: "find_a_friend", departureTimeFrom: new Date("2026-06-01T08:00:00Z"), departureTimeTo: new Date("2026-06-01T10:00:00Z") });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("returns false when routes don't intersect", () => {
    const p1 = makeProposal({ ...base, userId: "u1", searchType: "find_a_friend", departureLatitude: 45.0, departureLongitude: 9.0, searchRadius: 5 });
    const p2 = makeProposal({ ...base, userId: "u2", searchType: "find_a_friend", departureLatitude: 48.0, departureLongitude: 14.0, searchRadius: 5 });
    expect(areCompatible(p1, p2)).toBe(false);
  });

  it("passes only when BOTH directions are valid (explicit targetUserTypes)", () => {
    const day = { departureTimeFrom: new Date("2026-06-01T08:00:00Z"), departureTimeTo: new Date("2026-06-01T10:00:00Z") };
    const geo = { departureLatitude: 45.0, departureLongitude: 9.0, searchRadius: 50 };

    const p1 = makeProposal({ userId: "u1", authorUserType: "biker", targetUserTypes: ["zavorrina"], ...day, ...geo });
    const p2 = makeProposal({ userId: "u2", authorUserType: "zavorrina", targetUserTypes: ["biker"], ...day, ...geo });
    expect(areCompatible(p1, p2)).toBe(true);
    expect(areCompatible(p2, p1)).toBe(true);

    const p3 = makeProposal({ userId: "u3", authorUserType: "biker", targetUserTypes: ["zavorrina"], ...day, ...geo });
    const p4 = makeProposal({ userId: "u4", authorUserType: "zavorrina", targetUserTypes: ["zavorrina"], ...day, ...geo });
    expect(areCompatible(p3, p4)).toBe(false);
    expect(areCompatible(p4, p3)).toBe(false);
  });
});
