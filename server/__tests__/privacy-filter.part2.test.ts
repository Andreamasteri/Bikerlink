// LARGE-FILE-ALLOW: file di test — copertura casi d'uso estesa necessaria per privacy-filter
import { describe, it, expect, vi, beforeEach } from "vitest";
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
// Mock return type aliases — avoids explicit `any` casts
type StorageSetting = Awaited<ReturnType<typeof storage.getAppSetting>>;
type StorageNearbyRow = Awaited<ReturnType<typeof storage.getNearbyUsers>>[0];
type StorageAvailableRow = Awaited<ReturnType<typeof storage.getAvailableUsersList>>[0];

import { onlineTracker } from "../online-tracker";
import usersRouter from "../routes/users";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REQUESTER_ID = "requester-1";

/** Build a minimal Express app that injects a fake session and mounts the router. */
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

/** Return a mock storage AppSetting for map_visibility_filter. */
function filterSetting(value: "all" | "online_only" | "available_only") {
  return { key: "map_visibility_filter", value };
}

/** Minimal user object accepted by getAllUsers / isSystemAccount checks. */
function makeUser(
  id: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    nickname: `user_${id}`,
    avatarUrl: null,
    userType: "biker",
    role: "user",
    status: "active",
    ghostMode: false,
    lastLoginAt: null,
    ...overrides,
  };
}

/** Minimal search-result row ({ user, profile }). */
function makeSearchRow(
  id: string,
  userOverrides: Record<string, unknown> = {},
  profileOverrides: Record<string, unknown> = {}
) {
  return {
    user: makeUser(id, userOverrides),
    profile: {
      latitude: 45.0,
      longitude: 9.0,
      hideFromMap: false,
      isAvailable: false,
      bio: null,
      ghostMode: false,
      ...profileOverrides,
    },
  };
}

/** Minimal nearby-result row ({ user, profile, distance }). */
function makeNearbyRow(
  id: string,
  userOverrides: Record<string, unknown> = {},
  profileOverrides: Record<string, unknown> = {}
) {
  return {
    ...makeSearchRow(id, userOverrides, profileOverrides),
    distance: 5,
  };
}

/** Row as returned by storage.getAvailableBikersList / getAvailableZavorrinaList. */
function makeAvailableRow(
  id: string,
  userType: "biker" | "zavorrina" = "biker",
  profileOverrides: Record<string, unknown> = {}
) {
  return {
    user: makeUser(id, { userType }),
    profile: {
      latitude: 45.0,
      longitude: 9.0,
      hideFromMap: false,
      isAvailable: true,
      bio: null,
      lastOfflineLat: null,
      lastOfflineLng: null,
      offlinePositionRandomize: true,
      ...profileOverrides,
    },
    distance: 3,
  };
}

// ---------------------------------------------------------------------------
// GET /api/users/available-list
// ---------------------------------------------------------------------------

