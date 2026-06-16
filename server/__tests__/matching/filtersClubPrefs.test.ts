import { describe, it, expect, vi } from "vitest";

vi.mock("../../db", () => ({ db: {}, pool: {} }));
vi.mock("@shared/db", () => ({
  matchPreferences: {},
  motoClubMembers: {},
}));

import { clubScopeAllows, prefEnabled, bothPrefsEnabled } from "../../matching/filters";
type ClubScopeArg = Parameters<typeof clubScopeAllows>[0];
import { MatchPrefRow } from "../../matching/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MinimalProposal = { userId: string; clubId: string | null };

function makeProposal(userId: string, clubId: string | null = null): MinimalProposal {
  return { userId, clubId };
}

function makePrefRow(
  userId: string,
  overrides: Partial<Omit<MatchPrefRow, "id" | "userId" | "updatedAt">> = {}
): MatchPrefRow {
  return {
    id: "row-1",
    userId,
    updatedAt: new Date(),
    bikerBikerBrand: true,
    bikerZavorrinaBrand: true,
    bikerClubBrand: true,
    zavorrinaClubBrand: true,
    bikerBikerTypeStyle: true,
    bikerZavorrinaTypeStyle: true,
    bikerBikerDistance: true,
    bikerZavorrinaDistance: true,
    bikerBikerMusic: true,
    bikerZavorrinaMusic: true,
    bikerBikerLeanAngle: true,
    bikerBikerRouteTypeZone: true,
    bikerZavorrinaRouteTypeZone: true,
    bikerBikerAvgSpeed: true,
    bikerBikerAvgDuration: true,
    bikerBikerDayTime: true,
    bikerBikerEvents: true,
    directMatch: true,
    ...overrides,
  } as unknown as MatchPrefRow;
}

// ---------------------------------------------------------------------------
// clubScopeAllows
// ---------------------------------------------------------------------------

