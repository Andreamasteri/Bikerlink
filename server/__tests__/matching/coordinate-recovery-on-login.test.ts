/**
 * Integration test: coordinate recovery on first login for pre-existing users.
 *
 * Verifies that when a rider registered before the current session logs in
 * and their user_profiles row has null lat/lng, the login handler automatically
 * recovers coordinates via the fallback chain:
 *   1. coordinate_history (most recent GPS fix)
 *   2. users.first_login_lat / first_login_lng
 *   3. regional centroid (from ITALIAN_REGION_CENTROIDS)
 *
 * If the client also sends explicit coordinates in the login payload those are
 * stored as usual (existing behaviour, unchanged).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Module mocks (must come before any import that pulls in these modules)
// ---------------------------------------------------------------------------

vi.mock("../../db", () => ({
  db: {},
  pool: {},
  // login.ts guards its DB access with these helpers; the mock must expose them
  // or every handler call throws (TypeError) and returns 500.
  withDbTimeout: <T,>(p: Promise<T>): Promise<T> => p,
  DbTimeoutError: class DbTimeoutError extends Error {},
  isPoolHealthy: () => true,
}));

vi.mock("../../storage", () => ({
  storage: {
    getUserByEmail: vi.fn(),
    getUserByNickname: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    upsertUserProfile: vi.fn(),
    getUserProfile: vi.fn(),
    getLatestCoordinateHistory: vi.fn(),
    getAppSetting: vi.fn(),
  },
}));

vi.mock("../../online-tracker", () => ({
  onlineTracker: {
    setOnline: vi.fn(),
    setOffline: vi.fn(),
    setOfflineCallback: vi.fn(),
  },
}));

vi.mock("../../session-utils", () => ({
  revokeSessionsByType: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../session-sse", () => ({
  notifySessionDisplaced: vi.fn(),
  addSessionSseClient: vi.fn().mockReturnValue("conn-1"),
  removeSessionSseClient: vi.fn(),
}));

vi.mock("../../lib/visitor-tracking", () => ({
  parseVisitorCookie: vi.fn().mockReturnValue(null),
  recordVisit: vi.fn(),
}));

vi.mock("../motoclubs", () => ({
  createRegionalClubInvite: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("cookie-signature", () => ({
  default: {
    sign: vi.fn().mockReturnValue("signed"),
  },
}));

vi.mock("express-rate-limit", () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { storage } from "../../storage";
import loginRouter from "../../routes/auth/login";
import { ITALIAN_REGION_CENTROIDS } from "../../lib/region-centroids";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = "pre-existing-user-1";

function makeBaseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    nickname: "TesterRider",
    email: "tester@example.com",
    password: "$2b$12$hashedpassword",
    role: "user",
    status: "active",
    emailVerified: true,
    isFake: false,
    isSystem: false,
    isPrimal: false,
    ghostMode: false,
    region: null,
    country: "IT",
    firstLoginAt: null,
    firstLoginLat: null,
    firstLoginLng: null,
    lastLoginAt: null,
    lastLogoutAt: null,
    ...overrides,
  };
}

function makeProfile(lat: number | null = null, lng: number | null = null) {
  return {
    userId: USER_ID,
    latitude: lat,
    longitude: lng,
    isAvailable: false,
    hideFromMap: false,
    ghostMode: false,
    positionFuzz: false,
    positionFuzzKm: 0,
    offlinePositionRandomize: false,
    lastOfflineLat: null,
    lastOfflineLng: null,
    mapFilters: null,
  };
}

function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const fakeSession: Record<string, unknown> = { userId: null };
    Object.assign(req, {
      session: new Proxy(fakeSession, {
        set(target, prop, value) { target[prop as string] = value; return true; },
        get(target, prop) {
          if (prop === "save") return (cb: (err: null) => void) => cb(null);
          if (prop === "destroy") return (cb: (err: null) => void) => cb(null);
          return target[prop as string];
        },
      }),
      sessionID: "test-session-id",
    });
    next();
  });
  app.use("/api/auth", loginRouter);
  return app;
}

const LOGIN_BODY = { identifier: "tester@example.com", password: "TestPassword1" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("coordinate recovery on login — pre-existing user with null coords", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();

    const baseUser = makeBaseUser();
    vi.mocked(storage.getUserByEmail).mockResolvedValue(baseUser as never);
    vi.mocked(storage.getUserByNickname).mockResolvedValue(undefined);
    vi.mocked(storage.getUser).mockResolvedValue(baseUser as never);
    vi.mocked(storage.updateUser).mockResolvedValue(baseUser as never);
    vi.mocked(storage.upsertUserProfile).mockResolvedValue(makeProfile() as never);
    vi.mocked(storage.getAppSetting).mockResolvedValue(undefined);
    vi.mocked(storage.getLatestCoordinateHistory).mockResolvedValue(null);
    vi.mocked(storage.getUserProfile).mockResolvedValue(makeProfile() as never);
  });

  // -------------------------------------------------------------------------
  // Path 1 — GPS history available
  // -------------------------------------------------------------------------

  it("recovers coordinates from coordinate_history when profile lat/lng is null", async () => {
    const GPS_LAT = 45.47;
    const GPS_LNG = 9.19;
    vi.mocked(storage.getLatestCoordinateHistory).mockResolvedValue({ latitude: GPS_LAT, longitude: GPS_LNG });

    const res = await request(app).post("/api/auth/login").send(LOGIN_BODY);

    expect(res.status).toBe(200);

    await vi.waitFor(() => {
      const calls = vi.mocked(storage.upsertUserProfile).mock.calls;
      const recoveryCall = calls.find(
        ([uid, data]) =>
          uid === USER_ID &&
          (data as Record<string, unknown>).latitude === GPS_LAT &&
          (data as Record<string, unknown>).longitude === GPS_LNG
      );
      expect(recoveryCall).toBeDefined();
    });
  });

  it("does NOT fall through to firstLogin or centroid when GPS history is present", async () => {
    vi.mocked(storage.getLatestCoordinateHistory).mockResolvedValue({ latitude: 44.0, longitude: 8.5 });
    vi.mocked(storage.getUserByEmail).mockResolvedValue(makeBaseUser({ firstLoginLat: 45.5, firstLoginLng: 9.5, region: "Lombardia" }) as never);
    vi.mocked(storage.getUser).mockResolvedValue(makeBaseUser({ firstLoginLat: 45.5, firstLoginLng: 9.5, region: "Lombardia" }) as never);

    await request(app).post("/api/auth/login").send(LOGIN_BODY);

    await vi.waitFor(() => {
      const calls = vi.mocked(storage.upsertUserProfile).mock.calls;
      const centroid = ITALIAN_REGION_CENTROIDS["Lombardia"];
      const centroidCall = calls.find(
        ([, data]) =>
          (data as Record<string, unknown>).latitude === centroid[0] &&
          (data as Record<string, unknown>).longitude === centroid[1]
      );
      expect(centroidCall).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Path 2 — first_login_lat/lng available (no GPS history)
  // -------------------------------------------------------------------------

  it("recovers coordinates from firstLoginLat/Lng when GPS history is absent", async () => {
    const FIRST_LAT = 43.77;
    const FIRST_LNG = 11.26;
    vi.mocked(storage.getLatestCoordinateHistory).mockResolvedValue(null);
    vi.mocked(storage.getUserByEmail).mockResolvedValue(makeBaseUser({ firstLoginLat: FIRST_LAT, firstLoginLng: FIRST_LNG }) as never);
    vi.mocked(storage.getUser).mockResolvedValue(makeBaseUser({ firstLoginLat: FIRST_LAT, firstLoginLng: FIRST_LNG }) as never);

    const res = await request(app).post("/api/auth/login").send(LOGIN_BODY);

    expect(res.status).toBe(200);

    await vi.waitFor(() => {
      const calls = vi.mocked(storage.upsertUserProfile).mock.calls;
      const recoveryCall = calls.find(
        ([uid, data]) =>
          uid === USER_ID &&
          (data as Record<string, unknown>).latitude === FIRST_LAT &&
          (data as Record<string, unknown>).longitude === FIRST_LNG
      );
      expect(recoveryCall).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Path 3 — regional centroid fallback
  // -------------------------------------------------------------------------

  it("recovers coordinates from regional centroid when no GPS history and no firstLogin coords", async () => {
    vi.mocked(storage.getLatestCoordinateHistory).mockResolvedValue(null);
    vi.mocked(storage.getUserByEmail).mockResolvedValue(makeBaseUser({ region: "Toscana" }) as never);
    vi.mocked(storage.getUser).mockResolvedValue(makeBaseUser({ region: "Toscana" }) as never);

    const res = await request(app).post("/api/auth/login").send(LOGIN_BODY);

    expect(res.status).toBe(200);

    const [expectedLat, expectedLng] = ITALIAN_REGION_CENTROIDS["Toscana"];

    await vi.waitFor(() => {
      const calls = vi.mocked(storage.upsertUserProfile).mock.calls;
      const recoveryCall = calls.find(
        ([uid, data]) =>
          uid === USER_ID &&
          (data as Record<string, unknown>).latitude === expectedLat &&
          (data as Record<string, unknown>).longitude === expectedLng
      );
      expect(recoveryCall).toBeDefined();
    });
  });

  it("sets coordinatesUpdatedAt when recovering from regional centroid", async () => {
    vi.mocked(storage.getLatestCoordinateHistory).mockResolvedValue(null);
    vi.mocked(storage.getUserByEmail).mockResolvedValue(makeBaseUser({ region: "Veneto" }) as never);
    vi.mocked(storage.getUser).mockResolvedValue(makeBaseUser({ region: "Veneto" }) as never);

    await request(app).post("/api/auth/login").send(LOGIN_BODY);

    await vi.waitFor(() => {
      const calls = vi.mocked(storage.upsertUserProfile).mock.calls;
      const recoveryCall = calls.find(
        ([uid, data]) =>
          uid === USER_ID &&
          (data as Record<string, unknown>).coordinatesUpdatedAt instanceof Date
      );
      expect(recoveryCall).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Path 4 — no recovery possible (no history, no firstLogin, unknown region)
  // -------------------------------------------------------------------------

  it("does not call upsertUserProfile for coord recovery when no source is available", async () => {
    vi.mocked(storage.getLatestCoordinateHistory).mockResolvedValue(null);
    vi.mocked(storage.getUserByEmail).mockResolvedValue(makeBaseUser({ region: "UnknownRegion" }) as never);
    vi.mocked(storage.getUser).mockResolvedValue(makeBaseUser({ region: "UnknownRegion" }) as never);

    const res = await request(app).post("/api/auth/login").send(LOGIN_BODY);

    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    const calls = vi.mocked(storage.upsertUserProfile).mock.calls;
    const coordCalls = calls.filter(
      ([, data]) =>
        (data as Record<string, unknown>).latitude != null &&
        (data as Record<string, unknown>).longitude != null
    );
    expect(coordCalls).toHaveLength(0);
  });

  it("flips hide_from_map=true when no coordinate source is available (Task #66 invariant)", async () => {
    vi.mocked(storage.getLatestCoordinateHistory).mockResolvedValue(null);
    vi.mocked(storage.getUserByEmail).mockResolvedValue(makeBaseUser({ region: "UnknownRegion" }) as never);
    vi.mocked(storage.getUser).mockResolvedValue(makeBaseUser({ region: "UnknownRegion" }) as never);
    // Profile is advertised as visible (hide_from_map=false) but has no coords —
    // exactly the stuck state from prod. With no recovery source, it must be
    // flipped to hidden so the visibility state is truthful.
    vi.mocked(storage.getUserProfile).mockResolvedValue(makeProfile() as never);

    const res = await request(app).post("/api/auth/login").send(LOGIN_BODY);

    expect(res.status).toBe(200);

    await vi.waitFor(() => {
      const calls = vi.mocked(storage.upsertUserProfile).mock.calls;
      const hideCall = calls.find(
        ([uid, data]) =>
          uid === USER_ID && (data as Record<string, unknown>).hideFromMap === true
      );
      expect(hideCall).toBeDefined();
    });
  });

  it("reveals a never-positioned profile (hide_from_map=false) on its first coordinate", async () => {
    const CLIENT_LAT = 41.89;
    const CLIENT_LNG = 12.48;

    const res = await request(app)
      .post("/api/auth/login")
      .send({ ...LOGIN_BODY, latitude: CLIENT_LAT, longitude: CLIENT_LNG });

    expect(res.status).toBe(200);

    await vi.waitFor(() => {
      const calls = vi.mocked(storage.upsertUserProfile).mock.calls;
      const revealCall = calls.find(
        ([uid, data]) =>
          uid === USER_ID &&
          (data as Record<string, unknown>).latitude === CLIENT_LAT &&
          (data as Record<string, unknown>).hideFromMap === false
      );
      expect(revealCall).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Path 5 — coords already present → no recovery triggered
  // -------------------------------------------------------------------------

  it("skips recovery when profile already has coordinates", async () => {
    vi.mocked(storage.getUserProfile).mockResolvedValue(makeProfile(45.47, 9.19) as never);
    vi.mocked(storage.getLatestCoordinateHistory).mockResolvedValue({ latitude: 10.0, longitude: 10.0 });

    const res = await request(app).post("/api/auth/login").send(LOGIN_BODY);

    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    expect(vi.mocked(storage.getLatestCoordinateHistory)).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Path 6 — client sends explicit coords in login payload
  // -------------------------------------------------------------------------

  it("saves client-provided coordinates directly (existing behaviour unchanged)", async () => {
    const CLIENT_LAT = 41.89;
    const CLIENT_LNG = 12.48;

    const res = await request(app)
      .post("/api/auth/login")
      .send({ ...LOGIN_BODY, latitude: CLIENT_LAT, longitude: CLIENT_LNG });

    expect(res.status).toBe(200);

    await vi.waitFor(() => {
      const calls = vi.mocked(storage.upsertUserProfile).mock.calls;
      const directSave = calls.find(
        ([uid, data]) =>
          uid === USER_ID &&
          (data as Record<string, unknown>).latitude === CLIENT_LAT &&
          (data as Record<string, unknown>).longitude === CLIENT_LNG
      );
      expect(directSave).toBeDefined();
    });
  });
});
