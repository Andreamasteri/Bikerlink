/**
 * Regression guard — GraphHopperBlock never crashes when areas data is empty
 * or partially absent.
 *
 * Component under test: components/admin/ThinkCentreCardParts.tsx (GraphHopperBlock)
 *
 * Why: ThinkCentreCard passes `data.graphhopperAreas ?? []` to guard against a
 * missing field at the call site, but the block itself had no render test
 * verifying it handles an empty array or area objects with missing sub-fields
 * (e.g. absent `history`, `tier`, `nome`, `latencyMs`). A partial TC response
 * could crash inside the map() or in areaColor/areaStatusLabel helpers.
 *
 * Strategy: react-test-renderer, all native deps mocked. For each fixture the
 * block is rendered once collapsed (smoke) and once expanded (tap the header),
 * so the `areas.map(...)` branch is exercised.
 *
 * Regressions guarded:
 *   - `a.history?.length` crash when history is absent → optional chaining present
 *   - `a.tier === "core"` branch when tier is undefined → benign falsy comparison
 *   - `a.nome` render when nome is undefined → renders string "undefined", no throw
 *   - areaColor / areaStatusLabel with all optional fields undefined → safe
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── Mock: react-native ────────────────────────────────────────────────────────
vi.mock("react-native", () => ({
  View:             "View",
  Text:             "Text",
  TouchableOpacity: "TouchableOpacity",
  ScrollView:       "ScrollView",
  StyleSheet:       { create: (s: Record<string, unknown>) => s },
}));

// ── Mock: @expo/vector-icons ──────────────────────────────────────────────────
vi.mock("@expo/vector-icons", () => ({
  Ionicons:               "Ionicons",
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));

// ── Mock: @/constants/colors ──────────────────────────────────────────────────
vi.mock("@/constants/colors", () => ({
  default: { textSecondary: "#999" },
}));

// ── Mock: @shared/routing-areas ───────────────────────────────────────────────
vi.mock("@shared/routing-areas", () => ({
  getRoutingArea: () => null,
}));

// ── Mock: styles (relative import inside the component) ───────────────────────
vi.mock("@/components/admin/ThinkCentreCardParts.styles", () => ({
  styles: new Proxy({}, { get: () => ({}) }),
}));

import { GraphHopperBlock } from "@/components/admin/ThinkCentreCardParts";
import type { AreaServiceHealth } from "@/components/admin/ThinkCentreCardParts";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function renderBlock(
  areas: AreaServiceHealth[],
  opts: { fingerprint?: string | null; url?: string | null; tokenMissing?: boolean } = {},
) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(GraphHopperBlock, {
        areas,
        fingerprint: opts.fingerprint ?? null,
        url: opts.url ?? null,
        tokenMissing: opts.tokenMissing,
      }),
    );
  });
  return renderer;
}

async function expandBlock(renderer: TestRenderer.ReactTestRenderer) {
  const header = renderer.root.findAll(
    (n) => n.props.testID === "thinkcentre-gh-block-header",
  );
  if (header.length > 0) {
    await act(async () => { header[0].props.onPress(); });
  }
}

// ── Minimal valid area fixture ────────────────────────────────────────────────
function makeArea(overrides: Partial<AreaServiceHealth> = {}): AreaServiceHealth {
  return {
    code:      "it",
    nome:      "Italia",
    tier:      "core",
    enabled:   true,
    ok:        true,
    latencyMs: 42,
    history:   [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GraphHopperBlock — empty areas array", () => {
  it("renders without crashing when areas=[] (collapsed)", async () => {
    const renderer = await renderBlock([]);
    expect(renderer.toJSON()).not.toBeNull();
  });

  it("renders without crashing when areas=[] (expanded)", async () => {
    const renderer = await renderBlock([]);
    await expandBlock(renderer);
    expect(renderer.toJSON()).not.toBeNull();
  });

  it("shows 0 areas in subtitle text when areas=[]", async () => {
    const renderer = await renderBlock([]);
    const texts = renderer.root.findAll((n) => (n.type as unknown) === "Text");
    const content = texts.flatMap((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String) : [String(c ?? "")];
    });
    // The subtitle renders `{areas.length} aree`
    expect(content.some((t) => t.includes("0"))).toBe(true);
  });
});

describe("GraphHopperBlock — partial area object (missing optional fields)", () => {
  it("does not crash when history is absent", async () => {
    const area = makeArea({ history: undefined as unknown as [] });
    const renderer = await renderBlock([area]);
    await expandBlock(renderer);
    expect(renderer.toJSON()).not.toBeNull();
  });

  it("does not crash when tier is absent", async () => {
    const area = makeArea({ tier: undefined as unknown as "core" });
    const renderer = await renderBlock([area]);
    await expandBlock(renderer);
    expect(renderer.toJSON()).not.toBeNull();
  });

  it("does not crash when nome is absent", async () => {
    const area = makeArea({ nome: undefined as unknown as string });
    const renderer = await renderBlock([area]);
    await expandBlock(renderer);
    expect(renderer.toJSON()).not.toBeNull();
  });

  it("does not crash when latencyMs is absent and area is enabled+ok", async () => {
    const area = makeArea({ latencyMs: undefined as unknown as null });
    const renderer = await renderBlock([area]);
    await expandBlock(renderer);
    expect(renderer.toJSON()).not.toBeNull();
  });

  it("does not crash when enabled is false and all optional fields absent", async () => {
    const area = makeArea({
      enabled:  false,
      ok:       false,
      history:  undefined as unknown as [],
      probeLog: undefined,
      error:    undefined,
    });
    const renderer = await renderBlock([area]);
    await expandBlock(renderer);
    expect(renderer.toJSON()).not.toBeNull();
  });

  it("does not crash when startingUp is absent and area is down", async () => {
    const area = makeArea({
      ok:         false,
      startingUp: undefined,
      error:      "timeout",
    });
    const renderer = await renderBlock([area]);
    await expandBlock(renderer);
    expect(renderer.toJSON()).not.toBeNull();
  });

  it("does not crash with a mix of valid and fully-stripped partial areas", async () => {
    const areas: AreaServiceHealth[] = [
      makeArea(),
      // Bare minimum — only required fields
      {
        code:      "de",
        nome:      undefined as unknown as string,
        tier:      undefined as unknown as "core",
        enabled:   false,
        ok:        false,
        latencyMs: null,
        history:   undefined as unknown as [],
      },
    ];
    const renderer = await renderBlock(areas);
    await expandBlock(renderer);
    expect(renderer.toJSON()).not.toBeNull();
  });
});

describe("GraphHopperBlock — fingerprint and tokenMissing props", () => {
  it("renders without crash when fingerprint is provided and areas non-empty", async () => {
    const renderer = await renderBlock(
      [makeArea()],
      { fingerprint: "abc123", url: "https://gh.example.com" },
    );
    await expandBlock(renderer);
    expect(renderer.toJSON()).not.toBeNull();
  });

  it("renders without crash when tokenMissing=true and fingerprint=null", async () => {
    const renderer = await renderBlock(
      [makeArea({ enabled: false, ok: false })],
      { fingerprint: null, tokenMissing: true },
    );
    await expandBlock(renderer);
    expect(renderer.toJSON()).not.toBeNull();
  });
});
