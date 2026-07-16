/**
 * Integration test: dense real-session marker cap via buildMapMarkersState.
 *
 * PURPOSE
 * -------
 * Unit tests in cap-markers.test.ts prove capMarkers() works in isolation.
 * This file confirms the full pipeline — prop assembly → buildMapMarkersState
 * → capMarkers → JSON bridge payload — also respects the 400-marker hard cap,
 * so a future change to the prop-assembly path cannot silently bypass the guard.
 *
 * WHAT WE TEST
 * ------------
 * 1. Total markers encoded in the bridge JSON ≤ MARKERS_HARD_CAP (400) even
 *    when the caller passes >400 users + workshops + clubs combined.
 * 2. The current user (isCurrentUser=true) always survives when their position
 *    coincides with the viewport centre — the nearest-first sort preserves them.
 * 3. The double-JSON encoding used by the bridge is correctly round-tripped so
 *    decoders on the JS-in-WebView side receive the expected shape.
 *
 * STRATEGY
 * --------
 * buildMapMarkersState() returns JSON.stringify(JSON.stringify(state)) — the
 * double-stringified format the bridge expects.  We parse twice to recover the
 * state object and inspect markers directly.  No React Native runtime, no WebView,
 * no DOM — this runs in pure Node via Vitest.
 */

import { describe, it, expect } from "vitest";
import { buildMapMarkersState } from "@/components/map/buildMapMarkersState";
import { MARKERS_HARD_CAP, BRIDGE_PAYLOAD_SAFE_BYTE_LIMIT } from "@/lib/maps/cap-markers";
import type { MapUser, MapWorkshop, ClubMapPin } from "@/components/map/map-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Centre of the synthetic session — the "current user" sits here. */
const SESSION_CENTER = { latitude: 45.0, longitude: 10.0 };

const CURRENT_USER_ID = "me-001";

/**
 * Build N mock users spread in a grid north-east of `baseLat/baseLng`.
 * The caller controls whether one of them is the current user.
 */
function makeUsers(
  n: number,
  baseLat = 45.01,
  baseLng = 10.01,
): MapUser[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `user-${i}`,
    latitude: baseLat + Math.floor(i / 20) * 0.02,
    longitude: baseLng + (i % 20) * 0.02,
    userType: "biker" as const,
    sex: null,
    nickname: `rider_${i}`,
    country: "IT",
    currentSpeedKph: null,
    speedProfile: null,
  }));
}

function makeCurrentUser(): MapUser {
  return {
    id: CURRENT_USER_ID,
    latitude: SESSION_CENTER.latitude,
    longitude: SESSION_CENTER.longitude,
    userType: "biker" as const,
    sex: null,
    nickname: "io",
    country: "IT",
    currentSpeedKph: null,
    speedProfile: null,
  };
}

function makeWorkshops(n: number): MapWorkshop[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `ws-${i}`,
    latitude: 44.0 + i * 0.01,
    longitude: 9.0 + i * 0.01,
    name: `Officina ${i}`,
    isSynecoPartner: false,
  }));
}

function makeClubs(n: number): ClubMapPin[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `club-${i}`,
    latitude: 46.0 + i * 0.01,
    longitude: 11.0 + i * 0.01,
    name: `Club ${i}`,
    clubType: "generic",
    logoUrl: null,
    region: null,
    country: "IT",
    isFictitious: false,
    memberCount: 5,
  }));
}

/**
 * Decode the double-JSON string returned by buildMapMarkersState and
 * return the markers sub-object.
 */
function decodeMarkers(encoded: string): {
  users: Array<{ id: string; isCurrentUser: boolean }>;
  workshops: unknown[];
  businesses: unknown[];
  events: unknown[];
  clubs: unknown[];
  easterEggs: unknown[];
  sos: unknown[];
} {
  // buildMapMarkersState returns JSON.stringify(JSON.stringify(state))
  const inner: string = JSON.parse(encoded) as string;
  const state = JSON.parse(inner) as { markers: ReturnType<typeof decodeMarkers> };
  return state.markers;
}

/** Sum of all capped category lengths. */
function totalMarkers(markers: ReturnType<typeof decodeMarkers>): number {
  return (
    markers.users.length +
    markers.workshops.length +
    markers.businesses.length +
    markers.events.length +
    markers.clubs.length +
    markers.easterEggs.length +
    markers.sos.length
  );
}

