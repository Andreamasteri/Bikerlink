/**
 * Test di rendering per components/profile/TelemetrySavedLaps — SavedLapsSection
 *
 * Copre i casi critici:
 *  (a) laps è un array valido — renderizza le card senza crash.
 *  (b) laps è un non-array truthy (es. oggetto) — il guard Array.isArray
 *      impedisce il crash da "TypeError: undefined is not a function".
 *  (c) laps è null/undefined — il guard previene il crash.
 *  (d) laps è un array vuoto — nessun item renderizzato.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// ── mock: react-native ──────────────────────────────────────────────────────
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  Alert: { alert: vi.fn() },
  StyleSheet: { create: (s: Record<string, unknown>) => s },
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));

vi.mock("@/constants/colors", () => ({
  default: {
    accent: "#e07b39",
    text: "#111",
    textSecondary: "#888",
    surface: "#fff",
    background: "#f5f5f5",
    border: "#ddd",
  },
}));

const apiRequestMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/query-client", () => ({
  apiRequest: apiRequestMock,
  queryClient: { invalidateQueries: invalidateQueriesMock },
}));

// ── import del componente DOPO i mock ────────────────────────────────────────
import { SavedLapsSection } from "@/components/profile/TelemetrySavedLaps";
import type { IdealLap } from "@/components/profile/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── fixture ──────────────────────────────────────────────────────────────────
function makeLap(overrides: Partial<IdealLap> = {}): IdealLap {
  return {
    sessionId: "sess-1",
    startedAt: new Date("2025-07-10T08:30:00Z").toISOString(),
    sampleCount: 120,
    maxSpeedKmh: 97.5,
    maxLeanDeg: 38.2,
    maxGforce: 1.12,
    lapNumber: 1,
    lapName: "Giro test",
    distanceKm: 4.56,
    ...overrides,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────
const defaultProps = {
  compareMode: false,
  selectedLaps: [] as string[],
  onCompareToggle: vi.fn(),
  onSelectLap: vi.fn(),
};

let renderer: TestRenderer.ReactTestRenderer | null = null;

async function mount(laps: unknown) {
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(SavedLapsSection, {
        ...defaultProps,
        laps: laps as IdealLap[],
      }),
    );
  });
}

function allTexts(): string[] {
  return renderer!.root
    .findAll((n) => (n.type as unknown) === "Text")
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join("") : String(c ?? "");
    });
}

// ── setup / teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  renderer = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => {
      renderer!.unmount();
    });
  }
});

// ── test suite ────────────────────────────────────────────────────────────────
describe("SavedLapsSection — guard Array.isArray su laps non-array", () => {
  it("(a) laps array valido — renderizza la card del giro", async () => {
    await mount([makeLap()]);

    const texts = allTexts();
    expect(texts.some((t) => t === "Giro test")).toBe(true);
    // mostra il contatore "Giri Salvati (1)"
    expect(texts.some((t) => t.includes("Giri Salvati") && t.includes("1"))).toBe(true);
  });

  it("(b) laps è un oggetto non-array — non crasha, zero card renderizzate", async () => {
    // Simula la shape inattesa che causava "TypeError: undefined is not a function"
    await expect(mount({ unexpected: true })).resolves.not.toThrow();

    const texts = allTexts();
    // Il contatore deve mostrare 0 (nessun giro)
    expect(texts.some((t) => t.includes("Giri Salvati") && t.includes("0"))).toBe(true);
  });

  it("(c) laps è null — non crasha, zero card renderizzate", async () => {
    await expect(mount(null)).resolves.not.toThrow();

    const texts = allTexts();
    expect(texts.some((t) => t.includes("Giri Salvati") && t.includes("0"))).toBe(true);
  });

  it("(c2) laps è undefined — non crasha, zero card renderizzate", async () => {
    await expect(mount(undefined)).resolves.not.toThrow();

    const texts = allTexts();
    expect(texts.some((t) => t.includes("Giri Salvati") && t.includes("0"))).toBe(true);
  });

  it("(d) laps array vuoto — nessuna card, contatore a 0", async () => {
    await mount([]);

    const texts = allTexts();
    expect(texts.some((t) => t.includes("Giri Salvati") && t.includes("0"))).toBe(true);
  });

  it("(e) laps con più elementi — renderizza tutte le card", async () => {
    const laps = [
      makeLap({ sessionId: "s1", lapName: "Giro A" }),
      makeLap({ sessionId: "s2", lapName: "Giro B" }),
    ];
    await mount(laps);

    const texts = allTexts();
    expect(texts.some((t) => t === "Giro A")).toBe(true);
    expect(texts.some((t) => t === "Giro B")).toBe(true);
    expect(texts.some((t) => t.includes("Giri Salvati") && t.includes("2"))).toBe(true);
  });
});
