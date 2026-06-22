/**
 * Tests: protected accounts (PROTECTED_NICKNAMES) never appear in matching
 * or discovery results.
 *
 * Three raw-SQL code paths apply the filter:
 *   1. MatchingStorage.getCompatibleWishlistGaragePairs() — matching candidates
 *   2. ProposalsStorage.getActiveProposalCandidatePairs() — proposals pairing
 *   3. GET /compatible-bikers/:id route (sharing.ts) — proximity discovery
 *
 * Strategy
 * --------
 * The real DB is not available in the test environment, so db.execute is mocked
 * with a "filter-aware" implementation that simulates DB behaviour:
 *   - When the SQL object contains the BikerLink_Official exclusion clause, the mock
 *     returns only non-protected rows (as a real DB would).
 *   - When the exclusion clause is absent, the mock returns ALL seeded rows
 *     including protected ones (proving the filter is the reason for exclusion).
 *
 * Each test suite seeds both a BikerLink_Official account AND at least one
 * control/regular user.  Assertions confirm:
 *   a) the protected account is absent from results, AND
 *   b) the control user IS present (selective exclusion, not just empty results).
 *
 * A negative-path group also verifies that if PROTECTED_NICKNAMES is mocked as
 * empty (simulating filter removal), BikerLink_Official WOULD appear — proving
 * the filter is the causal defence.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ── Hoisted mock handles ──────────────────────────────────────────────────────

const { mockExecute, mockStorageGetPlannedRoute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockStorageGetPlannedRoute: vi.fn(),
}));

// ── Module mocks — must be declared before imports ───────────────────────────

vi.mock("../db", () => {
  const chainable = (): Record<string, unknown> => {
    const self: Record<string, () => unknown> = {
      from: vi.fn().mockResolvedValue([]),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };
    Object.values(self).forEach((fn) => {
      if (typeof fn === "function") {
        (fn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(self);
      }
    });
    return self;
  };

  return {
    db: {
      execute: mockExecute,
      select: vi.fn().mockReturnValue(chainable()),
      selectDistinct: vi.fn().mockReturnValue(chainable()),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
          onConflictDoUpdate: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    },
    pool: { query: vi.fn(), end: vi.fn(), connect: vi.fn(), on: vi.fn() },
  };
});

vi.mock("../storage", () => ({
  storage: {
    getPlannedRoute: mockStorageGetPlannedRoute,
    updatePlannedRoute: vi.fn().mockResolvedValue(undefined),
    createPlannedRoute: vi.fn().mockResolvedValue({ id: "route-1" }),
  },
}));

vi.mock("../objectStorage", () => ({
  uploadBuffer: vi.fn().mockResolvedValue("https://example.com/file"),
  objectExists: vi.fn().mockResolvedValue(false),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  downloadBuffer: vi.fn().mockResolvedValue(Buffer.from("")),
  isValidOtaBundlePath: vi.fn().mockReturnValue(true),
}));

vi.mock("../lib/abuse-rate-limit", () => ({
  getTrustedClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  createUserIpRateLimiter: vi.fn().mockReturnValue({ consume: vi.fn().mockResolvedValue(undefined) }),
  reportRateLimiter: { consume: vi.fn().mockResolvedValue(undefined) },
  feedbackRateLimiter: { consume: vi.fn().mockResolvedValue(undefined) },
  UserIpRateLimiter: class {},
  UserIpQuota: class {},
}));

vi.mock("express-rate-limit", () => {
  const passthrough = () => (_req: Request, _res: Response, next: NextFunction) => next();
  class MemoryStore {
    init() {}
    increment(_key: string, cb: (...args: unknown[]) => void) { cb(null, { totalHits: 1, resetTime: new Date() }); }
    decrement(_key: string) {}
    resetKey(_key: string) {}
    resetAll() {}
    localKeys = true;
  }
  return { default: passthrough, rateLimit: passthrough, MemoryStore };
});

vi.mock("multer", () => {
  const handler = (_req: Request, _res: Response, next: NextFunction) => next();
  const base = () => ({ single: () => handler, array: () => handler, fields: () => handler });
  const extras = { memoryStorage: vi.fn().mockReturnValue({}), diskStorage: vi.fn().mockReturnValue({}) };
  const multerFn = Object.assign(base, extras);
  (multerFn as unknown as Record<string, unknown>)["default"] = multerFn;
  return { default: multerFn };
});

// ── Imports ───────────────────────────────────────────────────────────────────

import express from "express";
import supertest from "supertest";
import { db } from "../db";
import { MatchingStorage } from "../storage/matching";
import { ProposalsStorage } from "../storage/proposals";
import sharingRouter from "../routes/planned-routes/sharing";

// ── Constants & seed data ─────────────────────────────────────────────────────

const PROTECTED_NICKNAME = "BikerLink_Official";
const PROTECTED_USER_ID  = "user-protected-system";

/** Convenience: serialise a drizzle SQL object to JSON for text-level inspection. */
function sqlToJson(sqlObj: unknown): string {
  return JSON.stringify(sqlObj);
}

