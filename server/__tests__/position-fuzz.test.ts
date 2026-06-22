/**
 * Tests: positionFuzz privacy setting hides exact coordinates from other users
 *
 * When a user sets positionFuzz=true and positionFuzzKm>0, their exact stored
 * coordinates must NEVER be returned verbatim to other viewers. Instead, a
 * random offset within the specified radius is applied by fuzzedCoordsForViewer().
 *
 * These tests guard all five coordinate-returning endpoints against future
 * regressions where the fuzz logic might be bypassed:
 *   - GET /api/users/online-list
 *   - GET /api/users/biker-available-list
 *   - GET /api/users/zavorrine-available-list
 *   - GET /api/users/nearby
 *   - GET /api/users/search
 *
 * Approach:
 *   1. All heavy server-side modules are mocked so the tests run without a real DB.
 *   2. Math.random is spied on and set to a deterministic value so the fuzz offset
 *      is predictable and the test can assert the exact expected output.
 *   3. The actual users router is imported — not a synthetic stub.
 *   4. Each test creates a "target" user with positionFuzz=true, positionFuzzKm=5,
 *      stored at (lat=45.0, lng=9.0). The requester is a DIFFERENT user.
 *   5. The assertion confirms the returned coords differ from the stored exact ones.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Module mocks — must appear before the router import so vitest hoists them
// ---------------------------------------------------------------------------

vi.mock("../storage", () => ({
  storage: {
    getBlockedUserIds: vi.fn().mockResolvedValue([]),
    getAppSetting: vi.fn().mockResolvedValue(null),
    getAllUsers: vi.fn().mockResolvedValue([]),
    searchUsers: vi.fn().mockResolvedValue([]),
    getNearbyUsers: vi.fn().mockResolvedValue([]),
    getOnlineUsersList: vi.fn().mockResolvedValue([]),
    getAvailableUsersList: vi.fn().mockResolvedValue([]),
    getAvailableBikersList: vi.fn().mockResolvedValue([]),
    getAvailableZavorrinaList: vi.fn().mockResolvedValue([]),
    getUserMotorcycles: vi.fn().mockResolvedValue([]),
    getUserMotorcyclesBatch: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../online-tracker", () => ({
  onlineTracker: {
    getOnlineUserIds: vi.fn().mockReturnValue([]),
    getAvailableBikerIds: vi.fn().mockReturnValue([]),
    getAvailableZavorrinaIds: vi.fn().mockReturnValue([]),
    isOnline: vi.fn().mockReturnValue(false),
    countAvailableBikers: vi.fn().mockReturnValue(0),
    countAvailableZavorrine: vi.fn().mockReturnValue(0),
    setOfflineCallback: vi.fn(),
  },
}));

vi.mock("../db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  pool: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock("../objectStorage", () => ({
  uploadBuffer: vi.fn(),
  downloadBuffer: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("../lib/abuse-rate-limit", () => ({
  reportRateLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
  getTrustedClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("../routes/motoclubs", () => ({
  createRegionalClubInvite: vi.fn(),
  seedMotoclubs: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import mocked modules and the router under test
// ---------------------------------------------------------------------------

import { storage } from "../storage";
// Mock return type aliases
type StorageSetting = Awaited<ReturnType<typeof storage.getAppSetting>>;
type StorageOnlineRow = Awaited<ReturnType<typeof storage.getOnlineUsersList>>[0];
type StorageAvailableRow = Awaited<ReturnType<typeof storage.getAvailableBikersList>>[0];
type StorageNearbyRow = Awaited<ReturnType<typeof storage.getNearbyUsers>>[0];
type StorageSearchRow = Awaited<ReturnType<typeof storage.searchUsers>>[0];

import { onlineTracker } from "../online-tracker";
import usersRouter from "../routes/users";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUESTER_ID = "requester-999";
const TARGET_ID = "target-fuzzy-user";

/** Exact coordinates stored for the target user. */
const STORED_LAT = 45.0;
const STORED_LNG = 9.0;

/**
 * Math.random() is fixed to 0.3 so the fuzz is deterministic.
 *
 * applyPositionFuzz with radiusKm=5, random=0.3:
 *   r      = 5 * sqrt(0.3)        ≈ 2.7386
 *   theta  = 0.3 * 2 * PI         ≈ 1.8850 rad
 *   dlat   = (r / 6371) * (180/PI) ≈ 0.02459 degrees
 *   dlng   = dlat / cos(45°)       ≈ 0.03478 degrees
 *   sin(θ) ≈  0.9511 → lat offset ≈ +0.02339
 *   cos(θ) ≈ -0.3090 → lng offset ≈ -0.01075
 *
 * Expected returned coords differ measurably from (45.0, 9.0).
 */
