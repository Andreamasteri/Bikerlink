/**
 * Tests: sync endpoints require admin auth — regression guard (Task #1002)
 *
 * POST /api/admin/db/sync/run and GET /api/admin/db/sync/status are mounted
 * behind _requireAdmin in server/routes/admin.ts at mount time, NOT inside the
 * route file itself. A refactor that drops _requireAdmin from that mount point
 * would silently expose the sync trigger to any caller.
 *
 * This test imports the REAL admin router (following the same pattern as
 * admin-business-auth.test.ts) so _requireAdmin is exercised through the exact
 * wiring the server uses in production.
 *
 * Covered:
 *   - no session              → 401 on POST /db/sync/run
 *   - no session              → 401 on GET  /db/sync/status
 *   - authenticated non-admin → 403 on POST /db/sync/run
 *   - authenticated non-admin → 403 on GET  /db/sync/status
 *   - suspended admin         → 403 on POST /db/sync/run  (defense-in-depth)
 *   - active admin            → sync service called (200 or 409 per service state)
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ── Module mocks must be declared before any imports ────────────────────────

const { mockGetUser, mockGetAppSetting } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetAppSetting: vi.fn(),
}));

const { mockIsSyncAvailable, mockSyncProdToDev, mockGetSyncStatus } = vi.hoisted(() => ({
  mockIsSyncAvailable: vi.fn<[], boolean>(),
  mockSyncProdToDev: vi.fn<[], Promise<{ ok: boolean; error?: string }>>(),
  mockGetSyncStatus: vi.fn<[], Promise<{ available: boolean; inProgress: boolean; lastSync: unknown; nextScheduledAt: string | null }>>(),
}));

// database — avoids DATABASE_URL check at module load time
vi.mock("../db", async () => {
  const { createDbMock } = await import("./helpers/db-mock");
  return createDbMock();
});

// storage — _requireAdmin uses getUser
vi.mock("../storage", () => ({
  storage: {
    getUser: mockGetUser,
    getAppSetting: mockGetAppSetting,
    upsertAppSetting: vi.fn().mockResolvedValue({}),
    getAllAppSettings: vi.fn().mockResolvedValue([]),
    getAllUsers: vi.fn().mockResolvedValue([]),
    getModeratorLogs: vi.fn().mockResolvedValue([]),
    createModeratorLog: vi.fn().mockResolvedValue({}),
    getBusinesses: vi.fn().mockResolvedValue([]),
    getBusiness: vi.fn().mockResolvedValue(null),
    setBusinessAccessToken: vi.fn().mockResolvedValue(null),
  },
}));

// sync-service — stub the three functions used by routes/sync.ts
vi.mock("../sync-service", () => ({
  isSyncAvailable: mockIsSyncAvailable,
  syncProdToDev: mockSyncProdToDev,
  getSyncStatus: mockGetSyncStatus,
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
  listObjects: vi.fn().mockResolvedValue([]),
  getPublicUrl: vi.fn().mockResolvedValue("https://example.com/file"),
  BUCKET_CAMPAIGN: "Campaign/ads/",
  BUCKET_WISHLIST: "Wishlist/",
  BUCKET_CONTEST: "PhotoContest/",
  BUCKET_PROFILE_PIC: "ProfilePic/",
  BUCKET_MOTO_PIC: "ProfilePic/motorcycles/",
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

// ── Import the REAL admin router (all deps mocked above) ─────────────────────
import express from "express";
import supertest from "supertest";
import adminRouter from "../routes/admin";

// ── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Builds an Express app mounting the REAL admin router at /api/admin (exactly
 * like server/routes.ts). When `userId` is undefined the request has no session,
 * so _requireAdmin must reject with 401.
 */
function buildApp(userId?: string) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const sessionID = "test-session";
    Object.assign(req, {
      session: userId ? { userId, sessionID } : {},
      sessionID,
    });
    next();
  });
  app.use("/api/admin", adminRouter);
  return app;
}

const ADMIN_USER    = { id: "admin-id",    role: "admin", status: "active",    password: "hashed", nickname: "Admin" }; // pragma: allowlist secret
const NON_ADMIN     = { id: "user-id",     role: "user",  status: "active",    password: "hashed", nickname: "Bob" };   // pragma: allowlist secret
const SUSPENDED_ADMIN = { id: "susp-id",   role: "admin", status: "suspended", password: "hashed", nickname: "OldAdmin" }; // pragma: allowlist secret

