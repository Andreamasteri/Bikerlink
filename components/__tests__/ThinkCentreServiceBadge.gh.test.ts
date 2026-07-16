/**
 * Regression guard — ghBadgeColor maps GraphHopper multi-area probe results to the
 * correct badge colour.
 *
 * Component under test: components/admin/ThinkCentreServiceBadge.tsx
 *
 * Why: the partial-online (amber) and all-starting-up (amber vs red) branches had
 * never been exercised by a test. A regression could show green when only half the
 * routing areas are healthy, or red when they are just loading.
 *
 * Strategy: import ghBadgeColor directly (exported for testability). Zero render needed.
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
import { ghBadgeColor } from "@/components/admin/ThinkCentreServiceBadge";
import type { ThinkCentreHealthMini } from "@/components/admin/ThinkCentreServiceBadge";

// ── helpers ──────────────────────────────────────────────────────────────────
function makeData(
  areas: { enabled: boolean; ok: boolean; startingUp?: boolean }[],
  graphhopperConfigured = true
): ThinkCentreHealthMini {
  return {
    services: [],
    graphhopperConfigured,
    graphhopperAreas: areas,
  };
}

// ── tests ────────────────────────────────────────────────────────────────────
describe("ghBadgeColor — GraphHopper multi-area badge colour", () => {
  it("returns green (#22c55e) when all enabled areas are ok", () => {
    const data = makeData([
      { enabled: true, ok: true },
      { enabled: true, ok: true },
    ]);
    expect(ghBadgeColor(data)).toBe("#22c55e");
  });

  it("returns red (#ef4444) when all enabled areas are down and none are startingUp", () => {
    const data = makeData([
      { enabled: true, ok: false },
      { enabled: true, ok: false },
    ]);
    expect(ghBadgeColor(data)).toBe("#ef4444");
  });

  it("returns amber (#f59e0b) when all enabled areas are down but at least one is startingUp", () => {
    const data = makeData([
      { enabled: true, ok: false, startingUp: true },
      { enabled: true, ok: false },
    ]);
    expect(ghBadgeColor(data)).toBe("#f59e0b");
  });

  it("returns amber (#f59e0b) for a mix of ok and down enabled areas", () => {
    const data = makeData([
      { enabled: true, ok: true },
      { enabled: true, ok: false },
    ]);
    expect(ghBadgeColor(data)).toBe("#f59e0b");
  });

  it("returns grey (#6b7280) when graphhopperConfigured is false", () => {
    const data = makeData(
      [{ enabled: true, ok: true }],
      false
    );
    expect(ghBadgeColor(data)).toBe("#6b7280");
  });

  it("returns grey (#6b7280) when graphhopperAreas is empty", () => {
    const data = makeData([]);
    expect(ghBadgeColor(data)).toBe("#6b7280");
  });

  it("returns grey (#6b7280) when no areas are enabled (all disabled)", () => {
    const data = makeData([
      { enabled: false, ok: true },
      { enabled: false, ok: false },
    ]);
    expect(ghBadgeColor(data)).toBe("#6b7280");
  });

  it("ignores disabled areas when computing colour — one ok enabled area → green", () => {
    const data = makeData([
      { enabled: true, ok: true },
      { enabled: false, ok: false },
    ]);
    expect(ghBadgeColor(data)).toBe("#22c55e");
  });
});