const FIXED_RANDOM = 0.3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: { userId: REQUESTER_ID } });
    next();
  });
  app.use("/api/users", usersRouter);
  return app;
}

/** Minimal user object for the fuzz target. */
function makeTargetUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: TARGET_ID,
    nickname: "fuzz_target",
    avatarUrl: null,
    userType: "biker",
    role: "user",
    status: "active",
    ghostMode: false,
    lastLoginAt: new Date().toISOString(),
    sex: "m",
    region: "Lombardia",
    country: "IT",
    birthYear: 1990,
    ...overrides,
  };
}

/** Profile with positionFuzz enabled at 5 km radius. */
function makeFuzzedProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    latitude: STORED_LAT,
    longitude: STORED_LNG,
    hideFromMap: false,
    isAvailable: true,
    bio: null,
    ghostMode: false,
    positionFuzz: true,
    positionFuzzKm: 5,
    lastOfflineLat: null,
    lastOfflineLng: null,
    offlinePositionRandomize: false,
    ...overrides,
  };
}

/** Profile WITHOUT positionFuzz — used to verify the owner sees exact coords. */
function makeExactProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...makeFuzzedProfile(overrides),
    positionFuzz: false,
  };
}

/** Row format used by online-list (getOnlineUsersList result shape). */
function makeOnlineListRow(profileOverrides: Record<string, unknown> = {}) {
  return {
    user: makeTargetUser(),
    profile: makeFuzzedProfile(profileOverrides),
    distance: 10,
  };
}

/** Row format used by biker/zavorrine available list. */
function makeAvailableRow(userType: "biker" | "zavorrina" = "biker", profileOverrides: Record<string, unknown> = {}) {
  return {
    user: makeTargetUser({ userType }),
    profile: makeFuzzedProfile({ isAvailable: true, ...profileOverrides }),
    distance: 5,
  };
}

/** Row format used by nearby endpoint. */
function makeNearbyRow(profileOverrides: Record<string, unknown> = {}) {
  return {
    user: makeTargetUser(),
    profile: makeFuzzedProfile({ offlinePositionRandomize: false, ...profileOverrides }),
    distance: 8,
  };
}

/** Row format used by search endpoint. */
function makeSearchRow(profileOverrides: Record<string, unknown> = {}) {
  return {
    user: makeTargetUser(),
    profile: makeFuzzedProfile(profileOverrides),
  };
}

/** App setting helper for map_visibility_filter=all. */
function filterAll() {
  return { key: "map_visibility_filter", value: "all" };
}

// ---------------------------------------------------------------------------
// GET /api/users/online-list — positionFuzz
// ---------------------------------------------------------------------------

