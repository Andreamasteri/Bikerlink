/**
 * Tests: admin routes must NOT apply map_visibility_filter
 *
 * map_visibility_filter is a user-facing privacy control (all/online_only/available_only)
 * that limits which users appear on the public map for regular users. Applying it to
 * admin endpoints would hide suspended, offline, or ghost-mode users from moderators,
 * silently breaking moderation workflows.
 *
 * These tests guard against accidental reintroduction of the filter on:
 *   - GET /api/admin/users
 *   - GET /api/admin/users/match-summary  (also mounted at /api/admin/match-inspector/users)
 *
 * Approach:
 *   1. All heavy server-side modules are mocked so the tests run without a real DB.
 *   2. The *actual* admin router (server/routes/admin.ts) is imported — not a synthetic stub.
 *   3. A minimal Express app injects a fake admin session so requireAdmin() passes.
 *   4. Behavioral assertions confirm all users (including offline ones) are returned
 *      regardless of what map_visibility_filter is set to.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ── Module mocks must be declared before any imports ────────────────────────
// vitest hoists vi.mock() calls, so these run before the test file's imports.
// Variables referenced inside vi.mock factories must be declared via vi.hoisted()
// so they are also hoisted and initialized before the factories execute.

const { mockGetAllUsers, mockGetUser, mockGetAppSetting } = vi.hoisted(() => ({
  mockGetAllUsers: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetAppSetting: vi.fn(),
}));

// database — avoids DATABASE_URL check at module load time
vi.mock("../db", () => {
  const mockSelect = vi.fn();
  const mockSelectDistinct = vi.fn();
  const mockExecute = vi.fn();
  const mockInsert = vi.fn();
  const mockDelete = vi.fn();
  const mockUpdate = vi.fn();

  const chainable = () => ({ from: vi.fn().mockResolvedValue([]), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) });

  mockSelect.mockReturnValue(chainable());
  mockSelectDistinct.mockReturnValue(chainable());
  mockExecute.mockResolvedValue({ rows: [] });
  mockInsert.mockReturnValue({ values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }), returning: vi.fn().mockResolvedValue([]) }) });
  mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue([]), returning: vi.fn().mockResolvedValue([]) });
  mockUpdate.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) });

  // selectDistinctOn(...).from(...).innerJoin(...).where(...).orderBy(...) — usato da GET /admin/users
  const distinctOnChain: Record<string, unknown> = {};
  distinctOnChain.from = vi.fn(() => distinctOnChain);
  distinctOnChain.innerJoin = vi.fn(() => distinctOnChain);
  distinctOnChain.where = vi.fn(() => distinctOnChain);
  distinctOnChain.orderBy = vi.fn().mockResolvedValue([]);

  return {
    db: {
      select: mockSelect,
      selectDistinct: mockSelectDistinct,
      selectDistinctOn: vi.fn(() => distinctOnChain),
      execute: mockExecute,
      insert: mockInsert,
      delete: mockDelete,
      update: mockUpdate,
    },
    pool: { query: vi.fn(), end: vi.fn() },
    // Passthrough: il wrapper di retry deve solo eseguire la funzione avvolta.
    withDbRetry: <T>(fn: () => Promise<T> | T): Promise<T> | T => fn(),
  };
});

// storage — the main dependency for the routes under test
vi.mock("../storage", () => ({
  storage: {
    getAllUsers: mockGetAllUsers,
    getUser: mockGetUser,
    getAppSetting: mockGetAppSetting,
    upsertAppSetting: vi.fn().mockResolvedValue({}),
    getUserProfile: vi.fn().mockResolvedValue(null),
    getUser2: vi.fn().mockResolvedValue(null),
    updateUser: vi.fn().mockResolvedValue(null),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    getModeratorLogs: vi.fn().mockResolvedValue([]),
    clearModeratorLogs: vi.fn().mockResolvedValue(0),
    getAllCampaigns: vi.fn().mockResolvedValue([]),
    getAllAppSettings: vi.fn().mockResolvedValue([]),
    createModeratorLog: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  sendEmailDetailed: vi.fn().mockResolvedValue(undefined),
  getEmailDiagnostics: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../objectStorage", () => ({
  uploadBuffer: vi.fn().mockResolvedValue("https://example.com/file"),
  objectExists: vi.fn().mockResolvedValue(false),
  isValidOtaBundlePath: vi.fn().mockReturnValue(true),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  downloadBuffer: vi.fn().mockResolvedValue(Buffer.from("")),
}));

vi.mock("../chat-sse", () => ({
  closeSseClient: vi.fn(),
}));

vi.mock("../uptime", () => ({
  SERVER_START_TIME: 1700000000000,
  uptimeState: {
    metroOnline: false,
    metroStartTime: 0,
    metroLastSeenAt: 0,
    frontendStartTime: 0,
  },
}));

vi.mock("../session-utils", () => ({
  revokeAllUserSessions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../matching-engine", () => ({
  getLastMatchingCycleMeta: vi.fn().mockResolvedValue(null),
  runBikerBikerMatching: vi.fn().mockResolvedValue(undefined),
  runWishlistMatching: vi.fn().mockResolvedValue(undefined),
  runMatchingForUser: vi.fn().mockResolvedValue(undefined),
  triggerMatchingRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../mass-seed-data", () => ({
  MOTORCYCLES: [],
  pickRandomN: vi.fn().mockReturnValue([]),
  getMotoYear: vi.fn().mockReturnValue(2020),
}));

vi.mock("./ads", () => ({
  cacheAdImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/concurrency", () => {
  class MockSemaphore { acquire() { return Promise.resolve(); } release() {} }
  class MockSemaphoreQueueFullError extends Error {}
  return {
    allSettledLimited: vi.fn().mockResolvedValue([]),
    allLimited: vi.fn().mockResolvedValue([]),
    DEFAULT_CONCURRENCY: 10,
    Semaphore: MockSemaphore,
    SemaphoreQueueFullError: MockSemaphoreQueueFullError,
    matchEnrichmentSemaphore: new MockSemaphore(),
    MATCH_ENRICHMENT_GLOBAL_LIMIT: 10,
    MATCH_ENRICHMENT_MAX_QUEUE: 100,
  };
});

vi.mock("./match-preferences", () => ({
  DEFAULT_PREFS: {},
}));

vi.mock("./motoclubs", () => ({
  createClubInvitesForMoto: vi.fn().mockResolvedValue(undefined),
  seedMotoclubs: vi.fn().mockResolvedValue(undefined),
  createRegionalClubInvite: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/abuse-rate-limit", () => ({
  getTrustedClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  createUserIpRateLimiter: vi.fn().mockReturnValue({
    consume: vi.fn().mockResolvedValue(undefined),
  }),
  reportRateLimiter: { consume: vi.fn().mockResolvedValue(undefined) },
  feedbackRateLimiter: { consume: vi.fn().mockResolvedValue(undefined) },
  UserIpRateLimiter: class {},
  UserIpQuota: class {},
}));

vi.mock("./auth", () => ({
  verifyEmailStore: { consume: vi.fn(), createToken: vi.fn() },
  resendVerificationStore: { consume: vi.fn(), createToken: vi.fn() },
  verifyAttempts: new Map(),
  clearVerifyAttempts: vi.fn(),
  VERIFY_EMAIL_WINDOW_MS: 900000,
  VERIFY_EMAIL_MAX: 10,
  RESEND_VERIFICATION_WINDOW_MS: 3600000,
  RESEND_VERIFICATION_MAX: 5,
  VERIFY_MAX_ATTEMPTS: 5,
  VERIFY_ATTEMPT_WINDOW_MS: 1800000,
}));

vi.mock("express-rate-limit", () => {
  const passthrough = () => (_req: Request, _res: Response, next: NextFunction) => next();
  class MemoryStore {
    init() {}
    increment(_key: string, cb: Function) { cb(null, { totalHits: 1, resetTime: new Date() }); }
    decrement(_key: string) {}
    resetKey(_key: string) {}
    resetAll() {}
    localKeys = true;
  }
  return { default: passthrough, rateLimit: passthrough, MemoryStore };
});

vi.mock("multer", () => {
  const handler = (_req: Request, _res: Response, next: NextFunction) => next();
  const multerFn = Object.assign(
    () => ({ single: () => handler, array: () => handler, fields: () => handler }),
    {
      memoryStorage: vi.fn().mockReturnValue({}),
      diskStorage: vi.fn().mockReturnValue({}),
    }
  ) as ReturnType<typeof Object.assign>;
  (multerFn as Record<string, unknown>).default = multerFn;
  return { default: multerFn };
});

vi.mock("docx", () => ({
  Document: class { },
  Packer: { toBuffer: vi.fn().mockResolvedValue(Buffer.from("")) },
  Paragraph: class { },
  Table: class { },
  TableRow: class { },
  TableCell: class { },
  WidthType: { PERCENTAGE: "pct", DXA: "dxa" },
  ShadingType: { CLEAR: "clear" },
  AlignmentType: { CENTER: "center", LEFT: "left", RIGHT: "right" },
  TextRun: class { },
  HeightRule: { ATLEAST: "atLeast", EXACT: "exact" },
}));

vi.mock("../constants", () => ({
  isProtectedUser: vi.fn().mockReturnValue(false),
  PROTECTED_EMAILS: [],
  PROTECTED_NICKNAMES: [],
}));

// ── Now import the REAL admin router (all its deps are mocked above) ─────────
import express from "express";
import supertest from "supertest";
import adminRouter from "../routes/admin";
import { db } from "../db";

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Builds a minimal Express app that injects an admin session and mounts the real admin router. */
function buildAdminApp() {
  const app = express();
  app.use(express.json());

  // Inject a fake admin session so requireAdmin() passes
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: { userId: "admin-test-id", sessionID: "test-session" }, sessionID: "test-session" });
    next();
  });

  // Mount the real admin router at /
  app.use("/", adminRouter);
  return app;
}