/** Base params shared across tests — callers override what they need. */
function baseParams() {
  return {
    mapsEnabled: true,
    activeTileUrl: "https://tile.example.com/{z}/{x}/{y}.png",
    activeTileMaxZoom: 19,
    userLocation: SESSION_CENTER,
    isAvailable: true,
    searchRadiusKm: null,
    filteredUsers: [] as MapUser[],
    workshops: [] as MapWorkshop[],
    businesses: [],
    eventPins: [],
    showEventPins: false,
    filterEvents: false,
    clubPins: [] as ClubMapPin[],
    filterClubs: true,
    easterEggs: [],
    activeSosRequests: [],
    realMeMarker: null,
    fakeMeMarker: null,
    currentUserId: null as string | null,
    fixedPositionEnabled: false,
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("buildMapMarkersState — marker cap integration", () => {
  it("encodes a valid double-JSON payload that round-trips correctly", () => {
    const encoded = buildMapMarkersState({
      ...baseParams(),
      filteredUsers: makeUsers(10),
    });

    // Outer parse → inner JSON string
    const inner = JSON.parse(encoded) as string;
    expect(typeof inner).toBe("string");

    // Inner parse → state object
    const state = JSON.parse(inner) as Record<string, unknown>;
    expect(state).toHaveProperty("markers");
    expect(state).toHaveProperty("tileUrl");
    expect(state).toHaveProperty("tileMaxZoom");
  });

  it("does NOT trim when total is below the cap", () => {
    // 50 users + 20 workshops + 15 clubs = 85 total, well below 400
    const encoded = buildMapMarkersState({
      ...baseParams(),
      filteredUsers: makeUsers(50),
      workshops: makeWorkshops(20),
      clubPins: makeClubs(15),
    });

    const markers = decodeMarkers(encoded);
    expect(markers.users.length).toBe(50);
    expect(markers.workshops.length).toBe(20);
    expect(markers.clubs.length).toBe(15);
    expect(totalMarkers(markers)).toBe(85);
  });

  it("caps total markers to ≤ MARKERS_HARD_CAP (400) with 300 users + 200 workshops", () => {
    // 500 total — must trigger the cap
    const encoded = buildMapMarkersState({
      ...baseParams(),
      filteredUsers: makeUsers(300),
      workshops: makeWorkshops(200),
    });

    const markers = decodeMarkers(encoded);
    const total = totalMarkers(markers);
    expect(total).toBeLessThanOrEqual(MARKERS_HARD_CAP);
    // Both categories must still have at least 1 marker (minimum-per-category guarantee)
    expect(markers.users.length).toBeGreaterThanOrEqual(1);
    expect(markers.workshops.length).toBeGreaterThanOrEqual(1);
  });

  it("caps total markers to ≤ 400 with 250 users + 200 workshops + 100 clubs (550 total)", () => {
    const encoded = buildMapMarkersState({
      ...baseParams(),
      filteredUsers: makeUsers(250),
      workshops: makeWorkshops(200),
      clubPins: makeClubs(100),
    });

    const markers = decodeMarkers(encoded);
    expect(totalMarkers(markers)).toBeLessThanOrEqual(MARKERS_HARD_CAP);
    // All three categories survive trimming (minimum guarantee)
    expect(markers.users.length).toBeGreaterThanOrEqual(1);
    expect(markers.workshops.length).toBeGreaterThanOrEqual(1);
    expect(markers.clubs.length).toBeGreaterThanOrEqual(1);
  });

  it("caps to ≤ 400 with a heavily skewed load (450 users, 1 workshop, 1 club)", () => {
    const encoded = buildMapMarkersState({
      ...baseParams(),
      filteredUsers: makeUsers(450),
      workshops: makeWorkshops(1),
      clubPins: makeClubs(1),
    });

    const markers = decodeMarkers(encoded);
    expect(totalMarkers(markers)).toBeLessThanOrEqual(MARKERS_HARD_CAP);
  });

  it("current user (isCurrentUser=true) at centre is always kept after cap fires", () => {
    // Place 450 other users far from the centre, current user AT centre.
    // Nearest-first sort means the current user is never trimmed.
    const otherUsers = makeUsers(450, 47.0, 13.0); // far from SESSION_CENTER
    const filteredUsers = [makeCurrentUser(), ...otherUsers];

    const encoded = buildMapMarkersState({
      ...baseParams(),
      filteredUsers,
      currentUserId: CURRENT_USER_ID,
    });

    const markers = decodeMarkers(encoded);
    expect(totalMarkers(markers)).toBeLessThanOrEqual(MARKERS_HARD_CAP);

    const me = markers.users.find((u) => u.id === CURRENT_USER_ID);
    expect(me).toBeDefined();
    expect(me?.isCurrentUser).toBe(true);
  });

  it("current user survives when they are FAR from the viewport centre (pinning guard)", () => {
    // Current user sits at lat=50, lng=20 — well outside SESSION_CENTER (45, 10).
    // All other users are clustered near the centre so nearest-first sorting
    // would normally discard the current user.  The pin must rescue them.
    const farCurrentUser: MapUser = {
      id: CURRENT_USER_ID,
      latitude: 50.0,
      longitude: 20.0,
      userType: "biker" as const,
      sex: null,
      nickname: "io_lontano",
      country: "IT",
      currentSpeedKph: null,
      speedProfile: null,
    };
    // 450 other users packed tightly around the centre — they would all rank
    // closer than the current user under a pure nearest-first sort.
    const nearUsers = makeUsers(450, 45.001, 10.001);
    const filteredUsers = [farCurrentUser, ...nearUsers];

    const encoded = buildMapMarkersState({
      ...baseParams(),
      filteredUsers,
      currentUserId: CURRENT_USER_ID,
    });

    const markers = decodeMarkers(encoded);
    expect(totalMarkers(markers)).toBeLessThanOrEqual(MARKERS_HARD_CAP);

    const me = markers.users.find((u) => u.id === CURRENT_USER_ID);
    expect(me).toBeDefined();
    expect(me?.isCurrentUser).toBe(true);
  });

  it("current user survives even when mixed with many near-centre users", () => {
    // 200 other users clustered very close to centre, 200 far away, + current user at exact centre.
    // The current user is the very closest → always in surviving set.
    const nearUsers = makeUsers(200, 45.001, 10.001); // ~110 m offset
    const farUsers = makeUsers(200, 48.0, 14.0);
    const filteredUsers = [...nearUsers, makeCurrentUser(), ...farUsers];

    const encoded = buildMapMarkersState({
      ...baseParams(),
      filteredUsers,
      workshops: makeWorkshops(100),
      currentUserId: CURRENT_USER_ID,
    });

    const markers = decodeMarkers(encoded);
    expect(totalMarkers(markers)).toBeLessThanOrEqual(MARKERS_HARD_CAP);

    const me = markers.users.find((u) => u.id === CURRENT_USER_ID);
    expect(me).toBeDefined();
    expect(me?.isCurrentUser).toBe(true);
  });

  it("marker categories not exceeding their individual quota are left untouched", () => {
    // 300 users (dominant) + 5 workshops — the tiny workshop array must survive intact.
    const encoded = buildMapMarkersState({
      ...baseParams(),
      filteredUsers: makeUsers(300),
      workshops: makeWorkshops(5),
    });

    const markers = decodeMarkers(encoded);
    expect(totalMarkers(markers)).toBeLessThanOrEqual(MARKERS_HARD_CAP);
    // 5 workshops should easily fit in the proportional quota for a small category.
    expect(markers.workshops.length).toBe(5);
  });

  it("handles the no-userLocation (null centre) case — falls back to array-position trimming", () => {
    const encoded = buildMapMarkersState({
      ...baseParams(),
      userLocation: null,
      filteredUsers: makeUsers(400),
      workshops: makeWorkshops(100),
    });

    const markers = decodeMarkers(encoded);
    expect(totalMarkers(markers)).toBeLessThanOrEqual(MARKERS_HARD_CAP);
  });

  it("current user survives when centre is null and they are at an arbitrary array position", () => {
    // No GPS fix → userLocation is null → center passed to capMarkers is null.
    // The current user is placed near the END of the array (index 449 out of 451),
    // so array-position trimming without the pin guard would silently discard them.
    // The null-branch pin guard must hoist them to position 0 before slicing.
    const otherUsersBefore = makeUsers(449, 45.5, 11.0);
    const currentUser: MapUser = {
      id: CURRENT_USER_ID,
      latitude: 46.0,
      longitude: 12.0,
      userType: "biker" as const,
      sex: null,
      nickname: "io_no_gps",
      country: "IT",
      currentSpeedKph: null,
      speedProfile: null,
    };
    const otherUsersAfter = makeUsers(1, 47.0, 13.0);
    // currentUser is at index 449 — well past any quota that would survive
    // unguarded array-position trimming across 451 total entries.
    const filteredUsers = [...otherUsersBefore, currentUser, ...otherUsersAfter];

    const encoded = buildMapMarkersState({
      ...baseParams(),
      userLocation: null, // no GPS fix → null centre
      filteredUsers,
      workshops: makeWorkshops(100), // push total to 551 so cap fires
      currentUserId: CURRENT_USER_ID,
    });

    const markers = decodeMarkers(encoded);
    expect(totalMarkers(markers)).toBeLessThanOrEqual(MARKERS_HARD_CAP);

    const me = markers.users.find((u) => u.id === CURRENT_USER_ID);
    expect(me).toBeDefined();
    expect(me?.isCurrentUser).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Exact-equality tests: total must be EXACTLY 400 when trimming fires
  // ---------------------------------------------------------------------------
});
