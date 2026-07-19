/**
 * Unit tests — redis-tunnel parseExitReason() classifier (Task #825)
 *
 * Covers the pattern-matching logic that classifies cloudflared exits and
 * surfaces the `lastExitReason` label in getRedisTunnelStatus() / admin panel TC.
 *
 * Confirmed DNS-failure strings come from the July 2026 incident
 * (Sentry #126649029, restart flood #157):
 *   systemd-resolved returned "server misbehaving" / "i/o timeout" on
 *   argotunnel.com SRV lookups → cloudflared couldn't discover an edge IP.
 */

import { describe, it, expect } from "vitest";
import { parseExitReason } from "../cache/redis-tunnel";

// ── DNS failure ───────────────────────────────────────────────────────────────

describe("parseExitReason — dns_failure", () => {
  it('classifies "server misbehaving" (Jul-2026 incident string)', () => {
    expect(parseExitReason("server misbehaving", 1, null)).toBe("dns_failure");
  });

  it('classifies "i/o timeout" (Jul-2026 incident string)', () => {
    expect(parseExitReason("i/o timeout", 1, null)).toBe("dns_failure");
  });

  it('classifies "unable to lookup" pattern', () => {
    expect(parseExitReason("unable to lookup argotunnel.com: no such host", 1, null)).toBe("dns_failure");
  });

  it('classifies "edge discovery" pattern', () => {
    expect(parseExitReason("failed edge discovery: dial tcp", 1, null)).toBe("dns_failure");
  });

  it('classifies "argotunnel" bare hostname', () => {
    expect(parseExitReason("lookup argotunnel.com: i/o timeout", 1, null)).toBe("dns_failure");
  });

  it("is case-insensitive (uppercase I/O Timeout)", () => {
    expect(parseExitReason("I/O Timeout connecting to argotunnel.com", 1, null)).toBe("dns_failure");
  });

  it("classifies from a multi-sentence line containing the pattern", () => {
    const line =
      'ERR Failed to connect to edge: lookup argotunnel.com on 127.0.0.53:53: server misbehaving';
    expect(parseExitReason(line, 1, null)).toBe("dns_failure");
  });
});

// ── Auth failure ──────────────────────────────────────────────────────────────

describe("parseExitReason — auth", () => {
  it('classifies "401" status in output', () => {
    expect(parseExitReason("HTTP 401 Unauthorized from Cloudflare Access", 1, null)).toBe("auth");
  });

  it('classifies "unauthorized" keyword', () => {
    expect(parseExitReason("unauthorized: service token rejected", 1, null)).toBe("auth");
  });

  it('classifies "authentication failed"', () => {
    expect(parseExitReason("authentication failed for service token", 1, null)).toBe("auth");
  });

  it('classifies "access denied"', () => {
    expect(parseExitReason("access denied by Cloudflare policy", 1, null)).toBe("auth");
  });

  it('classifies "invalid token"', () => {
    expect(parseExitReason("invalid token: malformed JWT", 1, null)).toBe("auth");
  });
});

// ── OOM (SIGKILL with no meaningful output) ───────────────────────────────────

describe("parseExitReason — oom", () => {
  it("classifies SIGKILL with null lastOutputLine", () => {
    expect(parseExitReason(null, null, "SIGKILL")).toBe("oom");
  });

  it("classifies SIGKILL even if output is an empty string", () => {
    expect(parseExitReason("", null, "SIGKILL")).toBe("oom");
  });

  it("classifies SIGKILL + code 137 (the typical OOM-kill combo from Node child_process)", () => {
    // Node reports both signal="SIGKILL" and code=137 for an OOM kill.
    expect(parseExitReason("some unrelated line", 137, "SIGKILL")).toBe("oom");
  });

  it("code 137 without a signal falls through to unknown (not a Node OOM-kill shape)", () => {
    // The code===137 guard is inside if(signal); without a signal it is unreachable
    // by design (Node's child_process always sets signal for OOM kills).
    expect(parseExitReason(null, 137, null)).toBe("unknown");
  });
});

// ── Signal (non-SIGKILL) ──────────────────────────────────────────────────────

describe("parseExitReason — signal", () => {
  it("classifies SIGTERM as signal", () => {
    expect(parseExitReason(null, null, "SIGTERM")).toBe("signal");
  });

  it("classifies an unexpected SIGHUP as signal", () => {
    expect(parseExitReason("watchdog sent SIGHUP", null, "SIGHUP")).toBe("signal");
  });
});

// ── Unknown ───────────────────────────────────────────────────────────────────

describe("parseExitReason — unknown", () => {
  it("returns unknown for unrecognised output and normal exit code", () => {
    expect(parseExitReason("connection reset by peer", 1, null)).toBe("unknown");
  });

  it("returns unknown when lastOutputLine is null and no signal", () => {
    expect(parseExitReason(null, 1, null)).toBe("unknown");
  });

  it("returns unknown for empty output and exit code 1", () => {
    expect(parseExitReason("", 1, null)).toBe("unknown");
  });

  it("returns unknown for exit code 0 with no output (clean shutdown not caught here)", () => {
    // shuttingDown guard is upstream; here we just verify the classifier itself
    expect(parseExitReason(null, 0, null)).toBe("unknown");
  });
});
