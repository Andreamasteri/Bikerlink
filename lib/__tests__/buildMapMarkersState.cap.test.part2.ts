// Part 2 of 2 — exact-equality & byte-size tests (see .part1.ts for shared helpers)

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

describe("buildMapMarkersState — marker cap integration", () => {

  it("total equals MARKERS_HARD_CAP exactly when pin guard fires with a viewport centre", () => {
    // 500 users: current user far from centre, 499 others packed near centre.
    // quota for "users" = 400 (single non-empty category → gets the full cap).
    // Pin guard: [pinned] + sorted.slice(0, 399) = 400 entries — exact equality.
    const farCurrentUser: MapUser = {
      id: CURRENT_USER_ID,
      latitude: 55.0,
      longitude: 25.0,
      userType: "biker" as const,
      sex: null,
      nickname: "io_lontano",
      country: "IT",
      currentSpeedKph: null,
      speedProfile: null,
    };
    const nearUsers = makeUsers(499, 45.001, 10.001);
    const filteredUsers = [farCurrentUser, ...nearUsers];

    const encoded = buildMapMarkersState({
      ...baseParams(),
      filteredUsers,
      currentUserId: CURRENT_USER_ID,
      // userLocation defaults to SESSION_CENTER (45, 10) — far from current user
    });

    const markers = decodeMarkers(encoded);
    // Exact equality: quota math must not produce an off-by-one
    expect(totalMarkers(markers)).toBe(MARKERS_HARD_CAP);

    // Current user must survive despite being the farthest from centre
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

  it("total equals MARKERS_HARD_CAP exactly when pin guard fires with null centre (no viewport)", () => {
    // Same pin-guard scenario but userLocation is null → array-position fallback.
    // Pin guard: [pinned] + rest.slice(0, 399) = 400 entries — exact equality.
    const farCurrentUser: MapUser = {
      id: CURRENT_USER_ID,
      latitude: 55.0,
      longitude: 25.0,
      userType: "biker" as const,
      sex: null,
      nickname: "io_lontano_null",
      country: "IT",
      currentSpeedKph: null,
      speedProfile: null,
    };
    // currentUser at index 0, 499 others fill the rest
    const otherUsers = makeUsers(499, 45.001, 10.001);
    const filteredUsers = [farCurrentUser, ...otherUsers];

    const encoded = buildMapMarkersState({
      ...baseParams(),
      userLocation: null, // null centre → position-based trim
      filteredUsers,
      currentUserId: CURRENT_USER_ID,
    });

    const markers = decodeMarkers(encoded);
    // Exact equality: quota-1 from rest, pinned prepended → 400 total
    expect(totalMarkers(markers)).toBe(MARKERS_HARD_CAP);

    // Current user must still survive
    const me = markers.users.find((u) => u.id === CURRENT_USER_ID);
    expect(me).toBeDefined();
    expect(me?.isCurrentUser).toBe(true);
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
