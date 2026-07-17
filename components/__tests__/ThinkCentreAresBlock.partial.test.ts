/**
 * Regression guard — AresBlock resilience when `samples` field is absent.
 *
 * Covers the gap fixed in task #462:
 *   detail.samples.length crashes when samples is absent in a partial TC response.
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => ({
  View:             "View",
  Text:             "Text",
  TouchableOpacity: "TouchableOpacity",
  StyleSheet:       { create: (s: Record<string, unknown>) => s },
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons:               "Ionicons",
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));

vi.mock("@/constants/colors", () => ({
  default: { textSecondary: "#999", text: "#fff" },
}));

vi.mock("react-native-svg", () => ({
  default:   "Svg",
  Polyline:  "Polyline",
  Line:      "Line",
  Text:      "SvgText",
}));

vi.mock("@/components/admin/ThinkCentreCardParts", () => ({
  ErrorHistory: "ErrorHistory",
  ProbeLog:     "ProbeLog",
}));

import { AresBlock } from "@/components/admin/ThinkCentreAresBlock";
import type { AresDetailedHealth } from "@/components/admin/ThinkCentreAresBlock";

async function renderAresBlock(detail: AresDetailedHealth | null | undefined) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(AresBlock, { detail, isLoading: false, hasError: false }),
    );
  });
  // Tap header to expand the body
  const header = renderer.root.findAll((n) => n.props.onPress !== undefined);
  if (header.length > 0) {
    await act(async () => { header[0].props.onPress(); });
  }
  return renderer;
}

describe("AresBlock — samples field absent in partial TC response", () => {
  it("does not throw when samples is undefined but metricsConfigured is true", async () => {
    const detail: Omit<AresDetailedHealth, "samples"> & { samples?: unknown[] } = {
      configured:       true,
      online:           true,
      latencyMs:        12,
      url:              "https://ares.example.com",
      metricsConfigured:true,
      cpuPct:           42,
      ramPct:           60,
      gpuPct:           null,
      history:          [],
      // samples deliberately omitted
    };
    await expect(renderAresBlock(detail as unknown as AresDetailedHealth)).resolves.toBeDefined();
  });

  it("does not throw when samples is null", async () => {
    const detail = {
      configured:        true,
      online:            true,
      latencyMs:         10,
      url:               null,
      metricsConfigured: true,
      cpuPct:            10,
      ramPct:            20,
      gpuPct:            null,
      history:           [],
      samples:           null,
    } as unknown as AresDetailedHealth;
    await expect(renderAresBlock(detail)).resolves.toBeDefined();
  });

  it("shows chart hint when samples is empty array", async () => {
    const detail: AresDetailedHealth = {
      configured:        true,
      online:            true,
      latencyMs:         10,
      url:               null,
      metricsConfigured: true,
      cpuPct:            10,
      ramPct:            20,
      gpuPct:            null,
      history:           [],
      samples:           [],
    };
    const renderer = await renderAresBlock(detail);
    const texts = renderer.root.findAll((n) => (n.type as unknown) === "Text");
    const content = texts.map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join("") : String(c ?? "");
    });
    // Should show the "raccolta dati" hint, not crash
    expect(content.some((t) => t.toLowerCase().includes("raccolta"))).toBe(true);
  });
});
