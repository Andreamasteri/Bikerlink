import { describe, it, expect, vi } from "vitest";

vi.mock("../../db", () => ({ db: {}, pool: {} }));
vi.mock("@shared/schema", () => ({ matchPreferences: {}, motoClubMembers: {} }));

import { deriveTargetUserTypes, resolveMatchPool } from "../../matching/scoring";

type P = Parameters<typeof resolveMatchPool>[0];

function makeProposal(overrides: Partial<P> = {}): P {
  return {
    id: "p1",
    userId: "user1",
    searchType: "find_a_friend",
    searchTypes: [],
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
// Single-type ↔ single-type  (baseline / existing behaviour)
// ---------------------------------------------------------------------------
describe("resolveMatchPool — single-type ↔ single-type (MATCH_RULES baseline)", () => {
  it("find_a_friend ↔ find_a_friend → match", () => {
    const p1 = makeProposal({ searchType: "find_a_friend" });
    const p2 = makeProposal({ searchType: "find_a_friend" });
    expect(resolveMatchPool(p1, p2)).toBe(true);
  });

  it("find_a_guest ↔ find_a_biker → match (both orders)", () => {
    const guest = makeProposal({ searchType: "find_a_guest" });
    const biker = makeProposal({ searchType: "find_a_biker" });
    expect(resolveMatchPool(guest, biker)).toBe(true);
    expect(resolveMatchPool(biker, guest)).toBe(true);
  });

  it("hitcher ↔ hitchhiker → match (both orders)", () => {
    const hitcher = makeProposal({ searchType: "hitcher" });
    const hh = makeProposal({ searchType: "hitchhiker" });
    expect(resolveMatchPool(hitcher, hh)).toBe(true);
    expect(resolveMatchPool(hh, hitcher)).toBe(true);
  });

  it("find_a_guest ↔ hitchhiker → match (cross-rule)", () => {
    const guest = makeProposal({ searchType: "find_a_guest" });
    const hh = makeProposal({ searchType: "hitchhiker" });
    expect(resolveMatchPool(guest, hh)).toBe(true);
    expect(resolveMatchPool(hh, guest)).toBe(true);
  });

  it("hitcher ↔ find_a_biker → match (cross-rule)", () => {
    const hitcher = makeProposal({ searchType: "hitcher" });
    const biker = makeProposal({ searchType: "find_a_biker" });
    expect(resolveMatchPool(hitcher, biker)).toBe(true);
    expect(resolveMatchPool(biker, hitcher)).toBe(true);
  });

  it("find_a_friend ↔ find_a_biker → NO match", () => {
    const friend = makeProposal({ searchType: "find_a_friend" });
    const biker = makeProposal({ searchType: "find_a_biker" });
    expect(resolveMatchPool(friend, biker)).toBe(false);
  });

  it("hitcher ↔ find_a_friend → NO match", () => {
    const hitcher = makeProposal({ searchType: "hitcher" });
    const friend = makeProposal({ searchType: "find_a_friend" });
    expect(resolveMatchPool(hitcher, friend)).toBe(false);
  });

  it("hitchhiker ↔ find_a_friend → NO match", () => {
    const hh = makeProposal({ searchType: "hitchhiker" });
    const friend = makeProposal({ searchType: "find_a_friend" });
    expect(resolveMatchPool(hh, friend)).toBe(false);
  });

  it("returns false when searchType is null on both sides", () => {
    const p1 = makeProposal({ searchType: null as unknown as P['searchType'] });
    const p2 = makeProposal({ searchType: null as unknown as P['searchType'] });
    expect(resolveMatchPool(p1, p2)).toBe(false);
  });

  it("returns false when searchType is null on one side", () => {
    const p1 = makeProposal({ searchType: null as unknown as P['searchType'] });
    const p2 = makeProposal({ searchType: "find_a_friend" });
    expect(resolveMatchPool(p1, p2)).toBe(false);
  });
});

describe("resolveMatchPool — canonical author/target assignment regressions", () => {
  it("matches biker find_a_guest with zavorrina find_a_biker", () => {
    const biker = makeProposal({
      userId: "biker-1",
      authorUserType: "biker",
      searchType: "find_a_guest",
      targetUserTypes: ["zavorrina", "coppia"],
    });
    const zavorrina = makeProposal({
      userId: "zav-1",
      authorUserType: "zavorrina",
      searchType: "find_a_biker",
      targetUserTypes: ["biker", "coppia"],
    });
    expect(resolveMatchPool(biker, zavorrina)).toBe(true);
    expect(resolveMatchPool(zavorrina, biker)).toBe(true);
  });

  it("derives target account types in the correct direction", () => {
    expect(deriveTargetUserTypes(makeProposal({ searchType: "find_a_guest", targetUserTypes: [] })))
      .toEqual(["zavorrina", "coppia"]);
    expect(deriveTargetUserTypes(makeProposal({ searchType: "find_a_biker", targetUserTypes: [] })))
      .toEqual(["biker", "coppia"]);
  });

  it("keeps compatibility for legacy intent aliases in targetUserTypes", () => {
    const biker = makeProposal({
      userId: "biker-2",
      authorUserType: "biker",
      searchType: "hitcher",
      targetUserTypes: ["zavorrina", "coppia"],
    });
    const hitchhiker = makeProposal({
      userId: "zav-2",
      authorUserType: "zavorrina",
      searchType: "hitchhiker",
      targetUserTypes: ["hitcher"],
    });
    expect(resolveMatchPool(biker, hitchhiker)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multi-type ↔ single-type  (the regression bug scenario)
// A proposal with searchTypes: ["find_a_guest", "find_a_friend"] must match
// a single-type "find_a_biker" proposal via the find_a_guest rule.
// ---------------------------------------------------------------------------
describe("resolveMatchPool — multi-type ↔ single-type (regression scenario)", () => {
  it("multi-type [find_a_guest, find_a_friend] ↔ find_a_biker → match via find_a_guest rule", () => {
    const multi = makeProposal({ searchTypes: ["find_a_guest", "find_a_friend"], searchType: null as unknown as P['searchType'] });
    const biker = makeProposal({ searchType: "find_a_biker" });
    expect(resolveMatchPool(multi, biker)).toBe(true);
    expect(resolveMatchPool(biker, multi)).toBe(true);
  });

  it("multi-type [find_a_friend, hitcher] ↔ hitchhiker → match via hitcher rule", () => {
    const multi = makeProposal({ searchTypes: ["find_a_friend", "hitcher"], searchType: null as unknown as P['searchType'] });
    const hh = makeProposal({ searchType: "hitchhiker" });
    expect(resolveMatchPool(multi, hh)).toBe(true);
    expect(resolveMatchPool(hh, multi)).toBe(true);
  });

  it("multi-type [find_a_guest, hitcher] ↔ find_a_biker → match (hitcher rule)", () => {
    const multi = makeProposal({ searchTypes: ["find_a_guest", "hitcher"], searchType: null as unknown as P['searchType'] });
    const biker = makeProposal({ searchType: "find_a_biker" });
    expect(resolveMatchPool(multi, biker)).toBe(true);
  });

  it("multi-type [find_a_guest, hitcher] ↔ hitchhiker → match (both rules fire)", () => {
    const multi = makeProposal({ searchTypes: ["find_a_guest", "hitcher"], searchType: null as unknown as P['searchType'] });
    const hh = makeProposal({ searchType: "hitchhiker" });
    expect(resolveMatchPool(multi, hh)).toBe(true);
  });

  it("searchType is used as fallback when searchTypes array is empty", () => {
    const p1 = makeProposal({ searchTypes: [], searchType: "find_a_guest" });
    const p2 = makeProposal({ searchType: "find_a_biker" });
    expect(resolveMatchPool(p1, p2)).toBe(true);
  });

  it("searchType fallback deduplication: searchTypes contains searchType, no duplicate confusion", () => {
    const p1 = makeProposal({ searchTypes: ["find_a_guest"], searchType: "find_a_guest" });
    const p2 = makeProposal({ searchType: "find_a_biker" });
    expect(resolveMatchPool(p1, p2)).toBe(true);
  });

  it("multi-type with NO matching category ↔ single-type → NO match", () => {
    const multi = makeProposal({ searchTypes: ["hitchhiker", "find_a_biker"], searchType: null as unknown as P['searchType'] });
    const friend = makeProposal({ searchType: "find_a_friend" });
    expect(resolveMatchPool(multi, friend)).toBe(false);
    expect(resolveMatchPool(friend, multi)).toBe(false);
  });

  it("multi-type with no valid types at all → NO match", () => {
    const multi = makeProposal({ searchTypes: [], searchType: null as unknown as P['searchType'] });
    const friend = makeProposal({ searchType: "find_a_friend" });
    expect(resolveMatchPool(multi, friend)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multi-type ↔ multi-type
// ---------------------------------------------------------------------------
describe("resolveMatchPool — multi-type ↔ multi-type", () => {
  it("[find_a_guest, find_a_friend] ↔ [find_a_biker, hitchhiker] → match via find_a_guest rule", () => {
    const p1 = makeProposal({ searchTypes: ["find_a_guest", "find_a_friend"], searchType: null as unknown as P['searchType'] });
    const p2 = makeProposal({ searchTypes: ["find_a_biker", "hitchhiker"], searchType: null as unknown as P['searchType'] });
    expect(resolveMatchPool(p1, p2)).toBe(true);
    expect(resolveMatchPool(p2, p1)).toBe(true);
  });

  it("[hitcher, find_a_friend] ↔ [hitchhiker, find_a_friend] → match via hitcher↔hitchhiker rule", () => {
    const p1 = makeProposal({ searchTypes: ["hitcher", "find_a_friend"], searchType: null as unknown as P['searchType'] });
    const p2 = makeProposal({ searchTypes: ["hitchhiker", "find_a_friend"], searchType: null as unknown as P['searchType'] });
    expect(resolveMatchPool(p1, p2)).toBe(true);
  });

  it("[find_a_friend] ↔ [find_a_friend] single-element arrays → match", () => {
    const p1 = makeProposal({ searchTypes: ["find_a_friend"], searchType: null as unknown as P['searchType'] });
    const p2 = makeProposal({ searchTypes: ["find_a_friend"], searchType: null as unknown as P['searchType'] });
    expect(resolveMatchPool(p1, p2)).toBe(true);
  });

  it("[hitchhiker, find_a_biker] ↔ [hitchhiker, find_a_biker] → NO match (no complementary rule)", () => {
    const p1 = makeProposal({ searchTypes: ["hitchhiker", "find_a_biker"], searchType: null as unknown as P['searchType'] });
    const p2 = makeProposal({ searchTypes: ["hitchhiker", "find_a_biker"], searchType: null as unknown as P['searchType'] });
    expect(resolveMatchPool(p1, p2)).toBe(false);
  });

  it("[find_a_friend] ↔ [find_a_biker] → NO match (incompatible single-element arrays)", () => {
    const p1 = makeProposal({ searchTypes: ["find_a_friend"], searchType: null as unknown as P['searchType'] });
    const p2 = makeProposal({ searchTypes: ["find_a_biker"], searchType: null as unknown as P['searchType'] });
    expect(resolveMatchPool(p1, p2)).toBe(false);
  });

  it("both empty arrays → NO match", () => {
    const p1 = makeProposal({ searchTypes: [], searchType: null as unknown as P['searchType'] });
    const p2 = makeProposal({ searchTypes: [], searchType: null as unknown as P['searchType'] });
    expect(resolveMatchPool(p1, p2)).toBe(false);
  });

  it("deduplicates overlapping searchTypes + searchType entries", () => {
    const p1 = makeProposal({ searchTypes: ["find_a_guest", "find_a_guest"], searchType: "find_a_guest" });
    const p2 = makeProposal({ searchTypes: ["find_a_biker"], searchType: "find_a_biker" });
    expect(resolveMatchPool(p1, p2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// No-match edge cases
// ---------------------------------------------------------------------------
describe("resolveMatchPool — no-match / edge cases", () => {
  it("unknown searchType on both sides → NO match", () => {
    const p1 = makeProposal({ searchType: "mystery_type" as unknown as P['searchType'] });
    const p2 = makeProposal({ searchType: "mystery_type" as unknown as P['searchType'] });
    expect(resolveMatchPool(p1, p2)).toBe(false);
  });

  it("multi-type with one unknown and one valid type ↔ matching single → still matches via valid type", () => {
    const p1 = makeProposal({ searchTypes: ["mystery_type" as unknown as string, "find_a_guest"], searchType: null as unknown as P['searchType'] });
    const p2 = makeProposal({ searchType: "find_a_biker" });
    expect(resolveMatchPool(p1, p2)).toBe(true);
  });

  it("explicit targetUserTypes path short-circuits MATCH_RULES even with multi searchTypes", () => {
    const p1 = makeProposal({
      searchTypes: ["find_a_guest", "find_a_friend"],
      searchType: null as unknown as P['searchType'],
      targetUserTypes: ["zavorrina"],
      authorUserType: "biker",
    });
    const p2 = makeProposal({
      searchType: "find_a_biker",
      targetUserTypes: ["biker"],
      authorUserType: "zavorrina",
    });
    expect(resolveMatchPool(p1, p2)).toBe(true);
  });

  it("explicit targetUserTypes: mismatch blocks match despite compatible searchTypes", () => {
    const p1 = makeProposal({
      searchTypes: ["find_a_guest"],
      targetUserTypes: ["zavorrina"],
      authorUserType: "biker",
    });
    const p2 = makeProposal({
      searchType: "find_a_biker",
      targetUserTypes: ["zavorrina"],
      authorUserType: "biker",
    });
    expect(resolveMatchPool(p1, p2)).toBe(false);
  });
});
