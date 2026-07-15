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
    getAvailableUsersList: vi.fn().mockResolvedValue([]),
    getAvailableBikersList: vi.fn().mockResolvedValue([]),
    getAvailableZavorrinaList: vi.fn().mockResolvedValue([]),
    getUserMotorcycles: vi.fn().mockResolvedValue([]),
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
type StorageSetting = Awaited<ReturnType<typeof storage.getAppSetting>>;
type StorageNearbyRow = Awaited<ReturnType<typeof storage.getNearbyUsers>>[0];
type StorageAvailableRow = Awaited<ReturnType<typeof storage.getAvailableUsersList>>[0];

import { onlineTracker } from "../online-tracker";
import usersRouter from "../routes/users";

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
  return { id, nickname: `user_${id}`, avatarUrl: null, userType: "biker", role: "user", status: "active", ghostMode: false, lastLoginAt: null, ...overrides };
}

function makeNearbyRow(id: string, userOverrides: Record<string, unknown> = {}, profileOverrides: Record<string, unknown> = {}) {
  return {
    user: makeUser(id, userOverrides),
    profile: { latitude: 45.0, longitude: 9.0, hideFromMap: false, isAvailable: false, bio: null, ghostMode: false, ...profileOverrides },
    distance: 5,
  };
}

function makeAvailableRow(id: string, userType: "biker" | "zavorrina" = "biker", profileOverrides: Record<string, unknown> = {}) {
  return {
    user: makeUser(id, { userType }),
    profile: { latitude: 45.0, longitude: 9.0, hideFromMap: false, isAvailable: true, bio: null, lastOfflineLat: null, lastOfflineLng: null, offlinePositionRandomize: true, ...profileOverrides },
    distance: 3,
  };
}

// ---------------------------------------------------------------------------
// GET /api/users/nearby — Task #2697 radius world-mode + positionFuzz
// ---------------------------------------------------------------------------

describe("GET /api/users/nearby — radius world-mode & positionFuzz (Task #2697)", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    vi.mocked(storage.getBlockedUserIds).mockResolvedValue([]);
  });

  it("nearby: distance is present for a non-fuzzed user", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(storage.getNearbyUsers).mockResolvedValue([
      {
        ...makeNearbyRow("plain-user", { lastLoginAt: new Date().toISOString() }, { positionFuzz: false, positionFuzzKm: 0 }),
        distance: 7.5,
      } as unknown as StorageNearbyRow,
    ]);

    const res = await request(app).get("/api/users/nearby?lat=45&lng=9&radius=50");

    expect(res.status).toBe(200);
    const user = res.body.find((u: Record<string, unknown>) => u.id === "plain-user");
    expect(user).toBeDefined();
    expect(user.distance).toBe(7.5);
  });

  it("biker-available-list: distance is null for a positionFuzz biker viewed by another user", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(onlineTracker.getAvailableBikerIds).mockReturnValue(["fuzz-biker"]);
    vi.mocked(storage.getAvailableBikersList).mockResolvedValue([
      makeAvailableRow("fuzz-biker", "biker", { positionFuzz: true, positionFuzzKm: 3 }) as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/biker-available-list?lat=45&lng=9");

    expect(res.status).toBe(200);
    const user = res.body.find((u: Record<string, unknown>) => u.id === "fuzz-biker");
    expect(user).toBeDefined();
    expect(user.distance).toBeNull();
  });

  it("zavorrine-available-list: distance is null for a positionFuzz zavorrina viewed by another user", async () => {
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") return { key, value: "false" } as unknown as StorageSetting;
      if (key === "map_visibility_filter") return filterSetting("all") as unknown as StorageSetting;
      return undefined;
    });
    vi.mocked(onlineTracker.getAvailableZavorrinaIds).mockReturnValue(["fuzz-zav"]);
    vi.mocked(storage.getAvailableZavorrinaList).mockResolvedValue([
      makeAvailableRow("fuzz-zav", "zavorrina", { positionFuzz: true, positionFuzzKm: 1 }) as unknown as StorageAvailableRow,
    ]);

    const res = await request(app).get("/api/users/zavorrine-available-list?lat=45&lng=9");

    expect(res.status).toBe(200);
    const user = res.body.find((u: Record<string, unknown>) => u.id === "fuzz-zav");
    expect(user).toBeDefined();
    expect(user.distance).toBeNull();
  });
});