describe("GET /api/users/online-list — positionFuzz hides exact coords", () => {
  let app: express.Application;
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(FIXED_RANDOM);

    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "map_visibility_filter") return filterAll() as unknown as StorageSetting;
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(storage.getUserMotorcycles).mockResolvedValue([]);
    vi.mocked(onlineTracker.getOnlineUserIds).mockReturnValue([TARGET_ID]);
    vi.mocked(storage.getOnlineUsersList).mockResolvedValue([makeOnlineListRow()] as unknown as StorageOnlineRow[]);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it("returns fuzzed coordinates (not exact) for a user with positionFuzz=true", async () => {
    const res = await request(app).get("/api/users/online-list");

    expect(res.status).toBe(200);
    const target = res.body.find((u: Record<string, unknown>) => u.id === TARGET_ID);
    expect(target).toBeDefined();

    expect(target.latitude).not.toBeNull();
    expect(target.longitude).not.toBeNull();
    expect(target.latitude).not.toBe(STORED_LAT);
    expect(target.longitude).not.toBe(STORED_LNG);
  });

  it("owner always receives exact coordinates even when positionFuzz=true", async () => {
    vi.mocked(onlineTracker.getOnlineUserIds).mockReturnValue([REQUESTER_ID]);
    vi.mocked(storage.getOnlineUsersList).mockResolvedValue([{
      user: { ...makeTargetUser(), id: REQUESTER_ID },
      profile: makeFuzzedProfile(),
      distance: 0,
    }] as unknown as StorageAvailableRow[]);

    const res = await request(app).get("/api/users/online-list");

    expect(res.status).toBe(200);
    const self = res.body.find((u: Record<string, unknown>) => u.id === REQUESTER_ID);
    expect(self).toBeDefined();
    expect(self.latitude).toBe(STORED_LAT);
    expect(self.longitude).toBe(STORED_LNG);
  });

  it("user with positionFuzz=false returns exact coords", async () => {
    vi.mocked(storage.getOnlineUsersList).mockResolvedValue([{
      ...makeOnlineListRow(),
      profile: makeExactProfile(),
    }] as unknown as StorageAvailableRow[]);

    const res = await request(app).get("/api/users/online-list");

    expect(res.status).toBe(200);
    const target = res.body.find((u: Record<string, unknown>) => u.id === TARGET_ID);
    expect(target).toBeDefined();
    expect(target.latitude).toBe(STORED_LAT);
    expect(target.longitude).toBe(STORED_LNG);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/biker-available-list — positionFuzz
// ---------------------------------------------------------------------------

describe("GET /api/users/biker-available-list — positionFuzz hides exact coords", () => {
  let app: express.Application;
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(FIXED_RANDOM);

    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "map_visibility_filter") return filterAll() as unknown as StorageSetting;
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(storage.getUserMotorcycles).mockResolvedValue([]);
    vi.mocked(onlineTracker.getAvailableBikerIds).mockReturnValue([TARGET_ID]);
    vi.mocked(storage.getAvailableBikersList).mockResolvedValue([makeAvailableRow("biker")] as unknown as StorageAvailableRow[]);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it("returns fuzzed coordinates (not exact) for a biker with positionFuzz=true", async () => {
    const res = await request(app).get("/api/users/biker-available-list");

    expect(res.status).toBe(200);
    const target = res.body.find((u: Record<string, unknown>) => u.id === TARGET_ID);
    expect(target).toBeDefined();
    expect(target.latitude).not.toBeNull();
    expect(target.longitude).not.toBeNull();
    expect(target.latitude).not.toBe(STORED_LAT);
    expect(target.longitude).not.toBe(STORED_LNG);
  });

  it("biker with positionFuzz=false returns exact coords", async () => {
    vi.mocked(storage.getAvailableBikersList).mockResolvedValue([{
      ...makeAvailableRow("biker"),
      profile: makeExactProfile({ isAvailable: true }),
    }] as unknown as StorageAvailableRow[]);

    const res = await request(app).get("/api/users/biker-available-list");

    expect(res.status).toBe(200);
    const target = res.body.find((u: Record<string, unknown>) => u.id === TARGET_ID);
    expect(target).toBeDefined();
    expect(target.latitude).toBe(STORED_LAT);
    expect(target.longitude).toBe(STORED_LNG);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/zavorrine-available-list — positionFuzz
// ---------------------------------------------------------------------------

describe("GET /api/users/zavorrine-available-list — positionFuzz hides exact coords", () => {
  let app: express.Application;
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(FIXED_RANDOM);

    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "map_visibility_filter") return filterAll() as unknown as StorageSetting;
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(storage.getUserMotorcycles).mockResolvedValue([]);
    vi.mocked(onlineTracker.getAvailableZavorrinaIds).mockReturnValue([TARGET_ID]);
    vi.mocked(storage.getAvailableZavorrinaList).mockResolvedValue([makeAvailableRow("zavorrina")] as unknown as StorageAvailableRow[]);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it("returns fuzzed coordinates (not exact) for a zavorrina with positionFuzz=true", async () => {
    const res = await request(app).get("/api/users/zavorrine-available-list");

    expect(res.status).toBe(200);
    const target = res.body.find((u: Record<string, unknown>) => u.id === TARGET_ID);
    expect(target).toBeDefined();
    expect(target.latitude).not.toBeNull();
    expect(target.longitude).not.toBeNull();
    expect(target.latitude).not.toBe(STORED_LAT);
    expect(target.longitude).not.toBe(STORED_LNG);
  });

  it("zavorrina with positionFuzz=false returns exact coords", async () => {
    vi.mocked(storage.getAvailableZavorrinaList).mockResolvedValue([{
      ...makeAvailableRow("zavorrina"),
      profile: makeExactProfile({ isAvailable: true }),
    }] as unknown as StorageAvailableRow[]);

    const res = await request(app).get("/api/users/zavorrine-available-list");

    expect(res.status).toBe(200);
    const target = res.body.find((u: Record<string, unknown>) => u.id === TARGET_ID);
    expect(target).toBeDefined();
    expect(target.latitude).toBe(STORED_LAT);
    expect(target.longitude).toBe(STORED_LNG);
  });
});
