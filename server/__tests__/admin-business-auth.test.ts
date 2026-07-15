/**
 * Tests: only admins may create or revoke business reach access-tokens (Task #4939).
 *
 * The business-scoped reach view (Task #4917) is unlocked by an access-token that
 * an admin generates/revokes via POST/DELETE /api/admin/business/:id/access-token.
 * Those routes carry NO auth of their own — they rely entirely on being mounted
 * behind _requireAdmin inside server/routes/admin.ts. The existing
 * business-reach-api.test.ts mounts the bare business router and therefore can
 * NOT catch a regression in that wiring (e.g. someone dropping _requireAdmin from
 * the mount). This file closes that gap by importing the REAL admin router and
 * exercising the token routes through the exact _requireAdmin wiring the server
 * uses in production.
 *
 * Covered:
 *   - logged-out request (no session)               → 401 on POST and DELETE
 *   - logged-in non-admin (role: "user")            → 403 on POST and DELETE
 *   - suspended admin (status !== "active")         → 403 (defense-in-depth)
 *   - active admin                                  → 200 success on POST and DELETE
 *
 * Approach mirrors admin-privacy-filter.test.ts: all heavy server modules are
 * mocked so the real admin router imports cleanly without a DB, then a minimal
 * Express app mounts it at /api/admin exactly like server/routes.ts does.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ── Module mocks must be declared before any imports ────────────────────────
// vitest hoists vi.mock() calls, so these run before the test file's imports.

const { mockGetUser, mockGetAppSetting, mockSetBusinessAccessToken } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetAppSetting: vi.fn(),
  mockSetBusinessAccessToken: vi.fn(),
}));

// database — avoids DATABASE_URL check at module load time.
// Uses the shared db-mock helper (chainable+thenable builders, execute default,
// withDbRetry passthrough) so future DB-shape changes need one edit in the helper,
// not here. Async factory + dynamic import is the hoisting-safe usage.
vi.mock("../db", async () => {
  const { createDbMock } = await import("./helpers/db-mock");
  return createDbMock();
});

// storage — _requireAdmin uses getUser; the business router uses setBusinessAccessToken
vi.mock("../storage", () => ({
  storage: {
    getUser: mockGetUser,
    getAppSetting: mockGetAppSetting,
    setBusinessAccessToken: mockSetBusinessAccessToken,
    upsertAppSetting: vi.fn().mockResolvedValue({}),
    getAllUsers: vi.fn().mockResolvedValue([]),
    getAllAppSettings: vi.fn().mockResolvedValue([]),
    getModeratorLogs: vi.fn().mockResolvedValue([]),
    createModeratorLog: vi.fn().mockResolvedValue({}),
    getBusinesses: vi.fn().mockResolvedValue([]),
    getBusiness: vi.fn().mockResolvedValue(null),
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

// ── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Builds an Express app that mounts the REAL admin router at /api/admin (exactly
 * like server/routes.ts) and optionally injects a session. When `userId` is
 * undefined the request is logged-out (no req.session.userId) so _requireAdmin
 * must reject with 401 before any storage lookup.
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

const ADMIN_USER = { id: "admin-test-id", role: "admin", status: "active", password: "hashed", nickname: "Admin" }; // pragma: allowlist secret
const NON_ADMIN_USER = { id: "user-test-id", role: "user", status: "active", password: "hashed", nickname: "Bob" }; // pragma: allowlist secret
const SUSPENDED_ADMIN = { id: "susp-admin-id", role: "admin", status: "suspended", password: "hashed", nickname: "ExAdmin" }; // pragma: allowlist secret

const POST_PATH = "/api/admin/business/biz-1/access-token";
const DELETE_PATH = "/api/admin/business/biz-1/access-token";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAppSetting.mockResolvedValue(undefined);
  // The business router persists the token through this; only reached when admin passes.
  mockSetBusinessAccessToken.mockImplementation(async (id: string, token: string | null) => ({
    id,
    accessToken: token,
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Logged-out requests must be rejected (401) before touching the business store
// ─────────────────────────────────────────────────────────────────────────────

describe("Business access-token routes — logged-out is rejected", () => {
  it("POST without a session returns 401 and never persists a token", async () => {
    const res = await supertest(buildApp()).post(POST_PATH);
    expect(res.status).toBe(401);
    expect(mockSetBusinessAccessToken).not.toHaveBeenCalled();
  });

  it("DELETE without a session returns 401 and never revokes a token", async () => {
    const res = await supertest(buildApp()).delete(DELETE_PATH);
    expect(res.status).toBe(401);
    expect(mockSetBusinessAccessToken).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated non-admins must be rejected (403)
// ─────────────────────────────────────────────────────────────────────────────

describe("Business access-token routes — non-admin is rejected", () => {
  it("POST as a regular user returns 403 and never persists a token", async () => {
    mockGetUser.mockResolvedValue(NON_ADMIN_USER);
    const res = await supertest(buildApp("user-test-id")).post(POST_PATH);
    expect(res.status).toBe(403);
    expect(mockSetBusinessAccessToken).not.toHaveBeenCalled();
  });

  it("DELETE as a regular user returns 403 and never revokes a token", async () => {
    mockGetUser.mockResolvedValue(NON_ADMIN_USER);
    const res = await supertest(buildApp("user-test-id")).delete(DELETE_PATH);
    expect(res.status).toBe(403);
    expect(mockSetBusinessAccessToken).not.toHaveBeenCalled();
  });

  it("POST as a suspended admin returns 403 (defense-in-depth) and never persists", async () => {
    mockGetUser.mockResolvedValue(SUSPENDED_ADMIN);
    const res = await supertest(buildApp("susp-admin-id")).post(POST_PATH);
    expect(res.status).toBe(403);
    expect(mockSetBusinessAccessToken).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Active admins still succeed through the real wiring
// ─────────────────────────────────────────────────────────────────────────────

describe("Business access-token routes — active admin succeeds", () => {
  it("POST as an admin generates a fresh token (200)", async () => {
    mockGetUser.mockResolvedValue(ADMIN_USER);
    const res = await supertest(buildApp("admin-test-id")).post(POST_PATH);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("biz-1");
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.accessToken.length).toBeGreaterThan(0);
    expect(mockSetBusinessAccessToken).toHaveBeenCalledTimes(1);
  });

  it("DELETE as an admin revokes the token (200, accessToken: null)", async () => {
    mockGetUser.mockResolvedValue(ADMIN_USER);
    const res = await supertest(buildApp("admin-test-id")).delete(DELETE_PATH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "biz-1", accessToken: null });
    expect(mockSetBusinessAccessToken).toHaveBeenCalledWith("biz-1", null);
  });
});