/** Returns true when the last db.execute call's SQL contains the protection filter. */
function lastSqlHasProtectedFilter(): boolean {
  const calls = vi.mocked(db.execute).mock.calls;
  if (calls.length === 0) return false;
  return sqlToJson(calls[calls.length - 1][0]).includes(PROTECTED_NICKNAME);
}

/** Wraps a rows array as a fake QueryResult accepted by mockResolvedValue/mockImplementation. */
function fakeQueryResult(rows: unknown[]): Awaited<ReturnType<typeof db.execute>> {
  return { rows } as unknown as Awaited<ReturnType<typeof db.execute>>;
}

// ─── Matching seed data ───────────────────────────────────────────────────────

/** All wishlist↔garage pairs including protected users (what DB would return WITHOUT filter). */
const ALL_MATCHING_ROWS = [
  // ✓ real pair — should appear in results
  {
    w_id: "w1", w_wishlist_id: "wl1", w_brand: "Honda", w_model: null,
    w_motorcycle_type: "sport", w_riding_style: null, w_created_at: new Date(),
    m_id: "m1", m_user_id: "user-real-biker", m_brand: "Honda", m_model: null,
    m_motorcycle_type: "sport", m_riding_style: null, m_year: 2020,
    m_displacement: 600, m_is_default: true, m_created_at: new Date(),
    zavorrina_id: "user-real-zavorrina",
    biker_id: "user-real-biker",
  },
  // ✗ protected as zavorrina — SQL filter must exclude this
  {
    w_id: "w2", w_wishlist_id: "wl2", w_brand: "Honda", w_model: null,
    w_motorcycle_type: "sport", w_riding_style: null, w_created_at: new Date(),
    m_id: "m2", m_user_id: "user-real-biker", m_brand: "Honda", m_model: null,
    m_motorcycle_type: "sport", m_riding_style: null, m_year: 2021,
    m_displacement: 600, m_is_default: true, m_created_at: new Date(),
    zavorrina_id: PROTECTED_USER_ID,
    biker_id: "user-real-biker",
  },
  // ✗ protected as biker — SQL filter must exclude this
  {
    w_id: "w3", w_wishlist_id: "wl3", w_brand: "Yamaha", w_model: null,
    w_motorcycle_type: "touring", w_riding_style: null, w_created_at: new Date(),
    m_id: "m3", m_user_id: PROTECTED_USER_ID, m_brand: "Yamaha", m_model: null,
    m_motorcycle_type: "touring", m_riding_style: null, m_year: 2022,
    m_displacement: 900, m_is_default: true, m_created_at: new Date(),
    zavorrina_id: "user-real-zavorrina",
    biker_id: PROTECTED_USER_ID,
  },
];

/** Filter-aware mock for MatchingStorage tests. */
function matchingFilterAwareMock(): void {
  vi.mocked(db.execute).mockImplementation(((sqlObj: unknown) => {
    const hasFilter = sqlToJson(sqlObj).includes(PROTECTED_NICKNAME);
    const rows = hasFilter
      ? ALL_MATCHING_ROWS.filter(
          (r) => r.zavorrina_id !== PROTECTED_USER_ID && r.biker_id !== PROTECTED_USER_ID
        )
      : ALL_MATCHING_ROWS;
    return Promise.resolve(fakeQueryResult(rows));
  }) as never);
}

