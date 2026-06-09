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
type StorageUser = Awaited<ReturnType<typeof storage.getAllUsers>>[0];
type StorageSetting = Awaited<ReturnType<typeof storage.getAppSetting>>;
type StorageSearchRow = Awaited<ReturnType<typeof storage.searchUsers>>[0];
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
// GET /api/users — global user list (no lat/lng path to avoid dynamic DB import)
// ---------------------------------------------------------------------------

describe("GET /api/users — map_visibility_filter", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();

    // Default: getBlockedUserIds returns [], offline_position_randomize not needed here
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);

    // Two non-requester users in the DB
    vi.mocked(storage.getAllUsers).mockResolvedValue([
      makeUser("user-online") as unknown as StorageUser,
      makeUser("user-offline") as unknown as StorageUser,
    ]);
  });

  it("filter=all — returns both online and offline users", async () => {
    vi.mocked(storage.getAppSetting).mockResolvedValue(filterSetting("all") as unknown as StorageSetting);
    vi.mocked(onlineTracker.getOnlineUserIds).mockReturnValue(["user-online"]);

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("user-online");
    expect(ids).toContain("user-offline");
  });

  it("filter=online_only — excludes offline users", async () => {
    vi.mocked(storage.getAppSetting).mockResolvedValue(filterSetting("online_only") as unknown as StorageSetting);
    vi.mocked(onlineTracker.getOnlineUserIds).mockReturnValue(["user-online"]);

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("user-online");
    expect(ids).not.toContain("user-offline");
  });

  it("filter=available_only — excludes users not in available set", async () => {
    vi.mocked(storage.getAppSetting).mockResolvedValue(filterSetting("available_only") as unknown as StorageSetting);
    // user-online is online but NOT available; user-available is available
    vi.mocked(storage.getAllUsers).mockResolvedValue([
      makeUser("user-online") as unknown as StorageUser,
      makeUser("user-offline") as unknown as StorageUser,
      makeUser("user-available") as unknown as StorageUser,
    ]);
    vi.mocked(onlineTracker.getAvailableBikerIds).mockReturnValue(["user-available"]);
    vi.mocked(onlineTracker.getAvailableZavorrinaIds).mockReturnValue([]);

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("user-available");
    expect(ids).not.toContain("user-online");
    expect(ids).not.toContain("user-offline");
  });

  it("requester is always excluded from results regardless of filter", async () => {
    vi.mocked(storage.getAppSetting).mockResolvedValue(filterSetting("all") as unknown as StorageSetting);
    vi.mocked(storage.getAllUsers).mockResolvedValue([
      makeUser(REQUESTER_ID) as unknown as StorageUser,
      makeUser("user-online") as unknown as StorageUser,
    ]);
    vi.mocked(onlineTracker.getOnlineUserIds).mockReturnValue([REQUESTER_ID, "user-online"]);

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).not.toContain(REQUESTER_ID);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/search
// ---------------------------------------------------------------------------

describe("GET /api/users/search — map_visibility_filter", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.searchUsers).mockResolvedValue([
      makeSearchRow("user-online") as unknown as StorageSearchRow,
      makeSearchRow("user-offline") as unknown as StorageSearchRow,
    ]);
  });

  it("filter=all — returns all matching users", async () => {
    vi.mocked(storage.getAppSetting).mockResolvedValue(filterSetting("all") as unknown as StorageSetting);
    vi.mocked(onlineTracker.getOnlineUserIds).mockReturnValue(["user-online"]);
    vi.mocked(onlineTracker.isOnline).mockImplementation((id) => id === "user-online");

    const res = await request(app).get("/api/users/search?q=user");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("user-online");
    expect(ids).toContain("user-offline");
  });

  it("filter=online_only — excludes offline users", async () => {
    vi.mocked(storage.getAppSetting).mockResolvedValue(filterSetting("online_only") as unknown as StorageSetting);
    vi.mocked(onlineTracker.getOnlineUserIds).mockReturnValue(["user-online"]);
    vi.mocked(onlineTracker.isOnline).mockImplementation((id) => id === "user-online");

    const res = await request(app).get("/api/users/search?q=user");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("user-online");
    expect(ids).not.toContain("user-offline");
  });

  it("filter=available_only — excludes non-available users", async () => {
    vi.mocked(storage.searchUsers).mockResolvedValue([
      makeSearchRow("user-online") as unknown as StorageSearchRow,
      makeSearchRow("user-offline") as unknown as StorageSearchRow,
      makeSearchRow("user-available") as unknown as StorageSearchRow,
    ]);
    vi.mocked(storage.getAppSetting).mockResolvedValue(filterSetting("available_only") as unknown as StorageSetting);
    vi.mocked(onlineTracker.getAvailableBikerIds).mockReturnValue(["user-available"]);
    vi.mocked(onlineTracker.getAvailableZavorrinaIds).mockReturnValue([]);
    vi.mocked(onlineTracker.getOnlineUserIds).mockReturnValue(["user-online", "user-available"]);
    vi.mocked(onlineTracker.isOnline).mockImplementation(
      (id) => id === "user-online" || id === "user-available"
    );

    const res = await request(app).get("/api/users/search?q=user");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("user-available");
    expect(ids).not.toContain("user-online");
    expect(ids).not.toContain("user-offline");
  });

  it("short query (<2 chars) returns empty list without hitting DB", async () => {
    const res = await request(app).get("/api/users/search?q=a");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(storage.searchUsers).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/nearby
// ---------------------------------------------------------------------------

describe("GET /api/users/nearby — map_visibility_filter", () => {
  let app: express.Application;

  const recentLoginAt = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago → online
  const oldLoginAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();   // 1 hour ago → offline

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      return undefined;
    });
  });

  it("filter=all — returns both online and offline users with valid coords", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(storage.getNearbyUsers).mockResolvedValue([
      makeNearbyRow("user-online", { lastLoginAt: recentLoginAt }) as unknown as StorageNearbyRow,
      makeNearbyRow("user-offline", { lastLoginAt: oldLoginAt }) as unknown as StorageNearbyRow,
    ]);

    const res = await request(app).get("/api/users/nearby?lat=45&lng=9");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("user-online");
    expect(ids).toContain("user-offline");
  });

  it("filter=online_only — excludes offline users", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("online_only") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(storage.getNearbyUsers).mockResolvedValue([
      makeNearbyRow("user-online", { lastLoginAt: recentLoginAt }) as unknown as StorageNearbyRow,
      makeNearbyRow("user-offline", { lastLoginAt: oldLoginAt }) as unknown as StorageNearbyRow,
    ]);

    const res = await request(app).get("/api/users/nearby?lat=45&lng=9");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("user-online");
    expect(ids).not.toContain("user-offline");
  });

  it("filter=available_only — excludes online but non-available users", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("available_only") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(storage.getNearbyUsers).mockResolvedValue([
      // online but NOT available
      makeNearbyRow("user-online-not-available", { lastLoginAt: recentLoginAt }, { isAvailable: false }) as unknown as StorageNearbyRow,
      // online AND available
      makeNearbyRow("user-available", { lastLoginAt: recentLoginAt }, { isAvailable: true }) as unknown as StorageNearbyRow,
      // offline
      makeNearbyRow("user-offline", { lastLoginAt: oldLoginAt }, { isAvailable: false }) as unknown as StorageNearbyRow,
    ]);

    const res = await request(app).get("/api/users/nearby?lat=45&lng=9");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("user-available");
    expect(ids).not.toContain("user-online-not-available");
    expect(ids).not.toContain("user-offline");
  });

  it("users with hideFromMap=true are always excluded regardless of filter", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(storage.getNearbyUsers).mockResolvedValue([
      makeNearbyRow("hidden-user", { lastLoginAt: recentLoginAt }, { hideFromMap: true }) as unknown as StorageNearbyRow,
      makeNearbyRow("visible-user", { lastLoginAt: recentLoginAt }) as unknown as StorageNearbyRow,
    ]);

    const res = await request(app).get("/api/users/nearby?lat=45&lng=9");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).not.toContain("hidden-user");
    expect(ids).toContain("visible-user");
  });

  it("returns 400 when lat/lng are missing", async () => {
    const res = await request(app).get("/api/users/nearby");
    expect(res.status).toBe(400);
  });

  // Task #2697 — raggio mondiale: senza radius (o radius=world/0) il backend
  // non deve tagliare gli utenti fuori dai 50km storici.
  it("world radius — returns users >50km away when radius is omitted", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(storage.getNearbyUsers).mockImplementation(async (_lat, _lng, radiusKm) => {
      // Lo storage mock verifica che il router passi radius=0 (world) in assenza
      // di parametro: se passasse 50 questo test fallirebbe.
      expect(radiusKm).toBe(0);
      return [
        { ...makeNearbyRow("far-user", { lastLoginAt: recentLoginAt }), distance: 9500 } as unknown as StorageNearbyRow,
        { ...makeNearbyRow("near-user", { lastLoginAt: recentLoginAt }), distance: 12 } as unknown as StorageNearbyRow,
      ];
    });

    const res = await request(app).get("/api/users/nearby?lat=45&lng=9");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("far-user");
    expect(ids).toContain("near-user");
  });

  it("world radius — explicit radius=world is treated as world", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(storage.getNearbyUsers).mockImplementation(async (_lat, _lng, radiusKm) => {
      expect(radiusKm).toBe(0);
      return [{ ...makeNearbyRow("very-far", { lastLoginAt: recentLoginAt }), distance: 14000 } as unknown as StorageNearbyRow];
    });

    const res = await request(app).get("/api/users/nearby?lat=45&lng=9&radius=world");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("very-far");
  });

  it("explicit numeric radius is forwarded to storage", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(storage.getNearbyUsers).mockImplementation(async (_lat, _lng, radiusKm) => {
      expect(radiusKm).toBe(25);
      return [];
    });

    const res = await request(app).get("/api/users/nearby?lat=45&lng=9&radius=25");
    expect(res.status).toBe(200);
  });
});

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
