/**
 * Task #104 — reveal-on-first-coordinate invariant on the coordinate-write paths.
 *
 * Task #66 established the map-visibility invariant: a profile must never be
 * advertised as visible (hide_from_map=false) while it has never been positioned
 * (coordinatesUpdatedAt == null). The reveal-on-first-coordinate helper
 * (server/lib/map-visibility.ts) restores the "visible by default" behaviour the
 * first time a real coordinate is stored — and only then, so it never overrides a
 * visibility choice an already-positioned rider makes later.
 *
 * The login path is covered by coordinate-recovery-on-login.test.ts. This suite
 * covers the OTHER three coordinate-write paths so a future refactor cannot silently
 * drop the reveal without a test failing:
 *   - PUT /api/users/location            (routes/users/misc.ts)
 *   - PUT /api/users/me/availability     (routes/users/profile.ts)
 *   - PUT /api/users/profile/dynamic     (routes/users/profile.ts)
 *
 * For each: a never-positioned profile is revealed (hide_from_map=false) on its
 * first coordinate, and an already-positioned profile's explicit visibility is
 * left untouched by a later coordinate write.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Module mocks (must come before any import that pulls in these modules)
// ---------------------------------------------------------------------------

vi.mock("../../storage", () => ({
  storage: {
    getUserProfile: vi.fn(),
    updateUserProfile: vi.fn(),
    createUserProfile: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    getAppSetting: vi.fn(),
  },
}));

vi.mock("../../matching-engine", () => ({
  triggerProposalProfileMatchingForZavorrina: vi.fn(),
}));

vi.mock("../../online-tracker", () => ({
  onlineTracker: {
    setAvailability: vi.fn(),
    setGhostMode: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { storage } from "../../storage";
import usersRouter from "../../routes/users";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = "rider-104";

/**
 * A profile that has NEVER been positioned. Per register.ts new profiles are
 * created hidden, so hideFromMap starts true and coordinatesUpdatedAt is null.
 */
function neverPositionedProfile(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER_ID,
    latitude: null,
    longitude: null,
    coordinatesUpdatedAt: null,
    isAvailable: false,
    hideFromMap: true,
    positionFuzz: false,
    positionFuzzKm: 0,
    fakeHomeEnabled: false,
    fakeWorkEnabled: false,
    fakeWhateverEnabled: false,
    fixedPositionEnabled: false,
    fixedPositionLat: null,
    fixedPositionLng: null,
    ...overrides,
  };
}

/**
 * A profile that HAS been positioned already and whose owner has made an explicit
 * visibility choice (here: hidden). A later coordinate write must NOT change it.
 */
function positionedProfile(overrides: Record<string, unknown> = {}) {
  return neverPositionedProfile({
    latitude: 45.0,
    longitude: 9.0,
    coordinatesUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
    hideFromMap: true,
    ...overrides,
  });
}

function buildApp(userId?: string): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: userId ? { userId } : {} });
    next();
  });
  app.use("/api/users", usersRouter);
  return app;
}

/** Find the update payload passed to storage.updateUserProfile for USER_ID. */
function updateProfileCalls(): Array<Record<string, unknown>> {
  return vi
    .mocked(storage.updateUserProfile)
    .mock.calls.filter(([uid]) => uid === USER_ID)
    .map(([, data]) => data as Record<string, unknown>);
}