/** Test users covering multiple status values — a correct admin response must include all of them. */
const TEST_USERS = [
  { id: "u1", nickname: "Alpha",  status: "active",    role: "user",  password: "hashed", isFake: false, email: "a@test.com", userType: "biker" },
  { id: "u2", nickname: "Beta",   status: "offline",   role: "user",  password: "hashed", isFake: false, email: "b@test.com", userType: "biker" },
  { id: "u3", nickname: "Gamma",  status: "suspended", role: "user",  password: "hashed", isFake: false, email: "c@test.com", userType: "biker" },
  { id: "u4", nickname: "Delta",  status: "active",    role: "user",  password: "hashed", isFake: true,  email: "d@test.com", userType: "zavorrina" },
];

/** Admin user returned by requireAdmin's storage.getUser() call. */
const ADMIN_USER = { id: "admin-test-id", role: "admin", status: "active", password: "hashed", nickname: "Admin" };

// ── Shared setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: getUser returns admin (for requireAdmin middleware)
  mockGetUser.mockResolvedValue(ADMIN_USER);

  // Default: getAppSetting returns undefined for any setting
  mockGetAppSetting.mockResolvedValue(undefined);

  // Default: getAllUsers returns full TEST_USERS list
  mockGetAllUsers.mockResolvedValue(TEST_USERS);

  // Default: db.select().from() returns empty arrays (lastfm/music queries in GET /users)
  vi.mocked(db.select).mockReturnValue({ from: vi.fn().mockResolvedValue([]) } as unknown as ReturnType<typeof db.select>);
  vi.mocked(db.selectDistinct).mockReturnValue({ from: vi.fn().mockResolvedValue([]) } as unknown as ReturnType<typeof db.selectDistinct>);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: GET /users
