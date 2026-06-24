/**
 * Guard the business-scoped reach view (Task #4917) with server-side tests so it
 * can't break silently (Task #4930).
 *
 * Covers the exact contract the titolare self-service view depends on:
 *  1. Public GET /api/businesses/reach/:token
 *     - valid token returns the aggregate self report
 *     - bad/unknown token returns 404
 *     - empty/whitespace token returns 404 (never reaches storage)
 *     - ?month=YYYY-MM filtering is forwarded to storage
 *     - invalid month value falls back to the current month
 *     - the response shape NEVER includes per-rider / individual fields
 *  2. Admin token generate/revoke:
 *     - POST /api/admin/business/:id/access-token returns a fresh token
 *     - POST on unknown business returns 404
 *     - DELETE /api/admin/business/:id/access-token revokes (accessToken: null)
 *     - DELETE on unknown business returns 404
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock state — must be declared before any vi.mock() call
// ---------------------------------------------------------------------------

const {
  mockGetBusinessByAccessToken,
  mockGetBusinessSelfReport,
  mockSetBusinessAccessToken,
} = vi.hoisted(() => ({
  mockGetBusinessByAccessToken: vi.fn(),
  mockGetBusinessSelfReport: vi.fn(),
  mockSetBusinessAccessToken: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../storage", () => ({
  storage: {
    getBusinessByAccessToken: mockGetBusinessByAccessToken,
    getBusinessSelfReport: mockGetBusinessSelfReport,
    setBusinessAccessToken: mockSetBusinessAccessToken,
  },
}));

// ---------------------------------------------------------------------------
// Imports under test — after mocks
// ---------------------------------------------------------------------------

import businessRoutes from "../routes/businesses";
import adminBusinessRouter from "../routes/admin/business";

// ---------------------------------------------------------------------------
// Test app builders
// ---------------------------------------------------------------------------

function buildPublicApp(): express.Application {
  const app = express();
  app.use(express.json());
  // Mounted exactly as the real server mounts it (server/routes.ts).
  app.use("/api/businesses", businessRoutes);
  return app;
}

function buildAdminApp(): express.Application {
  const app = express();
  app.use(express.json());
  // The real server mounts the admin business router under /api/admin behind
  // _requireAdmin; here we mount it directly to exercise the route handlers
  // (auth is covered elsewhere).
  app.use("/api/admin", adminBusinessRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_BUSINESS = {
  id: "biz-1",
  name: "Bar Curva",
  type: "bar",
  accessToken: "valid-token",
};

/** A full aggregate self-report exactly as getBusinessSelfReport returns it. */
function buildSelfReport(periodMonth: string) {
  return {
    businessId: "biz-1",
    name: "Bar Curva",
    type: "bar",
    periodMonth,
    qualifiedPassages: 42,
    uniqueRiders: 17,
    radiusM: 150,
    computedAt: new Date("2026-06-01T00:00:00.000Z"),
    clicks: 9,
    clicksByAction: { call: 4, directions: 3, website: 2 },
    availableMonths: ["2026-06", "2026-05"],
  };
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Fields that would leak individual rider data — these must NEVER appear.
const FORBIDDEN_FIELDS = [
  "userId",
  "userIds",
  "riderId",
  "riderIds",
  "riders",
  "sessions",
  "sessionId",
  "sessionIds",
  "lat",
  "lon",
  "latitude",
  "longitude",
  "points",
  "telemetry",
  "tracks",
];

// ---------------------------------------------------------------------------
// Suite 1 — Public GET /api/businesses/reach/:token
// ---------------------------------------------------------------------------

describe("GET /api/businesses/reach/:token — public self-service reach", () => {
  beforeEach(() => {
    mockGetBusinessByAccessToken.mockReset();
    mockGetBusinessSelfReport.mockReset();
  });

  it("valid token returns the aggregate report (200)", async () => {
    mockGetBusinessByAccessToken.mockResolvedValue(FAKE_BUSINESS);
    mockGetBusinessSelfReport.mockResolvedValue(buildSelfReport(currentMonth()));

    const res = await request(buildPublicApp()).get("/api/businesses/reach/valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      businessId: "biz-1",
      qualifiedPassages: 42,
      uniqueRiders: 17,
      clicks: 9,
    });
    expect(mockGetBusinessByAccessToken).toHaveBeenCalledWith("valid-token");
  });

  it("unknown token returns 404 and never queries the report", async () => {
    mockGetBusinessByAccessToken.mockResolvedValue(undefined);

    const res = await request(buildPublicApp()).get("/api/businesses/reach/nope");

    expect(res.status).toBe(404);
    expect(mockGetBusinessSelfReport).not.toHaveBeenCalled();
  });

  it("empty/whitespace token returns 404 without hitting storage", async () => {
    // A single space is trimmed to "" by the handler → 404 before any lookup.
    const res = await request(buildPublicApp()).get("/api/businesses/reach/%20");

    expect(res.status).toBe(404);
    expect(mockGetBusinessByAccessToken).not.toHaveBeenCalled();
    expect(mockGetBusinessSelfReport).not.toHaveBeenCalled();
  });

  it("returns 404 when the report itself is null (deleted business)", async () => {
    mockGetBusinessByAccessToken.mockResolvedValue(FAKE_BUSINESS);
    mockGetBusinessSelfReport.mockResolvedValue(null);

    const res = await request(buildPublicApp()).get("/api/businesses/reach/valid-token");

    expect(res.status).toBe(404);
  });

  it("?month=YYYY-MM is forwarded to the report query", async () => {
    mockGetBusinessByAccessToken.mockResolvedValue(FAKE_BUSINESS);
    mockGetBusinessSelfReport.mockResolvedValue(buildSelfReport("2026-03"));

    const res = await request(buildPublicApp()).get(
      "/api/businesses/reach/valid-token?month=2026-03",
    );

    expect(res.status).toBe(200);
    expect(mockGetBusinessSelfReport).toHaveBeenCalledWith("biz-1", "2026-03");
  });

  it("invalid month falls back to the current month", async () => {
    mockGetBusinessByAccessToken.mockResolvedValue(FAKE_BUSINESS);
    mockGetBusinessSelfReport.mockResolvedValue(buildSelfReport(currentMonth()));

    const res = await request(buildPublicApp()).get(
      "/api/businesses/reach/valid-token?month=not-a-month",
    );

    expect(res.status).toBe(200);
    expect(mockGetBusinessSelfReport).toHaveBeenCalledWith("biz-1", currentMonth());
  });

  it("malformed month (wrong shape) also falls back to the current month", async () => {
    mockGetBusinessByAccessToken.mockResolvedValue(FAKE_BUSINESS);
    mockGetBusinessSelfReport.mockResolvedValue(buildSelfReport(currentMonth()));

    // 2026-3 (single-digit month) does NOT match /^\d{4}-\d{2}$/.
    const res = await request(buildPublicApp()).get(
      "/api/businesses/reach/valid-token?month=2026-3",
    );

    expect(res.status).toBe(200);
    expect(mockGetBusinessSelfReport).toHaveBeenCalledWith("biz-1", currentMonth());
  });

  it("returns 500 when storage throws", async () => {
    mockGetBusinessByAccessToken.mockRejectedValue(new Error("db down"));

    const res = await request(buildPublicApp()).get("/api/businesses/reach/valid-token");

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Privacy guarantee: aggregate-only, no per-rider data
// ---------------------------------------------------------------------------

describe("GET /api/businesses/reach/:token — privacy (aggregate-only)", () => {
  beforeEach(() => {
    mockGetBusinessByAccessToken.mockReset();
    mockGetBusinessSelfReport.mockReset();
  });

  it("response never includes per-rider / individual tracking fields", async () => {
    mockGetBusinessByAccessToken.mockResolvedValue(FAKE_BUSINESS);
    mockGetBusinessSelfReport.mockResolvedValue(buildSelfReport(currentMonth()));

    const res = await request(buildPublicApp()).get("/api/businesses/reach/valid-token");

    expect(res.status).toBe(200);
    const keys = Object.keys(res.body);
    for (const forbidden of FORBIDDEN_FIELDS) {
      expect(keys).not.toContain(forbidden);
    }
    // uniqueRiders is a COUNT, not a list — assert it stays a number.
    expect(typeof res.body.uniqueRiders).toBe("number");
    expect(Array.isArray(res.body.uniqueRiders)).toBe(false);
  });

  it("only exposes the known aggregate field set (no extra leaked keys)", async () => {
    mockGetBusinessByAccessToken.mockResolvedValue(FAKE_BUSINESS);
    mockGetBusinessSelfReport.mockResolvedValue(buildSelfReport(currentMonth()));

    const res = await request(buildPublicApp()).get("/api/businesses/reach/valid-token");

    const allowed = new Set([
      "businessId",
      "name",
      "type",
      "periodMonth",
      "qualifiedPassages",
      "uniqueRiders",
      "radiusM",
      "computedAt",
      "clicks",
      "clicksByAction",
      "availableMonths",
    ]);
    for (const key of Object.keys(res.body)) {
      expect(allowed.has(key)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Admin token generate / revoke
// ---------------------------------------------------------------------------

describe("Admin access-token generate/revoke", () => {
  beforeEach(() => {
    mockSetBusinessAccessToken.mockReset();
  });

  it("POST /business/:id/access-token returns a fresh token", async () => {
    mockSetBusinessAccessToken.mockImplementation(async (id: string, token: string | null) => ({
      id,
      accessToken: token,
    }));

    const res = await request(buildAdminApp()).post("/api/admin/business/biz-1/access-token");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("biz-1");
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.accessToken.length).toBeGreaterThan(0);
    // Storage was asked to persist a non-null token for this business.
    expect(mockSetBusinessAccessToken).toHaveBeenCalledTimes(1);
    const [calledId, calledToken] = mockSetBusinessAccessToken.mock.calls[0];
    expect(calledId).toBe("biz-1");
    expect(typeof calledToken).toBe("string");
    expect((calledToken as string).length).toBeGreaterThan(0);
  });

  it("POST on unknown business returns 404", async () => {
    mockSetBusinessAccessToken.mockResolvedValue(undefined);

    const res = await request(buildAdminApp()).post("/api/admin/business/ghost/access-token");

    expect(res.status).toBe(404);
  });

  it("DELETE /business/:id/access-token revokes the token (null)", async () => {
    mockSetBusinessAccessToken.mockImplementation(async (id: string, token: string | null) => ({
      id,
      accessToken: token,
    }));

    const res = await request(buildAdminApp()).delete("/api/admin/business/biz-1/access-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "biz-1", accessToken: null });
    expect(mockSetBusinessAccessToken).toHaveBeenCalledWith("biz-1", null);
  });

  it("DELETE on unknown business returns 404", async () => {
    mockSetBusinessAccessToken.mockResolvedValue(undefined);

    const res = await request(buildAdminApp()).delete("/api/admin/business/ghost/access-token");

    expect(res.status).toBe(404);
  });

  it("generated tokens are unique across calls", async () => {
    const captured: string[] = [];
    mockSetBusinessAccessToken.mockImplementation(async (id: string, token: string | null) => {
      captured.push(token as string);
      return { id, accessToken: token };
    });

    await request(buildAdminApp()).post("/api/admin/business/biz-1/access-token");
    await request(buildAdminApp()).post("/api/admin/business/biz-1/access-token");

    expect(captured).toHaveLength(2);
    expect(captured[0]).not.toBe(captured[1]);
  });

  it("returns 500 when storage throws on generate", async () => {
    mockSetBusinessAccessToken.mockRejectedValue(new Error("db down"));

    const res = await request(buildAdminApp()).post("/api/admin/business/biz-1/access-token");

    expect(res.status).toBe(500);
  });
});
