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
// GET /api/users/nearby — positionFuzz
// ---------------------------------------------------------------------------

describe("GET /api/users/nearby — positionFuzz hides exact coords", () => {
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
    vi.mocked(storage.getNearbyUsers).mockResolvedValue([makeNearbyRow()] as unknown as StorageNearbyRow[]);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it("returns fuzzed coordinates (not exact) for a nearby user with positionFuzz=true", async () => {
    const res = await request(app).get("/api/users/nearby?lat=45&lng=9");

    expect(res.status).toBe(200);
    const target = res.body.find((u: Record<string, unknown>) => u.id === TARGET_ID);
    expect(target).toBeDefined();
    expect(target.latitude).not.toBeNull();
    expect(target.longitude).not.toBeNull();
    expect(target.latitude).not.toBe(STORED_LAT);
    expect(target.longitude).not.toBe(STORED_LNG);
  });

  it("nearby user with positionFuzz=false returns exact coords", async () => {
    vi.mocked(storage.getNearbyUsers).mockResolvedValue([{
      ...makeNearbyRow(),
      profile: makeExactProfile({ offlinePositionRandomize: false }),
    }] as unknown as StorageAvailableRow[]);

    const res = await request(app).get("/api/users/nearby?lat=45&lng=9");

    expect(res.status).toBe(200);
    const target = res.body.find((u: Record<string, unknown>) => u.id === TARGET_ID);
    expect(target).toBeDefined();
    expect(target.latitude).toBe(STORED_LAT);
    expect(target.longitude).toBe(STORED_LNG);
  });

  it("returns 400 when lat/lng params are missing", async () => {
    const res = await request(app).get("/api/users/nearby");
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/search — positionFuzz
// ---------------------------------------------------------------------------

describe("GET /api/users/search — positionFuzz hides exact coords", () => {
  let app: express.Application;
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(FIXED_RANDOM);

    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "map_visibility_filter") return filterAll() as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(onlineTracker.isOnline).mockReturnValue(false);
    vi.mocked(onlineTracker.getOnlineUserIds).mockReturnValue([]);
    vi.mocked(storage.searchUsers).mockResolvedValue([makeSearchRow()] as unknown as StorageSearchRow[]);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it("returns fuzzed coordinates (not exact) for a search result with positionFuzz=true", async () => {
    const res = await request(app).get("/api/users/search?q=fuzz_target");

    expect(res.status).toBe(200);
    const target = res.body.find((u: Record<string, unknown>) => u.id === TARGET_ID);
    expect(target).toBeDefined();
    expect(target.latitude).not.toBeNull();
    expect(target.longitude).not.toBeNull();
    expect(target.latitude).not.toBe(STORED_LAT);
    expect(target.longitude).not.toBe(STORED_LNG);
  });

  it("search result with positionFuzz=false returns exact coords", async () => {
    vi.mocked(storage.searchUsers).mockResolvedValue([{
      ...makeSearchRow(),
      profile: makeExactProfile(),
    }] as unknown as StorageAvailableRow[]);

    const res = await request(app).get("/api/users/search?q=fuzz_target");

    expect(res.status).toBe(200);
    const target = res.body.find((u: Record<string, unknown>) => u.id === TARGET_ID);
    expect(target).toBeDefined();
    expect(target.latitude).toBe(STORED_LAT);
    expect(target.longitude).toBe(STORED_LNG);
  });

  it("ghostMode user always gets null coords regardless of positionFuzz", async () => {
    vi.mocked(storage.searchUsers).mockResolvedValue([{
      user: { ...makeTargetUser(), ghostMode: true },
      profile: makeFuzzedProfile(),
    }] as unknown as StorageAvailableRow[]);

    const res = await request(app).get("/api/users/search?q=fuzz_target");

    expect(res.status).toBe(200);
    const target = res.body.find((u: Record<string, unknown>) => u.id === TARGET_ID);
    expect(target).toBeDefined();
    expect(target.latitude).toBeNull();
    expect(target.longitude).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cross-endpoint canary: fuzzedCoordsForViewer is referenced in all sub-router sources
// ---------------------------------------------------------------------------

describe("Canary — fuzzedCoordsForViewer is present in all coordinate-returning sub-routers", () => {
  it("users.ts root contains fuzzedCoordsForViewer references", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../routes/users.ts"), "utf-8");
    const executableLines = src
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");

    const count = (executableLines.match(/fuzzedCoordsForViewer/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("discovery.ts sub-router contains fuzzedCoordsForViewer references", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../routes/users/discovery.ts"), "utf-8");
    const executableLines = src
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");

    const count = (executableLines.match(/fuzzedCoordsForViewer/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("discovery-available.ts sub-router contains fuzzedCoordsForViewer references", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../routes/users/discovery-available.ts"), "utf-8");
    const executableLines = src
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");

    const count = (executableLines.match(/fuzzedCoordsForViewer/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("misc.ts sub-router contains fuzzedCoordsForViewer references", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../routes/users/misc.ts"), "utf-8");
    const executableLines = src
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");

    const count = (executableLines.match(/fuzzedCoordsForViewer/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
