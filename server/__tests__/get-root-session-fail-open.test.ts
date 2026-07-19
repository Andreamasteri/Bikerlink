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
    // mockImplementationOnce ensures the throw only applies to this one call
    // and does NOT contaminate later test suites (vi.clearAllMocks resets
    // call counts but not persistent mockImplementation overrides).
    vi.mocked(recordVisit).mockImplementationOnce(() => {
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

// ─── Timing / concurrency suite ───────────────────────────────────────────────
//
// Context: the production session pool has connectionTimeoutMillis=10000.  If
// the pool cannot acquire a connection within that window, connect-pg-simple
// calls its store callback with an error — and the fail-open wrapper in
// server/routes.ts then calls next().  That means every GET / during a DB
// outage could stall for up to 10 s before the page is served.
//
// These tests use a store that deliberately delays its error callback by
// STORE_DELAY_MS to simulate a slow (but not infinitely hung) connection
// timeout.  They assert:
//   1. Each individual response arrives well within the delay plus overhead.
//   2. N concurrent requests complete in roughly the same wall time as a single
//      request — i.e., the middleware does NOT serialise them.
// ─────────────────────────────────────────────────────────────────────────────

/** Simulates a session store whose I/O takes `delayMs` before calling back
 *  with an error — analogous to a DB connection that times out slowly. */
function makeDelayedBrokenStore(delayMs: number): session.Store {
  class DelayedBrokenStore extends session.Store {
    get(
      _sid: string,
      cb: (err: unknown, sess?: session.SessionData | null) => void,
    ) {
      setTimeout(() => cb(new Error(`store timeout after ${delayMs}ms`)), delayMs);
    }
    set(
      _sid: string,
      _sess: session.SessionData,
      cb?: (err?: unknown) => void,
    ) {
      setTimeout(
        () => (cb ? cb(new Error(`store timeout after ${delayMs}ms`)) : undefined),
        delayMs,
      );
    }
    destroy(_sid: string, cb?: (err?: unknown) => void) {
      setTimeout(
        () => (cb ? cb(new Error(`store timeout after ${delayMs}ms`)) : undefined),
        delayMs,
      );
    }
  }
  return new DelayedBrokenStore();
}

/** Mirrors buildApp() but uses the delayed store so we can measure timing. */
function buildDelayedApp(storeDelayMs: number): express.Application {
  const app = express();

  const sessionMiddleware = session({
    store: makeDelayedBrokenStore(storeDelayMs),
    secret: "test-secret",
    resave: false,
    saveUninitialized: false,
  });

  // Fail-open wrapper — identical to the production guard in server/routes.ts.
  app.use((req: Request, res: Response, next: NextFunction) => {
    sessionMiddleware(req, res, (err?: unknown) => {
      if (err) return next();
      next();
    });
  });

  registerSiteRoutes(app);
  return app;
}

/**
 * Returns the median value from a sorted or unsorted number array.
 * Uses the lower-median for even-length arrays.
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

describe("GET / — response-time under concurrent session-store delays", () => {
  // Keep the delay short so CI stays fast; long enough to be measurable.
  const STORE_DELAY_MS = 50;
  // Concurrency: enough to detect serialisation without overwhelming the runner.
  const CONCURRENCY = 10;
  // Per-request budget: generous enough to absorb CI jitter while still being
  // far below the production connectionTimeoutMillis=10000ms risk we are guarding.
  const PER_REQUEST_THRESHOLD_MS = 500;

  let delayedApp: express.Application;
  beforeEach(() => {
    vi.clearAllMocks();
    delayedApp = buildDelayedApp(STORE_DELAY_MS);
  });

  it("median response time stays below threshold when the store is slow", async () => {
    const durations: number[] = [];

    for (let i = 0; i < CONCURRENCY; i++) {
      const t0 = Date.now();
      const res = await request(delayedApp).get("/");
      durations.push(Date.now() - t0);
      expect(res.status).toBe(200);
    }

    const med = median(durations);
    expect(med).toBeLessThan(PER_REQUEST_THRESHOLD_MS);
  });

  it("N concurrent requests finish in roughly the same wall time as one request (no serialisation)", async () => {
    // Fire all N requests simultaneously and measure total wall time.
    const t0 = Date.now();
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => request(delayedApp).get("/")),
    );
    const wallMs = Date.now() - t0;

    // Every response must be 200.
    for (const res of results) {
      expect(res.status).toBe(200);
    }

    // If requests were serialised, total wall time ≥ CONCURRENCY * STORE_DELAY_MS
    // (10 × 50 ms = 500 ms).  Concurrent execution must complete in much less.
    // We cap at PER_REQUEST_THRESHOLD_MS (500 ms) — generous for CI jitter while
    // still proving requests are not queued serially behind each other.
    const concurrentThreshold = PER_REQUEST_THRESHOLD_MS;
    expect(wallMs).toBeLessThan(concurrentThreshold);
  });

  it("each individual response arrives within the per-request threshold even under concurrency", async () => {
    const timings = await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        const t0 = Date.now();
        const res = await request(delayedApp).get("/");
        return { status: res.status, durationMs: Date.now() - t0 };
      }),
    );

    for (const { status, durationMs } of timings) {
      expect(status).toBe(200);
      expect(durationMs).toBeLessThan(PER_REQUEST_THRESHOLD_MS);
    }
  });

  it("fail-open still returns HTML (not an error body) when the store is slow", async () => {
    const res = await request(delayedApp).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("<!doctype html");
  });
});
