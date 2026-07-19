/**
 * Task #800 — GET / must return 200 under a DB/session spike.
 *
 * Covers two fail-open guards introduced in Task #796:
 *   1. The session middleware wrapper (server/routes.ts:184-194) calls next()
 *      even when the store fires an error — a broken store must NOT cascade to 500.
 *   2. recordVisit (server/lib/visitor-tracking.ts) is fire-and-forget guarded
 *      by the bg-db-limiter kill-switch — any error there is swallowed.
 *
 * Without these guards, an overloaded DB pool that makes the session store
 * time-out would turn every GET / into a 500, breaking the public landing page
 * and the deploy-probe health check.
 *
 * The test builds a minimal Express app that mirrors the production wiring:
 *   - session middleware with a store that always fires an error
 *   - registerSiteRoutes() (tracking middleware + GET / page builder)
 * All DB-touching modules are mocked so the test is deterministic and fast.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import session from "express-session";

// ─── DB mock ──────────────────────────────────────────────────────────────────
vi.mock("../db", async () => {
  const { createDbMock } = await import("./helpers/db-mock");
  return createDbMock();
});

// ─── Storage mock ─────────────────────────────────────────────────────────────
vi.mock("../storage", () => ({
  storage: {
    getAppSetting: vi.fn().mockResolvedValue(null),
  },
}));

// ─── init-state: boot is fully complete ───────────────────────────────────────
vi.mock("../init-state", () => ({
  initState: { initializing: false, dbReady: true },
}));

// ─── site/render: lightweight stub ────────────────────────────────────────────
vi.mock("../site/render", () => ({
  renderPage: (_meta: unknown, body: string, _baseUrl: string) =>
    `<!doctype html><html lang="it"><head><title>BikerLink</title></head><body>${body}</body></html>`,
  getBaseUrl: (_req: unknown) => "https://bikerlink.app",
}));

// ─── site/pages: minimal stubs for every builder registerSiteRoutes references ─
vi.mock("../site/pages", () => {
  const stub = () => ({
    meta: { title: "BikerLink", description: "", canonical: "", ogImage: "" },
    body: "<main>stub</main>",
  });
  return {
    buildHome: stub,
    buildFeatures: stub,
    buildSos: stub,
    buildMotoclub: stub,
    buildCommunity: stub,
    buildDownload: stub,
    buildAbout: stub,
    buildFaq: stub,
    buildContact: stub,
    buildMatchingOverview: stub,
    buildMatchingHowItWorks: stub,
    buildMatchingTypes: stub,
    buildMatchingLearning: stub,
    buildMatchingAI: stub,
    buildMatchingPrivacy: stub,
    buildMatchingInvestors: stub,
  };
});

// ─── site/routes.part2: no-op stubs ───────────────────────────────────────────
vi.mock("../site/routes.part2", () => ({
  registerLegacyRedirects: vi.fn(),
  registerStaticLegalPages: vi.fn(),
  registerRobotsAndSitemap: vi.fn(),
  registerLlmGuide: vi.fn(),
}));

// ─── visitor-tracking: spy on recordVisit / ensureVisitorId ───────────────────
vi.mock("../lib/visitor-tracking", () => ({
  ensureVisitorId: (_req: Request, _res: Response) => "test-visitor-id",
  recordVisit: vi.fn(), // fire-and-forget — errors must not propagate
  VISITOR_COOKIE_NAME: "bl_vid",
  hashIp: vi.fn(() => null),
  ipPrefix: vi.fn(() => null),
  parseVisitorCookie: vi.fn(() => null),
}));

// ─── session-health: silence the alert logs ───────────────────────────────────
vi.mock("../session-health", () => ({
  recordSessionError: vi.fn(),
  recordSessionSuccess: vi.fn(),
}));

import { recordVisit } from "../lib/visitor-tracking";
import { registerSiteRoutes } from "../site/routes";

// ─── A connect-compatible session store whose every I/O call fires an error ───
function makeBrokenStore(): session.Store {
  class BrokenStore extends session.Store {
    get(_sid: string, cb: (err: unknown, sess?: session.SessionData | null) => void) {
      cb(new Error("DB spike — cannot read session"));
    }
    set(_sid: string, _sess: session.SessionData, cb?: (err?: unknown) => void) {
      if (cb) cb(new Error("DB spike — cannot write session"));
    }
    destroy(_sid: string, cb?: (err?: unknown) => void) {
      if (cb) cb(new Error("DB spike — cannot destroy session"));
    }
  }
  return new BrokenStore();
}

/**
 * Builds the minimal Express app matching the production wiring:
 *   server/routes.ts    → fail-open session middleware wrapper
 *   server/site/routes.ts → tracking middleware + page routes
 */
function buildApp(): express.Application {
  const app = express();

  // Fail-open session wrapper — mirrors server/routes.ts lines 186-194.
  const sessionMiddleware = session({
    store: makeBrokenStore(),
    secret: "test-secret",
    resave: false,
    saveUninitialized: false,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    sessionMiddleware(req, res, (err?: unknown) => {
      if (err) {
        // Swallow the error just like production does — proceed without a session.
        return next();
      }
      next();
    });
  });

  // Site routes: tracking middleware + page builders (GET /, /features, …).
  registerSiteRoutes(app);

  return app;
}

// Build once — store is always-failing throughout the entire suite.
const app = buildApp();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET / — session store always fails (simulated DB spike)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 even when the session store fires an error on every call", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
  });

  it("returns HTML, not a JSON 500 error body", async () => {
    const res = await request(app).get("/");
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    // Confirm we got actual page content, not an error payload.
    expect(res.text).toContain("<!doctype html");
  });

  it("does NOT hang — completes within the test timeout", async () => {
    // supertest itself enforces the timeout; this test documents the requirement.
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
  });

  it("recordVisit errors are swallowed by the tracking middleware try/catch", async () => {
    // Simulate a synchronous throw inside recordVisit — the worst case
    // where fire-and-forget itself crashes before the promise is even created.
    vi.mocked(recordVisit).mockImplementation(() => {
      throw new Error("simulated recordVisit synchronous crash");
    });
    const res = await request(app).get("/");
    // The try/catch in site/routes.ts must absorb the error — still 200.
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
  });
});

describe("GET / — no session cookie sent (anonymous browser request)", () => {
  it("returns 200 without any session cookie on the request", async () => {
    const res = await request(app).get("/").set("Cookie", "");
    expect(res.status).toBe(200);
  });
});
