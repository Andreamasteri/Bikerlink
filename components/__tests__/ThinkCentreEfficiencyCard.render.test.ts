/**
 * Regression guard — ThinkCentreEfficiencyCard payload shape resilience.
 *
 * Bug storico (Task #437): il componente crashava con TypeError quando il
 * payload dell'agente aveva shape annidata (metrics.metrics.*) invece di
 * shape flat (loadAvg1, ramUsedMb, …). La guard è stata aggiunta inline:
 *
 *   const metrics =
 *     rawMetrics != null && typeof rawMetrics.loadAvg1 === "number"
 *       ? rawMetrics : null;
 *
 * Questo test verifica che un futuro cambiamento di shape non ripristini il
 * crash, coprendo tre varianti di payload:
 *   1. flat online valida  → card espansa senza eccezioni
 *   2. offline             → banner offline senza eccezioni
 *   3. malformed (online:true ma loadAvg1 mancante) → nessun TypeError
 *
 * Strategia: react-test-renderer + IS_REACT_ACT_ENVIRONMENT, con useQuery
 * controllato per test (vi.mocked). Il componente usa useState(true) per
 * collapsed; simuliamo il press sull'header per espandere il contenuto
 * guard-ato, in modo da coprire le chiamate a .toFixed() e Math.round().
 *
 * Le dipendenze native/expo sono mockate solo per far caricare il modulo.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// ── Necessario in Node/React per gli aggiornamenti di stato asincroni ─────
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── Mock: react-native ────────────────────────────────────────────────────
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (s: Record<string, unknown>) => s },
}));

// ── Mock: @expo/vector-icons ──────────────────────────────────────────────
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: "MaterialCommunityIcons",
  Ionicons: "Ionicons",
}));

// ── Mock: @/constants/colors ──────────────────────────────────────────────
vi.mock("@/constants/colors", () => ({
  default: {
    surface: "#1a1a1a",
    border: "#333",
    text: "#fff",
    textSecondary: "#999",
  },
}));

// ── Mock: @/lib/query-client ──────────────────────────────────────────────
vi.mock("@/lib/query-client", () => ({
  getApiUrl: () => "http://localhost",
  authFetchHeaders: async () => ({}),
}));

// ── Mock: @tanstack/react-query — controllato per test ────────────────────
const useQueryMock = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

import { ThinkCentreEfficiencyCard } from "@/components/admin/ThinkCentreEfficiencyCard";

// ── Fixture payloads ──────────────────────────────────────────────────────

/** Flat online payload — shape attesa dopo il fix di Task #437 */
const flatOnlinePayload = {
  online: true as const,
  loadAvg1: 0.72,
  loadAvg5: 1.04,
  ramUsedMb: 4096,
  ramTotalMb: 16384,
  diskMounts: [{ path: "/", usedGb: 120, totalGb: 500, usedPct: 24 }],
  uptimeSec: 3_600 * 48 + 900,
  checkedAt: Date.now(),
};

/** Offline payload */
const offlinePayload = { online: false as const, reason: "timeout" };

/** Malformed: online:true ma loadAvg1 mancante — vecchia shape annidata */
const malformedPayload = {
  online: true as const,
  // loadAvg1 assente intenzionalmente
  metrics: { loadAvg1: 0.5, ramUsedMb: 2048, ramTotalMb: 8192 },
};

// ── Helpers ───────────────────────────────────────────────────────────────

function buildUseQueryReturn(data: unknown) {
  return { data, isLoading: false, error: null };
}

let renderer: TestRenderer.ReactTestRenderer | null = null;

async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(ThinkCentreEfficiencyCard));
  });
}

function findHeader() {
  return renderer!.root.findAll((n) => n.props.testID === "thinkcentre-efficiency-card-header");
}

async function expandCard() {
  const headers = findHeader();
  expect(headers).toHaveLength(1);
  await act(async () => {
    headers[0].props.onPress();
  });
}

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

// ══════════════════════════════════════════════════════════════════════════
// Test suite
// ══════════════════════════════════════════════════════════════════════════

describe("ThinkCentreEfficiencyCard — resilienza alla shape del payload agente", () => {

  it("1. flat online valida — card monta ed espande senza TypeError", async () => {
    useQueryMock.mockReturnValue(buildUseQueryReturn(flatOnlinePayload));

    await mount();
    // Il componente è collapsed=true per default; nessun crash sul render iniziale.
    expect(findHeader()).toHaveLength(1);

    // Espandi — attiva la sezione CPU/RAM/Disco che chiama .toFixed() e Math.round()
    await expandCard();

    // Verifica che i valori numerici vengano resi (nessuna eccezione = test passa).
    const allTexts = renderer!.root.findAll((n) => (n.type as unknown) === "Text");
    const textContents = allTexts.map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join("") : String(c ?? "");
    });

    // loadAvg1 = 0.72 → "0.72"
    expect(textContents.some((t) => t.includes("0.72"))).toBe(true);
    // RAM usedPercent = round(4096/16384*100) = 25
    expect(textContents.some((t) => t.includes("25%"))).toBe(true);
    // Disco: usedPct = 24%
    expect(textContents.some((t) => t.includes("24%"))).toBe(true);
  });

  it("2. offline payload — banner offline senza TypeError", async () => {
    useQueryMock.mockReturnValue(buildUseQueryReturn(offlinePayload));

    await mount();
    expect(findHeader()).toHaveLength(1);

    await expandCard();

    const allTexts = renderer!.root.findAll((n) => (n.type as unknown) === "Text");
    const textContents = allTexts.map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join("") : String(c ?? "");
    });

    // Banner offline deve essere visibile
    expect(textContents.some((t) => t.toLowerCase().includes("offline"))).toBe(true);
    // Nessuna sezione CPU deve apparire (metrics=null → guard attivo)
    expect(textContents.some((t) => t === "CPU")).toBe(false);
  });

  it("3. payload malformed (online:true, loadAvg1 mancante) — nessun TypeError, nessuna sezione CPU", async () => {
    useQueryMock.mockReturnValue(buildUseQueryReturn(malformedPayload));

    // Il fatto stesso che il componente monti ed espanda senza eccezioni è il requisito.
    await expect(
      (async () => {
        await mount();
        await expandCard();
      })(),
    ).resolves.toBeUndefined();

    // La guard `typeof rawMetrics.loadAvg1 === "number"` fa sì che metrics=null
    // → nessun .toFixed() su undefined → nessun TypeError.
    const allTexts = renderer!.root.findAll((n) => (n.type as unknown) === "Text");
    const textContents = allTexts.map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join("") : String(c ?? "");
    });

    // Con metrics=null la sezione CPU non deve renderizzarsi
    expect(textContents.some((t) => t === "CPU")).toBe(false);
    // Il banner offline deve apparire (online=true ma metrics=null → same offline banner path)
    expect(textContents.some((t) => t.toLowerCase().includes("offline"))).toBe(true);
  });

  it("4. payload undefined (loading) — solo header, nessun crash", async () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, error: null });

    await mount();
    // Nessun crash; l'header è l'unica cosa resa.
    expect(findHeader()).toHaveLength(1);
  });
});