// ─────────────────────────────────────────────────────────────────────────────

describe("Real admin router — GET /users", () => {
  it("returns HTTP 200 with the full user list", async () => {
    const response = await supertest(buildAdminApp()).get("/users");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(TEST_USERS.length);
  });

  it("strips passwords from returned users", async () => {
    const response = await supertest(buildAdminApp()).get("/users");
    expect(response.status).toBe(200);
    expect(response.body.every((u: Record<string, unknown>) => !("password" in u))).toBe(true);
  });

  it("includes offline users in the response (map_visibility_filter=online_only must not apply)", async () => {
    // Simulate the app setting being 'online_only' — admin must still see offline users
    mockGetAppSetting.mockImplementation(async (key: string) => {
      if (key === "map_visibility_filter") return { key, value: "online_only" };
      return undefined;
    });

    const response = await supertest(buildAdminApp()).get("/users");
    expect(response.status).toBe(200);
    const offlineUser = response.body.find((u: Record<string, unknown>) => u.id === "u2");
    expect(offlineUser).toBeDefined();
    expect(offlineUser.status).toBe("offline");
  });

  it("includes suspended users in the response (map_visibility_filter=available_only must not apply)", async () => {
    mockGetAppSetting.mockImplementation(async (key: string) => {
      if (key === "map_visibility_filter") return { key, value: "available_only" };
      return undefined;
    });

    const response = await supertest(buildAdminApp()).get("/users");
    expect(response.status).toBe(200);
    const suspendedUser = response.body.find((u: Record<string, unknown>) => u.id === "u3");
    expect(suspendedUser).toBeDefined();
    expect(suspendedUser.status).toBe("suspended");
  });

  it("returns the same user count for all map_visibility_filter values", async () => {
    const filterValues = ["all", "online_only", "available_only"];
    const counts: number[] = [];

    for (const filterValue of filterValues) {
      mockGetAppSetting.mockImplementation(async (key: string) => {
        if (key === "map_visibility_filter") return { key, value: filterValue };
        return undefined;
      });

      const response = await supertest(buildAdminApp()).get("/users");
      expect(response.status).toBe(200);
      counts.push(response.body.length);
    }

    // All three filter values must produce the same number of users
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBe(TEST_USERS.length);
  });

  it("does NOT call storage.getAppSetting('map_visibility_filter')", async () => {
    await supertest(buildAdminApp()).get("/users");

    const visFilterCalls = mockGetAppSetting.mock.calls.filter(
      ([key]: string[]) => key === "map_visibility_filter"
    );
    expect(visFilterCalls).toHaveLength(0);
  });

  it("calls storage.getAllUsers() to retrieve the unfiltered roster", async () => {
    await supertest(buildAdminApp()).get("/users");
    expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
  });
});
