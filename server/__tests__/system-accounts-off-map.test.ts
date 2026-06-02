/**
 * Regression guard: system accounts must never appear on the map or in
 * discovery results, regardless of how they reach a route handler.
 *
 * OnlineTracker unit tests live in online-tracker-unit.test.ts (separate
 * file so that the online-tracker module is NOT mocked there).
 *
 * This file covers route-level tests for the five discovery endpoints.
 * Storage mocks return a system user alongside a normal user; only the
 * normal user must appear in the JSON response.
 *
 * Endpoints tested:
 *  GET /api/users/           (discovery — no lat/lng path)
 *  GET /api/users/nearby
 *  GET /api/users/online-list
 *  GET /api/users/available-list
 *  GET /api/users/biker-available-list
 *  GET /api/users/zavorrine-available-list
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// OnlineTracker unit tests are in online-tracker-unit.test.ts (separate file,
// not mocked) — this file covers route-level regression tests only.

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest — must be before any imports that resolve
// to the mocked modules)
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
    countOnlineUsers: vi.fn().mockReturnValue(0),
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
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { storage } from "../storage";
import { onlineTracker } from "../online-tracker";
import usersRouter from "../routes/users";

type StorageSetting = Awaited<ReturnType<typeof storage.getAppSetting>>;
type StorageUser = Awaited<ReturnType<typeof storage.getAllUsers>>[0];
type StorageNearbyRow = Awaited<ReturnType<typeof storage.getNearbyUsers>>[0];
type StorageAvailableRow = Awaited<ReturnType<typeof storage.getAvailableUsersList>>[0];
type StorageOnlineRow = Awaited<ReturnType<typeof storage.getOnlineUsersList>>[0];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const REQUESTER_ID = "requester-1";

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

function filterSetting(value: "all" | "online_only" | "available_only") {
  return { key: "map_visibility_filter", value };
}

function makeUser(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    nickname: `user_${id}`,
    avatarUrl: null,
    userType: "biker",
    role: "user",
    status: "active",
    ghostMode: false,
    isFake: false,
    isSystem: false,
    lastLoginAt: null,
    ...overrides,
  };
}

function makeSystemUser(id: string, variant: "isSystem" | "adminRole" | "protectedNickname" = "isSystem"): Record<string, unknown> {
  if (variant === "adminRole") return makeUser(id, { role: "admin", nickname: `admin_${id}` });
  if (variant === "protectedNickname") return makeUser(id, { nickname: "BikerLink_Official" });
  return makeUser(id, { isSystem: true, nickname: `system_${id}` });
}

function makeNearbyRow(id: string, userOverrides: Record<string, unknown> = {}) {
  return {
    user: makeUser(id, { lastLoginAt: new Date().toISOString(), ...userOverrides }),
    profile: {
      latitude: 45.0,
      longitude: 9.0,
      hideFromMap: false,
      isAvailable: false,
      bio: null,
      ghostMode: false,
      positionFuzz: false,
      positionFuzzKm: 0,
      offlinePositionRandomize: false,
      lastOfflineLat: null,
      lastOfflineLng: null,
    },
    distance: 5,
  };
}

function makeAvailableRow(id: string, userType: "biker" | "zavorrina" = "biker", userOverrides: Record<string, unknown> = {}) {
  return {
    user: makeUser(id, { userType, ...userOverrides }),
    profile: {
      latitude: 45.0,
      longitude: 9.0,
      hideFromMap: false,
      isAvailable: true,
      bio: null,
      positionFuzz: false,
      positionFuzzKm: 0,
      lastOfflineLat: null,
      lastOfflineLng: null,
      offlinePositionRandomize: false,
    },
    distance: 3,
  };
}

function makeOnlineRow(id: string, userOverrides: Record<string, unknown> = {}) {
  return {
    user: makeUser(id, { lastLoginAt: new Date().toISOString(), ...userOverrides }),
    profile: {
      latitude: 45.0,
      longitude: 9.0,
      hideFromMap: false,
      isAvailable: false,
      bio: null,
      positionFuzz: false,
      positionFuzzKm: 0,
      lastOfflineLat: null,
      lastOfflineLng: null,
      offlinePositionRandomize: false,
    },
    distance: 4,
  };
}

// ===========================================================================
// Route-level: system accounts absent from discovery responses
// ===========================================================================

describe("GET /api/users — system account absent from discovery response", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getAppSetting).mockResolvedValue(filterSetting("all") as unknown as StorageSetting);
  });

  it("isSystem=true user is absent; normal user is present", async () => {
    vi.mocked(storage.getAllUsers).mockResolvedValue([
      makeSystemUser("sys-1", "isSystem") as unknown as StorageUser,
      makeUser("normal-1") as unknown as StorageUser,
    ]);
    vi.mocked(onlineTracker.getOnlineUserIds).mockReturnValue(["normal-1", "sys-1"]);

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("sys-1");
  });

  it("role=admin user is absent; normal user is present", async () => {
    vi.mocked(storage.getAllUsers).mockResolvedValue([
      makeSystemUser("admin-1", "adminRole") as unknown as StorageUser,
      makeUser("normal-1") as unknown as StorageUser,
    ]);

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("admin-1");
  });

  it("protected-nickname user is absent; normal user is present", async () => {
    vi.mocked(storage.getAllUsers).mockResolvedValue([
      makeSystemUser("official-1", "protectedNickname") as unknown as StorageUser,
      makeUser("normal-1") as unknown as StorageUser,
    ]);

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("official-1");
  });

  it("all three system-account variants absent in a mixed list", async () => {
    vi.mocked(storage.getAllUsers).mockResolvedValue([
      makeSystemUser("sys-flag", "isSystem") as unknown as StorageUser,
      makeSystemUser("admin-role", "adminRole") as unknown as StorageUser,
      makeSystemUser("official-nick", "protectedNickname") as unknown as StorageUser,
      makeUser("normal-1") as unknown as StorageUser,
      makeUser("normal-2") as unknown as StorageUser,
    ]);

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).toContain("normal-2");
    expect(ids).not.toContain("sys-flag");
    expect(ids).not.toContain("admin-role");
    expect(ids).not.toContain("official-nick");
  });
});

// ---------------------------------------------------------------------------

describe("GET /api/users/nearby — system account absent from nearby response", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
  });

  it("isSystem=true nearby row is filtered out; normal row is present", async () => {
    vi.mocked(storage.getNearbyUsers).mockResolvedValue([
      makeNearbyRow("sys-1", { isSystem: true, nickname: "system_user" }) as unknown as StorageNearbyRow,
      makeNearbyRow("normal-1") as unknown as StorageNearbyRow,
    ]);

    const res = await request(app).get("/api/users/nearby?lat=45&lng=9");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("sys-1");
  });

  it("admin-role nearby row is filtered out", async () => {
    vi.mocked(storage.getNearbyUsers).mockResolvedValue([
      makeNearbyRow("admin-1", { role: "admin", nickname: "admin_user" }) as unknown as StorageNearbyRow,
      makeNearbyRow("normal-1") as unknown as StorageNearbyRow,
    ]);

    const res = await request(app).get("/api/users/nearby?lat=45&lng=9");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("admin-1");
  });

  it("protected-nickname nearby row is filtered out", async () => {
    vi.mocked(storage.getNearbyUsers).mockResolvedValue([
      makeNearbyRow("official-1", { nickname: "BikerLink_Official" }) as unknown as StorageNearbyRow,
      makeNearbyRow("normal-1") as unknown as StorageNearbyRow,
    ]);

    const res = await request(app).get("/api/users/nearby?lat=45&lng=9");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("official-1");
  });

  it("all three system-account variants are absent from nearby results", async () => {
    vi.mocked(storage.getNearbyUsers).mockResolvedValue([
      makeNearbyRow("sys-flag", { isSystem: true }) as unknown as StorageNearbyRow,
      makeNearbyRow("admin-role", { role: "admin" }) as unknown as StorageNearbyRow,
      makeNearbyRow("official-nick", { nickname: "BikerLink_Official" }) as unknown as StorageNearbyRow,
      makeNearbyRow("normal-1") as unknown as StorageNearbyRow,
    ]);

    const res = await request(app).get("/api/users/nearby?lat=45&lng=9");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("sys-flag");
    expect(ids).not.toContain("admin-role");
    expect(ids).not.toContain("official-nick");
  });
});

// ---------------------------------------------------------------------------

describe("GET /api/users/online-list — system account absent from online-list response", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getUserMotorcyclesBatch).mockResolvedValue([]);
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "show_distance_in_nearby_counter") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
  });

  it("isSystem=true user in getOnlineUsersList result is absent from response", async () => {
    vi.mocked(onlineTracker.getOnlineUserIds).mockReturnValue(["normal-1", "sys-1"]);
    vi.mocked(storage.getOnlineUsersList).mockResolvedValue([
      makeOnlineRow("sys-1", { isSystem: true }) as unknown as StorageOnlineRow,
      makeOnlineRow("normal-1") as unknown as StorageOnlineRow,
    ]);

    const res = await request(app).get("/api/users/online-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("sys-1");
  });

  it("admin-role user in getOnlineUsersList result is absent from response", async () => {
    vi.mocked(onlineTracker.getOnlineUserIds).mockReturnValue(["normal-1", "admin-1"]);
    vi.mocked(storage.getOnlineUsersList).mockResolvedValue([
      makeOnlineRow("admin-1", { role: "admin" }) as unknown as StorageOnlineRow,
      makeOnlineRow("normal-1") as unknown as StorageOnlineRow,
    ]);

    const res = await request(app).get("/api/users/online-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("admin-1");
  });

  it("all three system-account variants absent from online-list", async () => {
    vi.mocked(onlineTracker.getOnlineUserIds).mockReturnValue(["normal-1", "sys-flag", "admin-role", "official-nick"]);
    vi.mocked(storage.getOnlineUsersList).mockResolvedValue([
      makeOnlineRow("sys-flag", { isSystem: true }) as unknown as StorageOnlineRow,
      makeOnlineRow("admin-role", { role: "admin" }) as unknown as StorageOnlineRow,
      makeOnlineRow("official-nick", { nickname: "BikerLink_Official" }) as unknown as StorageOnlineRow,
      makeOnlineRow("normal-1") as unknown as StorageOnlineRow,
    ]);

    const res = await request(app).get("/api/users/online-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("sys-flag");
    expect(ids).not.toContain("admin-role");
    expect(ids).not.toContain("official-nick");
  });
});

// ---------------------------------------------------------------------------

describe("GET /api/users/available-list — system account absent from available-list response", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getUserMotorcyclesBatch).mockResolvedValue([]);
    vi.mocked(storage.getAppSetting).mockResolvedValue(filterSetting("all") as unknown as StorageSetting);
  });

  it("isSystem=true user from getAvailableUsersList is absent from response", async () => {
    vi.mocked(storage.getAvailableUsersList).mockResolvedValue([
      makeAvailableRow("sys-1", "biker", { isSystem: true }) as unknown as StorageAvailableRow,
      makeAvailableRow("normal-1", "biker") as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("sys-1");
  });

  it("admin-role user from getAvailableUsersList is absent from response", async () => {
    vi.mocked(storage.getAvailableUsersList).mockResolvedValue([
      makeAvailableRow("admin-1", "biker", { role: "admin" }) as unknown as StorageAvailableRow,
      makeAvailableRow("normal-1", "biker") as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("admin-1");
  });

  it("all three system-account variants absent from available-list", async () => {
    vi.mocked(storage.getAvailableUsersList).mockResolvedValue([
      makeAvailableRow("sys-flag", "biker", { isSystem: true }) as unknown as StorageAvailableRow,
      makeAvailableRow("admin-role", "biker", { role: "admin" }) as unknown as StorageAvailableRow,
      makeAvailableRow("official-nick", "zavorrina", { nickname: "BikerLink_Official" }) as unknown as StorageAvailableRow,
      makeAvailableRow("normal-1", "biker") as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("sys-flag");
    expect(ids).not.toContain("admin-role");
    expect(ids).not.toContain("official-nick");
  });
});

// ---------------------------------------------------------------------------

describe("GET /api/users/biker-available-list — system account absent", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getUserMotorcycles).mockResolvedValue([]);
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
  });

  it("isSystem=true biker from getAvailableBikersList is absent from response", async () => {
    vi.mocked(onlineTracker.getAvailableBikerIds).mockReturnValue(["normal-biker", "sys-biker"]);
    vi.mocked(storage.getAvailableBikersList).mockResolvedValue([
      makeAvailableRow("sys-biker", "biker", { isSystem: true }) as unknown as StorageAvailableRow,
      makeAvailableRow("normal-biker", "biker") as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/biker-available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-biker");
    expect(ids).not.toContain("sys-biker");
  });

  it("admin-role biker from getAvailableBikersList is absent from response", async () => {
    vi.mocked(onlineTracker.getAvailableBikerIds).mockReturnValue(["normal-biker", "admin-biker"]);
    vi.mocked(storage.getAvailableBikersList).mockResolvedValue([
      makeAvailableRow("admin-biker", "biker", { role: "admin" }) as unknown as StorageAvailableRow,
      makeAvailableRow("normal-biker", "biker") as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/biker-available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-biker");
    expect(ids).not.toContain("admin-biker");
  });

  it("all three system-account variants absent from biker-available-list", async () => {
    vi.mocked(onlineTracker.getAvailableBikerIds).mockReturnValue(["normal-biker", "sys-flag", "admin-role", "official-nick"]);
    vi.mocked(storage.getAvailableBikersList).mockResolvedValue([
      makeAvailableRow("sys-flag", "biker", { isSystem: true }) as unknown as StorageAvailableRow,
      makeAvailableRow("admin-role", "biker", { role: "admin" }) as unknown as StorageAvailableRow,
      makeAvailableRow("official-nick", "biker", { nickname: "BikerLink_Official" }) as unknown as StorageAvailableRow,
      makeAvailableRow("normal-biker", "biker") as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/biker-available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-biker");
    expect(ids).not.toContain("sys-flag");
    expect(ids).not.toContain("admin-role");
    expect(ids).not.toContain("official-nick");
  });
});

// ---------------------------------------------------------------------------

describe("GET /api/users/zavorrine-available-list — system account absent", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
    vi.mocked(storage.getUserMotorcycles).mockResolvedValue([]);
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
  });

  it("isSystem=true zavorrina from getAvailableZavorrinaList is absent from response", async () => {
    vi.mocked(onlineTracker.getAvailableZavorrinaIds).mockReturnValue(["normal-zav", "sys-zav"]);
    vi.mocked(storage.getAvailableZavorrinaList).mockResolvedValue([
      makeAvailableRow("sys-zav", "zavorrina", { isSystem: true }) as unknown as StorageAvailableRow,
      makeAvailableRow("normal-zav", "zavorrina") as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/zavorrine-available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-zav");
    expect(ids).not.toContain("sys-zav");
  });

  it("admin-role zavorrina from getAvailableZavorrinaList is absent from response", async () => {
    vi.mocked(onlineTracker.getAvailableZavorrinaIds).mockReturnValue(["normal-zav", "admin-zav"]);
    vi.mocked(storage.getAvailableZavorrinaList).mockResolvedValue([
      makeAvailableRow("admin-zav", "zavorrina", { role: "admin" }) as unknown as StorageAvailableRow,
      makeAvailableRow("normal-zav", "zavorrina") as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/zavorrine-available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-zav");
    expect(ids).not.toContain("admin-zav");
  });

  it("all three system-account variants absent from zavorrine-available-list", async () => {
    vi.mocked(onlineTracker.getAvailableZavorrinaIds).mockReturnValue(["normal-zav", "sys-flag", "admin-role", "official-nick"]);
    vi.mocked(storage.getAvailableZavorrinaList).mockResolvedValue([
      makeAvailableRow("sys-flag", "zavorrina", { isSystem: true }) as unknown as StorageAvailableRow,
      makeAvailableRow("admin-role", "zavorrina", { role: "admin" }) as unknown as StorageAvailableRow,
      makeAvailableRow("official-nick", "zavorrina", { nickname: "BikerLink_Official" }) as unknown as StorageAvailableRow,
      makeAvailableRow("normal-zav", "zavorrina") as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/zavorrine-available-list");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-zav");
    expect(ids).not.toContain("sys-flag");
    expect(ids).not.toContain("admin-role");
    expect(ids).not.toContain("official-nick");
  });
});