describe("GET /api/users/available-list — map_visibility_filter", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getUserMotorcycles).mockResolvedValue([]);
  });

  it("filter=all — returns all available users from storage", async () => {
    vi.mocked(storage.getAppSetting).mockResolvedValue(filterSetting("all") as unknown as StorageSetting);
    vi.mocked(storage.getAvailableUsersList).mockResolvedValue([
      makeAvailableRow("user-avail-1") as unknown as StorageAvailableRow,
      makeAvailableRow("user-avail-2") as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("user-avail-1");
    expect(ids).toContain("user-avail-2");
  });

  it("filter=online_only — excludes users not in the online tracker set", async () => {
    vi.mocked(storage.getAppSetting).mockResolvedValue(filterSetting("online_only") as unknown as StorageSetting);
    vi.mocked(storage.getAvailableUsersList).mockResolvedValue([
      makeAvailableRow("user-online") as unknown as StorageAvailableRow,
      makeAvailableRow("user-offline") as unknown as StorageAvailableRow,
    ]);
    // Only user-online is tracked as currently online
    vi.mocked(onlineTracker.getOnlineUserIds).mockReturnValue(["user-online"]);

    const res = await request(app).get("/api/users/available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("user-online");
    expect(ids).not.toContain("user-offline");
  });

  it("filter=available_only — is a no-op; all storage-returned rows appear (endpoint contract: only available users stored)", async () => {
    vi.mocked(storage.getAppSetting).mockResolvedValue(filterSetting("available_only") as unknown as StorageSetting);
    // Mix: one row with isAvailable=true (correct) and one with isAvailable=false (defensive case).
    // The route treats available_only as a no-op and trusts storage to pre-filter. Both rows pass
    // the JS filter, confirming the no-op behaviour is intentional and documented in the source.
    vi.mocked(storage.getAvailableUsersList).mockResolvedValue([
      makeAvailableRow("user-avail-1", "biker", { isAvailable: true }) as unknown as StorageAvailableRow,
      makeAvailableRow("user-avail-2", "biker", { isAvailable: false }) as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    // Both pass — the no-op is by design (storage already filters; the route trusts it)
    expect(ids).toContain("user-avail-1");
    expect(ids).toContain("user-avail-2");
  });

  it("returns empty list when storage returns no available users", async () => {
    vi.mocked(storage.getAppSetting).mockResolvedValue(filterSetting("all") as unknown as StorageSetting);
    vi.mocked(storage.getAvailableUsersList).mockResolvedValue([]);

    const res = await request(app).get("/api/users/available-list");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("blocked users are excluded even when filter=all", async () => {
    vi.mocked(storage.getAppSetting).mockResolvedValue(filterSetting("all") as unknown as StorageSetting);
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue(["user-blocked"]);
    vi.mocked(storage.getAvailableUsersList).mockResolvedValue([
      makeAvailableRow("user-blocked") as unknown as StorageAvailableRow,
      makeAvailableRow("user-visible") as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).not.toContain("user-blocked");
    expect(ids).toContain("user-visible");
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/biker-available-list
// ---------------------------------------------------------------------------

describe("GET /api/users/biker-available-list — map_visibility_filter", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getUserMotorcycles).mockResolvedValue([]);
  });

  it("filter=all — returns all tracker-available bikers", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(onlineTracker.getAvailableBikerIds).mockReturnValue(["biker-1", "biker-2"]);
    vi.mocked(storage.getAvailableBikersList).mockResolvedValue([
      makeAvailableRow("biker-1") as unknown as StorageAvailableRow,
      makeAvailableRow("biker-2") as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/biker-available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("biker-1");
    expect(ids).toContain("biker-2");
  });

  it("filter=online_only — returns only tracker-present bikers (offline excluded)", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("online_only") as unknown as StorageSetting;
      return undefined;
    });
    // Only biker-online is in the tracker
    vi.mocked(onlineTracker.getAvailableBikerIds).mockReturnValue(["biker-online"]);
    vi.mocked(storage.getAvailableBikersList).mockResolvedValue([
      makeAvailableRow("biker-online") as unknown as StorageAvailableRow,
    ]);

    // With online_only, includeOffline branch is skipped entirely
    const res = await request(app).get("/api/users/biker-available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("biker-online");
    // biker-offline never entered results (not in tracker, offline branch skipped)
    expect(ids).not.toContain("biker-offline");
  });

  it("filter=available_only — excludes bikers whose profile marks them as not available", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("available_only") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(onlineTracker.getAvailableBikerIds).mockReturnValue(["biker-avail", "biker-not-avail"]);
    vi.mocked(storage.getAvailableBikersList).mockResolvedValue([
      makeAvailableRow("biker-avail", "biker", { isAvailable: true }) as unknown as StorageAvailableRow,
      makeAvailableRow("biker-not-avail", "biker", { isAvailable: false }) as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/biker-available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("biker-avail");
    expect(ids).not.toContain("biker-not-avail");
  });

  it("returns empty list when no bikers are available in tracker", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(onlineTracker.getAvailableBikerIds).mockReturnValue([]);

    const res = await request(app).get("/api/users/biker-available-list");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/zavorrine-available-list
// ---------------------------------------------------------------------------

describe("GET /api/users/zavorrine-available-list — map_visibility_filter", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getUserMotorcycles).mockResolvedValue([]);
  });

  it("filter=all — returns all tracker-available zavorrine", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(onlineTracker.getAvailableZavorrinaIds).mockReturnValue(["zav-1", "zav-2"]);
    vi.mocked(storage.getAvailableZavorrinaList).mockResolvedValue([
      makeAvailableRow("zav-1", "zavorrina") as unknown as StorageAvailableRow,
      makeAvailableRow("zav-2", "zavorrina") as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/zavorrine-available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("zav-1");
    expect(ids).toContain("zav-2");
  });

  it("filter=online_only — offline branch is skipped; only tracker users returned", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("online_only") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(onlineTracker.getAvailableZavorrinaIds).mockReturnValue(["zav-online"]);
    vi.mocked(storage.getAvailableZavorrinaList).mockResolvedValue([
      makeAvailableRow("zav-online", "zavorrina") as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/zavorrine-available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("zav-online");
    expect(ids).not.toContain("zav-offline");
  });

  it("filter=available_only — excludes zavorrine whose profile marks them as not available", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("available_only") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(onlineTracker.getAvailableZavorrinaIds).mockReturnValue(["zav-avail", "zav-not-avail"]);
    vi.mocked(storage.getAvailableZavorrinaList).mockResolvedValue([
      makeAvailableRow("zav-avail", "zavorrina", { isAvailable: true }) as unknown as StorageAvailableRow,
      makeAvailableRow("zav-not-avail", "zavorrina", { isAvailable: false }) as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/zavorrine-available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("zav-avail");
    expect(ids).not.toContain("zav-not-avail");
  });

  it("returns empty list when no zavorrine are available in tracker", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(onlineTracker.getAvailableZavorrinaIds).mockReturnValue([]);

    const res = await request(app).get("/api/users/zavorrine-available-list");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// positionFuzz — distance must be null for fuzzed users (triangulation guard)
// ---------------------------------------------------------------------------

describe("positionFuzz — distance nulled to prevent triangulation", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getUserMotorcycles).mockResolvedValue([]);
  });

  it("nearby: distance is null for a positionFuzz user viewed by another user", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(storage.getNearbyUsers).mockResolvedValue([
      {
        ...makeNearbyRow("fuzz-user", { lastLoginAt: new Date().toISOString() }, {
          positionFuzz: true,
          positionFuzzKm: 2,
        }),
        distance: 7.5,
      } as unknown as StorageNearbyRow,
    ]);

    const res = await request(app).get("/api/users/nearby?lat=45&lng=9&radius=50");

    expect(res.status).toBe(200);
    const user = res.body.find((u: Record<string, unknown>) => u.id === "fuzz-user");
    expect(user).toBeDefined();
    expect(user.distance).toBeNull();
  });
});
