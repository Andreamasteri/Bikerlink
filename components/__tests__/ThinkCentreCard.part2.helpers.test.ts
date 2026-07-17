/**
 * Regression guard — ThinkCentreCard.part2 helper resilience.
 *
 * Covers the double-optional-chain gaps fixed in task #462:
 *   - ghToStatus(undefined, ...) must not crash (areas param absent)
 *   - ThinkCentreFooter with eventsData missing the `events` field must not throw TypeError
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── Mock: react-native ─────────────────────────────────────────────────────
vi.mock("react-native", () => ({
  View:             "View",
  Text:             "Text",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator:"ActivityIndicator",
  StyleSheet:       { create: (s: Record<string, unknown>) => s },
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));

vi.mock("@/constants/colors", () => ({
  default: { textSecondary: "#999", text: "#fff" },
}));

vi.mock("@/components/admin/ThinkCentreCardStyles", () => ({
  styles: {
    retryButton: {}, retryButtonBusy: {}, retryText: {},
    note: {}, noteBody: {}, noteText: {}, legend: {}, legendText: {},
    mono: {}, poweredOffOverlay: {}, poweredOffOverlayTitle: {},
    poweredOffOverlaySub: {},
  },
}));

vi.mock("@/components/admin/ThinkCentreCardParts", () => ({
  EventLog: "EventLog",
}));

import {
  ghToStatus,
  ThinkCentreFooter,
} from "@/components/admin/ThinkCentreCard.part2";

// ── ghToStatus — undefined / null areas ───────────────────────────────────

describe("ghToStatus — partial data resilience", () => {
  it("returns 'unknown' when areas is undefined", () => {
    expect(ghToStatus(undefined, true)).toBe("unknown");
  });

  it("returns 'unknown' when areas is null", () => {
    expect(ghToStatus(null as unknown as undefined, true)).toBe("unknown");
  });

  it("returns 'unknown' when configured is false (areas present)", () => {
    expect(ghToStatus([], false)).toBe("unknown");
  });

  it("returns 'ok' when all enabled areas are ok", () => {
    const areas = [{ enabled: true, ok: true }];
    expect(ghToStatus(areas, true)).toBe("ok");
  });
});

// ── ThinkCentreFooter — eventsData with missing `events` field ─────────────

describe("ThinkCentreFooter — eventsData without events field", () => {
  async function renderFooter(eventsData: unknown) {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(ThinkCentreFooter, {
          poweredOffActive: false,
          data: null,
          isFetching: false,
          refetch: vi.fn(),
          eventsData,
        }),
      );
    });
    return renderer;
  }

  it("does not throw when eventsData is an object without events field", async () => {
    // Simulates a partial TC health response that set eventsData truthy but omits events
    await expect(renderFooter({ })).resolves.toBeDefined();
  });

  it("does not throw when eventsData is undefined", async () => {
    await expect(renderFooter(undefined)).resolves.toBeDefined();
  });

  it("does not throw when eventsData.events is null", async () => {
    await expect(renderFooter({ events: null })).resolves.toBeDefined();
  });

  it("renders EventLog when eventsData.events has items", async () => {
    const renderer = await renderFooter({ events: [{ id: 1, message: "test", timestamp: Date.now(), level: "info" }] });
    const nodes = renderer.root.findAll((n) => (n.type as unknown) === "EventLog");
    expect(nodes).toHaveLength(1);
  });
});