const SYNC_RUN_PATH    = "/api/admin/db/sync/run";
const SYNC_STATUS_PATH = "/api/admin/db/sync/status";

const MOCK_STATUS = {
  available: true,
  inProgress: false,
  lastSync: null,
  nextScheduledAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAppSetting.mockResolvedValue(undefined);
  mockGetSyncStatus.mockResolvedValue(MOCK_STATUS);
  mockIsSyncAvailable.mockReturnValue(true);
  mockSyncProdToDev.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// No session → 401 before the route handler is reached
// ─────────────────────────────────────────────────────────────────────────────

describe("Sync routes — logged-out caller is rejected", () => {
  it("POST /db/sync/run without a session returns 401", async () => {
    const res = await supertest(buildApp()).post(SYNC_RUN_PATH);
    expect(res.status).toBe(401);
    // sync-service must never be invoked for an unauthenticated request
    expect(mockSyncProdToDev).not.toHaveBeenCalled();
  });

  it("GET /db/sync/status without a session returns 401", async () => {
    const res = await supertest(buildApp()).get(SYNC_STATUS_PATH);
    expect(res.status).toBe(401);
    expect(mockGetSyncStatus).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Non-admin / suspended admin → 403
// ─────────────────────────────────────────────────────────────────────────────

describe("Sync routes — non-admin caller is rejected", () => {
  it("POST /db/sync/run as a regular user returns 403", async () => {
    mockGetUser.mockResolvedValue(NON_ADMIN);
    const res = await supertest(buildApp("user-id")).post(SYNC_RUN_PATH);
    expect(res.status).toBe(403);
    expect(mockSyncProdToDev).not.toHaveBeenCalled();
  });

  it("GET /db/sync/status as a regular user returns 403", async () => {
    mockGetUser.mockResolvedValue(NON_ADMIN);
    const res = await supertest(buildApp("user-id")).get(SYNC_STATUS_PATH);
    expect(res.status).toBe(403);
    expect(mockGetSyncStatus).not.toHaveBeenCalled();
  });

  it("POST /db/sync/run as a suspended admin returns 403 (defense-in-depth)", async () => {
    mockGetUser.mockResolvedValue(SUSPENDED_ADMIN);
    const res = await supertest(buildApp("susp-id")).post(SYNC_RUN_PATH);
    expect(res.status).toBe(403);
    expect(mockSyncProdToDev).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Active admin → auth gate passes, route handler runs
// ─────────────────────────────────────────────────────────────────────────────

describe("Sync routes — active admin passes the auth gate", () => {
  it("GET /db/sync/status as admin returns 200 with status payload", async () => {
    mockGetUser.mockResolvedValue(ADMIN_USER);
    const res = await supertest(buildApp("admin-id")).get(SYNC_STATUS_PATH);
    expect(res.status).toBe(200);
    expect(mockGetSyncStatus).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({ available: true, inProgress: false });
  });

  it("POST /db/sync/run as admin invokes syncProdToDev and returns ok: true", async () => {
    mockGetUser.mockResolvedValue(ADMIN_USER);
    mockGetSyncStatus.mockResolvedValue({ ...MOCK_STATUS, lastSync: { ok: true, startedAt: "2024-01-01T00:00:00.000Z" } });

    const res = await supertest(buildApp("admin-id")).post(SYNC_RUN_PATH);
    expect(res.status).toBe(200);
    expect(mockSyncProdToDev).toHaveBeenCalledTimes(1);
    expect(res.body.ok).toBe(true);
  });

  it("POST /db/sync/run as admin when sync is unavailable returns 409 (no DB wipe risk)", async () => {
    mockGetUser.mockResolvedValue(ADMIN_USER);
    mockIsSyncAvailable.mockReturnValue(false);

    const res = await supertest(buildApp("admin-id")).post(SYNC_RUN_PATH);
    // Route returns 409 when sync is not available; syncProdToDev is never called
    expect(res.status).toBe(409);
    expect(mockSyncProdToDev).not.toHaveBeenCalled();
  });
});