// ─── Proposals seed data ──────────────────────────────────────────────────────

/**
 * Maps proposal ID → owning user nickname.
 * The SQL joins proposals to users and filters by nickname; here we simulate
 * that join in the mock to apply the same selective exclusion.
 */
const PROPOSAL_OWNER: Record<string, string> = {
  "proposal-A": "RealUser1",
  "proposal-B": "RealUser2",
  "proposal-C": PROTECTED_NICKNAME,   // BikerLink_Official owns this proposal
  "proposal-D": "AnotherRealUser",
};

/** All candidate pairs including pairs that involve the protected user. */
const ALL_PROPOSAL_PAIRS = [
  { id1: "proposal-A", id2: "proposal-B" },   // ✓ real pair — should appear
  { id1: "proposal-C", id2: "proposal-D" },   // ✗ protected user's proposal — must be excluded
];

/** Filter-aware mock for ProposalsStorage tests. */
function proposalsFilterAwareMock(): void {
  vi.mocked(db.execute).mockImplementation(((sqlObj: unknown) => {
    const hasFilter = sqlToJson(sqlObj).includes(PROTECTED_NICKNAME);
    const rows = hasFilter
      ? ALL_PROPOSAL_PAIRS.filter(
          (p) =>
            PROPOSAL_OWNER[p.id1] !== PROTECTED_NICKNAME &&
            PROPOSAL_OWNER[p.id2] !== PROTECTED_NICKNAME
        )
      : ALL_PROPOSAL_PAIRS;
    return Promise.resolve(fakeQueryResult(rows));
  }) as never);
}

// ─── Sharing route seed data ──────────────────────────────────────────────────

/** All nearby-biker rows including the protected account. */
const ALL_NEARBY_BIKERS = [
  {
    user_id: "user-real-biker",
    nickname: "RealBiker1",
    user_type: "biker",
    avatar_url: null,
    riding_style: "sport",
    is_available: true,
    latitude: 45.46,
    longitude: 9.19,
    proximity_score: 45,
    style_score: 30,
    avail_score: 20,
    last_login_at: new Date(),
    hide_from_map: false,
  },
  {
    user_id: PROTECTED_USER_ID,
    nickname: PROTECTED_NICKNAME,   // ✗ must be excluded
    user_type: "biker",
    avatar_url: null,
    riding_style: "touring",
    is_available: false,
    latitude: 45.47,
    longitude: 9.20,
    proximity_score: 40,
    style_score: 0,
    avail_score: 0,
    last_login_at: new Date(),
    hide_from_map: false,
  },
];

/** Filter-aware mock for sharing route tests. */
function sharingFilterAwareMock(): void {
  vi.mocked(db.execute).mockImplementation(((sqlObj: unknown) => {
    const hasFilter = sqlToJson(sqlObj).includes(PROTECTED_NICKNAME);
    const rows = hasFilter
      ? ALL_NEARBY_BIKERS.filter((r) => r.nickname !== PROTECTED_NICKNAME)
      : ALL_NEARBY_BIKERS;
    return Promise.resolve(fakeQueryResult(rows));
  }) as never);
}

/** A minimal planned-route fixture with a valid origin waypoint. */
const FAKE_ROUTE = {
  id: "route-42",
  userId: "user-1",
  title: "Test Route",
  style: "balanced",
  waypoints: [{ lat: 45.46, lng: 9.19, name: "Milano" }],
  polyline: null,
  visibility: "public",
  metadata: {},
};

/** Builds a minimal Express app that injects a session and mounts the sharing router. */
function buildSharingApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: { userId: "user-1" }, sessionID: "sess-1" });
    next();
  });
  app.use("/routes", sharingRouter);
  return app;
}

// ── Shared setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockResolvedValue({ rows: [] });
  mockStorageGetPlannedRoute.mockResolvedValue(FAKE_ROUTE);
});
