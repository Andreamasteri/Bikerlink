/**
 * Regression guard — svcColor maps aihub probe results to the correct badge colour.
 *
 * Component under test: components/admin/ThinkCentreServiceBadge.tsx
 *
 * Why: Task #256 — the AI Hub badge was added to ServiceBadgeStrip with no test.
 * A future refactor of svcColor could silently change red→green for a failed probe.
 *
 * Strategy: import svcColor directly (exported for testability). Zero render needed.
 * React / React Native / Colors mocked only to allow module load.
 */

import { describe, it, expect, vi } from "vitest";

// ── mocks: allow module load without native runtime ──────────────────────────
vi.mock("react", () => ({
  default: { createElement: vi.fn() },
}));
vi.mock("react-native", () => ({
  View: {},
  Text: {},
  StyleSheet: { create: (s: unknown) => s },
}));
vi.mock("@/constants/colors", () => ({ default: { border: "#e5e7eb" } }));

// ── import the pure function under test ─────────────────────────────────────
import { svcColor } from "@/components/admin/ThinkCentreServiceBadge";

// ── tests ────────────────────────────────────────────────────────────────────
describe("svcColor — aihub badge colour", () => {
  it("returns red (#ef4444) when aihub probe fails (ok:false, configured:true)", () => {
    expect(
      svcColor({ key: "aihub", configured: true, ok: false })
    ).toBe("#ef4444");
  });

  it("returns green (#22c55e) when aihub probe succeeds (ok:true, configured:true)", () => {
    expect(
      svcColor({ key: "aihub", configured: true, ok: true })
    ).toBe("#22c55e");
  });

  it("returns grey (#6b7280) when aihub is not configured (configured:false)", () => {
    expect(
      svcColor({ key: "aihub", configured: false, ok: false })
    ).toBe("#6b7280");
  });

  it("returns amber (#f59e0b) when aihub is starting up (ok:false, startingUp:true)", () => {
    expect(
      svcColor({ key: "aihub", configured: true, ok: false, startingUp: true })
    ).toBe("#f59e0b");
  });

  it("returns grey (#6b7280) when service entry is undefined (probe not yet received)", () => {
    expect(svcColor(undefined)).toBe("#6b7280");
  });
});
