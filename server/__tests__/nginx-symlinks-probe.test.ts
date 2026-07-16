import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Unit tests for probeNginxSymlinksInfra().
 *
 * The critical case: the TC agent returns HTTP 503 (not 2xx) when it detects
 * non-symlink entries in sites-enabled/, but still includes the full JSON body
 * { ok: false, nonSymlinks: ["openwebui"] }. The probe must parse that body
 * regardless of HTTP status — bailing on !res.ok would silently discard the
 * list of offending vhost names.
 */

// ── fetch mock (hoisted) ──────────────────────────────────────────────────────
const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal Response-like object with JSON body */
function makeResponse(status: number, body: unknown): Response {
  const json = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(JSON.parse(json)),
  } as unknown as Response;
}

/** Build a response whose json() rejects (malformed body) */
function makeBadJsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new Error("SyntaxError: Unexpected token")),
  } as unknown as Response;
}

// ── module import (after mocks) ───────────────────────────────────────────────
import { probeNginxSymlinksInfra } from "../routes/admin/thinkcentre-health-infra-probes";

// ── env setup ─────────────────────────────────────────────────────────────────
const MONITOR_URL = "https://tc.biker-link.net/probe/nginx";

beforeEach(() => {
  process.env.NGINX_MONITOR_URL = MONITOR_URL;
  process.env.THINKCENTRE_AGENT_TOKEN = "test-token";
  fetchMock.mockReset();
});

afterEach(() => {
  delete process.env.NGINX_MONITOR_URL;
  delete process.env.THINKCENTRE_AGENT_TOKEN;
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("probeNginxSymlinksInfra", () => {
  it("returns ok=true with empty nonSymlinks when agent reports all symlinks (HTTP 200)", async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { ok: true, nonSymlinks: [], dir: "/etc/nginx/sites-enabled" }));

    const result = await probeNginxSymlinksInfra();

    expect(result.configured).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.nonSymlinks).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it("returns ok=false with populated nonSymlinks even when agent returns HTTP 503 (critical case)", async () => {
    // The agent returns 503 when ok=false, but body still has the offending names.
    fetchMock.mockResolvedValue(
      makeResponse(503, { ok: false, nonSymlinks: ["openwebui"], dir: "/etc/nginx/sites-enabled" }),
    );

    const result = await probeNginxSymlinksInfra();

    expect(result.configured).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.nonSymlinks).toEqual(["openwebui"]);
  });

  it("handles multiple non-symlink entries reported via 503", async () => {
    fetchMock.mockResolvedValue(
      makeResponse(503, { ok: false, nonSymlinks: ["openwebui", "searxng-extra"], dir: "/etc/nginx/sites-enabled" }),
    );

    const result = await probeNginxSymlinksInfra();

    expect(result.ok).toBe(false);
    expect(result.nonSymlinks).toEqual(["openwebui", "searxng-extra"]);
  });

  it("returns ok=false with empty nonSymlinks when body is unparseable (non-JSON error page)", async () => {
    fetchMock.mockResolvedValue(makeBadJsonResponse(502));

    const result = await probeNginxSymlinksInfra();

    expect(result.configured).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.nonSymlinks).toEqual([]);
    expect(result.error).toMatch(/unparseable/i);
  });

  it("returns configured=false and ok=true when NGINX_MONITOR_URL is unset", async () => {
    delete process.env.NGINX_MONITOR_URL;

    const result = await probeNginxSymlinksInfra();

    expect(result.configured).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.nonSymlinks).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the symlinks endpoint derived from NGINX_MONITOR_URL", async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { ok: true, nonSymlinks: [] }));

    await probeNginxSymlinksInfra();

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe("https://tc.biker-link.net/probe/nginx-symlinks");
  });

  it("sends X-Agent-Token header when THINKCENTRE_AGENT_TOKEN is set", async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { ok: true, nonSymlinks: [] }));

    await probeNginxSymlinksInfra();

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers?.["X-Agent-Token"]).toBe("test-token");
  });

  it("returns ok=false when fetch itself throws (network error)", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await probeNginxSymlinksInfra();

    expect(result.configured).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.nonSymlinks).toEqual([]);
    expect(result.error).toBeDefined();
  });
});