const NEW_LAT = 41.89;
const NEW_LNG = 12.48;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task #104 — reveal-on-first-coordinate on coordinate-write paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A non-zavorrina user so the matching trigger is a no-op branch.
    vi.mocked(storage.getUser).mockResolvedValue({ id: USER_ID, userType: "biker", firstLoginLat: 1, firstLoginLng: 1 } as never);
    vi.mocked(storage.updateUser).mockResolvedValue({ id: USER_ID } as never);
    vi.mocked(storage.updateUserProfile).mockResolvedValue(neverPositionedProfile() as never);
    vi.mocked(storage.createUserProfile).mockResolvedValue(neverPositionedProfile() as never);
    vi.mocked(storage.getAppSetting).mockResolvedValue(undefined as never);
  });

  // -------------------------------------------------------------------------
  // PUT /api/users/location
  // -------------------------------------------------------------------------

  describe("PUT /location", () => {
    it("reveals a never-positioned profile (hide_from_map=false) on its first coordinate", async () => {
      vi.mocked(storage.getUserProfile).mockResolvedValue(neverPositionedProfile() as never);

      const res = await request(buildApp(USER_ID))
        .put("/api/users/location")
        .send({ latitude: NEW_LAT, longitude: NEW_LNG });

      expect(res.status).toBe(200);
      const calls = updateProfileCalls();
      const revealCall = calls.find(
        (data) => data.latitude === NEW_LAT && data.hideFromMap === false,
      );
      expect(revealCall).toBeDefined();
    });

    it("does NOT change an already-positioned profile's explicit visibility", async () => {
      vi.mocked(storage.getUserProfile).mockResolvedValue(positionedProfile() as never);

      const res = await request(buildApp(USER_ID))
        .put("/api/users/location")
        .send({ latitude: NEW_LAT, longitude: NEW_LNG });

      expect(res.status).toBe(200);
      const calls = updateProfileCalls();
      expect(calls.length).toBeGreaterThan(0);
      // The coordinate write must touch coords but never re-write hideFromMap.
      for (const data of calls) {
        expect(data).not.toHaveProperty("hideFromMap");
      }
    });
  });

  // -------------------------------------------------------------------------
  // PUT /api/users/me/availability
  // -------------------------------------------------------------------------

  describe("PUT /me/availability", () => {
    it("reveals a never-positioned profile (hide_from_map=false) on its first coordinate", async () => {
      vi.mocked(storage.getUserProfile).mockResolvedValue(neverPositionedProfile() as never);

      const res = await request(buildApp(USER_ID))
        .put("/api/users/me/availability")
        .send({ isAvailable: true, latitude: NEW_LAT, longitude: NEW_LNG });

      expect(res.status).toBe(200);
      const calls = updateProfileCalls();
      const revealCall = calls.find(
        (data) => data.latitude === NEW_LAT && data.hideFromMap === false,
      );
      expect(revealCall).toBeDefined();
    });

    it("does NOT change an already-positioned profile's explicit visibility", async () => {
      vi.mocked(storage.getUserProfile).mockResolvedValue(positionedProfile() as never);

      const res = await request(buildApp(USER_ID))
        .put("/api/users/me/availability")
        .send({ isAvailable: true, latitude: NEW_LAT, longitude: NEW_LNG });

      expect(res.status).toBe(200);
      const calls = updateProfileCalls();
      expect(calls.length).toBeGreaterThan(0);
      for (const data of calls) {
        expect(data).not.toHaveProperty("hideFromMap");
      }
    });
  });

  // -------------------------------------------------------------------------
  // PUT /api/users/profile/dynamic
  // -------------------------------------------------------------------------

  describe("PUT /profile/dynamic", () => {
    it("reveals a never-positioned profile (hide_from_map=false) on its first coordinate", async () => {
      vi.mocked(storage.getUserProfile).mockResolvedValue(neverPositionedProfile() as never);

      const res = await request(buildApp(USER_ID))
        .put("/api/users/profile/dynamic")
        .send({ isAvailable: true, latitude: NEW_LAT, longitude: NEW_LNG });

      expect(res.status).toBe(200);
      const calls = updateProfileCalls();
      const revealCall = calls.find(
        (data) => data.latitude === NEW_LAT && data.hideFromMap === false,
      );
      expect(revealCall).toBeDefined();
    });

    it("does NOT change an already-positioned profile's explicit visibility", async () => {
      vi.mocked(storage.getUserProfile).mockResolvedValue(positionedProfile() as never);

      const res = await request(buildApp(USER_ID))
        .put("/api/users/profile/dynamic")
        .send({ isAvailable: true, latitude: NEW_LAT, longitude: NEW_LNG });

      expect(res.status).toBe(200);
      const calls = updateProfileCalls();
      expect(calls.length).toBeGreaterThan(0);
      for (const data of calls) {
        expect(data).not.toHaveProperty("hideFromMap");
      }
    });
  });
});
