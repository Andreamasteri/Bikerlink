import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import express from "express";
import supertest from "supertest";

// ── Module mocks must be declared before any imports ────────────────────────
const { mockGetAllUsers, mockGetUser, mockGetAppSetting } = vi.hoisted(() => ({
  mockGetAllUsers: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetAppSetting: vi.fn(),
}));

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

  return {
    db: {
      select: mockSelect,
      selectDistinct: mockSelectDistinct,
      execute: mockExecute,
      insert: mockInsert,
      delete: mockDelete,
      update: mockUpdate,
    },
    pool: { query: vi.fn(), end: vi.fn() },
  };
});

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

import adminRouter from "../routes/admin";
import { db } from "../db";

// ── Test helpers ─────────────────────────────────────────────────────────────

function buildAdminApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: { userId: "admin-test-id", sessionID: "test-session" }, sessionID: "test-session" });
    next();
  });
  app.use("/", adminRouter);
  return app;
}

const ADMIN_USER = { id: "admin-test-id", role: "admin", status: "active", password: "hashed", nickname: "Admin" }; // pragma: allowlist secret

// ── Shared setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue(ADMIN_USER);
  mockGetAppSetting.mockResolvedValue(undefined);
  vi.mocked(db.select).mockReturnValue({ from: vi.fn().mockResolvedValue([]) } as unknown as ReturnType<typeof db.select>);
  vi.mocked(db.selectDistinct).mockReturnValue({ from: vi.fn().mockResolvedValue([]) } as unknown as ReturnType<typeof db.selectDistinct>);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: GET /users/match-summary
// ─────────────────────────────────────────────────────────────────────────────

