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

  it("bridge payload byte size stays below BRIDGE_PAYLOAD_SAFE_BYTE_LIMIT (500 KB) for a worst-case 400-marker session", () => {
    // Worst-case payload: 400 markers where every string field is at a realistic
    // production upper bound (long nicknames, long workshop names, etc.).
    // This catches schema bloat — new fields or longer strings — that would push
    // the serialised bridge JSON over the Android-safe threshold even though the
    // marker COUNT stays within MARKERS_HARD_CAP.
    //
    // Threshold: BRIDGE_PAYLOAD_SAFE_BYTE_LIMIT = 500 KB (512 000 bytes).
    // The Android RN bridge serialises the payload string into a Java HashMap;
    // payloads above ~500 KB risk OOM on 256 MB heaps regardless of marker count.
    // If this assertion fires, the marker schema has grown — reduce field
    // verbosity, drop a field, or tighten MARKERS_HARD_CAP before shipping.

    // 350 verbose users + 50 verbose workshops = exactly 400 total (no cap fires).
    // Using long-but-realistic strings to represent real worst-case production data.
    const verboseUsers: MapUser[] = Array.from({ length: 350 }, (_, i) => ({
      id: `user-verbose-${String(i).padStart(4, "0")}`,
      latitude: 45.0 + (i % 100) * 0.001,
      longitude: 10.0 + Math.floor(i / 100) * 0.001,
      userType: "biker" as const,
      sex: i % 2 === 0 ? ("M" as const) : ("F" as const),
      nickname: `rider_con_nickname_lungo_${i}`, // ~30 chars — realistic upper bound
      country: "IT",
      currentSpeedKph: 95.5,
      speedProfile: "mountain" as const,
    }));

    const verboseWorkshops: MapWorkshop[] = Array.from({ length: 50 }, (_, i) => ({
      id: `ws-verbose-${String(i).padStart(3, "0")}`,
      latitude: 44.0 + i * 0.01,
      longitude: 9.0 + i * 0.01,
      name: `Officina Meccanica Specializzata Con Nome Lungo ${i}`, // ~52 chars
      isSynecoPartner: false,
    }));

    const encoded = buildMapMarkersState({
      ...baseParams(),
      filteredUsers: verboseUsers,
      workshops: verboseWorkshops,
    });

    // Measure the UTF-8 byte length of the full bridge string.
    // TextEncoder is available in both Node.js and browser environments,
    // so this works without requiring @types/node in the client tsconfig.
    const byteLength = new TextEncoder().encode(encoded).length;

    expect(byteLength).toBeLessThan(BRIDGE_PAYLOAD_SAFE_BYTE_LIMIT);

    // Sanity: all 400 markers must have been kept (no cap triggered).
    const markers = decodeMarkers(encoded);
    expect(totalMarkers(markers)).toBe(400);
  });

  it("total stays exactly below cap across all seven CAPPED categories", () => {
    // Every capped category populated — total = 7 × 70 = 490, over cap.
    const encoded = buildMapMarkersState({
      ...baseParams(),
      filteredUsers: makeUsers(70),
      workshops: makeWorkshops(70),
      clubPins: makeClubs(70),
      showEventPins: true,
      filterEvents: true,
      // events, easterEggs, sos, businesses are empty in base — that's fine;
      // the three we populate are enough to go over cap.
      businesses: Array.from({ length: 70 }, (_, i) => ({
        id: `biz-${i}`,
        latitude: 43.0 + i * 0.01,
        longitude: 8.0 + i * 0.01,
        name: `Biz ${i}`,
        type: "hotel",
      })),
      eventPins: Array.from({ length: 70 }, (_, i) => ({
        id: `ev-${i}`,
        latitude: 42.0 + i * 0.01,
        longitude: 7.0 + i * 0.01,
        title: `Event ${i}`,
        eventDate: "2099-12-31",
      })),
      easterEggs: Array.from({ length: 70 }, (_, i) => ({
        id: `eg-${i}`,
        latitude: 41.0 + i * 0.01,
        longitude: 6.0 + i * 0.01,
        name: `Egg ${i}`,
      })),
      activeSosRequests: Array.from({ length: 70 }, (_, i) => ({
        id: `sos-${i}`,
        latitude: 40.0 + i * 0.01,
        longitude: 5.0 + i * 0.01,
        radiusKm: 5,
        reason: "breakdown",
        requesterNickname: `rider_${i}`,
      })),
    });

    const markers = decodeMarkers(encoded);
    expect(totalMarkers(markers)).toBeLessThanOrEqual(MARKERS_HARD_CAP);
    // Every category must have at least 1 survivor (minimum-per-category guarantee).
    expect(markers.users.length).toBeGreaterThanOrEqual(1);
    expect(markers.workshops.length).toBeGreaterThanOrEqual(1);
    expect(markers.businesses.length).toBeGreaterThanOrEqual(1);
    expect(markers.events.length).toBeGreaterThanOrEqual(1);
    expect(markers.clubs.length).toBeGreaterThanOrEqual(1);
    expect(markers.easterEggs.length).toBeGreaterThanOrEqual(1);
    expect(markers.sos.length).toBeGreaterThanOrEqual(1);
  });

  it("bridge payload byte size stays below BRIDGE_PAYLOAD_SAFE_BYTE_LIMIT when all seven categories are full (400 verbose markers total)", () => {
    // Worst-case cross-category payload: all seven capped categories populated
    // with verbose markers whose string fields are at realistic production upper
    // bounds, totalling exactly 400 (= MARKERS_HARD_CAP) so no count-cap fires
    // and every marker is serialised.  This complements the single-category
    // worst-case above and catches schema bloat introduced to any category.
    //
    // Distribution (7 categories, sum = 400):
    //   users=80  workshops=60  businesses=60  events=60
    //   clubs=60  easterEggs=40  sos=40
    //
    // If this assertion fires, the bridge payload has grown — reduce field
    // verbosity, drop a field, or tighten MARKERS_HARD_CAP before shipping.

    const USERS_N = 80;
    const WORKSHOPS_N = 60;
    const BUSINESSES_N = 60;
    const EVENTS_N = 60;
    const CLUBS_N = 60;
    const EASTER_EGGS_N = 40;
    const SOS_N = 40;
    // Sanity-check: total must equal MARKERS_HARD_CAP so no trimming occurs
    // and every verbose marker contributes to the byte measurement.
    expect(
      USERS_N + WORKSHOPS_N + BUSINESSES_N + EVENTS_N + CLUBS_N + EASTER_EGGS_N + SOS_N
    ).toBe(400);

    const verboseUsers: MapUser[] = Array.from({ length: USERS_N }, (_, i) => ({
      id: `user-all7-${String(i).padStart(4, "0")}`,
      latitude: 45.0 + (i % 10) * 0.001,
      longitude: 10.0 + Math.floor(i / 10) * 0.001,
      userType: "biker" as const,
      sex: i % 2 === 0 ? ("M" as const) : ("F" as const),
      nickname: `rider_con_nickname_lungo_all7_${i}`, // ~35 chars
      country: "IT",
      currentSpeedKph: 87.3,
      speedProfile: "mountain" as const,
    }));

    const verboseWorkshops: MapWorkshop[] = Array.from({ length: WORKSHOPS_N }, (_, i) => ({
      id: `ws-all7-${String(i).padStart(3, "0")}`,
      latitude: 44.0 + i * 0.01,
      longitude: 9.0 + i * 0.01,
      name: `Officina Meccanica Specializzata Con Nome Lungo All7 ${i}`, // ~56 chars
      isSynecoPartner: i % 5 === 0,
    }));

    const verboseBusinesses = Array.from({ length: BUSINESSES_N }, (_, i) => ({
      id: `biz-all7-${String(i).padStart(3, "0")}`,
      latitude: 43.0 + i * 0.01,
      longitude: 8.0 + i * 0.01,
      name: `Hotel Ristorante Panoramico Con Nome Lungo All7 ${i}`, // ~53 chars
      type: "hotel",
    }));

    const verboseEvents = Array.from({ length: EVENTS_N }, (_, i) => ({
      id: `ev-all7-${String(i).padStart(3, "0")}`,
      latitude: 42.0 + i * 0.01,
      longitude: 7.0 + i * 0.01,
      title: `Raduno Internazionale Motociclisti Con Titolo Lungo All7 ${i}`, // ~60 chars
      eventDate: "2099-12-31",
    }));

    const verboseClubs: ClubMapPin[] = Array.from({ length: CLUBS_N }, (_, i) => ({
      id: `club-all7-${String(i).padStart(3, "0")}`,
      latitude: 41.0 + i * 0.01,
      longitude: 6.0 + i * 0.01,
      name: `Moto Club Regionale Con Nome Lungo All7 ${i}`, // ~44 chars
      clubType: "generic",
      logoUrl: null,
      region: "Lombardia",
      country: "IT",
      isFictitious: false,
      memberCount: 42,
    }));

    const verboseEasterEggs = Array.from({ length: EASTER_EGGS_N }, (_, i) => ({
      id: `eg-all7-${String(i).padStart(3, "0")}`,
      latitude: 40.0 + i * 0.01,
      longitude: 5.0 + i * 0.01,
      name: `Easter Egg Nascosto Con Nome Lungo All7 ${i}`, // ~44 chars
    }));

    const verboseSos = Array.from({ length: SOS_N }, (_, i) => ({
      id: `sos-all7-${String(i).padStart(3, "0")}`,
      latitude: 39.0 + i * 0.01,
      longitude: 4.0 + i * 0.01,
      radiusKm: 10,
      reason: "breakdown",
      requesterNickname: `rider_sos_con_nickname_lungo_all7_${i}`, // ~37 chars
    }));

    const encoded = buildMapMarkersState({
      ...baseParams(),
      filteredUsers: verboseUsers,
      workshops: verboseWorkshops,
      businesses: verboseBusinesses,
      eventPins: verboseEvents,
      showEventPins: true,
      filterEvents: true,
      clubPins: verboseClubs,
      filterClubs: true,
      easterEggs: verboseEasterEggs,
      activeSosRequests: verboseSos,
    });

    // Measure the UTF-8 byte length of the full bridge string.
    const byteLength = new TextEncoder().encode(encoded).length;
    expect(byteLength).toBeLessThan(BRIDGE_PAYLOAD_SAFE_BYTE_LIMIT);

    // Sanity: no trimming should have occurred — all 400 markers must be present.
    const markers = decodeMarkers(encoded);
    expect(totalMarkers(markers)).toBe(400);
    // Every category must be fully represented.
    expect(markers.users.length).toBe(USERS_N);
    expect(markers.workshops.length).toBe(WORKSHOPS_N);
    expect(markers.businesses.length).toBe(BUSINESSES_N);
    expect(markers.events.length).toBe(EVENTS_N);
    expect(markers.clubs.length).toBe(CLUBS_N);
    expect(markers.easterEggs.length).toBe(EASTER_EGGS_N);
    expect(markers.sos.length).toBe(SOS_N);
  });
});
