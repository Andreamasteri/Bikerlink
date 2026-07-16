/**
 * Tests: legacy-path fallback in the three serve routes.
 *
 * After the bucket-path migration each route tries the new canonical prefix first
 * and silently falls back to the old prefix. If that fallback is ever removed or
 * the old-path download throws an unexpected error, all photos stored before the
 * migration silently 404. This suite guards against that regression.
 *
 * Routes covered:
 *   GET /api/ads/images/:filename      Campaign/ads/  → public/ads/
 *   GET /api/contest/photos/:filename  PhotoContest/  → public/contest/
 *   GET /api/users/photos/:filename    ProfilePic/    → public/photos/
 *
 * Verified:
 *   - new path succeeds → 200 (no fallback needed)
 *   - new path fails, legacy path succeeds → 200 (fallback kicks in)
 *   - both paths fail → 404, never 500
 *   - missing DB row → 404, no download attempted
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ── Hoisted mock factories ─────────────────────────────────────────────────────

const {
  mockDownloadBuffer,
  mockFsExistsSync,
  mockFsMkdirSync,
  mockFsWriteFileSync,
  mockDbSelect,
  mockHasBlockedUser,
} = vi.hoisted(() => ({
  mockDownloadBuffer: vi.fn(),
  mockFsExistsSync: vi.fn().mockReturnValue(false),
  mockFsMkdirSync: vi.fn(),
  mockFsWriteFileSync: vi.fn(),
  mockDbSelect: vi.fn(),
  mockHasBlockedUser: vi.fn().mockResolvedValue(false),
}));

// ── Mock: object storage ──────────────────────────────────────────────────────

vi.mock("../objectStorage", () => ({
  downloadBuffer: mockDownloadBuffer,
  uploadBuffer: vi.fn().mockResolvedValue(undefined),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  listObjects: vi.fn().mockResolvedValue([]),
  objectExists: vi.fn().mockResolvedValue(false),
  BUCKET_CAMPAIGN: "Campaign/ads/",
  BUCKET_CONTEST: "PhotoContest/",
  BUCKET_PROFILE_PIC: "ProfilePic/",
  BUCKET_MOTO_PIC: "ProfilePic/motorcycles/",
  BUCKET_WISHLIST: "Wishlist/",
  isValidOtaBundlePath: vi.fn().mockReturnValue(true),
  getPublicUrl: vi.fn().mockResolvedValue("https://example.com/obj"),
}));

// ── Mock: fs (used by ads route for local disk cache) ─────────────────────────

vi.mock("fs", () => ({
  default: {
    existsSync: mockFsExistsSync,
    mkdirSync: mockFsMkdirSync,
    writeFileSync: mockFsWriteFileSync,
    readdirSync: vi.fn().mockReturnValue([]),
    unlinkSync: vi.fn(),
  },
}));

// ── Mock: database (shared; select is individually controlled per test) ───────

vi.mock("../db", async () => {
  const { createDbMock } = await import("./helpers/db-mock");
  return createDbMock({ db: { select: mockDbSelect } });
});

// ── Mock: storage ─────────────────────────────────────────────────────────────

vi.mock("../storage", () => ({
  storage: {
    getAllCampaigns: vi.fn().mockResolvedValue([]),
    ghostCampaign: vi.fn().mockResolvedValue(undefined),
    hasBlockedUser: mockHasBlockedUser,
    getUser: vi.fn().mockResolvedValue(null),
    getUserPhoto: vi.fn().mockResolvedValue(null),
    getUserPhotoCount: vi.fn().mockResolvedValue(0),
    createUserPhoto: vi.fn().mockResolvedValue({ id: "photo-1" }),
    deleteUserPhoto: vi.fn().mockResolvedValue(undefined),
    getBlockedUsersByBlocker: vi.fn().mockResolvedValue([]),
    isBlocked: vi.fn().mockResolvedValue(false),
    blockUser: vi.fn().mockResolvedValue(undefined),
    unblockUser: vi.fn().mockResolvedValue(true),
    deleteBikerBikerMatchesBetween: vi.fn().mockResolvedValue(undefined),
    createReport: vi.fn().mockResolvedValue({ id: "r-1" }),
    getActiveCampaigns: vi.fn().mockResolvedValue([]),
    getActiveAdsByUserType: vi.fn().mockResolvedValue([]),
    incrementCampaignImpressions: vi.fn().mockResolvedValue(undefined),
    getAppSetting: vi.fn().mockResolvedValue(null),
    getPhotoContestEntries: vi.fn().mockResolvedValue([]),
    getPhotoContestEntry: vi.fn().mockResolvedValue(null),
    getPhotoVote: vi.fn().mockResolvedValue(null),
    getDailyVoteCount: vi.fn().mockResolvedValue(null),
    createPhotoVote: vi.fn().mockResolvedValue(undefined),
    incrementEntryVotes: vi.fn().mockResolvedValue(undefined),
    upsertDailyVoteCount: vi.fn().mockResolvedValue(undefined),
    createPhotoContestEntry: vi.fn().mockResolvedValue({ id: "entry-1" }),
    deletePhotoContestEntry: vi.fn().mockResolvedValue(undefined),
    getPhotoWinners: vi.fn().mockResolvedValue([]),
  },
}));

// ── Mock: lib/concurrency ────────────────────────────────────────────────────

vi.mock("../lib/concurrency", () => {
  class MockSemaphore {
    acquire() { return Promise.resolve(); }
    release() {}
  }
  class MockSemaphoreQueueFullError extends Error {}
  return {
    allLimited: vi.fn(async (fns: Array<() => Promise<unknown>>) =>
      Promise.all(fns.map((f) => f()))
    ),
    allSettledLimited: vi.fn().mockResolvedValue([]),
    DEFAULT_CONCURRENCY: 10,
    Semaphore: MockSemaphore,
    SemaphoreQueueFullError: MockSemaphoreQueueFullError,
    matchEnrichmentSemaphore: new MockSemaphore(),
    MATCH_ENRICHMENT_GLOBAL_LIMIT: 10,
    MATCH_ENRICHMENT_MAX_QUEUE: 100,
  };
});

// ── Mock: lib/abuse-rate-limit ────────────────────────────────────────────────

vi.mock("../lib/abuse-rate-limit", () => ({
  getTrustedClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  reportRateLimiter: { isOverLimit: vi.fn().mockReturnValue(false) },
  createUserIpRateLimiter: vi.fn().mockReturnValue({
    isOverLimit: vi.fn().mockReturnValue(false),
  }),
}));

// ── Mock: constants ───────────────────────────────────────────────────────────

vi.mock("../constants", () => ({
  isProtectedUser: vi.fn().mockReturnValue(false),
  PROTECTED_EMAILS: [],
  PROTECTED_NICKNAMES: [],
}));

// ── Mock: multer (used by contest + users routes for POST handlers) ────────────

vi.mock("multer", () => {
  const handler = (_req: Request, _res: Response, next: NextFunction) => next();
  const multerFn = Object.assign(
    () => ({
      single: () => handler,
      array: () => handler,
      fields: () => handler,
    }),
    {
      memoryStorage: vi.fn().mockReturnValue({}),
      diskStorage: vi.fn().mockReturnValue({}),
    }
  );
  (multerFn as Record<string, unknown>).default = multerFn;
  return { default: multerFn };
});

// ── Imports (after all vi.mock declarations) ──────────────────────────────────

import express from "express";
import supertest from "supertest";
import { createQueryBuilder } from "./helpers/db-mock";
import adsRouter from "../routes/ads";
import contestRouter from "../routes/contest";
import usersRouter from "../routes/users/actions";

// ── Shared constants ──────────────────────────────────────────────────────────

const IMAGE_BYTES = Buffer.from("fake-image-bytes");

// ── App builder helpers ───────────────────────────────────────────────────────

function buildAdsApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/ads", adsRouter);
  return app;
}

function buildContestApp(userId?: string) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: userId ? { userId } : {} });
    next();
  });
  app.use("/api/contest", contestRouter);
  return app;
}

function buildUsersApp(userId?: string) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: userId ? { userId } : {} });
    next();
  });
  app.use("/api/users", usersRouter);
  return app;
}

// ── beforeEach: reset mocks to safe defaults ──────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockFsExistsSync.mockReturnValue(false);
  mockFsMkdirSync.mockReturnValue(undefined);
  mockFsWriteFileSync.mockReturnValue(undefined);
  mockHasBlockedUser.mockResolvedValue(false);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ads/images/:filename
// Canonical prefix: Campaign/ads/  |  Legacy prefix: public/ads/
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/ads/images/:filename — legacy-path fallback", () => {
  it("returns 200 using the new canonical path when it succeeds", async () => {
    mockDownloadBuffer.mockResolvedValue(IMAGE_BYTES);

    const res = await supertest(buildAdsApp()).get("/api/ads/images/photo.jpg");

    expect(res.status).toBe(200);
    expect(mockDownloadBuffer).toHaveBeenCalledWith("Campaign/ads/photo.jpg");
    expect(mockDownloadBuffer).toHaveBeenCalledTimes(1);
  });

  it("falls back to legacy public/ads/ and returns 200 when the new path throws", async () => {
    mockDownloadBuffer
      .mockRejectedValueOnce(new Error("object not found in new path"))
      .mockResolvedValueOnce(IMAGE_BYTES);

    const res = await supertest(buildAdsApp()).get("/api/ads/images/photo.jpg");

    expect(res.status).toBe(200);
    expect(mockDownloadBuffer).toHaveBeenNthCalledWith(1, "Campaign/ads/photo.jpg");
    expect(mockDownloadBuffer).toHaveBeenNthCalledWith(2, "public/ads/photo.jpg");
    expect(mockDownloadBuffer).toHaveBeenCalledTimes(2);
  });

  it("returns 404 — never 500 — when both new and legacy paths fail", async () => {
    mockDownloadBuffer.mockRejectedValue(new Error("not found anywhere"));

    const res = await supertest(buildAdsApp()).get("/api/ads/images/photo.jpg");

    expect(res.status).toBe(404);
    // Confirm both paths were attempted before giving up
    expect(mockDownloadBuffer).toHaveBeenCalledTimes(2);
  });

  it("returns 400 without downloading when the filename contains path traversal", async () => {
    const res = await supertest(buildAdsApp()).get(
      "/api/ads/images/..%2Fetc%2Fpasswd"
    );

    expect(res.status).toBe(400);
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });

  it("does not attempt any download when the file is already in the local disk cache", async () => {
    mockFsExistsSync.mockReturnValue(true); // cache hit

    await supertest(buildAdsApp()).get("/api/ads/images/cached.jpg");

    // The important assertion: no download was attempted
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contest/photos/:filename
// Canonical prefix: PhotoContest/  |  Legacy prefix: public/contest/
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/contest/photos/:filename — legacy-path fallback", () => {
  /** Prime the DB select mock to return the given rows for the next call. */
  function primeDb(rows: unknown[]) {
    mockDbSelect.mockReturnValue(createQueryBuilder(rows));
  }

  const APPROVED_ENTRY = [{ id: "entry-1", isApproved: true }];

  it("returns 200 using the new canonical path when it succeeds", async () => {
    primeDb(APPROVED_ENTRY);
    mockDownloadBuffer.mockResolvedValue(IMAGE_BYTES);

    const res = await supertest(buildContestApp("user-1")).get(
      "/api/contest/photos/photo.webp"
    );

    expect(res.status).toBe(200);
    expect(mockDownloadBuffer).toHaveBeenCalledWith("PhotoContest/photo.webp");
    expect(mockDownloadBuffer).toHaveBeenCalledTimes(1);
  });

  it("falls back to legacy public/contest/ and returns 200 when the new path throws", async () => {
    primeDb(APPROVED_ENTRY);
    mockDownloadBuffer
      .mockRejectedValueOnce(new Error("object not found in new path"))
      .mockResolvedValueOnce(IMAGE_BYTES);

    const res = await supertest(buildContestApp("user-1")).get(
      "/api/contest/photos/photo.webp"
    );

    expect(res.status).toBe(200);
    expect(mockDownloadBuffer).toHaveBeenNthCalledWith(1, "PhotoContest/photo.webp");
    expect(mockDownloadBuffer).toHaveBeenNthCalledWith(2, "public/contest/photo.webp");
    expect(mockDownloadBuffer).toHaveBeenCalledTimes(2);
  });

  it("returns 404 — never 500 — when both new and legacy paths fail", async () => {
    primeDb(APPROVED_ENTRY);
    mockDownloadBuffer.mockRejectedValue(new Error("not found anywhere"));

    const res = await supertest(buildContestApp("user-1")).get(
      "/api/contest/photos/photo.webp"
    );

    expect(res.status).toBe(404);
    expect(mockDownloadBuffer).toHaveBeenCalledTimes(2);
  });

  it("returns 404 without downloading when the entry is not in the DB", async () => {
    primeDb([]); // no matching entry

    const res = await supertest(buildContestApp("user-1")).get(
      "/api/contest/photos/missing.webp"
    );

    expect(res.status).toBe(404);
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });

  it("returns 404 without downloading when the entry is not approved", async () => {
    primeDb([{ id: "entry-2", isApproved: false }]);

    const res = await supertest(buildContestApp("user-1")).get(
      "/api/contest/photos/pending.webp"
    );

    expect(res.status).toBe(404);
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });

  it("returns 401 when the request is not authenticated", async () => {
    const res = await supertest(buildContestApp()).get(
      "/api/contest/photos/photo.webp"
    );

    expect(res.status).toBe(401);
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/photos/:filename
// Canonical prefix: ProfilePic/  |  Legacy prefix: public/photos/
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/users/photos/:filename — legacy-path fallback", () => {
  /** Prime the DB select mock to return the given rows for the next call. */
  function primeDb(rows: unknown[]) {
    mockDbSelect.mockReturnValue(createQueryBuilder(rows));
  }

  const OWNER_ROW = [{ userId: "user-1", isApproved: true }];
  const OTHER_APPROVED_ROW = [{ userId: "other-user", isApproved: true }];

  it("returns 200 using the new canonical path when it succeeds", async () => {
    primeDb(OWNER_ROW);
    mockDownloadBuffer.mockResolvedValue(IMAGE_BYTES);

    const res = await supertest(buildUsersApp("user-1")).get(
      "/api/users/photos/photo.webp"
    );

    expect(res.status).toBe(200);
    expect(mockDownloadBuffer).toHaveBeenCalledWith("ProfilePic/photo.webp");
    expect(mockDownloadBuffer).toHaveBeenCalledTimes(1);
  });

  it("falls back to legacy public/photos/ and returns 200 when the new path throws", async () => {
    primeDb(OWNER_ROW);
    mockDownloadBuffer
      .mockRejectedValueOnce(new Error("object not found in new path"))
      .mockResolvedValueOnce(IMAGE_BYTES);

    const res = await supertest(buildUsersApp("user-1")).get(
      "/api/users/photos/photo.webp"
    );

    expect(res.status).toBe(200);
    expect(mockDownloadBuffer).toHaveBeenNthCalledWith(1, "ProfilePic/photo.webp");
    expect(mockDownloadBuffer).toHaveBeenNthCalledWith(2, "public/photos/photo.webp");
    expect(mockDownloadBuffer).toHaveBeenCalledTimes(2);
  });

  it("returns 404 — never 500 — when both new and legacy paths fail", async () => {
    primeDb(OWNER_ROW);
    mockDownloadBuffer.mockRejectedValue(new Error("not found anywhere"));

    const res = await supertest(buildUsersApp("user-1")).get(
      "/api/users/photos/photo.webp"
    );

    expect(res.status).toBe(404);
    expect(mockDownloadBuffer).toHaveBeenCalledTimes(2);
  });

  it("returns 404 without downloading when the photo row is not in the DB", async () => {
    primeDb([]); // no matching row

    const res = await supertest(buildUsersApp("user-1")).get(
      "/api/users/photos/missing.webp"
    );

    expect(res.status).toBe(404);
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });

  it("returns 404 without downloading when a non-owner requests an unapproved photo", async () => {
    primeDb([{ userId: "other-user", isApproved: false }]);

    const res = await supertest(buildUsersApp("user-1")).get(
      "/api/users/photos/private.webp"
    );

    expect(res.status).toBe(404);
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });

  it("returns 403 without downloading when the photo owner has blocked the requester", async () => {
    primeDb(OTHER_APPROVED_ROW);
    mockHasBlockedUser.mockResolvedValue(true);

    const res = await supertest(buildUsersApp("user-1")).get(
      "/api/users/photos/photo.webp"
    );

    expect(res.status).toBe(403);
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });

  it("allows the owner to see their own unapproved photo and falls back to legacy path", async () => {
    // Owner (userId === requesterId) bypasses the isApproved check entirely
    primeDb([{ userId: "user-1", isApproved: false }]);
    mockDownloadBuffer
      .mockRejectedValueOnce(new Error("not in new path"))
      .mockResolvedValueOnce(IMAGE_BYTES);

    const res = await supertest(buildUsersApp("user-1")).get(
      "/api/users/photos/own.webp"
    );

    expect(res.status).toBe(200);
    expect(mockDownloadBuffer).toHaveBeenNthCalledWith(1, "ProfilePic/own.webp");
    expect(mockDownloadBuffer).toHaveBeenNthCalledWith(2, "public/photos/own.webp");
  });

  it("returns 401 when the request is not authenticated", async () => {
    const res = await supertest(buildUsersApp()).get(
      "/api/users/photos/photo.webp"
    );

    expect(res.status).toBe(401);
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });
});