describe("clubScopeAllows", () => {
  it("returns true when both proposals have no club (public match)", () => {
    const p1 = makeProposal("user1", null);
    const p2 = makeProposal("user2", null);
    const keys = new Set<string>();
    expect(clubScopeAllows(p1 as unknown as ClubScopeArg, p2 as unknown as ClubScopeArg, keys)).toBe(true);
  });

  it("returns true when both proposals are in the same club and both users are members", () => {
    const p1 = makeProposal("user1", "club-a");
    const p2 = makeProposal("user2", "club-a");
    const keys = new Set(["user1:club-a", "user2:club-a"]);
    expect(clubScopeAllows(p1 as unknown as ClubScopeArg, p2 as unknown as ClubScopeArg, keys)).toBe(true);
  });

  it("returns false when proposals are in different clubs", () => {
    const p1 = makeProposal("user1", "club-a");
    const p2 = makeProposal("user2", "club-b");
    const keys = new Set(["user1:club-a", "user2:club-b"]);
    expect(clubScopeAllows(p1 as unknown as ClubScopeArg, p2 as unknown as ClubScopeArg, keys)).toBe(false);
  });

  it("returns false when p1 has a club but p2 does not (mixed scope)", () => {
    const p1 = makeProposal("user1", "club-a");
    const p2 = makeProposal("user2", null);
    const keys = new Set(["user1:club-a"]);
    expect(clubScopeAllows(p1 as unknown as ClubScopeArg, p2 as unknown as ClubScopeArg, keys)).toBe(false);
  });

  it("returns false when p2 has a club but p1 does not (mixed scope)", () => {
    const p1 = makeProposal("user1", null);
    const p2 = makeProposal("user2", "club-b");
    const keys = new Set(["user2:club-b"]);
    expect(clubScopeAllows(p1 as unknown as ClubScopeArg, p2 as unknown as ClubScopeArg, keys)).toBe(false);
  });

  it("returns false when same club but p1 membership key is missing", () => {
    const p1 = makeProposal("user1", "club-a");
    const p2 = makeProposal("user2", "club-a");
    const keys = new Set(["user2:club-a"]);
    expect(clubScopeAllows(p1 as unknown as ClubScopeArg, p2 as unknown as ClubScopeArg, keys)).toBe(false);
  });

  it("returns false when same club but p2 membership key is missing", () => {
    const p1 = makeProposal("user1", "club-a");
    const p2 = makeProposal("user2", "club-a");
    const keys = new Set(["user1:club-a"]);
    expect(clubScopeAllows(p1 as unknown as ClubScopeArg, p2 as unknown as ClubScopeArg, keys)).toBe(false);
  });

  it("returns false when same club but membershipKeys is completely empty", () => {
    const p1 = makeProposal("user1", "club-a");
    const p2 = makeProposal("user2", "club-a");
    const keys = new Set<string>();
    expect(clubScopeAllows(p1 as unknown as ClubScopeArg, p2 as unknown as ClubScopeArg, keys)).toBe(false);
  });

  it("returns false when keys exist for a different club (no cross-club elevation)", () => {
    const p1 = makeProposal("user1", "club-a");
    const p2 = makeProposal("user2", "club-a");
    const keys = new Set(["user1:club-b", "user2:club-b"]);
    expect(clubScopeAllows(p1 as unknown as ClubScopeArg, p2 as unknown as ClubScopeArg, keys)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// prefEnabled
// ---------------------------------------------------------------------------

describe("prefEnabled", () => {
  it("returns true when the user has no row in the map (permissive default)", () => {
    const map = new Map<string, MatchPrefRow>();
    expect(prefEnabled(map, "unknown-user", "bikerBikerBrand")).toBe(true);
  });

  it("returns true when the preference is explicitly true", () => {
    const map = new Map<string, MatchPrefRow>();
    map.set("user1", makePrefRow("user1", { bikerBikerBrand: true }));
    expect(prefEnabled(map, "user1", "bikerBikerBrand")).toBe(true);
  });

  it("returns false when the preference is explicitly false", () => {
    const map = new Map<string, MatchPrefRow>();
    map.set("user1", makePrefRow("user1", { bikerBikerBrand: false }));
    expect(prefEnabled(map, "user1", "bikerBikerBrand")).toBe(false);
  });

  it("returns true when the preference value is null (treated as not-false)", () => {
    const map = new Map<string, MatchPrefRow>();
    map.set("user1", makePrefRow("user1", { bikerBikerBrand: null as unknown as boolean }));
    expect(prefEnabled(map, "user1", "bikerBikerBrand")).toBe(true);
  });

  it("returns true when the preference value is undefined (treated as not-false)", () => {
    const map = new Map<string, MatchPrefRow>();
    map.set("user1", makePrefRow("user1", { bikerBikerBrand: undefined as unknown as boolean }));
    expect(prefEnabled(map, "user1", "bikerBikerBrand")).toBe(true);
  });

  it("checks only the requested key, not all keys", () => {
    const map = new Map<string, MatchPrefRow>();
    map.set("user1", makePrefRow("user1", { bikerBikerBrand: true, directMatch: false }));
    expect(prefEnabled(map, "user1", "bikerBikerBrand")).toBe(true);
    expect(prefEnabled(map, "user1", "directMatch")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bothPrefsEnabled
// ---------------------------------------------------------------------------

describe("bothPrefsEnabled", () => {
  it("returns true when both users have no row (both default to true)", () => {
    const map = new Map<string, MatchPrefRow>();
    expect(bothPrefsEnabled(map, "user1", "user2", "bikerBikerBrand")).toBe(true);
  });

  it("returns true when both users explicitly have the preference enabled", () => {
    const map = new Map<string, MatchPrefRow>();
    map.set("user1", makePrefRow("user1", { bikerBikerBrand: true }));
    map.set("user2", makePrefRow("user2", { bikerBikerBrand: true }));
    expect(bothPrefsEnabled(map, "user1", "user2", "bikerBikerBrand")).toBe(true);
  });

  it("returns false when user1 has the preference disabled", () => {
    const map = new Map<string, MatchPrefRow>();
    map.set("user1", makePrefRow("user1", { bikerBikerBrand: false }));
    map.set("user2", makePrefRow("user2", { bikerBikerBrand: true }));
    expect(bothPrefsEnabled(map, "user1", "user2", "bikerBikerBrand")).toBe(false);
  });

  it("returns false when user2 has the preference disabled", () => {
    const map = new Map<string, MatchPrefRow>();
    map.set("user1", makePrefRow("user1", { bikerBikerBrand: true }));
    map.set("user2", makePrefRow("user2", { bikerBikerBrand: false }));
    expect(bothPrefsEnabled(map, "user1", "user2", "bikerBikerBrand")).toBe(false);
  });

  it("returns false when both users have the preference disabled", () => {
    const map = new Map<string, MatchPrefRow>();
    map.set("user1", makePrefRow("user1", { bikerBikerBrand: false }));
    map.set("user2", makePrefRow("user2", { bikerBikerBrand: false }));
    expect(bothPrefsEnabled(map, "user1", "user2", "bikerBikerBrand")).toBe(false);
  });

  it("returns false when user1 has no row but user2 explicitly disables", () => {
    const map = new Map<string, MatchPrefRow>();
    map.set("user2", makePrefRow("user2", { bikerBikerBrand: false }));
    expect(bothPrefsEnabled(map, "user1", "user2", "bikerBikerBrand")).toBe(false);
  });

  it("returns true when user2 has no row and user1 explicitly enables", () => {
    const map = new Map<string, MatchPrefRow>();
    map.set("user1", makePrefRow("user1", { bikerBikerBrand: true }));
    expect(bothPrefsEnabled(map, "user1", "user2", "bikerBikerBrand")).toBe(true);
  });
});
