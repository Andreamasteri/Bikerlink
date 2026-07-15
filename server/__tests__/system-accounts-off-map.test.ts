/**
 * Regression guard: system accounts must never appear on the map or in
 * discovery results, regardless of how they reach a route handler.
 *
 * OnlineTracker unit tests live in online-tracker-unit.test.ts (separate
 * file so that the online-tracker module is NOT mocked there).
 *
 * This file covers route-level tests for three discovery endpoints:
 *  GET /api/users/           (discovery — no lat/lng path)
 *  GET /api/users/nearby
 *  GET /api/users/online-list
 *
 * The remaining three available-list endpoints are in:
 *  system-accounts-off-map-available.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

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

// Uses the shared db-mock helper so future DB-shape changes need one edit in the
// helper, not here. Async factory + dynamic import is the hoisting-safe usage.
vi.mock("../db", async () => {
  const { createDbMock } = await import("./helpers/db-mock");
  return createDbMock();
});

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

import { storage } from "../storage";
import { onlineTracker } from "../online-tracker";
import usersRouter from "../routes/users";

type StorageSetting = Awaited<ReturnType<typeof storage.getAppSetting>>;
type StorageUser = Awaited<ReturnType<typeof storage.getAllUsers>>[0];
type StorageNearbyRow = Awaited<ReturnType<typeof storage.getNearbyUsers>>[0];
type StorageOnlineRow = Awaited<ReturnType<typeof storage.getOnlineUsersList>>[0];

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

  it("isSystem=true user is absent from discovery response", async () => {
    vi.mocked(storage.getAllUsers).mockResolvedValue([
      makeUser("sys-1", { isSystem: true, nickname: "system_user" }) as unknown as StorageUser,
      makeUser("normal-1") as unknown as StorageUser,
    ]);

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("sys-1");
  });

  it("admin-role user is absent from discovery response", async () => {
    vi.mocked(storage.getAllUsers).mockResolvedValue([
      makeUser("admin-1", { role: "admin", nickname: "admin_user" }) as unknown as StorageUser,
      makeUser("normal-1") as unknown as StorageUser,
    ]);

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("admin-1");
  });

  it("protected-nickname user is absent from discovery response", async () => {
    vi.mocked(storage.getAllUsers).mockResolvedValue([
      makeUser("official-1", { nickname: "BikerLink_Official" }) as unknown as StorageUser,
      makeUser("normal-1") as unknown as StorageUser,
    ]);

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
    expect(ids).not.toContain("official-1");
  });

  it("all three system-account variants absent from discovery", async () => {
    vi.mocked(storage.getAllUsers).mockResolvedValue([
      makeUser("sys-flag", { isSystem: true }) as unknown as StorageUser,
      makeUser("admin-role", { role: "admin" }) as unknown as StorageUser,
      makeUser("official-nick", { nickname: "BikerLink_Official" }) as unknown as StorageUser,
      makeUser("normal-1") as unknown as StorageUser,
    ]);

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    const ids = res.body.map((u: Record<string, unknown>) => u.id);
    expect(ids).toContain("normal-1");
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
