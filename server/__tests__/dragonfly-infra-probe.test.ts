import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Unit tests for probeDragonflyInfra() — ioredis PING branch.
 *
 * Verifica che il probe DragonflyDB usi un PING ioredis reale verso
 * TC_DRAGONFLY_URL (lo stesso URL del client applicativo), non un semplice
 * TCP connect o HTTP al TC agent.
 *
 * Casi critici:
 *   - PING riuscito → ok=true
 *   - PING rifiutato (auth, ECONNREFUSED, MaxClients) → ok=false
 *   - TC_DRAGONFLY_URL non impostato ma REDIS_PROBE_URL presente → modalità legacy HTTP
 *   - Nessuna variabile configurata → configured=false
 */

// ── ioredis mock ──────────────────────────────────────────────────────────────
// The production code does `import Redis from "ioredis"` (static), so vi.mock()
// intercepts it reliably. We expose mockPing/mockQuit via the constructor factory.
const mockPing = vi.fn<[], Promise<string>>();
const mockQuit = vi.fn<[], Promise<"OK">>();

vi.mock("ioredis", () => {
  const RedisMock = vi.fn(function () {
    return { ping: mockPing, quit: mockQuit };
  });
  return { default: RedisMock };
});

// ── fetch mock (for legacy HTTP probe branch) ─────────────────────────────────
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// ── module import (MUST come after vi.mock) ───────────────────────────────────
import { probeDragonflyInfra } from "../routes/admin/thinkcentre-health-infra-probes";
import Redis from "ioredis";
const MockRedis = Redis as unknown as ReturnType<typeof vi.fn>;

// ── helpers ───────────────────────────────────────────────────────────────────
const DRAGONFLY_URL = "redis://tc.internal:6380";

function makeHttpResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default implementations after clearAllMocks.
  mockQuit.mockResolvedValue("OK");
  // Clear all dragonfly-related env vars.
  delete process.env.TC_DRAGONFLY_URL;
  delete process.env.DRAGONFLY_PROBE_URL;
  delete process.env.REDIS_PROBE_URL;
  delete process.env.REDIS_PROBE_HOST;
  delete process.env.THINKCENTRE_AGENT_TOKEN;
});

afterEach(() => {
  delete process.env.TC_DRAGONFLY_URL;
  delete process.env.DRAGONFLY_PROBE_URL;
  delete process.env.REDIS_PROBE_URL;
  delete process.env.REDIS_PROBE_HOST;
  delete process.env.THINKCENTRE_AGENT_TOKEN;
});

// ── ioredis PING branch ───────────────────────────────────────────────────────

describe("probeDragonflyInfra — ioredis PING branch (TC_DRAGONFLY_URL set)", () => {
  it("returns ok=true when PING succeeds", async () => {
    process.env.TC_DRAGONFLY_URL = DRAGONFLY_URL;
    mockPing.mockResolvedValue("PONG");

    const result = await probeDragonflyInfra();

    expect(result.configured).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeTypeOf("number");
    expect(result.error).toBeUndefined();
    expect(MockRedis).toHaveBeenCalledTimes(1);
    expect(mockPing).toHaveBeenCalledTimes(1);
  });

  it("returns ok=false when PING rejects (connection refused)", async () => {
    process.env.TC_DRAGONFLY_URL = DRAGONFLY_URL;
    mockPing.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:6380"));

    const result = await probeDragonflyInfra();

    expect(result.configured).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/ECONNREFUSED/i);
  });

  it("returns ok=false when PING rejects (auth error)", async () => {
    process.env.TC_DRAGONFLY_URL = DRAGONFLY_URL;
    mockPing.mockRejectedValue(new Error("NOAUTH Authentication required"));

    const result = await probeDragonflyInfra();

    expect(result.configured).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/NOAUTH|Authentication/i);
  });

  it("returns ok=false when PING times out (simulated via rejection)", async () => {
    process.env.TC_DRAGONFLY_URL = DRAGONFLY_URL;
    // Simulate a timeout by rejecting with the same error the probe's race produces.
    mockPing.mockRejectedValue(new Error("PING timeout (3s)"));

    const result = await probeDragonflyInfra();

    expect(result.configured).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timeout/i);
  });

  it("calls quit() after a successful PING (disposable client cleanup)", async () => {
    process.env.TC_DRAGONFLY_URL = DRAGONFLY_URL;
    mockPing.mockResolvedValue("PONG");

    await probeDragonflyInfra();

    expect(mockQuit).toHaveBeenCalledTimes(1);
  });

  it("calls quit() after a failed PING (no resource leak)", async () => {
    process.env.TC_DRAGONFLY_URL = DRAGONFLY_URL;
    mockPing.mockRejectedValue(new Error("ECONNREFUSED"));

    await probeDragonflyInfra();

    expect(mockQuit).toHaveBeenCalledTimes(1);
  });

  it("masks credentials in the returned URL", async () => {
    process.env.TC_DRAGONFLY_URL = "redis://:secret-password@tc.internal:6380";
    mockPing.mockResolvedValue("PONG");

    const result = await probeDragonflyInfra();

    // The returned URL must not expose the raw password.
    expect(result.url).not.toContain("secret-password");
  });

  it("does NOT call the HTTP fetch path when TC_DRAGONFLY_URL is set", async () => {
    process.env.TC_DRAGONFLY_URL = DRAGONFLY_URL;
    process.env.REDIS_PROBE_URL = "https://tc.biker-link.net/probe/redis";
    mockPing.mockResolvedValue("PONG");

    await probeDragonflyInfra();

    // ioredis branch takes precedence — legacy HTTP must not fire.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT create an ioredis client when TC_DRAGONFLY_URL is unset", async () => {
    // No TC_DRAGONFLY_URL — should fall through to legacy path.
    process.env.REDIS_PROBE_URL = "https://tc.biker-link.net/probe/redis";
    fetchMock.mockResolvedValue(makeHttpResponse(200, "ok"));

    await probeDragonflyInfra();

    expect(MockRedis).not.toHaveBeenCalled();
  });
});

// ── Legacy HTTP probe branch ──────────────────────────────────────────────────

describe("probeDragonflyInfra — legacy HTTP branch (TC_DRAGONFLY_URL unset)", () => {
  it("uses HTTP probe via REDIS_PROBE_URL when TC_DRAGONFLY_URL is not set", async () => {
    process.env.REDIS_PROBE_URL = "https://tc.biker-link.net/probe/redis";
    process.env.THINKCENTRE_AGENT_TOKEN = "test-token";
    fetchMock.mockResolvedValue(makeHttpResponse(200, "ok"));

    const result = await probeDragonflyInfra();

    expect(result.configured).toBe(true);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(MockRedis).not.toHaveBeenCalled();
  });

  it("returns ok=false when HTTP probe returns 401", async () => {
    process.env.REDIS_PROBE_URL = "https://tc.biker-link.net/probe/redis";
    process.env.THINKCENTRE_AGENT_TOKEN = "wrong-token";
    fetchMock.mockResolvedValue(makeHttpResponse(401, "Unauthorized"));

    const result = await probeDragonflyInfra();

    expect(result.configured).toBe(true);
    expect(result.ok).toBe(false);
    // Error is set (exact format depends on sanitizeError's env — just check truthy).
    expect(result.error).toBeTruthy();
  });
});

// ── Not configured ────────────────────────────────────────────────────────────

describe("probeDragonflyInfra — no configuration", () => {
  it("returns configured=false when no DragonflyDB env vars are set", async () => {
    const result = await probeDragonflyInfra();

    expect(result.configured).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBeNull();
    expect(result.url).toBeNull();
    expect(MockRedis).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
