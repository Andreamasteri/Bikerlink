/**
 * Regression guard — OllamaBlock / PersonaModelRows persona drift.
 *
 * Task #623: PERSONA_LABELS (local to ThinkCentreInfraBlocks) must stay in
 * sync with the server-side PersonaModels type {bowie, horus, ares}.
 * If a future commit adds/removes a persona in one place but not the other,
 * this test catches it before it ships.
 *
 * What is asserted:
 *   1. Exactly 3 persona-name Text nodes appear (Bowie, Horus, Ares).
 *   2. "Quebracho" does NOT appear anywhere in the rendered tree.
 *   3. The component mounts and expands without TypeError when personaModels
 *      is null / absent (offline state).
 *
 * Pattern: react-test-renderer + IS_REACT_ACT_ENVIRONMENT, react-native
 * mocked as strings, following ThinkCentreCard.render.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// ── Required for async state updates in Node ──────────────────────────────
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── Mock: react-native ────────────────────────────────────────────────────
vi.mock("react-native", () => ({
  View:             "View",
  Text:             "Text",
  TouchableOpacity: "TouchableOpacity",
  StyleSheet:       { create: (s: Record<string, unknown>) => s },
}));

// ── Mock: @expo/vector-icons ──────────────────────────────────────────────
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: "MaterialCommunityIcons",
  Ionicons:               "Ionicons",
}));

// ── Mock: @/constants/colors ──────────────────────────────────────────────
vi.mock("@/constants/colors", () => ({
  default: {
    surface:       "#1a1a1a",
    card:          "#222",
    border:        "#333",
    text:          "#fff",
    textSecondary: "#999",
    accent:        "#f59e0b",
  },
}));

// ── Mock: ThinkCentreCardParts (sub-components used by InfraBlock) ────────
vi.mock("@/components/admin/ThinkCentreCardParts", () => ({
  ErrorHistory: "ErrorHistory",
  ProbeLog:     "ProbeLog",
}));

import { OllamaBlock } from "@/components/admin/ThinkCentreInfraBlocks";
import type { PersonaModels } from "@/components/admin/ThinkCentreInfraBlocks";

// ── Fixture ───────────────────────────────────────────────────────────────

const fixturePersonaModels: PersonaModels = {
  bowie: { configured: "bowie-model:latest",  available: true  },
  horus: { configured: "horus-model:latest",  available: true  },
  ares:  { configured: "devstral:latest",      available: false },
};

const fixtureService = {
  configured: true,
  ok:         true,
  latencyMs:  42,
  url:        "http://localhost:11434",
  error:      undefined,
  history:    [],
};

// ── Helpers ───────────────────────────────────────────────────────────────

function allTextStrings(root: TestRenderer.ReactTestInstance): string[] {
  return root
    .findAll((n) => (n.type as unknown) === "Text")
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join("") : String(c ?? "");
    });
}

/** Find the first TouchableOpacity (InfraBlock header) and press it. */
async function expandBlock(root: TestRenderer.ReactTestInstance) {
  const header = root.findAll(
    (n) => (n.type as unknown) === "TouchableOpacity",
  );
  expect(header.length).toBeGreaterThan(0);
  await act(async () => {
    header[0].props.onPress();
  });
}

let renderer: TestRenderer.ReactTestRenderer | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  renderer = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => { renderer!.unmount(); });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Test suite
// ══════════════════════════════════════════════════════════════════════════

describe("OllamaBlock — PersonaModelRows drift guard (Task #623)", () => {

  it("1. con payload persona valido — espande e mostra esattamente 3 righe persona (Bowie, Horus, Ares)", async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(OllamaBlock, {
          service:       fixtureService,
          fingerprint:   "abc123",
          personaModels: fixturePersonaModels,
        }),
      );
    });

    await expandBlock(renderer!.root);

    const texts = allTextStrings(renderer!.root);

    // ── Esattamente 3 righe persona ──────────────────────────────────────
    const personaNames = texts.filter(
      (t) => t === "Bowie" || t === "Horus (routing · coordinator)" || t === "Ares",
    );
    expect(personaNames).toHaveLength(3);
    expect(personaNames).toContain("Bowie");
    expect(personaNames).toContain("Horus (routing · coordinator)");
    expect(personaNames).toContain("Ares");

    // ── Quebracho NON deve comparire ────────────────────────────────────
    const hasQuebracho = texts.some((t) => t.toLowerCase().includes("quebracho"));
    expect(hasQuebracho).toBe(false);
  });

  it("2. nessun persona 'Quebracho' nel tree anche con payload completo", async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(OllamaBlock, {
          service:       fixtureService,
          fingerprint:   null,
          personaModels: fixturePersonaModels,
        }),
      );
    });

    await expandBlock(renderer!.root);

    const texts = allTextStrings(renderer!.root);
    expect(texts.some((t) => t.toLowerCase().includes("quebracho"))).toBe(false);
  });

  it("3. personaModels=null (Ollama offline) — monta ed espande senza TypeError", async () => {
    await expect(
      (async () => {
        await act(async () => {
          renderer = TestRenderer.create(
            React.createElement(OllamaBlock, {
              service:       { ...fixtureService, ok: false },
              fingerprint:   null,
              personaModels: null,
            }),
          );
        });
        await expandBlock(renderer!.root);
      })(),
    ).resolves.toBeUndefined();
  });

  it("4. personaModels=undefined (isLoading) — monta senza TypeError", async () => {
    await expect(
      (async () => {
        await act(async () => {
          renderer = TestRenderer.create(
            React.createElement(OllamaBlock, {
              isLoading: true,
            }),
          );
        });
      })(),
    ).resolves.toBeUndefined();
  });

  it("5. tutti e 3 i modelli 'available=null' (lista modelli non disponibile) — badge 'sconosciuto' senza crash", async () => {
    const unknownModels: PersonaModels = {
      bowie: { configured: "bowie-model:latest", available: null },
      horus: { configured: "horus-model:latest", available: null },
      ares:  { configured: "devstral:latest",    available: null },
    };

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(OllamaBlock, {
          service:       fixtureService,
          personaModels: unknownModels,
        }),
      );
    });

    await expandBlock(renderer!.root);

    const texts = allTextStrings(renderer!.root);

    // 3 persona names present
    expect(texts.filter((t) => t === "Bowie").length).toBeGreaterThanOrEqual(1);
    expect(texts.filter((t) => t === "Ares").length).toBeGreaterThanOrEqual(1);

    // badge "sconosciuto" appears for each
    const sconosciutoCount = texts.filter((t) => t === "sconosciuto").length;
    expect(sconosciutoCount).toBe(3);

    // No Quebracho
    expect(texts.some((t) => t.toLowerCase().includes("quebracho"))).toBe(false);
  });
});
