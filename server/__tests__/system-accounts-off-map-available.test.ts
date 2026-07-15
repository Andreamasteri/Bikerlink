/**
 * Regression guard: system accounts must never appear in available-list
 * discovery endpoints.
 *
 * This file covers the three "available" endpoints:
 *  GET /api/users/available-list
 *  GET /api/users/biker-available-list
 *  GET /api/users/zavorrine-available-list
 *
 * The discovery / nearby / online-list endpoints are in:
 *  system-accounts-off-map.test.ts
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
type StorageAvailableRow = Awaited<ReturnType<typeof storage.getAvailableUsersList>>[0];

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

// ===========================================================================
// Route-level: system accounts absent from available-list responses
// ===========================================================================

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
