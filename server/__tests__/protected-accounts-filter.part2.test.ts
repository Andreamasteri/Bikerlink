import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import express from "express";
import supertest from "supertest";
import { db } from "../db";
import { MatchingStorage } from "../storage/matching";
import { ProposalsStorage } from "../storage/proposals";
import sharingRouter from "../routes/planned-routes/sharing";

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

// ── Constants & seed data ─────────────────────────────────────────────────────

const PROTECTED_NICKNAME = "BikerLink_Official";
const PROTECTED_USER_ID  = "user-protected-system";

function sqlToJson(sqlObj: unknown): string {
  return JSON.stringify(sqlObj);
}

function lastSqlHasProtectedFilter(): boolean {
  const calls = vi.mocked(db.execute).mock.calls;
  if (calls.length === 0) return false;
  return sqlToJson(calls[calls.length - 1][0]).includes(PROTECTED_NICKNAME);
}

function fakeQueryResult(rows: unknown[]): Awaited<ReturnType<typeof db.execute>> {
  return { rows } as unknown as Awaited<ReturnType<typeof db.execute>>;
}

const ALL_MATCHING_ROWS = [
  {
    w_id: "w1", w_wishlist_id: "wl1", w_brand: "Honda", w_model: null,
    w_motorcycle_type: "sport", w_riding_style: null, w_created_at: new Date(),
    m_id: "m1", m_user_id: "user-real-biker", m_brand: "Honda", m_model: null,
    m_motorcycle_type: "sport", m_riding_style: null, m_year: 2020,
    m_displacement: 600, m_is_default: true, m_created_at: new Date(),
    zavorrina_id: "user-real-zavorrina",
    biker_id: "user-real-biker",
  },
  {
    w_id: "w2", w_wishlist_id: "wl2", w_brand: "Honda", w_model: null,
    w_motorcycle_type: "sport", w_riding_style: null, w_created_at: new Date(),
    m_id: "m2", m_user_id: "user-real-biker", m_brand: "Honda", m_model: null,
    m_motorcycle_type: "sport", m_riding_style: null, m_year: 2021,
    m_displacement: 600, m_is_default: true, m_created_at: new Date(),
    zavorrina_id: PROTECTED_USER_ID,
    biker_id: "user-real-biker",
  },
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

const PROPOSAL_OWNER: Record<string, string> = {
  "proposal-A": "RealUser1",
  "proposal-B": "RealUser2",
  "proposal-C": PROTECTED_NICKNAME,
  "proposal-D": "AnotherRealUser",
};

const ALL_PROPOSAL_PAIRS = [
  { id1: "proposal-A", id2: "proposal-B" },
  { id1: "proposal-C", id2: "proposal-D" },
];

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
    nickname: PROTECTED_NICKNAME,
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

function sharingFilterAwareMock(): void {
  vi.mocked(db.execute).mockImplementation(((sqlObj: unknown) => {
    const hasFilter = sqlToJson(sqlObj).includes(PROTECTED_NICKNAME);
    const rows = hasFilter
      ? ALL_NEARBY_BIKERS.filter((r) => r.nickname !== PROTECTED_NICKNAME)
      : ALL_NEARBY_BIKERS;
    return Promise.resolve(fakeQueryResult(rows));
  }) as never);
}

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

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockResolvedValue({ rows: [] });
  mockStorageGetPlannedRoute.mockResolvedValue(FAKE_ROUTE);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Matching candidates — getCompatibleWishlistGaragePairs
// ═══════════════════════════════════════════════════════════════════════════════

describe("MatchingStorage.getCompatibleWishlistGaragePairs — protected account exclusion", () => {
  it("excludes the BikerLink_Official account (zavorrina role) and keeps real users", async () => {
    matchingFilterAwareMock();
    const store = new MatchingStorage();
    const pairs = await store.getCompatibleWishlistGaragePairs();

    const zavorrinaIds = pairs.map((p) => p.zavorrinaId);
    expect(zavorrinaIds).not.toContain(PROTECTED_USER_ID);
    expect(zavorrinaIds).toContain("user-real-zavorrina");
  });

  it("excludes the BikerLink_Official account (biker role) and keeps real users", async () => {
    matchingFilterAwareMock();
    const store = new MatchingStorage();
    const pairs = await store.getCompatibleWishlistGaragePairs();

    const bikerIds = pairs.map((p) => p.bikerId);
    expect(bikerIds).not.toContain(PROTECTED_USER_ID);
    expect(bikerIds).toContain("user-real-biker");
  });

  it("returns exactly the non-protected pairs (selective exclusion, not empty result)", async () => {
    matchingFilterAwareMock();
    const store = new MatchingStorage();
    const pairs = await store.getCompatibleWishlistGaragePairs();

    expect(pairs).toHaveLength(1);
    expect(pairs[0].zavorrinaId).toBe("user-real-zavorrina");
    expect(pairs[0].bikerId).toBe("user-real-biker");
  });

  it("negative path: without protection filter, BikerLink_Official WOULD appear", async () => {
    vi.mocked(db.execute).mockResolvedValue(fakeQueryResult(ALL_MATCHING_ROWS));

    const store = new MatchingStorage();
    const pairs = await store.getCompatibleWishlistGaragePairs();

    const allIds = pairs.flatMap((p) => [p.zavorrinaId, p.bikerId]);
    expect(allIds).toContain(PROTECTED_USER_ID);
  });

  it("emits SQL that contains the PROTECTED_NICKNAMES exclusion clause", async () => {
    matchingFilterAwareMock();
    const store = new MatchingStorage();
    await store.getCompatibleWishlistGaragePairs();

    expect(lastSqlHasProtectedFilter()).toBe(true);
  });

  it("applies the filter to BOTH the zavorrina and biker sides of the join", async () => {
    matchingFilterAwareMock();
    const store = new MatchingStorage();
    await store.getCompatibleWishlistGaragePairs();

    const serialised = sqlToJson(vi.mocked(db.execute).mock.calls[0][0]);
    const occurrences = serialised.split(PROTECTED_NICKNAME).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Proposals query — getActiveProposalCandidatePairs
// ═══════════════════════════════════════════════════════════════════════════════

describe("ProposalsStorage.getActiveProposalCandidatePairs — protected account exclusion", () => {
  it("excludes proposals belonging to BikerLink_Official and keeps real proposals", async () => {
    proposalsFilterAwareMock();
    const store = new ProposalsStorage();
    const pairs = await store.getActiveProposalCandidatePairs(50);

    const allIds = pairs.flatMap((p) => [p.id1, p.id2]);
    expect(allIds).not.toContain("proposal-C");
    expect(allIds).toContain("proposal-A");
    expect(allIds).toContain("proposal-B");
  });

  it("returns exactly the non-protected pairs (selective exclusion, not empty result)", async () => {
    proposalsFilterAwareMock();
    const store = new ProposalsStorage();
    const pairs = await store.getActiveProposalCandidatePairs(50);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual({ id1: "proposal-A", id2: "proposal-B" });
  });

  it("negative path: without protection filter, BikerLink_Official proposal WOULD appear", async () => {
    vi.mocked(db.execute).mockResolvedValue(fakeQueryResult(ALL_PROPOSAL_PAIRS));

    const store = new ProposalsStorage();
    const pairs = await store.getActiveProposalCandidatePairs(50);

    const allIds = pairs.flatMap((p) => [p.id1, p.id2]);
    expect(allIds).toContain("proposal-C");
  });

  it("emits SQL that contains the PROTECTED_NICKNAMES exclusion clause", async () => {
    proposalsFilterAwareMock();
    const store = new ProposalsStorage();
    await store.getActiveProposalCandidatePairs(50);

    expect(lastSqlHasProtectedFilter()).toBe(true);
  });

  it("applies the filter to BOTH users (u1 and u2) in the self-join", async () => {
    proposalsFilterAwareMock();
    const store = new ProposalsStorage();
    await store.getActiveProposalCandidatePairs(50);

    const serialised = sqlToJson(vi.mocked(db.execute).mock.calls[0][0]);
    const occurrences = serialised.split(PROTECTED_NICKNAME).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Compatible-bikers proximity — GET /routes/compatible-bikers/:id
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /routes/compatible-bikers/:id — protected account exclusion", () => {
  it("excludes BikerLink_Official and returns only real nearby bikers", async () => {
    sharingFilterAwareMock();
    const app = buildSharingApp();
    const res = await supertest(app).get("/routes/compatible-bikers/route-42");

    expect(res.status).toBe(200);
    const nicknames = (res.body.bikers as Array<{ nickname: string }>).map((b) => b.nickname);
    expect(nicknames).not.toContain(PROTECTED_NICKNAME);
    expect(nicknames).toContain("RealBiker1");
  });

  it("returns a non-empty biker list (selective exclusion, not empty result)", async () => {
    sharingFilterAwareMock();
    const app = buildSharingApp();
    const res = await supertest(app).get("/routes/compatible-bikers/route-42");

    expect(res.status).toBe(200);
    expect(res.body.bikers).toHaveLength(1);
    expect(res.body.count).toBe(1);
    expect(res.body.bikers[0].nickname).toBe("RealBiker1");
  });

  it("negative path: without protection filter, BikerLink_Official WOULD appear", async () => {
    vi.mocked(db.execute).mockResolvedValue(fakeQueryResult(ALL_NEARBY_BIKERS));

    const app = buildSharingApp();
    const res = await supertest(app).get("/routes/compatible-bikers/route-42");

    expect(res.status).toBe(200);
    const nicknames = (res.body.bikers as Array<{ nickname: string }>).map((b) => b.nickname);
    expect(nicknames).toContain(PROTECTED_NICKNAME);
    expect(nicknames).toContain("RealBiker1");
  });

  it("emits SQL that contains the PROTECTED_NICKNAMES exclusion clause", async () => {
    sharingFilterAwareMock();
    const app = buildSharingApp();
    await supertest(app).get("/routes/compatible-bikers/route-42");

    expect(lastSqlHasProtectedFilter()).toBe(true);
  });

  it("returns 404 when the planned route is not found", async () => {
    mockStorageGetPlannedRoute.mockResolvedValue(null);

    const app = buildSharingApp();
    const res = await supertest(app).get("/routes/compatible-bikers/nonexistent");

    expect(res.status).toBe(404);
  });

  it("returns an empty biker list when the route has no valid origin waypoint", async () => {
    mockStorageGetPlannedRoute.mockResolvedValue({
      ...FAKE_ROUTE,
      waypoints: [{ lat: 0, lng: 0, name: "Empty" }],
    });

    const app = buildSharingApp();
    const res = await supertest(app).get("/routes/compatible-bikers/route-42");

    expect(res.status).toBe(200);
    expect(res.body.bikers).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Canary: PROTECTED_NICKNAMES constant integrity
// ═══════════════════════════════════════════════════════════════════════════════

describe("Canary — PROTECTED_NICKNAMES constant and source-level coverage", () => {
  it("constants.ts exports a non-empty PROTECTED_NICKNAMES array", async () => {
    const { PROTECTED_NICKNAMES } = await import("../constants");
    expect(Array.isArray(PROTECTED_NICKNAMES)).toBe(true);
    expect(PROTECTED_NICKNAMES.length).toBeGreaterThan(0);
  });

  it("PROTECTED_NICKNAMES includes 'BikerLink_Official'", async () => {
    const { PROTECTED_NICKNAMES } = await import("../constants");
    expect(PROTECTED_NICKNAMES).toContain("BikerLink_Official");
  });

  it("matching.ts references PROTECTED_NICKNAMES in executable SQL code", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../storage/matching.ts"), "utf-8");
    const execLines = src.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
    expect(execLines).toContain("PROTECTED_NICKNAMES");
  });

  it("proposals.ts references PROTECTED_NICKNAMES in executable SQL code", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../storage/proposals.ts"), "utf-8");
    const execLines = src.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
    expect(execLines).toContain("PROTECTED_NICKNAMES");
  });

  it("sharing.ts references PROTECTED_NICKNAMES in executable SQL code", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../routes/planned-routes/sharing.ts"), "utf-8");
    const execLines = src.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
    expect(execLines).toContain("PROTECTED_NICKNAMES");
  });
});