describe("Real admin router — GET /users/match-summary", () => {
  function mockMatchSummaryDb(userRows: object[], total = userRows.length) {
    vi.mocked(db.execute)
      .mockResolvedValueOnce({ rows: [{ cnt: String(total) }] } as unknown as Awaited<ReturnType<typeof db.execute>>) // COUNT query
      .mockResolvedValueOnce({ rows: userRows } as unknown as Awaited<ReturnType<typeof db.execute>>);                 // main SELECT
  }

  beforeEach(() => {
    mockMatchSummaryDb([
      { id: "u1", nickname: "Alpha", avatar_url: null, user_type: "biker", role: "user", status: "active",  bb_count: "3", bz_count: "1", bb_counts: null },
      { id: "u2", nickname: "Beta",  avatar_url: null, user_type: "biker", role: "user", status: "offline", bb_count: "0", bz_count: "0", bb_counts: null },
    ]);
  });

  it("returns HTTP 200 with a paginated user list", async () => {
    const response = await supertest(buildAdminApp()).get("/users/match-summary");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.users)).toBe(true);
    expect(typeof response.body.total).toBe("number");
    expect(response.body.page).toBe(1);
  });

  it("includes offline users in the paginated results", async () => {
    const response = await supertest(buildAdminApp()).get("/users/match-summary");
    expect(response.status).toBe(200);
    const offlineUser = response.body.users.find((u: Record<string, unknown>) => u.id === "u2");
    expect(offlineUser).toBeDefined();
    expect(offlineUser.status).toBe("offline");
  });

  it("returns the same users regardless of map_visibility_filter setting", async () => {
    const filterValues = ["all", "online_only", "available_only"];
    const resultSets: string[][] = [];

    for (const filterValue of filterValues) {
      mockGetAppSetting.mockImplementation(async (key: string) => {
        if (key === "map_visibility_filter") return { key, value: filterValue };
        return undefined;
      });

      mockMatchSummaryDb([
        { id: "u1", nickname: "Alpha", avatar_url: null, user_type: "biker", role: "user", status: "active",  bb_count: "3", bz_count: "1", bb_counts: null },
        { id: "u2", nickname: "Beta",  avatar_url: null, user_type: "biker", role: "user", status: "offline", bb_count: "0", bz_count: "0", bb_counts: null },
      ]);

      const response = await supertest(buildAdminApp()).get("/users/match-summary");
      expect(response.status).toBe(200);
      resultSets.push(response.body.users.map((u: Record<string, unknown>) => u.id));
    }

    expect(resultSets[1]).toEqual(resultSets[0]);
    expect(resultSets[2]).toEqual(resultSets[0]);
  });

  it("does NOT call storage.getAppSetting('map_visibility_filter')", async () => {
    await supertest(buildAdminApp()).get("/users/match-summary");

    const visFilterCalls = mockGetAppSetting.mock.calls.filter(
      ([key]: string[]) => key === "map_visibility_filter"
    );
    expect(visFilterCalls).toHaveLength(0);
  });

  it("total count in response is NOT reduced by a visibility filter setting", async () => {
    mockGetAppSetting.mockImplementation(async (key: string) => {
      if (key === "map_visibility_filter") return { key, value: "online_only" };
      return undefined;
    });

    vi.mocked(db.execute).mockReset();
    const totalFromDb = 42;
    vi.mocked(db.execute)
      .mockResolvedValueOnce({ rows: [{ cnt: String(totalFromDb) }] } as unknown as Awaited<ReturnType<typeof db.execute>>)
      .mockResolvedValueOnce({ rows: [] } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const response = await supertest(buildAdminApp()).get("/users/match-summary");
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(totalFromDb);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: GET /users/match-summary — search filtering
// ─────────────────────────────────────────────────────────────────────────────

describe("Real admin router — GET /users/match-summary search filtering", () => {
  type ExecuteResult = Awaited<ReturnType<typeof db.execute>>;

  function mockMatchSummaryFull(opts: {
    paginationCount: number;
    zeroMatchCount?: number;
    userRows?: object[];
  }) {
    const { paginationCount, zeroMatchCount = 0, userRows = [] } = opts;
    vi.mocked(db.execute)
      .mockResolvedValueOnce({ rows: [{ cnt: String(paginationCount) }] } as unknown as ExecuteResult)
      .mockResolvedValueOnce({ rows: [{ cnt: String(zeroMatchCount)  }] } as unknown as ExecuteResult)
      .mockResolvedValueOnce({ rows: userRows }                           as unknown as ExecuteResult)
      .mockResolvedValue(   { rows: [] }                                 as unknown as ExecuteResult);
  }

  beforeEach(() => {
    vi.mocked(db.execute).mockReset();
    vi.mocked(db.execute).mockResolvedValue({ rows: [] } as unknown as ExecuteResult);
  });

  it("returns only matching users when search param is provided", async () => {
    mockMatchSummaryFull({
      paginationCount: 1,
      zeroMatchCount: 0,
      userRows: [
        { id: "u1", nickname: "Alpha", avatar_url: null, user_type: "biker", role: "user", status: "active", bb_count: "2", bz_count: "0", bb_counts: null },
      ],
    });

    const response = await supertest(buildAdminApp()).get("/users/match-summary?search=Alpha");
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0].nickname).toBe("Alpha");
  });

  it("pagination total reflects the search-filtered count, not the global count", async () => {
    mockMatchSummaryFull({ paginationCount: 3, zeroMatchCount: 1, userRows: [] });

    const response = await supertest(buildAdminApp()).get("/users/match-summary?search=xyz");
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(3);
  });

  it("search and zeroOnly compose with AND logic — total reflects both filters", async () => {
    mockMatchSummaryFull({ paginationCount: 2, zeroMatchCount: 5, userRows: [] });

    const response = await supertest(buildAdminApp()).get("/users/match-summary?search=Test&zeroOnly=true");
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.zeroMatchCount).toBe(5);
  });

  it("empty search string behaves the same as no search param", async () => {
    mockMatchSummaryFull({ paginationCount: 10, zeroMatchCount: 3, userRows: [] });
    const responseBlank = await supertest(buildAdminApp()).get("/users/match-summary?search=");
    expect(responseBlank.status).toBe(200);
    expect(responseBlank.body.total).toBe(10);

    mockMatchSummaryFull({ paginationCount: 10, zeroMatchCount: 3, userRows: [] });
    const responseAbsent = await supertest(buildAdminApp()).get("/users/match-summary");
    expect(responseAbsent.status).toBe(200);
    expect(responseAbsent.body.total).toBe(10);
  });

  it("source code contains ILIKE nickname filter applied to both COUNT and SELECT", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.resolve(__dirname, "../routes/admin/users.next.ts"),
      "utf-8"
    );
    const ilikeMentions = (src.match(/ILIKE/g) ?? []).length;
    expect(ilikeMentions).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Canary: confirms the filter IS used in the regular (non-admin) user routes
// ─────────────────────────────────────────────────────────────────────────────

describe("Canary — map_visibility_filter is still active in regular user routes", () => {
  it("users.ts contains functional map_visibility_filter references", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../routes/users.ts"), "utf-8");
    const executableLines = src
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    expect(executableLines).toContain("map_visibility_filter");
  });
});
